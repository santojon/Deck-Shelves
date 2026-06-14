// SideNav focus-target inspector. Reads the diagnostics the panel
// pushes on open + on every focus retry so we can confirm:
//   * what shelf the panel inferred as "current" at open
//     (`__ds_sidenav_open = { shelfId, appid }`)
//   * whether that shelfId is present in the panel's row Map
//     (`__ds_sidenav_focus = { attempt, targetId, hit, keys }`)
//   * the visible shelf list from the DOM (`.ds-shelf[data-shelfid]`)
//
// When `hit: false` and `keys` doesn't include `targetId`, the open
// path is reading a shelfId the panel never renders (mismatch between
// what `tryOpen` finds via gpfocus and what `readVisibleShelvesFromDom`
// scopes to).
//
// Usage:
//   node devkit/diag/diag_sidenav_focus.cjs
'use strict';

const { runProbe } = require('./_lib/cdp.cjs');

const expr = `(() => {
  const g = globalThis;
  const view = g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
  const doc = view?.document;
  const visible = [];
  if (doc) {
    const root = doc.querySelector('.deck-shelves-root') ?? doc;
    for (const el of root.querySelectorAll('.ds-shelf[data-shelfid]')) {
      const rect = el.getBoundingClientRect();
      visible.push({
        id: el.getAttribute('data-shelfid'),
        title: el.querySelector('.ds-shelf-title')?.textContent?.trim() ?? null,
        top: Math.round(rect.top),
        height: Math.round(rect.height),
        offscreen: rect.height < 4 || el.offsetParent === null,
      });
    }
  }
  return {
    sidenav_open: g.__ds_sidenav_open,
    sidenav_focus: g.__ds_sidenav_focus,
    sidenav_mounted: g.__ds_sidenav_mounted,
    sidenav_enabled: g.__ds_sidenav_enabled,
    visible_shelves: visible,
  };
})()`;

runProbe('shared', expr)
  .then((v) => { console.log(JSON.stringify(v, null, 2)); process.exit(0); })
  .catch((e) => { console.error('PROBE ERROR:', e.message || e); process.exit(1); });
