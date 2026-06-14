#!/usr/bin/env python3
"""Generic perf bench against a Steam Deck via CDP.

Project-agnostic: the runner reads selectors, navigation steps and
thresholds from a JSON config (default: ./perf-bench.config.json or the
path in PERF_BENCH_CONFIG). The config shape mirrors what the bench
needs and nothing else:

    {
      "name": "<your project>",
      "navigate": ["/library", "/library/home"],   // optional
      "mount_selector": ".your-card[data-foo]",   // required
      "count_selectors": {                         // optional
        "shelves": ".your-shelf[data-shelfid]",
        "cards":   ".your-card[data-appid]",
        "featured": ".your-card--featured"
      },
      "settings_cache_key": "your-settings-cache-v3",  // optional
      "thresholds": {
        "mount_ms_warn": 3000, "mount_ms_fail": 6000,
        "frame_gap_warn": 50,  "frame_gap_fail": 100
      }
    }

Usage:
    pnpm perf:bench
    pnpm perf:bench -- --runs 5 --config ./my-perf.json
    pnpm perf:bench -- --host 192.168.x.x --port 8081
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent.parent.parent))

from devkit.lib.cdp import open_session, load_env  # type: ignore


DEFAULT_THRESHOLDS = {
    "mount_ms_warn": 3000, "mount_ms_fail": 6000,
    "frame_gap_warn": 50,  "frame_gap_fail": 100,
}


def _load_config(path: str | None) -> dict:
    candidates = [path] if path else []
    candidates.append(os.environ.get("PERF_BENCH_CONFIG", ""))
    candidates.append("./perf-bench.config.json")
    candidates.append(str(THIS_DIR.parent / "perf-bench.config.json"))
    for c in candidates:
        if not c:
            continue
        p = Path(c)
        if p.is_file():
            with open(p) as f:
                cfg = json.load(f)
            cfg["_source"] = str(p)
            return cfg
    print("ERROR: no perf-bench config found. Pass --config or set PERF_BENCH_CONFIG.", file=sys.stderr)
    sys.exit(2)


_PROBE_BASELINE = """
(function(){
  const mem = performance.memory;
  return {
    usedJSHeapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(2) : null,
    totalJSHeapMB: mem ? +(mem.totalJSHeapSize / 1048576).toFixed(2) : null,
  };
})()
"""


def _build_mount_probe(cfg: dict) -> str:
    nav = json.dumps(cfg.get("navigate") or [])
    mount_sel = json.dumps(cfg.get("mount_selector") or "body")
    cs = cfg.get("count_selectors") or {}
    shelves_sel  = json.dumps(cs.get("shelves") or "")
    cards_sel    = json.dumps(cs.get("cards")   or "")
    featured_sel = json.dumps(cs.get("featured") or "")
    return f"""
(async function(){{
  performance.mark('pb-start');
  try {{
    if (typeof Router !== 'undefined' && Router?.Navigate) {{
      for (const p of {nav}) {{
        Router.Navigate(p);
        await new Promise(r => setTimeout(r, 400));
      }}
    }}
  }} catch {{}}

  const deadline = Date.now() + 8000;
  const mountSel = {mount_sel};
  while (Date.now() < deadline) {{
    if (mountSel && document.querySelector(mountSel)) break;
    await new Promise(r => setTimeout(r, 80));
  }}
  performance.mark('pb-end');
  performance.measure('pb-mount', 'pb-start', 'pb-end');

  const mountMs = +(performance.getEntriesByName('pb-mount')[0]?.duration ?? -1).toFixed(1);
  const shelves  = {shelves_sel}  ? document.querySelectorAll({shelves_sel}).length  : 0;
  const cards    = {cards_sel}    ? document.querySelectorAll({cards_sel}).length    : 0;
  const featured = {featured_sel} ? document.querySelectorAll({featured_sel}).length : 0;

  let maxFrameMs = 0;
  let lastT = performance.now();
  await new Promise(resolve => {{
    let n = 0;
    function tick(t) {{
      const gap = t - lastT;
      if (gap > maxFrameMs) maxFrameMs = gap;
      lastT = t;
      if (++n < 10) requestAnimationFrame(tick);
      else resolve();
    }}
    requestAnimationFrame(tick);
  }});

  const mem = performance.memory;
  return {{
    mountMs, shelves, cards, featured,
    maxFrameGapMs: +maxFrameMs.toFixed(1),
    usedJSHeapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(2) : null,
  }};
}})()
"""


def _build_scale_probe(cfg: dict) -> str:
    cs = cfg.get("count_selectors") or {}
    shelf_sel = json.dumps(cs.get("shelves") or "")
    card_sel  = json.dumps(cs.get("cards")   or "")
    cache_key = json.dumps(cfg.get("settings_cache_key") or "")
    shelf_id_attr   = json.dumps(cfg.get("shelf_id_attribute")   or "data-shelfid")
    settings_paths  = cfg.get("settings_count_paths") or []
    return f"""
(function(){{
  const shelfSel = {shelf_sel};
  const cardSel  = {card_sel};
  const idAttr   = {shelf_id_attr};
  const els = shelfSel ? Array.from(document.querySelectorAll(shelfSel)) : [];
  const rendered = els.map(el => {{
    const rect = el.getBoundingClientRect();
    return {{
      id: el.getAttribute(idAttr) || '?',
      cards: cardSel ? el.querySelectorAll(cardSel).length : 0,
      h: Math.round(rect.height),
    }};
  }});
  let configured = [];
  const key = {cache_key};
  try {{
    if (key) {{
      const s = JSON.parse(localStorage.getItem(key) || '{{}}');
      configured = {json.dumps(settings_paths)}.map(p => {{
        const arr = p.split('.').reduce((o, k) => (o ? o[k] : undefined), s);
        return {{ path: p, count: Array.isArray(arr) ? arr.length : 0 }};
      }});
    }}
  }} catch {{}}
  return {{ rendered, configured }};
}})()
"""


def _run_bench(cfg: dict, host: str, port: int, target: str, runs: int) -> dict:
    print(f"[perf] connecting to {host}:{port} [{target}]", flush=True)
    sess = open_session(host, port, target)

    print("[perf] baseline memory", flush=True)
    baseline = sess.evaluate(_PROBE_BASELINE, timeout=5) or {}

    print("[perf] scale probe", flush=True)
    scale = sess.evaluate(_build_scale_probe(cfg), timeout=10) or {}
    rendered = scale.get("rendered", [])
    shelf_count = len(rendered)
    total_cards = sum(s.get("cards", 0) for s in rendered)
    print(f"[perf] shelves={shelf_count} cards={total_cards}", flush=True)

    mount_probe = _build_mount_probe(cfg)
    mount_times, max_frames, heap_after = [], [], []
    for i in range(runs):
        print(f"[perf] run {i+1}/{runs}", flush=True)
        r = sess.evaluate(mount_probe, timeout=20) or {}
        mount_times.append(r.get("mountMs", -1))
        max_frames.append(r.get("maxFrameGapMs", 0))
        heap = r.get("usedJSHeapMB")
        if heap is not None: heap_after.append(heap)
        print(f"       mount={r.get('mountMs')}ms maxFrame={r.get('maxFrameGapMs')}ms heap={heap}MB", flush=True)
        time.sleep(0.5)

    sess.close()

    def _avg(lst): return round(sum(lst) / len(lst), 1) if lst else None
    def _p90(lst):
        if not lst: return None
        s = sorted(lst)
        return round(s[int(len(s) * 0.9)], 1)

    return {
        "project": cfg.get("name", "unknown"),
        "host": host, "port": port, "target": target, "runs": runs,
        "scale": {
            "shelves_rendered": shelf_count,
            "cards_rendered": total_cards,
            "configured": scale.get("configured", []),
            "shelf_detail": rendered,
        },
        "mount_ms":    {"avg": _avg(mount_times), "p90": _p90(mount_times), "all": mount_times},
        "frame_gap_ms": {"avg": _avg(max_frames), "p90": _p90(max_frames), "all": max_frames},
        "heap_mb": {"baseline": baseline.get("usedJSHeapMB"), "after_avg": _avg(heap_after)},
        "thresholds": {**DEFAULT_THRESHOLDS, **(cfg.get("thresholds") or {})},
    }


def _print_summary(data: dict) -> None:
    thr = data["thresholds"]
    mount = data["mount_ms"]
    frame = data["frame_gap_ms"]
    scale = data["scale"]
    heap = data["heap_mb"]
    print()
    print("=" * 60)
    print(f"  Perf Benchmark — {data['project']}")
    print("=" * 60)
    print(f"  Scale   : {scale['shelves_rendered']} groups, {scale['cards_rendered']} items")
    for c in scale.get("configured", []):
        print(f"  Config  : {c['path']} = {c['count']}")
    ma = mount["avg"] or 0
    mf = "FAIL" if ma > thr["mount_ms_fail"] else ("WARN" if ma > thr["mount_ms_warn"] else "OK")
    print(f"  Mount   : [{mf}] avg={mount['avg']}ms p90={mount['p90']}ms (warn>{thr['mount_ms_warn']}ms)")
    fa = frame["avg"] or 0
    ff = "FAIL" if fa > thr["frame_gap_fail"] else ("WARN" if fa > thr["frame_gap_warn"] else "OK")
    print(f"  Jank    : [{ff}] maxFrame avg={frame['avg']}ms p90={frame['p90']}ms (warn>{thr['frame_gap_warn']}ms)")
    if heap.get("baseline") is not None and heap.get("after_avg") is not None:
        print(f"  Heap    : baseline={heap['baseline']}MB after={heap['after_avg']}MB")
    print("=" * 60)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="")
    parser.add_argument("--host", default="")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--target", default="Big Picture")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--json-out", default="")
    args = parser.parse_args()

    cfg = _load_config(args.config or None)
    env_host, env_port = load_env()
    host = args.host or env_host
    port = args.port or env_port
    if not host:
        print("ERROR: DECK_HOST not set.", file=sys.stderr)
        return 1

    data = _run_bench(cfg, host, port, args.target, args.runs)
    _print_summary(data)

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(data, indent=2))
        print(f"[perf] JSON -> {args.json_out}")

    return 0 if (data["mount_ms"]["avg"] or 0) < data["thresholds"]["mount_ms_fail"] else 1


if __name__ == "__main__":
    sys.exit(main())
