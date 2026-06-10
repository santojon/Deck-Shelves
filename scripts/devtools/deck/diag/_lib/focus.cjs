// Helpers for forcing focus onto a DS card from CDP. Used by probes that
// need a focused card before measuring (focus ring, Y button, horizontal
// nav, etc.).
'use strict';
const { runProbe } = require('./cdp.cjs');

// Try a series of techniques in increasing aggression to land focus on
// the first card of the first DS shelf in the home root. Returns
// { focused, appid, shelfId, method } when successful, else { focused: false, tried }.
async function focusFirstDsCard(target = 'bp') {
  const expr = `(async function(){
    const root = document.getElementById('deck-shelves-home-root');
    if (!root) return { focused: false, error: 'no ds root' };
    const tried = [];

    const isFocused = () => {
      const el = root.querySelector('.ds-card.gpfocus, .ds-card:focus, .ds-card[data-focused="true"]');
      if (!el) return null;
      return { el, appid: el.getAttribute('data-appid'), shelfId: el.getAttribute('data-shelfid') };
    };

    let already = isFocused();
    if (already) return { focused: true, method: 'pre-existing', appid: already.appid, shelfId: already.shelfId };

    // 1. Try direct HTMLElement.focus() on the first .ds-card.
    const first = root.querySelector('.ds-card');
    if (!first) return { focused: false, tried: ['no .ds-card'] };
    tried.push('first .ds-card found: ' + (first.getAttribute('data-appid') || '?'));

    try {
      first.scrollIntoView({ block: 'center', inline: 'center' });
      // ts hooks: GamepadNav uses focus(), but Steam's Focusable wraps
      // <div tabIndex="0"> — focusing the Focusable parent may work better.
      let target = first.closest('[tabindex]') || first;
      target.focus({ preventScroll: false });
      tried.push('focus on: ' + target.tagName + (target.getAttribute('tabindex') ? '[tabindex=' + target.getAttribute('tabindex') + ']' : ''));
      await new Promise(r => requestAnimationFrame(r));
      let f = isFocused();
      if (f) return { focused: true, method: 'direct focus()', appid: f.appid, shelfId: f.shelfId };
    } catch(e) { tried.push('focus() err: ' + e.message); }

    // 2. Try setting GamepadNavTree focus context manually if API is reachable.
    try {
      const nav = window.GamepadNavTree?.m_context?.m_controller || window.FocusNavController;
      if (nav?.SetFocusToElement) {
        nav.SetFocusToElement(first);
        tried.push('GamepadNavTree.SetFocusToElement called');
        await new Promise(r => requestAnimationFrame(r));
        let f = isFocused();
        if (f) return { focused: true, method: 'GamepadNavTree', appid: f.appid, shelfId: f.shelfId };
      } else {
        tried.push('GamepadNavTree.SetFocusToElement not available');
      }
    } catch(e) { tried.push('navtree err: ' + e.message); }

    // 3. Synthesise a tap (mouse) inside the card center to nudge Steam's
    //    focus tracker. Fallback when the React focus controller resists.
    try {
      const r = first.getBoundingClientRect();
      const x = Math.round(r.left + r.width/2);
      const y = Math.round(r.top + r.height/2);
      for (const type of ['mousedown', 'mouseup', 'click']) {
        first.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, view: window }));
      }
      tried.push('mouse click dispatched');
      await new Promise(r => requestAnimationFrame(r));
      let f = isFocused();
      if (f) return { focused: true, method: 'mouse', appid: f.appid, shelfId: f.shelfId };
    } catch(e) { tried.push('mouse err: ' + e.message); }

    return { focused: false, tried };
  })()`;

  return runProbe(target, expr, { awaitPromise: true });
}

module.exports = { focusFirstDsCard };
