#!/usr/bin/env python3
"""
Performance benchmark for Deck Shelves home rendering.

Measures:
  - Cold mount time (navigate to home → first shelf visible)
  - Per-shelf and per-card render overhead at current scale
  - Scroll jank indicators (long-task estimate via rAF timing)
  - Memory delta after mount vs baseline

Usage:
    pnpm perf:bench               # uses .env
    pnpm perf:bench -- --runs 5
    pnpm perf:bench -- --host 192.168.x.x --port 8081

Output is machine-readable JSON + human summary. Suitable for tracking
before/after deltas in PRs.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent.parent.parent))

from scripts.devtools.deck.lib.cdp import open_session, load_env  # type: ignore


# ---------------------------------------------------------------------------
# JS probes
# ---------------------------------------------------------------------------

_PROBE_BASELINE = """
(function(){
  const mem = performance.memory;
  return {
    usedJSHeapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(2) : null,
    totalJSHeapMB: mem ? +(mem.totalJSHeapSize / 1048576).toFixed(2) : null,
  };
})()
"""

_PROBE_MOUNT = """
(async function(){
  performance.mark('ds-bench-start');

  try {
    if (typeof Router !== 'undefined' && Router?.Navigate) {
      Router.Navigate('/library');
      await new Promise(r => setTimeout(r, 400));
      Router.Navigate('/library/home');
    }
  } catch {}

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (document.querySelector('.ds-card[data-appid]')) break;
    await new Promise(r => setTimeout(r, 80));
  }
  performance.mark('ds-bench-shelf');
  performance.measure('ds-bench-mount', 'ds-bench-start', 'ds-bench-shelf');

  const mountMs = +(performance.getEntriesByName('ds-bench-mount')[0]?.duration ?? -1).toFixed(1);
  const shelves = document.querySelectorAll('.ds-shelf[data-shelfid]').length;
  const cards   = document.querySelectorAll('.ds-card[data-appid]').length;
  const featured = document.querySelectorAll('.ds-card--featured').length;

  let maxFrameMs = 0;
  let lastT = performance.now();
  await new Promise(resolve => {
    let n = 0;
    function tick(t) {
      const gap = t - lastT;
      if (gap > maxFrameMs) maxFrameMs = gap;
      lastT = t;
      if (++n < 10) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });

  const mem = performance.memory;
  return {
    mountMs,
    shelves,
    cards,
    featured,
    maxFrameGapMs: +maxFrameMs.toFixed(1),
    usedJSHeapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(2) : null,
  };
})()
"""

_PROBE_SHELF_SCALE = """
(function(){
  const shelfEls = Array.from(document.querySelectorAll('.ds-shelf[data-shelfid]'));
  const rendered = shelfEls.map(el => {
    const id = el.getAttribute('data-shelfid') || '?';
    const cards = el.querySelectorAll('.ds-card[data-appid]').length;
    const rect = el.getBoundingClientRect();
    return { id, cards, h: Math.round(rect.height) };
  });
  const settings = JSON.parse(localStorage.getItem('deck-shelves-settings-cache-v3') || '{}');
  const configured = (settings.shelves || []).map(s => ({id: s.id, title: s.title, limit: s.limit || 20, enabled: s.enabled, hidden: s.hidden}));
  const smart = (settings.smartShelves || []).map(s => ({id: s.id, title: s.title, limit: s.limit || 20, enabled: s.enabled !== false, hidden: s.hidden}));
  return { rendered, configured, smart };
})()
"""


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def _run_bench(host: str, port: int, runs: int) -> dict:
    print(f"[perf] connecting to {host}:{port} …", flush=True)
    bp = open_session(host, port, "Big Picture")

    print("[perf] baseline memory …", flush=True)
    baseline = bp.evaluate(_PROBE_BASELINE, timeout=5) or {}

    print("[perf] shelf scale probe …", flush=True)
    scale = bp.evaluate(_PROBE_SHELF_SCALE, timeout=10) or {}

    shelf_count = len(scale.get("rendered", []))
    total_cards = sum(s["cards"] for s in scale.get("rendered", []))
    print(f"[perf] shelves={shelf_count}  cards={total_cards}", flush=True)

    mount_times, max_frames, heap_after = [], [], []

    for i in range(runs):
        print(f"[perf] run {i+1}/{runs} …", flush=True)
        r = bp.evaluate(_PROBE_MOUNT, timeout=20) or {}
        mt = r.get("mountMs", -1)
        mf = r.get("maxFrameGapMs", 0)
        heap = r.get("usedJSHeapMB")
        print(f"       mount={mt}ms  maxFrame={mf}ms  heap={heap}MB  s={r.get('shelves')} c={r.get('cards')}", flush=True)
        mount_times.append(mt)
        max_frames.append(mf)
        if heap is not None:
            heap_after.append(heap)
        time.sleep(0.5)

    bp.close()

    def _avg(lst): return round(sum(lst) / len(lst), 1) if lst else None
    def _p90(lst):
        if not lst: return None
        s = sorted(lst)
        return round(s[int(len(s) * 0.9)], 1)

    return {
        "host": host,
        "port": port,
        "runs": runs,
        "scale": {
            "shelves_rendered": shelf_count,
            "cards_rendered": total_cards,
            "configured_regular": len(scale.get("configured", [])),
            "configured_smart": len(scale.get("smart", [])),
            "shelf_detail": scale.get("rendered", []),
        },
        "mount_ms": {"avg": _avg(mount_times), "p90": _p90(mount_times), "all": mount_times},
        "frame_gap_ms": {"avg": _avg(max_frames), "p90": _p90(max_frames), "all": max_frames},
        "heap_mb": {
            "baseline": baseline.get("usedJSHeapMB"),
            "after_avg": _avg(heap_after),
        },
        "thresholds": {
            "mount_ms_warn": 3000, "mount_ms_fail": 6000,
            "frame_gap_warn": 50, "frame_gap_fail": 100,
        },
    }


def _print_summary(data: dict) -> None:
    scale = data["scale"]
    mount = data["mount_ms"]
    frame = data["frame_gap_ms"]
    heap = data["heap_mb"]
    thr = data["thresholds"]
    print()
    print("=" * 60)
    print("  Deck Shelves — Performance Benchmark")
    print("=" * 60)
    print(f"  Scale   : {scale['shelves_rendered']} shelves, {scale['cards_rendered']} cards total")
    print(f"  Config  : {scale['configured_regular']} regular + {scale['configured_smart']} smart")

    ma = mount["avg"] or 0
    mf = "⚠️ " if ma > thr["mount_ms_warn"] else ("❌ " if ma > thr["mount_ms_fail"] else "✅ ")
    print(f"  Mount   : {mf}avg={mount['avg']}ms  p90={mount['p90']}ms  (warn>{thr['mount_ms_warn']}ms)")

    fa = frame["avg"] or 0
    ff = "⚠️ " if fa > thr["frame_gap_warn"] else ("❌ " if fa > thr["frame_gap_fail"] else "✅ ")
    print(f"  Jank    : {ff}maxFrame avg={frame['avg']}ms  p90={frame['p90']}ms  (warn>{thr['frame_gap_warn']}ms)")

    if heap.get("baseline") and heap.get("after_avg"):
        delta = round(heap["after_avg"] - heap["baseline"], 2)
        print(f"  Heap    : baseline={heap['baseline']}MB  after={heap['after_avg']}MB  Δ=+{delta}MB")

    if scale["shelf_detail"]:
        print("  Shelves :")
        for s in scale["shelf_detail"][:12]:
            print(f"    {'…' + s['id'][-28:] if len(s['id']) > 29 else s['id']:30s}  cards={s['cards']:3d}")
        if len(scale["shelf_detail"]) > 12:
            print(f"    … and {len(scale['shelf_detail']) - 12} more")

    print()
    if ma > thr["mount_ms_fail"]:
        print("  ❌ FAIL: Mount >6s. Reduce shelf count or cards per shelf.")
    elif ma > thr["mount_ms_warn"]:
        print("  ⚠️  WARN: Mount >3s. Consider fewer shelves or smaller limits.")
    else:
        print("  ✅ PASS: Performance within acceptable range.")

    if scale["cards_rendered"] > 0 and scale["shelves_rendered"] > 0:
        avg_cards = scale["cards_rendered"] / scale["shelves_rendered"]
        if avg_cards > 50:
            print(f"  ⚠️  NOTE: {avg_cards:.0f} cards/shelf avg — consider limit ≤50 for smoother scroll.")
    print("=" * 60)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--json-out", default="")
    args = parser.parse_args()

    env_host, env_port = load_env()
    host = args.host or env_host
    port = args.port or env_port

    if not host:
        print("ERROR: DECK_HOST not set.", file=sys.stderr)
        return 1

    data = _run_bench(host, port, args.runs)
    _print_summary(data)

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(data, indent=2))
        print(f"[perf] JSON → {args.json_out}")

    return 0 if (data["mount_ms"]["avg"] or 0) < data["thresholds"]["mount_ms_fail"] else 1


if __name__ == "__main__":
    sys.exit(main())
