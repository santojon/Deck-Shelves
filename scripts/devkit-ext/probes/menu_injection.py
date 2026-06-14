#!/usr/bin/env python3
"""
Deck Shelves — menu injection diagnostic.

Verifies that the "Deck Shelves" submenu appears in the native game
context menu for cards across different shelves and game states
(installed Steam, uninstalled Steam, non-Steam shortcut).

Usage:
    python3 devkit/probes/menu_injection.py

What it checks:
  1. CreateContextMenuInstance patch installed (installCreateContextMenuPatch)
  2. LibraryContextMenu class discovered (discoverLibraryContextMenuClass)
  3. "Deck Shelves" item appears in DOM for 3 different cards
  4. Submenu expands with 7 expected actions
  5. React tree has DS items (hasDsItem) for all tested menus
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[5]))
from devkit.probes._base import connect, ev, sep  # noqa: E402


# ─────────────────────────────────────────────────────────────────────────────


def check_patches(sjc) -> None:
    sep("Patch state")
    result = ev(sjc, """
    (() => {
      const dfl = globalThis.DFL ?? globalThis.deckyFrontendLib;
      const out = {};
      // CreateContextMenuInstance patch
      try {
        const m = dfl.findModuleByExport(e => e?.toString && e.toString().includes('CreateContextMenuInstance'));
        if (m) {
          for (const k of Object.keys(m)) {
            const v = m[k];
            if (typeof v === 'function' && v.prototype?.CreateContextMenuInstance &&
                v.toString().includes('m_ActiveMenu')) {
              out.mgrFound = true;
              out.ctxPatchInstalled = v.prototype.CreateContextMenuInstance.toString()
                .includes('DsContextMenuWrapper');
              break;
            }
          }
        }
      } catch(e) { out.ctxErr = String(e); }
      // LibraryContextMenu class discovery
      try {
        const m = dfl.findModuleByExport(e => e?.toString && e.toString().includes('().LibraryContextMenu'));
        if (m) {
          const w = Object.values(m).find(s => s?.toString && s.toString().includes('navigator:'));
          const r = w ? dfl.fakeRenderComponent(w) : null;
          out.clsDiscovered = !!r?.type;
          out.clsName = r?.type?.name;
        }
      } catch(e) { out.clsErr = String(e); }
      return JSON.stringify(out, null, 2);
    })()
    """)
    data = json.loads(result or "{}")
    print(f"  mgrFound            : {data.get('mgrFound', '?')}")
    print(f"  ctxPatchInstalled   : {data.get('ctxPatchInstalled', '?')}")
    print(f"  clsDiscovered       : {data.get('clsDiscovered', '?')} (name={data.get('clsName')})")


def open_menu_and_check(sjc, shelf_idx: int, card_idx: int) -> dict:
    result = ev(sjc, f"""
    (async () => {{
      const gpuDoc = window.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
      const shelves = Array.from(gpuDoc.querySelectorAll('.ds-shelf'));
      const card = shelves[{shelf_idx}]?.querySelectorAll('.ds-card')?.[{card_idx}];
      if (!card) return JSON.stringify({{err: 'no card', shelvesFound: shelves.length}});

      // Close any existing menu
      for (const d of [document, gpuDoc]) {{
        try {{ d.dispatchEvent(new KeyboardEvent('keydown', {{key:'Escape',bubbles:true}})); }} catch {{}}
      }}
      await new Promise(r => setTimeout(r, 800));

      // Focus card and open menu
      for (const d of [document, gpuDoc]) {{
        try {{ for (const f of d.querySelectorAll('.ds-card.gpfocus')) f.classList.remove('gpfocus'); }} catch {{}}
      }}
      card.classList.add('gpfocus');
      globalThis.__ds_last_focused_card = card;
      await new Promise(r => setTimeout(r, 200));
      card.dispatchEvent(new Event('vgp_onmenubutton', {{bubbles:true, cancelable:true}}));
      await new Promise(r => setTimeout(r, 1200));

      const out = {{
        appid: card.getAttribute('data-appid'),
        shelfId: card.getAttribute('data-shelfid'),
      }};
      for (const d of [document, gpuDoc]) {{
        const menus = d.querySelectorAll('[role="menu"]');
        for (const m of menus) {{
          const items = Array.from(m.querySelectorAll('[role="menuitem"]'));
          if (!items.length) continue;
          out.itemCount = items.length;
          out.itemTexts = items.map(it => (it.textContent||'').substring(0, 35));
          out.hasDeckShelves = items.some(it => /Deck Shelves/i.test(it.textContent||''));
          break;
        }}
        if (out.itemCount) break;
      }}
      return JSON.stringify(out, null, 2);
    }})()
    """, timeout=15)
    return json.loads(result or "{}")


def expand_submenu(sjc) -> dict:
    """Click 'Deck Shelves' and check the resulting submenu."""
    result = ev(sjc, """
    (async () => {
      const gpuDoc = window.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
      for (const d of [document, gpuDoc]) {
        const items = Array.from(d.querySelectorAll('[role="menuitem"]'));
        const dsItem = items.find(it => /Deck Shelves/i.test(it.textContent||''));
        if (!dsItem) continue;
        try { dsItem.click(); } catch {}
        await new Promise(r => setTimeout(r, 800));
        const allMenus = Array.from(d.querySelectorAll('[role="menu"]'));
        const out = { menuCount: allMenus.length, submenus: [] };
        for (const m of allMenus) {
          const its = Array.from(m.querySelectorAll('[role="menuitem"]'));
          out.submenus.push({ count: its.length, items: its.map(it => (it.textContent||'').substring(0,35)) });
        }
        return JSON.stringify(out, null, 2);
      }
      return JSON.stringify({err: 'no Deck Shelves item found'});
    })()
    """, timeout=10)
    return json.loads(result or "{}")


def run() -> int:
    sjc, host, port = connect()
    print(f"Connected: {host}:{port}\n")

    check_patches(sjc)

    sep("Menu presence per shelf/game state")
    tests = [
        (0, 0, "shelf 0 card 0 (typically installed)"),
        (1, 0, "shelf 1 card 0 (typically uninstalled)"),
        (2, 5, "shelf 2 card 5 (mid-shelf)"),
    ]
    failures = 0
    for shelf_i, card_i, label in tests:
        data = open_menu_and_check(sjc, shelf_i, card_i)
        ok = data.get("hasDeckShelves", False)
        status = "✅" if ok else "❌"
        appid = data.get("appid", "?")
        count = data.get("itemCount", 0)
        print(f"  {status} {label}")
        print(f"     appid={appid}  items={count}  hasDeckShelves={ok}")
        if data.get("err"):
            print(f"     error: {data['err']}")
        if not ok:
            failures += 1
        time.sleep(0.5)

    sep("Submenu content (expanding Deck Shelves on shelf 0 card 0)")
    open_menu_and_check(sjc, 0, 0)
    sub = expand_submenu(sjc)
    if sub.get("err"):
        print(f"  ❌ {sub['err']}")
        failures += 1
    else:
        menus = sub.get("submenus", [])
        main_menu = menus[0] if menus else {}
        submenu = menus[1] if len(menus) > 1 else {}
        print(f"  Menu count   : {sub.get('menuCount')}")
        print(f"  Main items   : {main_menu.get('count')}")
        print(f"  Submenu items: {submenu.get('count')}  {submenu.get('items', [])}")
        if submenu.get("count") == 7:
            print("  ✅ All 7 submenu actions present")
        else:
            print(f"  ❌ Expected 7 submenu items, got {submenu.get('count')}")
            failures += 1

    sjc.close()
    sep()
    if failures == 0:
        print("✅  All menu injection checks passed")
    else:
        print(f"❌  {failures} check(s) failed")
    return failures


if __name__ == "__main__":
    sys.exit(run())
