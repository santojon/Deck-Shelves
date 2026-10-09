#!/usr/bin/env python3
"""
Deck Shelves — multi-scenario perf matrix (vanilla / empty / typical 8×20 /
stress 16×50 / large 2000 / huge 5000) without a redeploy per scenario.

Requires the QA perf-matrix build on the device:
    DS_QA_PERF_MATRIX=1 pnpm run deploy:deck:hard      (== pnpm run qa:perf-matrix)

Switching a scenario = write `localStorage['__ds_perf_scenario']` in the plugin
realm and call the dev hook `__ds_qa_reapply_override()` (the settings store
only recomputes on a real backend change, so the write alone does nothing —
that was the "lagged one scenario behind, then stuck" failure of the earlier
navigate-to-force-a-remount approach). No reload, no Steam restart. Per
scenario: wait for the expected shelf count, do one route-away/return (warm
rebuild, what users feel), and record time-to-full, long tasks and heap.

Usage:
    python3 scripts/deckprobe-ext/probes/perf_matrix.py            # all scenarios
    python3 scripts/deckprobe-ext/probes/perf_matrix.py typical_8x20 stress_16x50
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from deckprobe.lib import cdp  # noqa: E402

SCENARIOS = {
    "vanilla": 0, "empty": 0, "typical_8x20": 8, "stress_16x50": 16, "large_2000": 20, "huge_5000": 50,
}

SNAP = """(() => { const m = document.getElementById('deck-shelves-home-root');
  const r = m && m.querySelector('.deck-shelves-root');
  return JSON.stringify({ hasRoot: !!m, revealed: !!(r && getComputedStyle(r).display !== 'none'),
    shelves: document.querySelectorAll('.ds-shelf[data-shelfid]').length, cards: document.querySelectorAll('.ds-card').length,
    mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null }); })()"""
PERF = """(() => { try { const s = window.__ds_perf_snapshot();
  return JSON.stringify({ longTasks: s.longTaskCount, longMs: Math.round(s.longTaskTotalMs), timers: s.activeTimers, observers: s.activeObservers, subs: s.activeSubscriptions }); }
  catch (e) { return JSON.stringify({ err: String(e) }); } })()"""
NAV = "(p => { if (typeof window.__ds_dev_navigate === 'function') return window.__ds_dev_navigate(p); window.DFL.Navigation.Navigate(p); return true; })(%s)"
BACK = "(() => { if (typeof window.__ds_dev_navigate_back === 'function') return window.__ds_dev_navigate_back(); window.DFL.Navigation.NavigateBack(); return true; })()"


class Matrix:
    def __init__(self) -> None:
        host, port = cdp.load_env()
        self.bp = cdp.open_session(host, port, "Big Picture")
        self.sjc = cdp.open_session(host, port, "SharedJSContext")

    def close(self) -> None:
        self.bp.close()
        self.sjc.close()

    def snap(self) -> dict:
        return json.loads(self.bp.evaluate(SNAP))

    def perf(self) -> dict:
        return json.loads(self.sjc.evaluate(PERF))

    def gc(self) -> None:
        for sess in (self.bp, self.sjc):
            try:
                sess.call("HeapProfiler.collectGarbage", timeout=30)
            except Exception:
                pass

    def switch(self, name: str) -> bool:
        r = self.sjc.evaluate(
            "(n => { try { localStorage.setItem('__ds_perf_scenario', n); "
            "if (typeof window.__ds_qa_reapply_override !== 'function') return 'no-hook'; "
            "window.__ds_qa_reapply_override(); return 'ok'; } catch (e) { return 'err:' + e; } })(%s)" % json.dumps(name)
        )
        if r != "ok":
            print(f"  switch({name}) -> {r}  (is the QA perf-matrix build deployed?)")
        return r == "ok"

    def wait_shelves(self, expected: int, timeout: float = 30.0) -> dict:
        t0 = time.time()
        s = self.snap()
        while time.time() - t0 < timeout:
            s = self.snap()
            if (expected == 0 and s["shelves"] == 0) or (expected > 0 and s["shelves"] >= expected and s["revealed"]):
                break
            time.sleep(0.25)
        s["t_settle"] = round((time.time() - t0) * 1000)
        return s

    def warm_return(self, expected: int) -> dict:
        # Leaving a Home with thousands of cards tears them all down inside this
        # evaluate; give it room instead of cutting it off at the default 8 s.
        self.sjc.evaluate(NAV % json.dumps("/library"), timeout=60.0)
        time.sleep(2.0)
        p0 = self.perf()
        t0 = time.time()
        self.sjc.evaluate(BACK, timeout=60.0)
        t_full = None
        deadline = t0 + 12.0
        while time.time() < deadline:
            s = self.snap()
            if s["hasRoot"] and s["revealed"] and s["shelves"] >= expected:
                t_full = round((time.time() - t0) * 1000)
                break
            time.sleep(0.1)
        time.sleep(1.5)
        p1 = self.perf()
        return {"t_full_ms": t_full, "longTasks": p1.get("longTasks", 0) - p0.get("longTasks", 0), "longMs": p1.get("longMs", 0) - p0.get("longMs", 0)}

    def run_one(self, name: str) -> dict:
        expected = SCENARIOS[name]
        print(f"=== {name} (expect {expected} shelves)")
        if not self.switch(name):
            return {"scenario": name, "error": "switch failed"}
        s = self.wait_shelves(expected)
        print(f"  settled in {s['t_settle']} ms: shelves={s['shelves']} cards={s['cards']}")
        ret = self.warm_return(expected) if expected > 0 else {"t_full_ms": None, "longTasks": 0, "longMs": 0}
        self.gc()
        time.sleep(1.0)
        end = self.snap()
        print(f"  warm return: full={ret['t_full_ms']} ms, longTasks={ret['longTasks']} ({ret['longMs']} ms), heap after GC {end['mem']} MB")
        return {"scenario": name, "expectedShelves": expected, "shelves": end["shelves"], "cards": end["cards"], "settleMs": s["t_settle"], "heapMbAfterGc": end["mem"], **{"return_" + k: v for k, v in ret.items()}}

    # One scenario failing (a CDP timeout while thousands of cards tear down)
    # must not lose the others: record the error and carry on.
    def run(self, names: list[str]) -> list[dict]:
        out = []
        for name in names:
            try:
                out.append(self.run_one(name))
            except Exception as e:
                print(f"  {name}: {e!r}")
                out.append({"scenario": name, "expectedShelves": SCENARIOS[name], "error": repr(e)})
        return out


def main() -> None:
    names = [a for a in sys.argv[1:] if a in SCENARIOS] or list(SCENARIOS)
    m = Matrix()
    results: list[dict] = []
    try:
        results = m.run(names)
        m.switch("typical_8x20")
    finally:
        m.close()
        out_dir = ROOT / "site" / "reports" / "perf"
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "perf-matrix-latest.json").write_text(json.dumps({"recordedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "results": results}, indent=2) + "\n", encoding="utf-8")
        print("results written:", out_dir / "perf-matrix-latest.json")
    sys.exit(0 if all("error" not in r for r in results) else 1)


if __name__ == "__main__":
    main()
