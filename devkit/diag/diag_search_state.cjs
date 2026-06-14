// Quick-search state inspector — reads the diagnostic globals the
// SearchOverlay exposes so we can confirm:
//   * overlay mounted at least once (`search_mounted`)
//   * settings toggles match the user's QAM (`search_enabled`,
//     plus the underlying setting via a getCurrentSettings() probe)
//   * the shelf registry the search uses has been populated
//     (`registry_size`, `search_pool`)
//   * the last query the user typed and whether anything matched
//     (`search_last = { q, pool, hits }`)
//   * BP-context controller input bridge is up
//     (`bp_input_installed_path`)
//   * what `document.activeElement` was on the last focus retry while
//     the pill was open (`search_active = { isInput, activeTag, ... }`)
//
// Usage:
//   node devkit/diag/diag_search_state.cjs
'use strict';

const { runProbe } = require('./_lib/cdp.cjs');

const expr = `(() => {
  const g = globalThis;
  return {
    overlays_imported: g.__ds_overlays_imported,
    homepatch_loaded: g.__ds_homepatch_loaded,
    search_mounted: g.__ds_search_mounted,
    search_enabled: g.__ds_search_enabled,
    sidenav_enabled: g.__ds_sidenav_enabled,
    sidenav_mounted: g.__ds_sidenav_mounted,
    registry_size: g.__ds_shelf_registry_size,
    search_pool: g.__ds_search_pool,
    search_last: g.__ds_search_last,
    search_active: g.__ds_search_active,
    bp_input_installed_path: !!g.__ds_input_bp_view,
  };
})()`;

runProbe('shared', expr)
  .then((v) => { console.log(JSON.stringify(v, null, 2)); process.exit(0); })
  .catch((e) => { console.error('PROBE ERROR:', e.message || e); process.exit(1); });
