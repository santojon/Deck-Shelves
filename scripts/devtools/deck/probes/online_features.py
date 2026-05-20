#!/usr/bin/env python3
"""
Deck Shelves — online features diagnostic.

Checks the state of online features: settings, caches, store fetch,
wishlist backend call, and price cache.

Usage:
    python3 scripts/devtools/deck/probes/online_features.py
    python3 scripts/devtools/deck/probes/online_features.py --clear-caches

Flags:
    --clear-caches   Remove ds-store-cache-v1 and ds-price-cache-v1 from
                     localStorage so the next shelf resolve fetches fresh data.
    --call-wishlist  Call the Python get_wishlist backend and report the result.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[5]))
from scripts.devtools.deck.probes._base import connect, ev, sep  # noqa: E402


def check_settings(sjc) -> dict:
    sep("Settings (localStorage cache)")
    raw = ev(sjc, """
    (() => {
      const raw = localStorage.getItem('deck-shelves-settings-cache-v3');
      if (!raw) return JSON.stringify({err: 'no cache'});
      const s = JSON.parse(raw);
      return JSON.stringify({
        enabled: s.enabled,
        shelvesCount: s.shelves?.length,
        onlineFeaturesEnabled: s.onlineFeaturesEnabled,
        onlineWishlistEnabled: s.onlineWishlistEnabled,
        onlinePriceSortEnabled: s.onlinePriceSortEnabled,
        onlinePrivacyAccepted: s.onlinePrivacyAccepted,
        onlineShelves: s.shelves?.filter(sh => sh?.source?.type === 'wishlist' || sh?.source?.type === 'store')
          .map(sh => ({title: sh.title, source: sh.source?.type})),
      }, null, 2);
    })()
    """)
    data = json.loads(raw or "{}")
    if data.get("err"):
        print(f"  ⚠ {data['err']}")
    else:
        print(f"  enabled               : {data.get('enabled')}")
        print(f"  shelves               : {data.get('shelvesCount')}")
        print(f"  onlineFeaturesEnabled : {data.get('onlineFeaturesEnabled')}")
        print(f"  onlineWishlistEnabled : {data.get('onlineWishlistEnabled')}")
        print(f"  onlinePriceSortEnabled: {data.get('onlinePriceSortEnabled')}")
        print(f"  onlinePrivacyAccepted : {data.get('onlinePrivacyAccepted')}")
        onl = data.get("onlineShelves", [])
        if onl:
            print(f"  online shelves        : {onl}")
        else:
            print("  online shelves        : (none created yet)")
    return data


def check_caches(sjc) -> None:
    sep("localStorage caches")
    raw = ev(sjc, """
    (() => {
      const storeRaw = localStorage.getItem('ds-store-cache-v1');
      const wishlistRaw = localStorage.getItem('ds-wishlist-cache-v1');
      const priceRaw = localStorage.getItem('ds-price-cache-v1');
      const out = {};
      if (storeRaw) {
        const s = JSON.parse(storeRaw);
        out.storeCache = { ids: s.data?.ids?.length, ageMin: Math.round((Date.now() - s.ts) / 60000) };
      } else { out.storeCache = null; }
      if (wishlistRaw) {
        const w = JSON.parse(wishlistRaw);
        out.wishlistCache = { ids: w.data?.ids?.length, ageMin: Math.round((Date.now() - w.ts) / 60000) };
      } else { out.wishlistCache = null; }
      if (priceRaw) {
        const p = JSON.parse(priceRaw);
        out.priceCache = { entries: Object.keys(p).length };
      } else { out.priceCache = null; }
      return JSON.stringify(out, null, 2);
    })()
    """)
    data = json.loads(raw or "{}")
    sc = data.get("storeCache")
    wc = data.get("wishlistCache")
    pc = data.get("priceCache")
    # Pre-format each cache summary outside the f-string. Nested f-strings
    # with backslash-escaped quotes (`{sc[\"ids\"]}`) only parse on Python
    # 3.12+ (PEP 701); CodeQL / older runners fail with SyntaxError. Building
    # the inner strings up-front sidesteps the limitation entirely.
    store_summary    = f"{sc['ids']} IDs, {sc['ageMin']}min old" if sc else "(empty)"
    wishlist_summary = f"{wc['ids']} IDs, {wc['ageMin']}min old" if wc else "(empty)"
    price_summary    = f"{pc['entries']} entries"                if pc else "(empty)"
    print(f"  store cache   : {store_summary}")
    print(f"  wishlist cache: {wishlist_summary}")
    print(f"  price cache   : {price_summary}")


def check_store_fetch(sjc) -> None:
    sep("Steam Store search API")
    raw = ev(sjc, """
    (async () => {
      const urls = [
        'https://store.steampowered.com/search/results/?specials=1&json=1&count=10&cc=us',
        'https://store.steampowered.com/search/results/?maxprice=free&json=1&count=10&cc=us',
      ];
      const results = {};
      for (const url of urls) {
        const key = url.includes('specials') ? 'specials' : 'free';
        try {
          const r = await fetch(url);
          if (!r.ok) { results[key] = {err: `HTTP ${r.status}`}; continue; }
          const ct = r.headers.get('content-type') ?? '';
          if (!ct.includes('json')) { results[key] = {err: `non-json: ${ct}`}; continue; }
          const j = await r.json();
          const ids = (j?.items ?? []).map(it => {
            const m = it?.logo?.match(/\\/apps\\/(\\d+)\\//);
            return m ? Number(m[1]) : null;
          }).filter(Boolean);
          results[key] = { count: ids.length, sample: ids.slice(0, 3) };
        } catch(e) { results[key] = {err: String(e)}; }
      }
      return JSON.stringify(results, null, 2);
    })()
    """, timeout=15)
    data = json.loads(raw or "{}")
    for key, val in data.items():
        if val.get("err"):
            print(f"  ❌ {key}: {val['err']}")
        else:
            print(f"  ✅ {key}: {val['count']} IDs  sample={val['sample']}")


def check_price_api(sjc) -> None:
    sep("Price API (api/appdetails)")
    raw = ev(sjc, """
    (async () => {
      // Test with Dota 2 (570, free), Subnautica (264710, paid)
      const url = 'https://store.steampowered.com/api/appdetails?appids=570,264710&filters=price_overview';
      const r = await fetch(url);
      if (!r.ok) return JSON.stringify({err: `HTTP ${r.status}`});
      const j = await r.json();
      return JSON.stringify({
        dota2: j?.[570]?.success ? (j[570].data?.price_overview ? j[570].data.price_overview : 'no price (F2P)') : 'failed',
        subnautica: j?.[264710]?.success ? (j[264710].data?.price_overview ?? 'no price') : 'failed',
      }, null, 2);
    })()
    """, timeout=10)
    data = json.loads(raw or "{}")
    if data.get("err"):
        print(f"  ❌ {data['err']}")
    else:
        print(f"  Dota 2 (F2P) : {data.get('dota2')}")
        print(f"  Subnautica   : {data.get('subnautica')}")


def call_wishlist_backend(sjc) -> None:
    sep("Wishlist backend call (get_wishlist)")
    raw = ev(sjc, """
    (async () => {
      const init = globalThis.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
      if (!init?.connect) return JSON.stringify({err: 'no deckyLoaderAPIInit'});
      const api = init.connect(1, 'Deck Shelves');
      const communityUrl = globalThis.urlStore?.m_steamUrls?.userwishlist?.url ?? '';
      const res = await api.call('get_wishlist', { community_url: communityUrl });
      return JSON.stringify({
        ok: res?.ok,
        count: res?.count,
        first5: res?.ids?.slice?.(0, 5),
        authed: res?.authed,
        error: res?.error?.substring?.(0, 100),
      }, null, 2);
    })()
    """, timeout=20)
    data = json.loads(raw or "{}")
    if data.get("ok"):
        print(f"  ✅ ok=True  count={data['count']}  authed={data.get('authed', False)}")
        print(f"     first5={data.get('first5')}")
    else:
        print(f"  ❌ error: {data.get('error') or data.get('err')}")


def clear_caches(sjc) -> None:
    sep("Clearing caches")
    raw = ev(sjc, """
    (() => {
      localStorage.removeItem('ds-store-cache-v1');
      localStorage.removeItem('ds-price-cache-v1');
      return JSON.stringify({
        storeCleared: !localStorage.getItem('ds-store-cache-v1'),
        priceCleared: !localStorage.getItem('ds-price-cache-v1'),
      });
    })()
    """)
    data = json.loads(raw or "{}")
    print(f"  store cache cleared : {data.get('storeCleared')}")
    print(f"  price cache cleared : {data.get('priceCleared')}")


def run() -> int:
    parser = argparse.ArgumentParser(description="Deck Shelves — online features diagnostic")
    parser.add_argument("--clear-caches", action="store_true", help="Clear store and price caches")
    parser.add_argument("--call-wishlist", action="store_true", help="Call get_wishlist Python backend")
    args = parser.parse_args()

    sjc, host, port = connect()
    print(f"Connected: {host}:{port}\n")

    settings = check_settings(sjc)
    check_caches(sjc)
    check_store_fetch(sjc)
    check_price_api(sjc)

    if args.call_wishlist:
        call_wishlist_backend(sjc)

    if args.clear_caches:
        clear_caches(sjc)

    sjc.close()
    sep()

    online = settings.get("onlineFeaturesEnabled")
    if not online:
        print("⚠ Online features are disabled — enable in QAM › Behavior")
    else:
        print("✅ Online features enabled")
    return 0


if __name__ == "__main__":
    sys.exit(run())
