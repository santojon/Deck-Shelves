// Inspect the focused card's focus-ring state. Reports the focused
// element, its computed box-shadow / outline, transform, z-index, and
// the .gpfocus / :focus class state. Useful for the "focus ring sometimes
// vanishes" investigation.
//
// Usage: node scripts/devtools/deck/diag/probe_focus_ring.cjs bp
'use strict';
const { runAndPrint } = require('./_lib/cdp.cjs');

const target = process.argv[2] || 'bp';

runAndPrint(target, `(function(){
  const out = {};
  const root = document.getElementById('deck-shelves-home-root');
  if (!root) return { error: 'no ds root' };

  const focused = root.querySelector('.ds-card.gpfocus, .ds-card:focus');
  if (!focused) {
    return { error: 'no focused ds-card', activeElement: document.activeElement?.tagName + '.' + (document.activeElement?.className || '').substring(0,80) };
  }

  const cs = getComputedStyle(focused);
  out.cardSelectors = {
    hasGpfocus: focused.classList.contains('gpfocus'),
    hasFocusPseudo: focused.matches(':focus'),
    hasHoverPseudo: focused.matches(':hover'),
    isSelected: focused.classList.contains('is-selected'),
  };
  out.computed = {
    boxShadow: cs.boxShadow,
    outline: cs.outline,
    outlineWidth: cs.outlineWidth,
    transform: cs.transform.substring(0, 80),
    zIndex: cs.zIndex,
    opacity: cs.opacity,
    pointerEvents: cs.pointerEvents,
  };
  out.dataAttrs = {
    appid: focused.getAttribute('data-appid'),
    shelfId: focused.getAttribute('data-shelfid'),
    cardIndex: focused.getAttribute('data-ds-card-index'),
    themeRoundCompat: document.querySelector('.deck-shelves-root')?.getAttribute('data-ds-theme-focus-round-compat'),
  };

  // Check overlay state — is FocusRingRoot covering the card?
  const focusRingRoot = focused.ownerDocument.querySelector('[class*="FocusRingRoot"], [data-deck-shelves-focus-ring]');
  if (focusRingRoot) {
    const r = focusRingRoot.getBoundingClientRect();
    const cr = focused.getBoundingClientRect();
    out.focusRingRoot = {
      cls: focusRingRoot.className.substring(0, 80),
      visible: r.width > 0 && r.height > 0,
      coversCard: r.left <= cr.left && r.right >= cr.right && r.top <= cr.top && r.bottom >= cr.bottom,
    };
  }

  return out;
})()`);
