// Measures the Y-button (highlight toggle) round trip on a focused DS
// card. Steam's Y button → onOptionsButton on the Focusable wrapper →
// toggleCardHighlight() in GameCard.tsx (no public API). From CDP a
// synthetic 'y' keypress mirrors the same handler path because Steam's
// input pipeline maps gamepad Y to that key for controller-input flows.
//
// Usage: node scripts/devtools/deck/diag/probe_y_button.cjs
'use strict';
const { openSession } = require('./_lib/cdp.cjs');
const { focusFirstDsCard } = require('./_lib/focus.cjs');

(async () => {
  const focus = await focusFirstDsCard('bp');
  if (!focus.focused) {
    console.error('focus failed:', JSON.stringify(focus));
    process.exit(1);
  }
  const { appid, shelfId } = focus;

  const sess = await openSession('bp');
  try {
    const snapshot = `(function(){
      const card = document.querySelector('#deck-shelves-home-root .ds-card[data-appid="${appid}"]');
      if (!card) return null;
      return {
        cls: card.className,
        isHighlighted: /highlight/i.test(card.className) || /highlight/i.test(Array.from(card.querySelectorAll('[class]')).map(e => e.className).join(' ')),
        focusedAppid: document.querySelector('#deck-shelves-home-root .ds-card.gpfocus, #deck-shelves-home-root .ds-card.is-selected')?.getAttribute('data-appid'),
      };
    })()`;
    const before = await sess.evaluate(snapshot);
    console.log('before:', JSON.stringify(before));

    const t0 = Date.now();
    // Y button → Focusable's onOptionsButton callback. There's no public
    // API for it; walk the React fiber to find the callback prop and call
    // it directly. Mirrors a real Y press without depending on the
    // gamepad-only event channel Steam uses internally.
    const dispatched = await sess.evaluate(`(function(){
      const card = document.querySelector('#deck-shelves-home-root .ds-card[data-appid="${appid}"]');
      if (!card) return { error: 'no card' };
      const wrapper = card.closest('[tabindex]') || card;
      const fiberKey = Object.keys(wrapper).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactInternalInstance$') || k.startsWith('__reactFiber$'));
      if (!fiberKey) return { error: 'no react fiber key on wrapper' };
      // Walk up the React fiber tree looking for an onOptionsButton prop.
      let fiber = wrapper[fiberKey];
      // __reactProps$ is direct; fiber refs need .memoizedProps
      const tryProps = (f) => f?.memoizedProps ?? f?.pendingProps ?? f;
      let depth = 0;
      while (fiber && depth < 12) {
        const p = tryProps(fiber);
        if (p && typeof p.onOptionsButton === 'function') {
          try { p.onOptionsButton(); return { called: true, depth }; }
          catch (e) { return { error: 'onOptionsButton threw: ' + e.message, depth }; }
        }
        fiber = fiber.return ?? null;
        depth++;
      }
      // Try the props slot directly (newer React layout)
      const props = wrapper[Object.keys(wrapper).find(k => k.startsWith('__reactProps$'))];
      if (props && typeof props.onOptionsButton === 'function') {
        try { props.onOptionsButton(); return { called: true, viaReactProps: true }; }
        catch (e) { return { error: 'onOptionsButton threw: ' + e.message }; }
      }
      return { error: 'no onOptionsButton found within depth 12', tried: depth };
    })()`);
    console.log('dispatch:', JSON.stringify(dispatched));

    const deadline = Date.now() + 1500;
    let after = before;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 32));
      after = await sess.evaluate(snapshot);
      if (after?.isHighlighted !== before?.isHighlighted) break;
    }
    const elapsed = Date.now() - t0;
    console.log('after:', JSON.stringify(after));
    console.log(JSON.stringify({
      appid, shelfId,
      elapsedMs: elapsed,
      stateChanged: before?.isHighlighted !== after?.isHighlighted,
      focusKept: before?.focusedAppid === after?.focusedAppid,
    }, null, 2));
  } finally {
    sess.close();
  }
})().catch((e) => { console.error('PROBE ERROR:', e.message || e); process.exit(1); });
