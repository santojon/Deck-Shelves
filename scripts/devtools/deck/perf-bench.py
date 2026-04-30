#!/usr/bin/env python3
"""
Tiny performance bench for the home-cold-mount path. Drops a few
`performance.mark` / `performance.measure` calls into the BigPicture
runtime via CDP, navigates to the home, then reads the durations back.

Usage:
    python3 scripts/devtools/deck/perf-bench.py [--host HOST] [--port 8080]

Output is suitable for tracking before/after deltas in PRs.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent.parent))

from scripts.devtools.deck.screenshots.lib.cdp import open_session  # type: ignore


def _load_env() -> tuple[str, int]:
    host = os.environ.get("DECK_HOST", "")
    port = int(os.environ.get("DECK_CDP_PORT", "8080") or "8080")
    env = THIS_DIR.parent.parent.parent / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k == "DECK_HOST" and not host: host = v
            elif k == "DECK_CDP_PORT" and v:
                try: port = int(v)
                except ValueError: pass
    return host, port


BENCH_EXPR = """
(async function(){
  const out = {};
  const measure = (name) => { try { return performance.getEntriesByName(name)[0]?.duration ?? null; } catch { return null; } };
  performance.mark('ds-bench-start');
  // Navigate to home so the home patch runs from a clean state.
  if (typeof Router !== 'undefined' && Router?.Navigate) {
    Router.Navigate('/library');
    await new Promise(r => setTimeout(r, 300));
    Router.Navigate('/library/home');
  }
  // Wait until at least one DS shelf is in the DOM.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (document.querySelector('.ds-shelf[data-shelfid]')) break;
    await new Promise(r => setTimeout(r, 50));
  }
  performance.mark('ds-bench-shelf-rendered');
  performance.measure('ds-bench-mount', 'ds-bench-start', 'ds-bench-shelf-rendered');
  out.mountMs = measure('ds-bench-mount');
  out.shelvesRendered = document.querySelectorAll('.ds-shelf[data-shelfid]').length;
  out.cardsRendered = document.querySelectorAll('.ds-card[data-appid]').length;
  return out;
})()
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Bench home cold mount.")
    parser.add_argument("--host")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--runs", type=int, default=3)
    args = parser.parse_args()

    env_host, env_port = _load_env()
    host = args.host or env_host
    port = args.port or env_port
    if not host:
        print("error: --host required (or set DECK_HOST in .env)", file=sys.stderr)
        return 2

    print(f"Targeting {host}:{port}, {args.runs} runs")
    sess = open_session(host, port, "Big Picture")
    try:
        durations = []
        for i in range(1, args.runs + 1):
            r = sess.evaluate(BENCH_EXPR, timeout=15)
            mount_ms = (r or {}).get("mountMs")
            shelves = (r or {}).get("shelvesRendered")
            cards = (r or {}).get("cardsRendered")
            print(f"  run {i}: mount {mount_ms:.1f} ms, {shelves} shelves, {cards} cards")
            if isinstance(mount_ms, (int, float)):
                durations.append(mount_ms)
            time.sleep(1)

        if durations:
            avg = sum(durations) / len(durations)
            mn = min(durations)
            mx = max(durations)
            print(f"\nmount p_avg = {avg:.1f} ms, p_min = {mn:.1f} ms, p_max = {mx:.1f} ms")
        return 0
    finally:
        sess.close()


if __name__ == "__main__":
    raise SystemExit(main())
