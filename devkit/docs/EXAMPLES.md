# DeckProbe — example probes

Copy-paste recipes for common diagnostics.

## 1. Smoke test the home

```bash
python3 devkit/cli.py probe --mode smoke
```

Returns `pass: true` when:
- the plugin's home mount is present
- the native home viewport sibling is present
- at least one row + one card render
- no resolver caught an exception

Exit code is non-zero on `pass: false`, so this is the canonical
regression gate in CI.

## 2. Inspect every visible card in the first row

```js
// devkit/diag/diag_first_row.cjs
'use strict';
const { runAndPrint } = require('./_lib/cdp');

const expr = `(function(){
  const mount = document.getElementById('deck-shelves-home-root');
  if (!mount) return { error: 'no mount' };
  const firstRow = mount.querySelector('.ds-row-scroll');
  if (!firstRow) return { error: 'no row' };
  return Array.from(firstRow.querySelectorAll('.ds-card')).map((card, i) => ({
    i,
    text: (card.textContent || '').trim().slice(0, 60),
    bbox: card.getBoundingClientRect().width > 0,
    appid: card.getAttribute('data-appid'),
  }));
})()`;

runAndPrint('bp', expr);
```

Run:

```bash
node devkit/diag/diag_first_row.cjs
```

## 3. Read settings from the live cache

```js
// devkit/diag/diag_settings_snapshot.cjs
'use strict';
const { runAndPrint } = require('./_lib/cdp');

const expr = `(function(){
  const raw = localStorage.getItem('deck-shelves-settings-cache-v3');
  if (!raw) return { error: 'no cache' };
  const s = JSON.parse(raw);
  return {
    enabled: s.enabled,
    shelf_count: s.shelves?.length,
    smart_shelf_count: s.smartShelves?.length,
    online_features: s.onlineFeaturesEnabled,
  };
})()`;

runAndPrint('shared', expr);
```

For a different plugin, swap the localStorage key — the cdp helper
substitutes selectors, not arbitrary storage keys.

## 4. Probe a fiber's React state

```js
// devkit/diag/diag_fiber_state.cjs
'use strict';
const { runAndPrint } = require('./_lib/cdp');

const expr = `(function(){
  const root = document.querySelector('.deck-shelves-root');
  if (!root) return { error: 'no root' };
  function getFiber(el) {
    for (const k of Object.keys(el)) if (k.startsWith('__reactFiber')) return el[k];
    return null;
  }
  let found = null;
  function walk(f, d) {
    if (!f || d > 200 || found) return;
    try {
      const tn = typeof f.type === 'function' ? (f.type.displayName || f.type.name) : null;
      if (tn === 'ShelfViewImpl') found = f.memoizedProps?.shelf?.id;
    } catch {}
    walk(f.child, d + 1); walk(f.sibling, d);
  }
  const r = getFiber(root); if (r) walk(r, 0);
  return { firstShelfId: found };
})()`;

runAndPrint('bp', expr);
```

## 5. Watch console output for a project-tagged log line

```bash
# tail console for 30 s, filtering on `[DS]` and `deck-shelves`
node devkit/tools/console_capture.cjs <TARGET_ID> 30
```

The filter defaults to substrings derived from `DEVKIT_PROJECT_LABEL`
and `DEVKIT_ROW_SEL`; override the full list with
`DEVKIT_CONSOLE_FILTER='myproj,my-row-class,custom-tag'`.

## 6. Open the QAM, click the Decky tab, click your plugin

```js
// devkit/diag/qam_open_plugin.cjs
'use strict';
const { runAndPrint } = require('./_lib/cdp');

const open = `(function(){
  const ms = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.m_MenuStore;
  ms.OpenQuickAccessMenu();
  return { side: ms.m_eOpenSideMenu };
})()`;

const click = `(function(){
  const tabs = Array.from(document.querySelectorAll('[role=tab]'));
  for (let i = 0; i < tabs.length; i++) {
    const svg = tabs[i].querySelector('svg path');
    if (svg && svg.getAttribute('d')?.startsWith('M320')) {
      tabs[i].click();
      return { clickedTab: i };
    }
  }
  return { error: 'no decky tab' };
})()`;

(async () => {
  await runAndPrint('shared', open);
  await new Promise(r => setTimeout(r, 1500));
  await runAndPrint('qam', click);
})();
```

## 7. Smoke probe with project-specific selectors

When testing against a plugin whose home mount and card classes differ
from the default project:

```bash
DEVKIT_HOME_MOUNT_ID=my-plugin-home-root \
DEVKIT_CARD_SEL='.tile' \
DEVKIT_ROW_SEL='.tile-row' \
python3 devkit/cli.py probe --mode rows
```

The probe source still references `deck-shelves-home-root` and
`.ds-card`; the cdp helper rewrites them on the fly.

## 8. Run all diag scripts that match a substring

```bash
# Run every diag whose name contains "shelf"
python3 devkit/cli.py diag list \
  | grep shelf \
  | xargs -n1 python3 devkit/cli.py diag run
```

## 9. Sanity-check the price / online cache

```js
// devkit/diag/diag_online_caches.cjs
'use strict';
const { runAndPrint } = require('./_lib/cdp');

const expr = `(function(){
  const wl = JSON.parse(localStorage.getItem('ds-wishlist-cache-v1') || 'null');
  const store = JSON.parse(localStorage.getItem('ds-store-cache-v3') || 'null');
  const price = JSON.parse(localStorage.getItem('ds-price-cache-v1') || '{}');
  return {
    wl_count: wl?.data?.ids?.length ?? null,
    wl_age_min: wl ? Math.round((Date.now() - wl.ts) / 60000) : null,
    store_count: store?.data?.ids?.length ?? null,
    store_age_min: store ? Math.round((Date.now() - store.ts) / 60000) : null,
    price_count: Object.keys(price).length,
  };
})()`;

runAndPrint('shared', expr);
```

## 10. Capture a screenshot of the current QAM state

```bash
python3 devkit/cli.py screenshot --locale en-US --keep-existing
```

Output lands in `screenshots/out/en-US/`. Pass `--script` to point at a
custom navigation flow (see [`README.md`](README.md#screenshot-pipeline)).
