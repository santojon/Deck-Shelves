#!/usr/bin/env python3
"""
Deck Shelves — menu injection diagnostic.

Opens the native game context menu on cards of different shelves and game
states and checks that the plugin's entries are injected: the per-card actions
(highlight, hide/remove, add to / remove from shelf, …) and the "Shelf" group
with its Management / Display / Visual sub-groups. Entries are identified by
their React keys (`ds-…`), so the check does not depend on the UI language.

Usage:
    python3 scripts/deckprobe-ext/probes/menu_injection.py

What it checks:
  1. Patch state (informational): whether the plugin's boot patch on the game menu is installed
  2. For 3 cards: at least one `ds-card-…` action and the `ds-shelf-root` group,
     and no plugin entry injected twice
  3. Expanding the shelf group shows `ds-mgmt`, `ds-display` and `ds-visual`
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from probe_base import connect, ev, sep  # noqa: E402


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
      // Boot patch state, as the plugin records it
      try {
        const dbg = globalThis.deckShelves?.debug || {};
        out.clsDiscovered = dbg.lcmPatched === true;
        out.lcmRenderCalls = dbg.lcmRenderCalls ?? null;
      } catch(e) { out.clsErr = String(e); }
      return JSON.stringify(out, null, 2);
    })()
    """)
    data = json.loads(result or "{}")
    print(f"  mgrFound            : {data.get('mgrFound', '?')}")
    print(f"  ctxPatchInstalled   : {data.get('ctxPatchInstalled', '?')}")
    print(f"  clsDiscovered       : {data.get('clsDiscovered', '?')} (render calls={data.get('lcmRenderCalls')})")


# Plugin entries carry React keys starting with "ds-"; read them off each menu
# item's fiber chain (the key sits on the MenuItem/MenuGroup element a few levels up).
DS_KEYS_JS = r"""
const closeMenus = async (docs) => {
  for (let i = 0; i < 4; i++) {
    const open = docs.flatMap((d) => d ? Array.from(d.querySelectorAll('[role="menu"]')) : []);
    if (!open.length) return 0;
    open[open.length - 1].dispatchEvent(new CustomEvent('vgp_oncancel', {bubbles: true, cancelable: true, detail: {button: 2}}));
    await new Promise((r) => setTimeout(r, 500));
  }
  return docs.reduce((n, d) => n + (d ? d.querySelectorAll('[role="menu"]').length : 0), 0);
};
const dsKeysOf = (menu) => Array.from(menu.querySelectorAll('[role="menuitem"]')).map((el) => {
  const fk = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
  let f = fk ? el[fk] : null;
  for (let i = 0; f && i < 12; i++, f = f.return) {
    if (typeof f.key === 'string' && f.key.startsWith('ds-')) return f.key;
  }
  return null;
}).filter(Boolean);
"""


def open_menu_and_check(sjc, shelf_idx: int, card_idx: int) -> dict:
    result = ev(sjc, f"""
    (async () => {{
      {DS_KEYS_JS}
      const gpuDoc = window.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
      const shelves = Array.from(gpuDoc.querySelectorAll('.ds-shelf'));
      const card = shelves[{shelf_idx}]?.querySelectorAll('.ds-card')?.[{card_idx}];
      if (!card) return JSON.stringify({{err: 'no card', shelvesFound: shelves.length}});
      await closeMenus([document, gpuDoc]);
      for (const d of [document, gpuDoc]) {{
        try {{ for (const f of d.querySelectorAll('.ds-card.gpfocus')) f.classList.remove('gpfocus'); }} catch {{}}
      }}
      card.classList.add('gpfocus');
      globalThis.__ds_last_focused_card = card;
      await new Promise(r => setTimeout(r, 200));
      card.dispatchEvent(new Event('vgp_onmenubutton', {{bubbles:true, cancelable:true}}));
      await new Promise(r => setTimeout(r, 1200));
      const out = {{ appid: card.getAttribute('data-appid'), shelfId: card.getAttribute('data-shelfid') }};
      for (const d of [document, gpuDoc]) {{
        for (const m of d.querySelectorAll('[role="menu"]')) {{
          const items = m.querySelectorAll('[role="menuitem"]');
          if (!items.length) continue;
          out.itemCount = items.length;
          out.dsKeys = dsKeysOf(m);
          break;
        }}
        if (out.itemCount) break;
      }}
      return JSON.stringify(out);
    }})()
    """, timeout=15)
    return json.loads(result or "{}")


def expand_shelf_group(sjc) -> dict:
    """Click the plugin's "Shelf" group (key ds-shelf-root) and read the submenu's plugin keys."""
    result = ev(sjc, f"""
    (async () => {{
      {DS_KEYS_JS}
      const gpuDoc = window.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
      for (const d of [document, gpuDoc]) {{
        const items = Array.from(d.querySelectorAll('[role="menuitem"]'));
        const root = items.find((el) => {{
          const fk = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
          let f = fk ? el[fk] : null;
          for (let i = 0; f && i < 12; i++, f = f.return) if (f.key === 'ds-shelf-root') return true;
          return false;
        }});
        if (!root) continue;
        try {{ root.click(); }} catch {{}}
        await new Promise(r => setTimeout(r, 900));
        const menus = Array.from(d.querySelectorAll('[role="menu"]'));
        const sub = menus[menus.length - 1];
        const out = {{ menuCount: menus.length, subKeys: sub ? dsKeysOf(sub) : [] }};
        out.leftOpen = await closeMenus([document, gpuDoc]);
        return JSON.stringify(out);
      }}
      return JSON.stringify({{err: 'no shelf group (ds-shelf-root) in the open menu'}});
    }})()
    """, timeout=12)
    return json.loads(result or "{}")


def judge_menu(data: dict) -> list[str]:
    keys = data.get("dsKeys") or []
    problems = []
    if not any(k.startswith("ds-card-") or k.startswith("ds-lib-") for k in keys):
        problems.append("no per-card plugin action")
    if "ds-shelf-root" not in keys:
        problems.append("no shelf group (ds-shelf-root)")
    dupes = sorted({k for k in keys if keys.count(k) > 1})
    if dupes:
        problems.append(f"injected twice: {dupes}")
    return problems


def run() -> int:
    sjc, host, port = connect()
    print(f"Connected: {host}:{port}\n")

    check_patches(sjc)

    sep("Plugin entries per shelf/game state")
    tests = [
        (0, 0, "shelf 0 card 0"),
        (1, 0, "shelf 1 card 0"),
        (2, 5, "shelf 2 card 5 (mid-shelf)"),
    ]
    failures = 0
    for shelf_i, card_i, label in tests:
        data = open_menu_and_check(sjc, shelf_i, card_i)
        problems = [data["err"]] if data.get("err") else judge_menu(data)
        print(f"  {'✅' if not problems else '❌'} {label}")
        print(f"     appid={data.get('appid', '?')}  items={data.get('itemCount', 0)}  plugin keys={data.get('dsKeys', [])}")
        for pr in problems:
            print(f"     problem: {pr}")
        failures += 1 if problems else 0
        time.sleep(0.5)

    sep("Shelf group (expanding ds-shelf-root on shelf 0 card 0)")
    open_menu_and_check(sjc, 0, 0)
    sub = expand_shelf_group(sjc)
    if sub.get("err"):
        print(f"  ❌ {sub['err']}")
        failures += 1
    else:
        keys = sub.get("subKeys", [])
        missing = [k for k in ("ds-mgmt", "ds-display", "ds-visual") if k not in keys]
        print(f"  Menus open   : {sub.get('menuCount')}")
        print(f"  Plugin keys  : {keys}")
        if missing:
            print(f"  ❌ missing sub-groups: {missing}")
            failures += 1
        else:
            print("  ✅ Management / Display / Visual groups present")

    left = ev(sjc, f"""(async () => {{ {DS_KEYS_JS}
      const gpuDoc = window.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
      return String(await closeMenus([document, gpuDoc])); }})()""", timeout=10)
    if str(left) != "0":
        print(f"  ⚠️  {left} menu(s) still open after cleanup")
    sjc.close()
    sep()
    if failures == 0:
        print("✅  All menu injection checks passed")
    else:
        print(f"❌  {failures} check(s) failed")
    return failures


if __name__ == "__main__":
    sys.exit(run())
