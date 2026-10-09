#!/usr/bin/env python3
"""
Deck Shelves — back-navigation gate (return-to-Home quality + leak check).

Drives real Steam navigation on the device over CDP (DFL.Navigation from the
plugin realm), alternating detail→Home and Library→Home, and measures per cycle:
time until the Home root exists, is revealed, holds every expected shelf, has
native recents hidden, and has gamepad focus on a card; whether the previously
selected card was restored; the number of roots (duplication); whether the
same-window DOM fallback mounted; and, across the run, timer/observer/
subscription deltas plus heap before/after. Requires a dev build (the perf
snapshot global is dev-only).

Usage:
    python3 scripts/deckprobe-ext/probes/backnav_gate.py            # 20 cycles, 6 shelves expected
    python3 scripts/deckprobe-ext/probes/backnav_gate.py 10 5
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from deckprobe.lib import cdp  # noqa: E402

SNAP = """(() => {
  const roots = document.querySelectorAll('#deck-shelves-home-root');
  const m = roots[0];
  const r = m && m.querySelector('.deck-shelves-root');
  const rec = document.querySelector('[aria-label="Jogos recentes"], [aria-label="Recent Games"]');
  const f = document.querySelector('.gpfocus');
  const fc = f && f.closest('.ds-card');
  return JSON.stringify({
    roots: roots.length,
    hasRoot: !!m,
    revealed: !!(r && getComputedStyle(r).display !== 'none'),
    shelves: document.querySelectorAll('.ds-shelf[data-shelfid]').length,
    recentsVisible: !!(rec && rec.getBoundingClientRect().height > 0),
    fallbackRoot: !!m && !!m.querySelector('[data-ds-fallback-host]'),
    focusAppid: fc ? fc.getAttribute('data-appid') : null,
    mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
  });
})()"""

# Plugin-provided dev hooks (host-agnostic); the loader's DFL globals are only
# a fallback for a build that predates them.
NAV_FOCUS = """(() => { try {
  if (typeof window.__ds_dev_nav_focus === 'function') return JSON.stringify(window.__ds_dev_nav_focus());
  const c = window.DFL.getFocusNavController();
  const ctx = c.m_ActiveContext || c.m_LastActiveContext;
  const el = ctx && ctx.m_lastFocusNode && ctx.m_lastFocusNode.m_element;
  const card = el && el.closest && el.closest('.ds-card');
  return JSON.stringify(card ? card.getAttribute('data-appid') : null);
} catch (e) { return 'null'; } })()"""

NAVIGATE = """(p => { if (typeof window.__ds_dev_navigate === 'function') return window.__ds_dev_navigate(p);
  window.DFL.Navigation.Navigate(p); return true; })(%s)"""
NAVIGATE_BACK = """(() => { if (typeof window.__ds_dev_navigate_back === 'function') return window.__ds_dev_navigate_back();
  window.DFL.Navigation.NavigateBack(); return true; })()"""

PERF = """(() => { try {
  const s = window.__ds_perf_snapshot();
  return JSON.stringify({ timers: s.activeTimers, observers: s.activeObservers, subs: s.activeSubscriptions,
    remounts: s.remountTries, longTasks: s.longTaskCount, longMs: Math.round(s.longTaskTotalMs) });
} catch (e) { return JSON.stringify({ err: String(e) }); } })()"""

TIMED_KEYS = ("t_root", "t_reveal", "t_full", "t_recentsHidden", "t_focus")


class Gate:
    def __init__(self, cycles: int, expected_shelves: int) -> None:
        host, port = cdp.load_env()
        self.bp = cdp.open_session(host, port, "Big Picture")
        self.sjc = cdp.open_session(host, port, "SharedJSContext")
        self.cycles = cycles
        self.expected = expected_shelves
        self.results: list[dict] = []

    def close(self) -> None:
        self.bp.close()
        self.sjc.close()

    def snap(self) -> dict:
        return json.loads(self.bp.evaluate(SNAP))

    def perf(self) -> dict:
        return json.loads(self.sjc.evaluate(PERF))

    def nav_focus(self) -> str | None:
        try:
            return json.loads(self.sjc.evaluate(NAV_FOCUS))
        except Exception:
            return None

    def navigate(self, target: str) -> None:
        self.sjc.evaluate(NAVIGATE % json.dumps(target))

    def back(self) -> None:
        self.sjc.evaluate(NAVIGATE_BACK)

    def wait_root_gone(self, timeout: float = 4.0) -> bool:
        t0 = time.time()
        while time.time() - t0 < timeout:
            if not self.snap()["hasRoot"]:
                return True
            time.sleep(0.1)
        return False

    def observe_return(self, rec: dict, pre_focus: str | None, t_ret: float) -> None:
        deadline = t_ret + 9.0
        while time.time() < deadline:
            s = self.snap()
            dt = round((time.time() - t_ret) * 1000)
            rec["maxRoots"] = max(rec["maxRoots"], s["roots"])
            rec["fallback"] = rec["fallback"] or s["fallbackRoot"]
            update_timings(rec, s, dt, self.expected)
            focus = s["focusAppid"] or self.nav_focus()
            if rec["t_focus"] is None and focus:
                rec["t_focus"] = dt
                rec["kept"] = focus == pre_focus
            if all(rec[k] is not None for k in TIMED_KEYS):
                return
            time.sleep(0.1)

    def run_cycle(self, i: int) -> dict:
        kind = "detail" if i % 2 == 1 else "library"
        pre_focus = self.snap()["focusAppid"] or self.nav_focus()
        target = f"/library/app/{pre_focus}" if (kind == "detail" and pre_focus) else "/library"
        self.navigate(target)
        if not self.wait_root_gone():
            print(f"cycle {i}: root never left Home after navigating to {target}")
        time.sleep(0.6)
        t_ret = time.time()
        self.back()
        rec = {"i": i, "kind": kind, "preFocus": pre_focus, "kept": None, "maxRoots": 0, "fallback": False}
        rec.update({k: None for k in TIMED_KEYS})
        self.observe_return(rec, pre_focus, t_ret)
        # "Kept" is judged at the end of the cycle: Steam's own focus-first-card
        # reflex can land before the plugin's restore re-takes, so the first
        # focus seen is only a timing, not the verdict. Bounded wait for the
        # restore loop's own window.
        rec["kept"] = self.wait_focus_restored(pre_focus, 3.5)
        time.sleep(1.2)
        rec["recentsVisibleAtEnd"] = self.snap()["recentsVisible"]
        return rec

    def wait_focus_restored(self, pre_focus: str | None, timeout: float) -> bool | None:
        if not pre_focus:
            return None
        t0 = time.time()
        while time.time() - t0 < timeout:
            if (self.snap()["focusAppid"] or self.nav_focus()) == pre_focus:
                return True
            time.sleep(0.15)
        return False

    def run(self) -> None:
        for sess in (self.bp, self.sjc):
            try:
                sess.call("HeapProfiler.collectGarbage", timeout=30)
            except Exception:
                pass
        base = self.snap()
        base_perf = self.perf()
        print("BASELINE", json.dumps(base), json.dumps(base_perf))
        for i in range(1, self.cycles + 1):
            rec = self.run_cycle(i)
            self.results.append(rec)
            print(
                f"cycle {i:2d} {rec['kind']:7s} root={rec['t_root']} reveal={rec['t_reveal']} full={rec['t_full']} "
                f"recentsHidden={rec['t_recentsHidden']} focus={rec['t_focus']} kept={rec['kept']} "
                f"roots<={rec['maxRoots']} fallback={rec['fallback']} recVisEnd={rec['recentsVisibleAtEnd']}"
            )
        # Forced GC first so the heap delta reflects retention, not garbage.
        for sess in (self.bp, self.sjc):
            try:
                sess.call("HeapProfiler.collectGarbage", timeout=30)
            except Exception:
                pass
        time.sleep(1.0)
        end = self.snap()
        end_perf = self.perf()
        print("END (after GC)", json.dumps(end), json.dumps(end_perf))
        self.summary(base, base_perf, end, end_perf)

    def summary(self, base: dict, base_perf: dict, end: dict, end_perf: dict) -> None:
        print("SUMMARY cycles", len(self.results))
        for k in TIMED_KEYS:
            vals = [r[k] for r in self.results if r[k] is not None]
            stat = (round(sum(vals) / len(vals)), max(vals), len(vals)) if vals else None
            print(f"  {k}: avg/max/n = {stat}")
        print("  selection kept:", sum(1 for r in self.results if r["kept"]), "/", len(self.results))
        print("  max roots seen:", max(r["maxRoots"] for r in self.results))
        print("  fallback mounted in cycles:", sum(1 for r in self.results if r["fallback"]))
        print("  recents visible at end of a cycle:", sum(1 for r in self.results if r["recentsVisibleAtEnd"]))
        for key in ("timers", "observers", "subs"):
            print(f"  {key} delta:", end_perf.get(key, 0) - base_perf.get(key, 0))
        print("  longTasks / longMs over run:", end_perf.get("longTasks"), end_perf.get("longMs"))
        print("  heap MB (pre-GC):", base["mem"], "->", end["mem"])
        self.write_results(base, base_perf, end, end_perf)

    def write_results(self, base: dict, base_perf: dict, end: dict, end_perf: dict) -> None:
        """Record the run so `pnpm run perf:gate:check` can judge it against thresholds."""
        full = [r["t_full"] for r in self.results if r["t_full"] is not None]
        out = {
            "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "cycles": len(self.results),
            "fullMsAvg": round(sum(full) / len(full)) if full else None,
            "fullMsMax": max(full) if full else None,
            "fullMeasured": len(full),
            "selectionKept": sum(1 for r in self.results if r["kept"]),
            "selectionJudged": sum(1 for r in self.results if r["kept"] is not None),
            "maxRoots": max(r["maxRoots"] for r in self.results),
            "fallbackMounts": sum(1 for r in self.results if r["fallback"]),
            "recentsVisibleAtEnd": sum(1 for r in self.results if r["recentsVisibleAtEnd"]),
            "leakDelta": {k: end_perf.get(k, 0) - base_perf.get(k, 0) for k in ("timers", "observers", "subs")},
            "heapMb": {"start": base["mem"], "end": end["mem"]},
            "cyclesDetail": self.results,
        }
        out_dir = Path(__file__).resolve().parents[3] / "site" / "reports" / "perf"
        out_dir.mkdir(parents=True, exist_ok=True)
        latest = out_dir / "backnav-latest.json"
        latest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        (out_dir / f"backnav-{time.strftime('%Y-%m-%d_%H-%M-%S')}.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        print("  results written:", latest)


def update_timings(rec: dict, s: dict, dt: int, expected: int) -> None:
    if rec["t_root"] is None and s["hasRoot"]:
        rec["t_root"] = dt
    if rec["t_reveal"] is None and s["revealed"]:
        rec["t_reveal"] = dt
    if rec["t_full"] is None and s["shelves"] >= expected:
        rec["t_full"] = dt
    if rec["t_recentsHidden"] is None and s["hasRoot"] and s["revealed"] and not s["recentsVisible"]:
        rec["t_recentsHidden"] = dt


def main() -> None:
    cycles = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    expected = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    gate = Gate(cycles, expected)
    try:
        gate.run()
    finally:
        gate.close()


if __name__ == "__main__":
    main()
