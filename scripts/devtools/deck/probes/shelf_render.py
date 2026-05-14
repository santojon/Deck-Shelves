#!/usr/bin/env python3
"""
Deck Shelves — shelf render diagnostic.

Lists all DS shelves on the home screen with their card counts,
AppOverview availability, and online-source status.

Usage:
    python3 scripts/devtools/deck/probes/shelf_render.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[5]))
from scripts.devtools.deck.probes._base import connect, ev, sep  # noqa: E402


def run() -> int:
    sjc, host, port = connect()
    print(f"Connected: {host}:{port}\n")

    sep("DS shelves on home screen")
    raw = ev(sjc, """
    (async () => {
      const gpuDoc = window.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
      const appStore = globalThis.appStore;
      const shelves = Array.from(gpuDoc?.querySelectorAll?.('[data-shelfid]') ?? []);
      const out = [];
      const seen = new Set();
      for (const el of shelves) {
        const shelfId = el.getAttribute('data-shelfid');
        if (seen.has(shelfId)) continue;
        seen.add(shelfId);
        const titleEl = el.querySelector('[class*="shelfTitle"], .ds-shelf-title');
        const title = titleEl?.textContent?.trim() ?? shelfId;
        const cards = Array.from(el.querySelectorAll('.ds-card[data-appid]'));
        const sampleIds = cards.slice(0, 3).map(c => Number(c.getAttribute('data-appid')));
        const localCount = sampleIds.filter(id => !!appStore?.GetAppOverviewByAppID?.(id)).length;
        out.push({
          shelfId, title,
          cardCount: cards.length,
          sampleIds,
          localRatio: `${localCount}/${sampleIds.length}`,
        });
      }
      return JSON.stringify(out, null, 2);
    })()
    """, timeout=10)
    data = json.loads(raw or "[]")
    for item in data:
        print(f"  {item['title']:<35} cards={item['cardCount']}  "
              f"localAppOverview={item['localRatio']}  sample={item['sampleIds']}")

    sep("AppStore size")
    raw = ev(sjc, """
    (() => {
      const as = globalThis.appStore;
      return JSON.stringify({
        allAppsCount: as?.allApps?.length,
        hasFn: typeof as?.GetAppOverviewByAppID === 'function',
      });
    })()
    """)
    data = json.loads(raw or "{}")
    print(f"  allApps count : {data.get('allAppsCount')}")
    print(f"  GetAppOverviewByAppID available: {data.get('hasFn')}")

    sjc.close()
    return 0


if __name__ == "__main__":
    sys.exit(run())
