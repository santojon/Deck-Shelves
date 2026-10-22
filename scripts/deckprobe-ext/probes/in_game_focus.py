#!/usr/bin/env python3
"""
Deck Shelves — focus grabs, menu access and timer wakeups while a game runs (run from the dev machine).

The Home stays mounted behind a running game. Nothing of ours may take Steam's
gamepad focus there: a grab lands on the invisible Home, and the Steam button /
Quick Access stop answering (reported as menus "not working while gaming").

What the probe does, on whatever build the device runs (no debug hooks needed):
  1. counts every BTakeFocus on a nav node inside our Home root (the card nav
     node's prototype is patched in the Big Picture document for the run) and
     every timer callback fired in the shared context, attributed to the plugin
     by the stack that scheduled it;
  2. launches a small installed game (or a non-Steam shortcut: --appid of an
     existing one, or a temporary one from --shortcut-exe; a shortcut is
     started and stopped by its 64-bit game id, read from its overview), waits
     for it to run (the running-apps list, or a game window in the compositor's
     focus events, which a shortcut never shows in the list), optionally opens
     the Home over it, then samples for
     --seconds: focus grabs, timer wakeups, the active nav tree, the power
     gate's state on a dev build, and several times opens the Quick Access menu
     and the Steam menu through Steam's own API, checking that each takes the
     nav focus and keeps it;
  3. stops the game, comes back to the Home, and reads where focus landed.

Judged: zero focus grabs from our cards while the game runs; both menus take
and keep focus every time; a card is focused again on the Home afterwards;
with --max-wakeups, the plugin's timer wakeups stay within the limit; with the
Home behind the game, no shelf resolves (the delta of the perf record's mount
fetch counter; reported only with --home-over-game, where the Home is live).
The report keeps the raw window list of the focus events, to read what the
compositor says about a non-Steam window (appid, executable).

Usage:
    python3 scripts/deckprobe-ext/probes/in_game_focus.py [--appid 332200] [--seconds 75]
        [--home-over-game] [--shortcut-exe /usr/bin/sleep --shortcut-args 300]
        [--max-wakeups 4] [--label before] [--out DIR]

Needs DECK_HOST / DECK_CDP_PORT in .env. Refuses to start while a game is running.
Exit codes: 0 judged green, 1 a check failed, 2 precondition failed.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from deckprobe.screenshots.lib.cdp import open_session  # noqa: E402

BUNDLE_MARKS = ["deck%20shelves", "deck shelves", "deck-shelves", "/bundle/index.js"]

INSTALL_BP = r"""(() => {
  const g = globalThis; if (g.__probe_focus) return 'already';
  const card = document.querySelector('#deck-shelves-home-root .ds-card');
  if (!card) return 'no card';
  const fk = Object.keys(card).find(k => k.startsWith('__reactFiber$'));
  let node = null;
  for (let f = fk && card[fk], d = 0; f && d < 10 && !node; f = f.return, d++) {
    let h = f.memoizedState;
    for (let i = 0; h && typeof h === 'object' && i < 40 && !node; i++, h = h.next) {
      const cur = h.memoizedState && h.memoizedState.current;
      if (cur && cur.m_Tree && typeof cur.BTakeFocus === 'function') node = cur;
    }
  }
  if (!node) return 'no nav node';
  const proto = Object.getPrototypeOf(node);
  const orig = proto.BTakeFocus;
  const P = g.__probe_focus = { start: Date.now(), btf: 0, btfDs: 0, btfDsStacks: [], focusin: 0, proto, orig };
  proto.BTakeFocus = function (...a) {
    const el = this && this.m_element;
    const ds = !!(el && el.closest && el.closest('#deck-shelves-home-root'));
    P.btf++;
    if (ds) { P.btfDs++; if (P.btfDsStacks.length < 12) P.btfDsStacks.push({ t: Date.now() - P.start, stack: String(new Error().stack).split('\n').slice(2, 7).map(s => s.trim().slice(0, 120)).join(' | ') }); }
    return orig.apply(this, a);
  };
  P.onFocusIn = (e) => { const t = e.target; if (t && t.closest && t.closest('#deck-shelves-home-root')) P.focusin++; };
  document.addEventListener('focusin', P.onFocusIn, true);
  return 'ok';
})()"""

REMOVE_BP = r"""(() => { const P = globalThis.__probe_focus; if (!P) return 'none';
  try { P.proto.BTakeFocus = P.orig; } catch (e) {}
  try { document.removeEventListener('focusin', P.onFocusIn, true); } catch (e) {}
  delete globalThis.__probe_focus; return 'removed'; })()"""

READ_BP = r"""(() => { const P = globalThis.__probe_focus || {}; const a = document.activeElement;
  const card = a && a.closest && a.closest('#deck-shelves-home-root .ds-card');
  return JSON.stringify({ btf: P.btf || 0, btfDs: P.btfDs || 0, focusin: P.focusin || 0, stacks: P.btfDsStacks || [],
    active: a ? a.tagName + '.' + String(a.className).slice(0, 24) : null, activeCard: card ? card.getAttribute('data-appid') : null,
    hidden: document.hidden, cards: document.querySelectorAll('#deck-shelves-home-root .ds-card').length }); })()"""

INSTALL_SJC = r"""(() => { const g = globalThis; if (g.__probe_wake) return 'already';
  const W = g.__probe_wake = { all: 0, ds: 0, sites: {}, origT: g.setTimeout, origI: g.setInterval };
  const marks = %s;
  // Attributed when scheduled: the scheduling stack names the bundle, the firing stack does not.
  // The first frames past the wrapper name the call site (readable on a dev build).
  const siteOf = () => { try { const st = String(new Error().stack); const low = st.toLowerCase(); if (!marks.some(m => low.includes(m))) return null; return st.split('\n').slice(3, 5).map(x => x.trim().replace(/https?:[^ )]*\//g, '')).join(' <- ').slice(0, 220); } catch (e) { return null; } };
  const wrap = (fn, site) => typeof fn !== 'function' ? fn : function (...a) { W.all++; if (site) { W.ds++; W.sites[site] = (W.sites[site] || 0) + 1; } return fn.apply(this, a); };
  g.setTimeout = function (fn, ...r) { return W.origT.call(g, wrap(fn, siteOf()), ...r); };
  g.setInterval = function (fn, ...r) { return W.origI.call(g, wrap(fn, siteOf()), ...r); };
  // The compositor's focus events: which windows exist and which has the focus (a game's window shows up here).
  const FW = g.__probe_fw = { last: null, seen: [], reg: null };
  try { FW.reg = SteamClient.System.UI.RegisterForFocusChangeEvents(e => { try { FW.last = JSON.parse(JSON.stringify(e)); const f = (e && e.focusedApp) || {}; const k = f.appid + '|' + f.strExeName + '|' + ((e && e.rgFocusable) || []).map(a => a.appid + ':' + a.strExeName).join(','); if (FW.seen[FW.seen.length - 1] !== k && FW.seen.length < 40) FW.seen.push(k); } catch (x) {} }); } catch (x) {}
  return 'ok'; })()""" % json.dumps(BUNDLE_MARKS)

REMOVE_SJC = r"""(() => { const W = globalThis.__probe_wake; if (!W) return 'none';
  try { const FW = globalThis.__probe_fw; if (FW && FW.reg && FW.reg.unregister) FW.reg.unregister(); } catch (e) {}
  delete globalThis.__probe_fw;
  globalThis.setTimeout = W.origT; globalThis.setInterval = W.origI; delete globalThis.__probe_wake; return 'removed'; })()"""

READ_SJC = r"""(() => { const W = globalThis.__probe_wake || {}; const c = globalThis.FocusNavController;
  const t = c && c.m_ActiveContext && c.m_ActiveContext.m_LastActiveNavTree;
  const ui = globalThis.SteamUIStore;
  const stamps = {}; for (const k of ['__ds_focus_first', '__ds_focus_effect_ran']) if (k in globalThis) stamps[k] = globalThis[k];
  try { if (typeof globalThis.__ds_power_gate === 'function') stamps.powerGate = globalThis.__ds_power_gate(); } catch (e) { stamps.powerGate = 'ERR ' + e; }
  const FW = globalThis.__probe_fw || {}; const wins = (FW.last && FW.last.rgFocusable) || [];
  // Any window that is not Steam's own (appid 769 / steamwebhelper); what the plugin's gate makes of it is in stamps.powerGate.
  const gameWindows = wins.filter(a => a && Number(a.appid) !== 769 && !/steamwebhelper|^steam$/i.test(String(a.strExeName || ''))).map(a => [a.appid, a.strExeName]);
  const fa = FW.last && FW.last.focusedApp;
  const P = globalThis.__ds_perf_state;
  return JSON.stringify({ wakeAll: W.all || 0, wakeDs: W.ds || 0, tree: t ? t.m_ID : null, running: (ui && ui.RunningApps || []).map(x => x.appid || x.unAppID),
    gameWindows, focusedWindow: fa ? [fa.appid, fa.strExeName] : null, windowSeen: (FW.seen || []).slice(-6),
    wakeSites: Object.entries(W.sites || {}).sort((x, y) => y[1] - x[1]).slice(0, 8),
    resolves: P && typeof P.mountFetches === 'number' ? P.mountFetches : null,
    buttons: ui && ui.BHomeAndQuickAccessButtonsEnabled ? ui.BHomeAndQuickAccessButtonsEnabled() : null,
    route: ui.WindowStore.GamepadUIMainWindowInstance.m_history.location.pathname, stamps }); })()"""

MENU_JS = r"""(async () => {
  const nav = globalThis.DFL && globalThis.DFL.Navigation; if (!nav) return JSON.stringify({ err: 'no DFL.Navigation' });
  const tree = () => { const c = FocusNavController; const t = c.m_ActiveContext && c.m_ActiveContext.m_LastActiveNavTree; return t ? t.m_ID : null; };
  const out = {};
  for (const [name, open, want] of [['qam', 'OpenQuickAccessMenu', /^QuickAccess/], ['main', 'OpenMainMenu', /^MainNavMenu/]]) {
    let took = false, seen = [];
    try { nav[open](); } catch (e) { out[name] = { err: String(e) }; continue; }
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) { await new Promise(r => setTimeout(r, 100)); const id = tree(); seen.push(id); if (id && want.test(id)) { took = true; break; } }
    // Keep sampling: a grab from our side shows as the tree leaving the menu while it is open.
    let stolen = 0, held = []; const t1 = Date.now();
    while (took && Date.now() - t1 < 3000) { await new Promise(r => setTimeout(r, 150)); const id = tree(); held.push(id); if (!(id && want.test(id))) stolen++; }
    out[name] = { took, ms: Date.now() - t0, trees: [...new Set(seen)], stolen, heldTrees: [...new Set(held)] };
    try { nav.CloseSideMenus(); } catch (e) {}
    await new Promise(r => setTimeout(r, 900));
  }
  out.after = tree();
  return JSON.stringify(out);
})()"""


def env() -> tuple[str, int]:
    host = os.environ.get("DECK_HOST", "")
    port = int(os.environ.get("DECK_CDP_PORT", "8081") or "8081")
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                v = v.strip().strip("\"'")
                if k.strip() == "DECK_HOST" and not host:
                    host = v
                if k.strip() == "DECK_CDP_PORT" and v:
                    port = int(v)
    return host, port


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--appid", type=int, default=332200)
    ap.add_argument("--seconds", type=int, default=75)
    ap.add_argument("--label", default="run")
    ap.add_argument("--out", default="")
    ap.add_argument("--shortcut-exe", default="", help="create a temporary non-Steam shortcut to this executable, launch it instead of --appid, remove it afterwards")
    ap.add_argument("--shortcut-args", default="")
    ap.add_argument("--home-over-game", action="store_true", help="after the launch, open the Home over the running game (as the Steam button's Home does) before sampling")
    ap.add_argument("--max-wakeups", type=int, default=-1, help="fail when the plugin's timer wakeups during the run exceed this (energy check; -1 = report only)")
    return ap.parse_args()


def j(session, expr: str, timeout: float = 15.0):
    return json.loads(session.evaluate(expr, timeout=timeout))


def route(sjc) -> str:
    return str(j(sjc, READ_SJC)["route"])


def launch_id(sjc, appid: int) -> str:
    # A non-Steam shortcut is started and stopped by its 64-bit game id; its 32-bit appid does nothing.
    if appid <= 0x7FFFFFFF:
        return str(appid)
    for _ in range(20):
        gid = sjc.evaluate(f"String((appStore.GetAppOverviewByAppID({appid}) || {{}}).gameid || '')", timeout=10)
        if gid and gid != "0":
            return str(gid)
        time.sleep(0.5)
    return str(appid)


def wait_started(sjc, appid: int, timeout_s: float) -> str | None:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        st = j(sjc, READ_SJC)
        if appid in st["running"]:
            return "running-apps"
        if st["gameWindows"]:
            return "game-window"
        time.sleep(1)
    return None


def wait_stopped(sjc, appid: int, timeout_s: float) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        st = j(sjc, READ_SJC)
        if appid not in st["running"] and not st["gameWindows"]:
            return True
        time.sleep(2)
    return False


def wait_route(sjc, prefix: str, tries: int) -> bool:
    for _ in range(tries):
        time.sleep(1)
        if route(sjc).startswith(prefix):
            return True
    return False


def ensure_home(sjc) -> bool:
    # Steam parks on an app page after a launch; come back to the Home first.
    if route(sjc).startswith("/library/home"):
        return True
    sjc.evaluate("DFL.Navigation.NavigateBack()", timeout=10)
    if not wait_route(sjc, "/library/home", 12):
        sjc.evaluate("DFL.Navigation.Navigate('/library/home')", timeout=10)
        time.sleep(3)
    ok = route(sjc).startswith("/library/home")
    if ok:
        time.sleep(3)
    return ok


def preconditions(sjc, bp) -> str | None:
    running = j(sjc, READ_SJC)["running"]
    if running:
        return f"a game is already running: {running}"
    if not ensure_home(sjc):
        return "could not reach the Home"
    inst = bp.evaluate(INSTALL_BP, timeout=15)
    if inst != "ok":
        return f"could not install the focus oracle: {inst}"
    print("sjc wake counter:", sjc.evaluate(INSTALL_SJC, timeout=10))
    return None


def add_temp_shortcut(sjc, exe: str, launch_args: str) -> int | None:
    created = sjc.evaluate(
        f"SteamClient.Apps.AddShortcut('DS probe', {json.dumps(exe)}, {json.dumps(os.path.dirname(exe) or '/')}, {json.dumps(launch_args)})",
        timeout=20,
    )
    try:
        appid = int(created)
    except (TypeError, ValueError):
        print("AddShortcut returned", created)
        return None
    time.sleep(2)
    print("temporary shortcut", appid)
    return appid


def remove_temp_shortcut(sjc, appid: int) -> None:
    try:
        sjc.evaluate(f"SteamClient.Apps.TerminateApp({json.dumps(launch_id(sjc, appid))}, false)", timeout=10)
        time.sleep(2)
    except Exception:
        pass
    try:
        print("remove shortcut:", sjc.evaluate(f"SteamClient.Apps.RemoveShortcut({appid})", timeout=10))
    except Exception as e:
        print("RemoveShortcut failed:", e)


def open_home_over_game(sjc, bp, report: dict) -> None:
    sjc.evaluate("DFL.Navigation.Navigate('/library/home')", timeout=10)
    for _ in range(15):
        time.sleep(1)
        if j(bp, READ_BP)["cards"] > 0 and route(sjc).startswith("/library/home"):
            break
    report["home_over_game"] = {"bp": j(bp, READ_BP), "sjc": j(sjc, READ_SJC)}
    hb = report["home_over_game"]["bp"]
    print("home over game:", {k: hb[k] for k in ("cards", "activeCard")}, report["home_over_game"]["sjc"]["tree"])


def menu_times(seconds: int, home_over_game: bool) -> set[int]:
    if home_over_game:
        return {5, 15, max(25, seconds // 2), max(35, (2 * seconds) // 3)}
    return {max(10, seconds // 3), max(20, (2 * seconds) // 3)}


def print_sample(sample: dict) -> None:
    gate = (sample["sjc"].get("stamps") or {}).get("powerGate")
    gate_s = f" gate={gate.get('state')}" if isinstance(gate, dict) else ""
    bp, sjc = sample["bp"], sample["sjc"]
    print(f"t={sample['t']:3d}s btfDs={bp['btfDs']} btfAll={bp['btf']} wakeDs={sjc['wakeDs']} wakeAll={sjc['wakeAll']} resolves={sjc['resolves']} tree={sjc['tree']} activeCard={bp['activeCard']}{gate_s} win={sjc['gameWindows']}")


def print_menus(el: int, res: dict) -> None:
    q, m = res.get("qam", {}), res.get("main", {})
    print(f"   menus at {el}s: qam took={q.get('took')} stolen={q.get('stolen')} {q.get('heldTrees')} | main took={m.get('took')} stolen={m.get('stolen')} {m.get('heldTrees')}")


def sample_phase(sjc, bp, report: dict, seconds: int, home_over_game: bool) -> None:
    t_start = time.time()
    done: set[int] = set()
    menu_at = menu_times(seconds, home_over_game)
    while time.time() - t_start < seconds:
        time.sleep(5)
        el = int(time.time() - t_start)
        sample = {"t": el, "bp": j(bp, READ_BP), "sjc": j(sjc, READ_SJC)}
        report["samples"].append(sample)
        print_sample(sample)
        for m in sorted(menu_at):
            if el >= m and m not in done:
                done.add(m)
                res = j(sjc, MENU_JS, timeout=20)
                res["t"] = el
                report["menus"].append(res)
                print_menus(el, res)


def stop_and_return(sjc, bp, appid: int, gid: str, report: dict) -> None:
    print("stopping the game")
    sjc.evaluate(f"SteamClient.Apps.TerminateApp({json.dumps(gid)}, false)", timeout=10)
    stopped = wait_stopped(sjc, appid, 60)
    time.sleep(4)
    report["after"] = {"stopped": stopped, "bp": j(bp, READ_BP), "sjc": j(sjc, READ_SJC)}
    # Steam lands on the game's page after exit; the Home must get a card focused on the way back.
    if not report["after"]["sjc"]["route"].startswith("/library/home"):
        sjc.evaluate("DFL.Navigation.NavigateBack()", timeout=10)
        wait_route(sjc, "/library/home", 12)
    for _ in range(8):
        time.sleep(1)
        if j(bp, READ_BP)["activeCard"]:
            break
    report["home"] = {"bp": j(bp, READ_BP), "sjc": j(sjc, READ_SJC)}


def launch(sjc, appid: int, report: dict) -> str:
    gid = launch_id(sjc, appid)
    report["launch_id"] = gid
    print("launching", appid, "" if gid == str(appid) else f"(game id {gid})")
    sjc.evaluate(f'SteamClient.Apps.RunGame({json.dumps(gid)}, "", -1, 100)', timeout=10)
    return gid


def run(sjc, bp, args: argparse.Namespace, report: dict) -> int:
    err = preconditions(sjc, bp)
    if err:
        print(err)
        return 2
    appid = args.appid
    if args.shortcut_exe:
        appid = add_temp_shortcut(sjc, args.shortcut_exe, args.shortcut_args)
        if appid is None:
            return 2
        report["appid"] = appid
        report["temp_shortcut"] = True
    report["before"] = {"bp": j(bp, READ_BP), "sjc": j(sjc, READ_SJC)}
    gid = launch(sjc, appid, report)
    report["started_by"] = wait_started(sjc, appid, 60)
    if not report["started_by"]:
        print("game did not start")
        report["error"] = "no start"
        return 2
    print("started by:", report["started_by"])
    time.sleep(5)
    if args.home_over_game:
        open_home_over_game(sjc, bp, report)
    report["at_start"] = {"bp": j(bp, READ_BP), "sjc": j(sjc, READ_SJC)}
    sample_phase(sjc, bp, report, args.seconds, args.home_over_game)
    stop_and_return(sjc, bp, appid, gid, report)
    return 0


def menu_ok(m: dict) -> bool:
    q, mm = m.get("qam", {}), m.get("main", {})
    return bool(q.get("took") and mm.get("took") and not q.get("stolen") and not mm.get("stolen"))


def resolves_delta(start_sjc: dict, last: dict) -> int | None:
    a, b = start_sjc["resolves"], last["sjc"]["resolves"]
    return b - a if isinstance(a, int) and isinstance(b, int) else None


def judge(report: dict, args: argparse.Namespace) -> dict:
    start_bp, start_sjc = report["at_start"]["bp"], report["at_start"]["sjc"]
    last = report["samples"][-1] if report["samples"] else report["at_start"]
    wake_ds = last["sjc"]["wakeDs"] - start_sjc["wakeDs"]
    resolves = resolves_delta(start_sjc, last)
    return {
        "home_over_game": bool(args.home_over_game),
        "focus_grabs_in_game": last["bp"]["btfDs"] - start_bp["btfDs"],
        "menus_took_focus": all(menu_ok(m) for m in report["menus"]),
        "home_focused_after": bool(report.get("after", {}).get("stopped")) and bool(report.get("home", {}).get("bp", {}).get("activeCard")),
        "plugin_timer_wakeups_in_game": wake_ds,
        "wakeups_within_limit": args.max_wakeups < 0 or wake_ds <= args.max_wakeups,
        "shelf_resolves_in_game": resolves,
        "resolves_ok": args.home_over_game or resolves in (0, None),
        "started_by": report.get("started_by"),
        "seconds": args.seconds,
    }


def main() -> int:
    args = parse_args()
    host, port = env()
    if not host:
        print("DECK_HOST missing")
        return 2
    sjc = open_session(host, port, "SharedJSContext")
    bp = open_session(host, port, "Big Picture")
    report: dict = {"label": args.label, "appid": args.appid, "samples": [], "menus": []}
    code = 2
    try:
        code = run(sjc, bp, args, report)
    finally:
        if report.get("temp_shortcut"):
            remove_temp_shortcut(sjc, report["appid"])
        for sess, expr in ((bp, REMOVE_BP), (sjc, REMOVE_SJC)):
            try:
                sess.evaluate(expr, timeout=10)
            except Exception:
                pass
        bp.close()
        sjc.close()
    if code != 0 or "at_start" not in report:
        return code
    verdict = judge(report, args)
    report["verdict"] = verdict
    out_dir = Path(args.out) if args.out else ROOT / ".deploy"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"in-game-focus-{args.label}.json"
    out.write_text(json.dumps(report, indent=2))
    print("after game:", {k: report["after"]["sjc"][k] for k in ("route", "tree")}, "| home:", {k: report["home"]["bp"].get(k) for k in ("activeCard", "cards")})
    print("verdict:", json.dumps(verdict), "->", out)
    if not verdict["wakeups_within_limit"]:
        print(f"energy: {verdict['plugin_timer_wakeups_in_game']} plugin timer wakeups in {args.seconds} s, limit {args.max_wakeups}")
        for site, n in (report["samples"][-1]["sjc"].get("wakeSites") or [])[:6]:
            print(f"  {n:5d} x {site}")
    if not verdict["resolves_ok"]:
        print(f"shelf resolves while the game ran: {verdict['shelf_resolves_in_game']}")
    ok = verdict["focus_grabs_in_game"] == 0 and verdict["menus_took_focus"] and verdict["home_focused_after"] and verdict["wakeups_within_limit"] and verdict["resolves_ok"]
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
