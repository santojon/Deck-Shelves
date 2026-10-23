#!/usr/bin/env python3
"""
Deck Shelves — cooperative-bundle fallback boots on the device (run from the dev machine).

A loader-launched copy that stood down for the neutral host's own copy must boot
itself when that copy never shows up. Two paths, then a restore:

    live    — the host runtime is injected and advertises the bundle, but its copy
              never boots: the loader copy publishes the defer signal and boots
              itself ~20 s later, on the injected host (forced owner kept).
    offer   — Steam starts with the host stopped and only its standing offer in
              storage: the loader copy stands down on the offer and boots itself
              ~60 s later as the loader's own owner, stamping `fallbackAt`; the
              host, started afterwards, withholds the offer for a day ("held").
    restore — the offer is dropped, the host restarts (offers again) and Steam
              restarts: the loader copy stands down and the host hosts its copy.

Preconditions (checked; changed only with --setup): the host service is active
with forced ownership and the cooperative bundle on, and the host's own copy
owns the renderer. `--setup` turns `coop_bundle` on in the host's install-dir
config (backup next to it), restarts the service and Steam, and waits for the
hand-over before the phases run.

Usage:
    python3 scripts/deckprobe-ext/probes/coop_fallback.py              # live + offer + restore
    python3 scripts/deckprobe-ext/probes/coop_fallback.py --phase=live # live + restore
    python3 scripts/deckprobe-ext/probes/coop_fallback.py --setup

Needs DECK_HOST / DECK_USER / DECK_CDP_PORT in .env. Restarts Steam (twice for
the full run), so it refuses to start while a game is running; use the test
device. Exit codes: 0 all phases passed, 1 a phase failed, 2 a precondition
failed (nothing was changed). Writes
site/reports/perf/coop-fallback-latest.json, judged by `pnpm run perf:gate:check`.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from deckprobe.lib import cdp  # noqa: E402

# Functional identifiers of the host install (unit, config path, offer storage key).
HOST_UNIT = "shelveshub.service"
HOST_CONFIG = "/home/deck/shelveshub/shelveshub.config.json"
OFFER_KEY = "shelveshub-coop-bundle"
# The plugin's fallback windows (runtime/host/coopDefer.ts) and the slack a poll adds.
LIVE_FALLBACK_S = 20
OFFER_FALLBACK_S = 60
SLACK_S = 15

STATE_JS = """(() => { const g = globalThis; let offer = null; try { offer = localStorage.getItem(%s); } catch (e) {}
  const d = g.__DECK_SHELVES_DEFER_TO_HOST__;
  return JSON.stringify({ now: Date.now(), build: g.__ds_build ?? null, owner: g.__DECK_SHELVES_OWNER__ ?? null,
    forced: g.__SHELVES_FORCE_OWNER__ ?? null, host: !!g.__SHELVES_HOST__, deferAt: d && typeof d === 'object' ? (d.at ?? 0) : null,
    hostBooted: g.__DECK_SHELVES_HOST_BUNDLE_BOOTED__ ?? null, offer: offer ? JSON.parse(offer) : null }); })()""" % json.dumps(OFFER_KEY)
HOME_JS = """JSON.stringify({ roots: document.querySelectorAll('.deck-shelves-root').length,
  shelves: document.querySelectorAll('.ds-shelf[data-shelfid]').length, cards: document.querySelectorAll('.ds-card').length })"""
STAND_DOWN_HOST_COPY_JS = """(() => { try { globalThis.__DECK_SHELVES_INSTANCE__?.dispose?.(); } catch (e) { return 'dispose failed: ' + e; }
  delete globalThis.__DECK_SHELVES_HOST_BUNDLE_BOOTED__; delete globalThis.__DECK_SHELVES_DEFER_TO_HOST__; return 'ok'; })()"""
REIMPORT_JS = """(() => { try { const p = DeckyPluginLoader.importPlugin('Deck Shelves', %s);
  return p && typeof p.then === 'function' ? 'importing' : String(p); } catch (e) { return 'import failed: ' + e; } })()"""

T0 = time.time()


def log(*parts: object) -> None:
    print(f"[{time.time() - T0:6.1f}s]", *parts, flush=True)


def load_env() -> dict:
    env = {}
    try:
        for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    except OSError:
        pass
    return env


def ssh(env: dict, cmd: str, timeout: int = 60) -> str:
    target = f"{env.get('DECK_USER', 'deck')}@{env['DECK_HOST']}"
    out = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", target, cmd],
                         capture_output=True, text=True, timeout=timeout)
    return (out.stdout + out.stderr).strip()


class Device:
    def __init__(self) -> None:
        self.env = load_env()
        self.host, self.port = cdp.load_env(str(ROOT / ".env"))

    def eval(self, target: str, expr: str):
        s = cdp.open_session(self.host, self.port, target)
        try:
            return s.evaluate(expr, timeout=10)
        finally:
            s.close()

    def state(self) -> dict | None:
        try:
            return json.loads(self.eval("SharedJSContext", STATE_JS))
        except Exception:
            return None

    def home(self) -> dict:
        try:
            return json.loads(self.eval("Big Picture", HOME_JS))
        except Exception:
            return {"roots": 0, "shelves": 0, "cards": 0}

    def wait(self, label: str, pred, timeout: float, every: float = 2.0):
        """Poll state + Home until `pred(state, home)`; logs each change. Returns (state, home) or (None, None)."""
        t1, last = time.time(), None
        while time.time() - t1 < timeout:
            st, hm = self.state(), self.home()
            line = json.dumps({k: st.get(k) for k in ("owner", "forced", "host", "deferAt", "hostBooted")} if st else None) + " " + json.dumps(hm)
            if line != last:
                log(f"{label}:", line)
                last = line
            if st and pred(st, hm):
                return st, hm
            time.sleep(every)
        return None, None

    def host_active(self) -> bool:
        return ssh(self.env, f"systemctl --user is-active {HOST_UNIT} || true") == "active"

    def host_config(self) -> dict:
        raw = ssh(self.env, f"python3 -c \"import json; d=json.load(open('{HOST_CONFIG}')); print(json.dumps({{k: d.get(k) for k in ('force_owner', 'coop_bundle')}}))\"")
        try:
            return json.loads(raw.splitlines()[-1])
        except Exception:
            return {}

    def steam_pid(self) -> str:
        return ssh(self.env, "pgrep -xo steam || true")

    def restart_steam(self) -> bool:
        old = self.steam_pid()
        ssh(self.env, "killall steam 2>/dev/null || true")
        t1 = time.time()
        while time.time() - t1 < 150:
            pid = self.steam_pid()
            if pid and pid != old:
                return True
            time.sleep(3)
        return False

    def device_epoch(self) -> int:
        try:
            return int(ssh(self.env, "date +%s"))
        except ValueError:
            return int(time.time())

    def journal_since(self, epoch: int, pattern: str) -> list[str]:
        out = ssh(self.env, f"journalctl --user -u {HOST_UNIT} --since @{epoch} --no-pager | grep -E '{pattern}' | cut -c1-220 || true")
        return [line for line in out.splitlines() if line.strip()]


def owns_with_host_copy(forced: str | None):
    return lambda st, hm: st.get("owner") == forced and bool(st.get("hostBooted")) and hm["shelves"] > 0


def setup(dev: Device) -> None:
    log("setup: coop_bundle on (backup next to the config), restart host + Steam")
    py = ("import json, shutil; p='%s'; shutil.copy(p, p + '.bak-coop-fallback'); d=json.load(open(p)); "
          "d['coop_bundle']=True; json.dump(d, open(p,'w'), indent=2); print('ok')") % HOST_CONFIG
    log("config:", ssh(dev.env, f"python3 -c \"{py}\""))
    log("host restart:", ssh(dev.env, f"systemctl --user restart {HOST_UNIT} && echo restarted"))
    time.sleep(6)
    dev.restart_steam()


GAME_RUNNING_JS = "String((globalThis.SteamUIStore?.RunningApps ?? []).length)"


def preconditions(dev: Device) -> str | None:
    try:
        if int(dev.eval("SharedJSContext", GAME_RUNNING_JS) or "0") > 0:
            return "a game is running — the probe restarts Steam, so it will not start now"
    except Exception:
        return "the device's debugger port is not reachable"
    if not dev.host_active():
        return f"{HOST_UNIT} is not active"
    cfg = dev.host_config()
    if cfg.get("force_owner") is not True or cfg.get("coop_bundle") is not True:
        return f"host config needs force_owner and coop_bundle on (got {cfg}); rerun with --setup"
    st, _hm = dev.wait("precondition", lambda s, h: bool(s.get("forced")) and s.get("owner") == s.get("forced") and bool(s.get("hostBooted")) and h["shelves"] > 0, 150)
    if not st:
        return "the host's own copy does not own the renderer (no hand-over in place)"
    return None


def phase_live(dev: Device, forced: str) -> dict:
    log("live: stop the host, stand its copy down, re-import the loader copy")
    log("host stop:", ssh(dev.env, f"systemctl --user stop {HOST_UNIT} && echo stopped"))
    log("stand down:", dev.eval("SharedJSContext", STAND_DOWN_HOST_COPY_JS))
    time.sleep(2)
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    log("re-import:", dev.eval("SharedJSContext", REIMPORT_JS % json.dumps(version)))
    st, _ = dev.wait("live/defer", lambda s, h: s.get("deferAt") is not None and s.get("host"), 30)
    if not st:
        return {"ok": False, "error": "the loader copy never published the defer signal"}
    defer_at = st["deferAt"]
    st, hm = dev.wait("live/boot", lambda s, h: s.get("deferAt") is None and s.get("owner") and h["shelves"] > 0, LIVE_FALLBACK_S + SLACK_S + 30)
    if not st:
        return {"ok": False, "error": "no fallback boot within the window"}
    after = round((st["now"] - defer_at) / 1000, 1)
    ok = LIVE_FALLBACK_S <= after <= LIVE_FALLBACK_S + SLACK_S and st["owner"] == forced
    return {"ok": ok, "bootAfterS": after, "expectedS": LIVE_FALLBACK_S, "owner": st["owner"], "shelves": hm["shelves"]}


def phase_offer(dev: Device, forced: str) -> dict:
    if dev.host_active():
        log("offer: host stop:", ssh(dev.env, f"systemctl --user stop {HOST_UNIT} && echo stopped"))
    st = dev.state()
    if not st or not st.get("offer"):
        return {"ok": False, "error": "no standing offer in the renderer's storage"}
    if st["offer"].get("fallbackAt"):
        return {"ok": False, "error": "the standing offer is already answered by a fallback (run restore first)"}
    log("offer: restart Steam with the host stopped")
    if not dev.restart_steam():
        return {"ok": False, "error": "Steam did not relaunch"}
    st, _ = dev.wait("offer/defer", lambda s, h: s.get("deferAt") is not None and not s.get("host"), 120, every=3)
    if not st:
        return {"ok": False, "error": "the loader copy never stood down on the offer"}
    defer_at = st["deferAt"]
    st, hm = dev.wait("offer/boot", lambda s, h: s.get("deferAt") is None and s.get("owner") and h["shelves"] > 0, OFFER_FALLBACK_S + SLACK_S + 30, every=3)
    if not st:
        return {"ok": False, "error": "no fallback boot within the window"}
    after = round((st["now"] - defer_at) / 1000, 1)
    stamped = bool((st.get("offer") or {}).get("fallbackAt"))
    since = dev.device_epoch()
    log("offer: host start:", ssh(dev.env, f"systemctl --user start {HOST_UNIT} && echo started"))
    held_lines: list[str] = []
    t1 = time.time()
    while time.time() - t1 < 60 and not held_lines:
        time.sleep(5)
        held_lines = dev.journal_since(since, "not offering again")
    for line in held_lines[:1]:
        log("host:", line)
    ok = OFFER_FALLBACK_S <= after <= OFFER_FALLBACK_S + SLACK_S and st["owner"] != forced and stamped and bool(held_lines)
    return {"ok": ok, "bootAfterS": after, "expectedS": OFFER_FALLBACK_S, "owner": st["owner"], "fallbackStamped": stamped,
            "hostHeldOffer": bool(held_lines), "shelves": hm["shelves"]}


def restore(dev: Device, forced: str) -> dict:
    log("restore: drop the offer, restart the host, restart Steam")
    dev.eval("SharedJSContext", f"(() => {{ try {{ localStorage.removeItem({json.dumps(OFFER_KEY)}); return 'removed'; }} catch (e) {{ return String(e); }} }})()")
    since = dev.device_epoch()
    log("host restart:", ssh(dev.env, f"systemctl --user restart {HOST_UNIT} && echo restarted"))
    st, _ = dev.wait("restore/offer", lambda s, h: bool(s.get("offer")) and not (s.get("offer") or {}).get("fallbackAt"), 45)
    if not st:
        return {"ok": False, "error": "the host did not offer its copy again"}
    if not dev.restart_steam():
        return {"ok": False, "error": "Steam did not relaunch"}
    st, hm = dev.wait("restore/hand-over", owns_with_host_copy(forced), 180, every=3)
    hosting = dev.journal_since(since, "hosting our own copy")
    for line in hosting[-1:]:
        log("host:", line)
    if not st:
        return {"ok": False, "error": "the hand-over did not come back"}
    return {"ok": True, "owner": st["owner"], "shelves": hm["shelves"], "hostLoggedHandOver": bool(hosting)}


def main() -> int:
    phase = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--phase=")), "all")
    dev = Device()
    if "--setup" in sys.argv:
        setup(dev)
    problem = preconditions(dev)
    if problem:
        log("precondition failed:", problem)
        return 2
    forced = dev.state()["forced"]
    build = dev.state().get("build")
    results: dict = {}
    try:
        if phase in ("all", "live"):
            results["live"] = phase_live(dev, forced)
            log("live:", results["live"])
        if phase in ("all", "offer"):
            results["offer"] = phase_offer(dev, forced)
            log("offer:", results["offer"])
        results["restore"] = restore(dev, forced)
        log("restore:", results["restore"])
    finally:
        if not dev.host_active():
            log("host was left stopped — starting it:", ssh(dev.env, f"systemctl --user start {HOST_UNIT} && echo started"))
    ok = all(r.get("ok") for r in results.values())
    rec = {"recordedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "build": build, "phase": phase,
           "ok": ok, "phases": results}
    out = ROOT / "site/reports/perf/coop-fallback-latest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")
    log(("✅ all phases passed" if ok else "❌ a phase failed"), "→", out.relative_to(ROOT))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
