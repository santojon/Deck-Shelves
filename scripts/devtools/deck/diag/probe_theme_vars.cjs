// Snapshot of Steam UI theme CSS variables on `documentElement` plus any
// optional element selectors passed via env. Use it when an element's
// background / color won't follow the theme — confirms whether Steam is
// actually exposing the named CSS vars (it often isn't) before chasing
// fallback chains.
//
// Usage:
//   node scripts/devtools/deck/diag/probe_theme_vars.cjs
//   PROBE_TARGET=qam node scripts/devtools/deck/diag/probe_theme_vars.cjs
//   PROBE_SELECTORS='.deck-shelves-qam-sidecar,.ds-sidecar-title' \
//     PROBE_VARS='--main-editor-bg-color,--gamepad-ui-bg-color,--ds-shell-bg' \
//     node scripts/devtools/deck/diag/probe_theme_vars.cjs
'use strict';
const { runAndPrint } = require('./_lib/cdp.cjs');

const target = process.env.PROBE_TARGET || 'qam';
const selectors = (process.env.PROBE_SELECTORS
  || '.deck-shelves-qam-sidecar,.ds-sidecar-title,.ds-sidecar-body,.deck-shelves-qam-main')
  .split(',').map(s => s.trim()).filter(Boolean);
const vars = (process.env.PROBE_VARS
  || '--main-editor-bg-color,--gamepad-ui-bg-color,--ds-shell-bg,--main-bg-color,--secondary-bg-color,--main-control-bg-color,--main-color')
  .split(',').map(s => s.trim()).filter(Boolean);

runAndPrint(target, `(function(){
  const out = { selectorBgs: {}, cssVars: {}, nearbyPanelBgs: [] };
  const sels = ${JSON.stringify(selectors)};
  const vars = ${JSON.stringify(vars)};
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) { out.selectorBgs[sel] = null; continue; }
    const cs = getComputedStyle(el);
    out.selectorBgs[sel] = { bg: cs.backgroundColor, color: cs.color };
  }
  const root = getComputedStyle(document.documentElement);
  for (const v of vars) {
    const val = root.getPropertyValue(v).trim();
    if (val) out.cssVars[v] = val;
  }
  const panels = Array.from(document.querySelectorAll('div')).slice(0, 80);
  out.nearbyPanelBgs = panels
    .map(el => getComputedStyle(el).backgroundColor)
    .filter(c => c && c !== 'rgba(0, 0, 0, 0)')
    .slice(0, 8);
  return out;
})()`);
