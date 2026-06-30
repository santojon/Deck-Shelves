#!/usr/bin/env python3
"""
Deck Shelves — native shelf detection probe.

Verifies the heuristic the sidenav + Quick Search use to find Steam's
native recents row on the home: walk the DS class map for
`nativeShelfContainer`, filter out instances inside `.deck-shelves-root`
and `#deck-shelves-home-root`, require at least one native card
(`:not(.ds-card)`), pick the visually topmost match.

Surfaces every candidate with its position, parent, inside-DS flag and
native-card count so you can see why a candidate was kept or dropped.

Usage:
    python3 scripts/deckprobe-ext/probes/native_shelf_detection.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[5]))
from deckprobe.probes._base import connect, ev, sep  # noqa: E402


def run() -> int:
    sjc, host, port = connect(title="Big Picture")
    print(f"Connected: {host}:{port}\n")

    sep("Native shelf detection — candidates from classmap")
    raw = ev(sjc, """
    JSON.stringify((function() {
      var map = null;
      try { map = JSON.parse(localStorage.getItem('ds_class_map') || 'null'); } catch (e) {}
      if (!map) return { error: 'no classmap' };
      var root = document.querySelector('.deck-shelves-root');
      var homeRoot = document.getElementById('deck-shelves-home-root');
      var candidates = [];
      var seen = new Set();
      function pushClass(cls) {
        if (!cls) return;
        document.querySelectorAll('[class~="' + cls + '"]').forEach(function(el){
          if (!seen.has(el)) { seen.add(el); candidates.push(el); }
        });
      }
      pushClass(map.nativeShelfContainer);
      pushClass(map.shelfSection);
      var nativeCardCls = map.nativeCard;
      var nativeCardSel = nativeCardCls
        ? '[class~="' + nativeCardCls + '"]:not(.ds-card), a[href*="/library/app/"]:not(.ds-card), [data-appid]:not(.ds-card)'
        : 'a[href*="/library/app/"]:not(.ds-card), [data-appid]:not(.ds-card)';
      var report = candidates.map(function(el){
        var r = el.getBoundingClientRect();
        return {
          cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
          insideDs: !!(root && root.contains(el)),
          insideHomeRoot: !!(homeRoot && homeRoot.contains(el)),
          top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width),
          nativeCardsCount: el.querySelectorAll(nativeCardSel).length,
        };
      });
      var winner = null;
      var bestTop = Infinity;
      candidates.forEach(function(el){
        if (root && root.contains(el)) return;
        if (homeRoot && homeRoot.contains(el)) return;
        if (!el.isConnected) return;
        if (!el.querySelector(nativeCardSel)) return;
        var r = el.getBoundingClientRect();
        if (r.height < 40 || r.width < 40) return;
        if (r.top < bestTop) { winner = el; bestTop = r.top; }
      });
      return {
        nativeShelfClass: map.nativeShelfContainer,
        nativeCardClass: map.nativeCard,
        candidateCount: candidates.length,
        candidates: report,
        winner: winner ? {
          cls: typeof winner.className === 'string' ? winner.className.slice(0, 80) : '',
          top: Math.round(winner.getBoundingClientRect().top),
          nativeCardsCount: winner.querySelectorAll(nativeCardSel).length,
        } : null,
      };
    })())
    """)
    data = json.loads(raw) if isinstance(raw, str) else raw
    print(json.dumps(data, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(run())
