#!/usr/bin/env python3
"""
Deck Shelves — release-gate soaks on the device (run from the dev machine).

Modes (all check, after each cycle: Home mounted with the expected shelf
count, exactly one root, one live HomeShelves instance, no fallback root,
and the timer/observer/subscription counters back at their baseline):

    sleepwake  — `rtcwake -m mem -s <secs>` on the Deck (RTC-timed resume), N cycles
    restart    — `killall steam` (Steam relaunches itself in Game Mode), N cycles
    reload     — loader hot-swap: the loader's whole cgroup is stopped (its unit
                 only signals the main PID, which would leave an orphaned loader
                 + plugin backends injecting behind every restart), then restarted

Usage:
    python3 scripts/deckprobe-ext/probes/soak.py sleepwake 50
    python3 scripts/deckprobe-ext/probes/soak.py restart 100
    python3 scripts/deckprobe-ext/probes/soak.py reload 20 --shelves=6
    python3 scripts/deckprobe-ext/probes/soak.py restart 20 --coexist

`--coexist`: a second host runtime is also delivering the bundle, and the copy
that owns the renderer is a published build without the dev globals. Judge on
the Home DOM + the owner metadata only (one root, one shelf panel, the owner
stays the same host every cycle).

Needs DECK_HOST / DECK_USER / DECK_SUDO_PASS / DECK_CDP_PORT in .env and a dev
build on the Deck (perf snapshot + instance globals are dev-only). Writes
site/reports/perf/soak-<mode>-latest.json.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from deckprobe.lib import cdp  # noqa: E402

CHECK_BP = """(() => { const m = document.getElementById('deck-shelves-home-root');
  return JSON.stringify({ roots: document.querySelectorAll('#deck-shelves-home-root').length,
    shelves: document.querySelectorAll('.ds-shelf[data-shelfid]').length,
    panels: document.querySelectorAll('#deck-shelves-home-root .deck-shelves-root').length,
    fallbackRoot: !!m && !!m.querySelector('[data-ds-fallback-host]'),
    revealed: !!(m && m.querySelector('.deck-shelves-root') && getComputedStyle(m.querySelector('.deck-shelves-root')).display !== 'none') }); })()"""
CHECK_SJC = """(() => { const owner = window.__DECK_SHELVES_OWNER__ || null; try { const s = window.__ds_perf_snapshot();
  return JSON.stringify({ owner, timers: s.activeTimers, observers: s.activeObservers, subs: s.activeSubscriptions,
    instances: (window.__ds_home_instances || []).length, scope: window.__ds_home_observer_scope || null,
    safeMode: !!(JSON.parse(localStorage.getItem('ds-boot-outcomes-v1') || '{}').safeMode) }); }
  catch (e) { return JSON.stringify({ owner, err: String(e) }); } })()"""
RELOAD_CMD = "systemctl kill plugin_loader.service; sleep 2; systemctl kill -s KILL plugin_loader.service; systemctl restart plugin_loader.service"


def load_env() -> dict:
    env = {}
    try:
        for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    except OSError:
        pass
    return env


def ssh(env: dict, cmd: str, timeout: int = 60) -> str:
    target = f"{env.get('DECK_USER', 'deck')}@{env['DECK_HOST']}"
    out = subprocess.run(
        ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10", target, cmd],
        capture_output=True, text=True, timeout=timeout,
    )
    return (out.stdout + out.stderr).strip()


def sudo(env: dict, cmd: str, timeout: int = 60) -> str:
    pw = env.get("DECK_SUDO_PASS", "")
    return ssh(env, f"printf '%s\\n' '{pw}' | sudo -S bash -c {json.dumps(cmd)} 2>/dev/null", timeout)


def wait_home(host: str, port: int, expected: int, timeout: float = 150.0) -> dict | None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            bp = cdp.open_session(host, port, "Big Picture")
            try:
                s = json.loads(bp.evaluate(CHECK_BP))
            finally:
                bp.close()
            if s["shelves"] >= expected and s["revealed"]:
                s["t_ready"] = round(time.time() - t0, 1)
                return s
        except Exception:
            pass
        time.sleep(3)
    return None


def read_sjc(host: str, port: int) -> dict:
    try:
        sjc = cdp.open_session(host, port, "SharedJSContext")
        try:
            return json.loads(sjc.evaluate(CHECK_SJC))
        finally:
            sjc.close()
    except Exception as e:
        return {"err": str(e)}


# After a loader restart the plugin realm is re-created and the plugin boots
# again a few seconds later; judging before that reads an empty realm (the old
# DOM can still be on screen). Wait for a live HomeShelves instance.
def wait_plugin(host: str, port: int, timeout: float = 90.0) -> dict:
    t0 = time.time()
    j = read_sjc(host, port)
    while time.time() - t0 < timeout:
        j = read_sjc(host, port)
        if isinstance(j.get("instances"), int) and j["instances"] >= 1:
            j["t_plugin"] = round(time.time() - t0, 1)
            return j
        time.sleep(2)
    return j


# The old Steam keeps answering CDP for a few seconds after `killall`, so a
# Home check right away would pass on the OLD session; wait for the new PID.
def wait_steam_relaunch(env: dict, old_pid: str, timeout: float = 150.0) -> str | None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        pid = ssh(env, "pgrep -xo steam || true")
        if pid and pid != old_pid:
            return pid
        time.sleep(3)
    return None


def trigger(mode: str, env: dict, sleep_secs: int) -> None:
    if mode == "sleepwake":
        sudo(env, f"rtcwake -m mem -s {sleep_secs}", timeout=sleep_secs + 60)
    elif mode == "restart":
        old = ssh(env, "pgrep -xo steam || true")
        ssh(env, "killall steam || true")
        wait_steam_relaunch(env, old)
    elif mode == "reload":
        sudo(env, RELOAD_CMD, timeout=90)
    else:
        raise SystemExit(f"unknown mode {mode}")


def judge_dom(s: dict | None) -> list[str]:
    if s is None:
        return ["home never came back"]
    problems = []
    if s["roots"] != 1:
        problems.append(f"roots={s['roots']}")
    if s.get("panels", 1) != 1:
        problems.append(f"panels={s.get('panels')}")
    if s["fallbackRoot"]:
        problems.append("fallback root present")
    return problems


def judge(s: dict | None, j: dict, base: dict, coexist: bool) -> list[str]:
    problems = judge_dom(s)
    if s is None:
        return problems
    if coexist:
        if j.get("owner") != base.get("owner"):
            problems.append(f"owner {base.get('owner')}->{j.get('owner')}")
        return problems
    if j.get("instances") != 1:
        problems.append(f"instances={j.get('instances')}")
    for k in ("timers", "observers", "subs"):
        if j.get(k, 0) > base.get(k, 0):
            problems.append(f"{k} {base.get(k)}->{j.get(k)}")
    if j.get("safeMode"):
        problems.append("safe mode tripped")
    return problems


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    mode = args[0] if args else "sleepwake"
    cycles = int(args[1]) if len(args) > 1 else 10
    coexist = "--coexist" in sys.argv
    expected = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--shelves=")), "6"))
    sleep_secs = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--sleep=")), "25"))
    env = load_env()
    host, port = cdp.load_env()
    first = wait_home(host, port, expected, 60)
    base = read_sjc(host, port)
    print("BASELINE", json.dumps(first), json.dumps(base))
    results = []
    for i in range(1, cycles + 1):
        t0 = time.time()
        trigger(mode, env, sleep_secs)
        s = wait_home(host, port, expected)
        j = read_sjc(host, port) if coexist else wait_plugin(host, port)
        time.sleep(3)
        j = read_sjc(host, port) if (coexist or j.get("instances")) else j
        problems = judge(s, j, base, coexist)
        rec = {"i": i, "ok": not problems, "problems": problems, "readyS": s and s.get("t_ready"), "cycleS": round(time.time() - t0, 1), "sjc": j}
        results.append(rec)
        print(f"cycle {i:3d} {'OK ' if not problems else 'BAD'} ready={rec['readyS']}s total={rec['cycleS']}s {problems or ''} owner={j.get('owner')} inst={j.get('instances')} scope={j.get('scope')}", flush=True)
    ok = sum(1 for r in results if r["ok"])
    print(f"SUMMARY {mode}{' (coexist)' if coexist else ''}: {ok}/{cycles} OK")
    out_dir = ROOT / "site" / "reports" / "perf"
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = "-coexist" if coexist else ""
    (out_dir / f"soak-{mode}{suffix}-latest.json").write_text(json.dumps({
        "mode": mode, "coexist": coexist, "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "cycles": cycles, "ok": ok, "baseline": base, "results": results,
    }, indent=2) + "\n", encoding="utf-8")
    sys.exit(0 if ok == cycles else 1)


if __name__ == "__main__":
    main()
