// Reproduces "focus loss when entering/returning between screens" — item 6.
// Sequence: focus a DS card on home → navigate to another route → return
// to home → check if focus restored to the original card.
//
// Usage: node scripts/devtools/deck/diag/probe_focus_loss_screen.cjs
'use strict';
const { openSession } = require('./_lib/cdp.cjs');
const { focusFirstDsCard } = require('./_lib/focus.cjs');

(async () => {
  await focusFirstDsCard('bp');
  await new Promise(r => setTimeout(r, 400));

  const sess = await openSession('bp');
  try {
    const snap = `(function(){
      const f = document.querySelector('.gpfocus');
      const root = document.getElementById('deck-shelves-home-root');
      return f ? {
        tag: f.tagName,
        appid: f.getAttribute('data-appid'),
        shelfId: f.getAttribute('data-shelfid'),
        insideDs: !!root?.contains(f),
        route: location.pathname + location.hash,
      } : { tag: 'none', route: location.pathname + location.hash };
    })()`;

    const before = await sess.evaluate(snap);
    console.log('BEFORE leave:', JSON.stringify(before));
    if (!before?.appid) { console.error('no DS card focused — abort'); process.exit(1); }

    // Navigate away — push a different route. The collections route is a
    // common Steam target that uses the same nav tree rebuild path.
    await sess.evaluate(`(function(){
      window.history.pushState({}, '', '/library/collections');
      window.dispatchEvent(new PopStateEvent('popstate'));
    })()`);
    await new Promise(r => setTimeout(r, 800));
    const afterLeave = await sess.evaluate(snap);
    console.log('AFTER leave:', JSON.stringify(afterLeave));

    // Back to home
    await sess.evaluate(`window.history.back()`);
    await new Promise(r => setTimeout(r, 1200));
    const afterReturn = await sess.evaluate(snap);
    console.log('AFTER return:', JSON.stringify(afterReturn));

    const restored = afterReturn.appid === before.appid;
    const lost = !afterReturn.appid || !afterReturn.insideDs;
    console.log('\nRESULT:', JSON.stringify({
      restored,
      lost,
      originalAppid: before.appid,
      returnedAppid: afterReturn.appid,
    }, null, 2));
  } finally { sess.close(); }
})().catch(e => { console.error('PROBE ERROR:', e.message || e); process.exit(1); });
