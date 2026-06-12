// Inspect the QuickAccessMenu (QAM) layout — window dimensions, the
// visible panel area (the dark `_2BB6uf...` container that hosts every
// tab's content), the tab strip on the left, and the current active
// tab class (`tab_Friends`, `tab_Notifications`, ...).
//
// Used to investigate "QAM expansion" (e.g. how Friends & Chat appears
// to use more horizontal space than other tabs) and to size DS QAM
// content relative to what the native UI exposes.
//
// Usage: node scripts/devtools/deck/diag/probe_qam_layout.cjs
'use strict';
const { runAndPrint } = require('./_lib/cdp.cjs');

runAndPrint('qam', `(async function(){
  const out = {};
  out.docDim = { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight };

  // Underlying QAM browser window dimensions — Steam allocates this
  // independently of the visible dark panel inside. On Steam Deck the
  // window is typically ~853x533 logical pixels (1280x800 physical at 1.5x).
  const sc = window.SteamClient;
  if (sc?.Window?.GetWindowDimensions) {
    try { out.windowDim = await sc.Window.GetWindowDimensions(); } catch (e) { out.errWindow = String(e); }
  }
  if (sc?.Window?.GetDefaultMonitorDimensions) {
    try { out.monitorDim = await sc.Window.GetDefaultMonitorDimensions(); } catch (e) { out.errMonitor = String(e); }
  }

  // The opaque dark panel that hosts every QAM tab's content.
  const visiblePanel = document.querySelector('._2BB6uf--jFaAmdnwLOqMU7');
  if (visiblePanel) {
    const r = visiblePanel.getBoundingClientRect();
    const cs = getComputedStyle(visiblePanel);
    out.visiblePanel = { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), bg: cs.backgroundColor };
  }

  // First tab name we can read — native QAM uses tab_Friends,
  // tab_Notifications, tab_Settings, etc. as class markers.
  const tabs = [];
  const seen = new Set();
  document.querySelectorAll('[class*="tab_"]').forEach(el => {
    const m = (el.className || '').toString().match(/tab_(\\w+)/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      const r = el.getBoundingClientRect();
      tabs.push({ name: m[1], w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) });
    }
  });
  out.tabs = tabs;

  // Currently focused element (gpfocuswithin walks the focus chain).
  const focused = document.querySelector('.gpfocus');
  if (focused) {
    out.focusedClass = (focused.className || '').toString().substring(0, 100);
  }

  return out;
})()`, { awaitPromise: true });
