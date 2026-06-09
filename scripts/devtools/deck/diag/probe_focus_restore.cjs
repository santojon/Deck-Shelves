// Reads the focusRestore module state + the active GamepadNav focus path.
// Useful when "focus jumps to first card" or "focus lost after returning
// from another screen" is reproducible — capture before AND after the
// triggering action and diff.
//
// Usage: node scripts/devtools/deck/diag/probe_focus_restore.cjs bp
'use strict';
const { runAndPrint } = require('./_lib/cdp.cjs');

const target = process.argv[2] || 'bp';

runAndPrint(target, `(function(){
  const out = { ts: Date.now() };
  const root = document.getElementById('deck-shelves-home-root');
  if (!root) return { error: 'no ds root' };

  const focused = root.querySelector('.ds-card.gpfocus, .ds-card:focus');
  out.focused = focused ? {
    appid: focused.getAttribute('data-appid'),
    shelfId: focused.getAttribute('data-shelfid'),
    cardIndex: focused.getAttribute('data-ds-card-index'),
  } : null;

  // Pending focus restore state — set by saveFocusTarget() / beginFocusRestoreLoop().
  try {
    const dbg = window.__DECK_SHELVES_DEBUG__;
    out.focusRestore = {
      pendingShelfId: dbg?.pendingFocusShelfId ?? 'n/a',
      pendingAppId: dbg?.pendingFocusAppId ?? 'n/a',
      lastSavedShelfId: dbg?.lastFocusShelfId ?? 'n/a',
      lastSavedAppId: dbg?.lastFocusAppId ?? 'n/a',
      loopActive: dbg?.focusRestoreLoopActive ?? 'n/a',
    };
  } catch(e) { out.errorRestore = String(e); }

  // GamepadNavTree active node — what Steam thinks is focused.
  try {
    const nav = window.GamepadNavTree?.m_context?.m_controller || window.FocusNavController;
    const active = nav?.m_ActiveContext || nav?.m_LastActiveContext;
    const trees = active?.m_rgGamepadNavigationTrees || [];
    out.navTrees = trees.length;
    const main = trees.find?.((t) => t?.m_ID === 'GamepadUI_Full_Root' || t?.m_ID === 'root_1_');
    const rootEl = main?.Root?.Element;
    out.activeRoot = rootEl ? (rootEl.id || rootEl.className?.substring(0, 80)) : 'n/a';
  } catch(e) { out.errorNav = String(e); }

  // Active route — different routes mean different focus contexts.
  try {
    out.route = { pathname: location.pathname, hash: location.hash.substring(0, 80) };
  } catch {}

  return out;
})()`);
