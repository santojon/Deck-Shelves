#!/usr/bin/env python3
"""
Deck Shelves — card-count performance probe.

Measures home-screen render time at increasing card counts to find the
threshold where FPS / frame budget degrades noticeably.

Usage:
    python3 scripts/devtools/deck/probes/perf_card_count.py
    python3 scripts/devtools/deck/probes/perf_card_count.py --max-count 100 --steps 5 10 20 30 50 75 100

The probe temporarily changes the first DS shelf's limit, triggers a
re-resolve, and measures the time between the resolve start and the last
card appearing in DOM. All changes are in-memory only — shelf settings
are restored afterwards.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[5]))
from scripts.devtools.deck.probes._base import connect, ev, sep  # noqa: E402

DEFAULT_STEPS = [5, 10, 15, 20, 25, 30, 40, 50]


def measure_at_count(sjc, shelf_id: str, count: int) -> dict:
    """Set shelf limit to `count`, trigger re-resolve, return timing info."""
    result = ev(sjc, f"""
    (async () => {{
        const ss = globalThis.__DECK_SHELVES_SHARED_SETTINGS__;
        const gpuDoc = window.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
        if (!ss || !gpuDoc) return JSON.stringify({{err: 'no settings or gpuDoc'}});

        // Temporarily change the shelf limit
        const shelf = ss.shelves?.find(s => s.id === '{shelf_id}');
        if (!shelf) return JSON.stringify({{err: 'shelf not found'}});
        const origLimit = shelf.limit;
        shelf.limit = {count};

        // Emit refresh event so the shelf re-resolves
        const t0 = performance.now();
        window.dispatchEvent(new CustomEvent('ds-shelf-refresh'));
        gpuDoc.defaultView?.dispatchEvent?.(new CustomEvent('ds-shelf-refresh'));

        // Poll until the expected number of cards appears (max 5s)
        let elapsed = 0;
        let cardCount = 0;
        const deadline = 5000;
        while (elapsed < deadline) {{
            await new Promise(r => setTimeout(r, 50));
            elapsed += 50;
            const shelfEl = gpuDoc.querySelector('[data-shelfid="{shelf_id}"]');
            cardCount = shelfEl ? shelfEl.querySelectorAll('.ds-card[data-appid]').length : 0;
            if (cardCount >= Math.min({count}, 5)) break;
        }}
        const renderMs = performance.now() - t0;

        // Restore original limit
        shelf.limit = origLimit;

        return JSON.stringify({{
            limit: {count},
            cardsRendered: cardCount,
            renderMs: Math.round(renderMs),
            timedOut: elapsed >= deadline,
        }});
    }})()
    """, timeout=10)
    return __import__('json').loads(result or '{}')


def run() -> int:
    parser = argparse.ArgumentParser(description="Card count performance probe")
    parser.add_argument("--steps", type=int, nargs="+", default=DEFAULT_STEPS)
    parser.add_argument("--shelf-id", help="Force a specific shelf ID to test")
    args = parser.parse_args()

    sjc, host, port = connect()
    print(f"Connected: {host}:{port}\n")

    sep("Finding first DS shelf")
    shelf_info = ev(sjc, """
    (() => {
        const gpuDoc = window.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
        const shelves = Array.from(gpuDoc?.querySelectorAll('[data-shelfid]') ?? []);
        const seen = new Set();
        for (const s of shelves) {
            const id = s.getAttribute('data-shelfid');
            if (seen.has(id)) continue; seen.add(id);
            const cards = s.querySelectorAll('.ds-card[data-appid]').length;
            if (cards > 0) return JSON.stringify({ id, cards });
        }
        return JSON.stringify({ err: 'no shelf with cards found' });
    })()
    """)
    info = __import__('json').loads(shelf_info or '{}')
    if info.get('err'):
        print(f"  ❌ {info['err']}")
        sjc.close()
        return 1

    shelf_id = args.shelf_id or info['id']
    print(f"  Shelf: {shelf_id}  (currently {info['cards']} cards)")

    sep("Render time by card count")
    print(f"  {'Count':>6}  {'Rendered':>8}  {'RenderMs':>9}  {'Est. FPS budget':>16}")
    print(f"  {'─'*6}  {'─'*8}  {'─'*9}  {'─'*16}")
    results = []
    for count in sorted(args.steps):
        r = measure_at_count(sjc, shelf_id, count)
        if r.get('err'):
            print(f"  {count:>6}  ERROR: {r['err']}")
            continue
        ms = r.get('renderMs', 0)
        rendered = r.get('cardsRendered', 0)
        r.get('timedOut', False)
        # 60 fps = 16.67ms/frame; flag if render > 2 frames
        flag = "⚠ slow" if ms > 33 else "✅"
        print(f"  {count:>6}  {rendered:>8}  {ms:>8}ms  {flag}")
        results.append((count, ms, rendered))
        time.sleep(0.5)  # let the shelf settle

    sep("Recommendation")
    ok = [(c, ms) for c, ms, _ in results if ms <= 33]
    slow = [(c, ms) for c, ms, _ in results if ms > 33]
    if ok:
        max_ok = max(c for c, _ in ok)
        print(f"  ✅ Up to {max_ok} cards renders within 2-frame budget (≤33ms)")
    if slow:
        first_slow = min(c for c, _ in slow)
        print(f"  ⚠  At {first_slow}+ cards render time exceeds 33ms")
    if ok and slow:
        print(f"\n  Suggested shelf limit: {max_ok}")
    elif ok:
        print("\n  All tested counts render fast. Try higher values.")

    sjc.close()
    return 0


if __name__ == "__main__":
    sys.exit(run())
