// Drives N synthetic right-key presses via CDP Input.dispatchKeyEvent
// (same path the screenshot scripts use, not JS-level synthetic events
// which Steam's controller-input pipeline ignores). Reports the time
// between focus changes so DS-card nav speed can be compared against
// the focus-zoom + scroll animation budget.
//
// Usage: node devkit/diag/probe_horizontal_nav.cjs [presses]
//   presses: number of synthetic ArrowRight presses (default 6)
'use strict';
const { openSession } = require('./_lib/cdp.cjs');
const { focusFirstDsCard } = require('./_lib/focus.cjs');

const N = Number(process.argv[2] || '6');

(async () => {
  const focus = await focusFirstDsCard('bp');
  if (!focus.focused) {
    console.error('focus failed:', JSON.stringify(focus));
    process.exit(1);
  }
  console.log('starting from appid', focus.appid);

  const sess = await openSession('bp');
  try {
    const samples = [];
    for (let i = 0; i < N; i++) {
      const before = await sess.evaluate(`document.querySelector('#deck-shelves-home-root .ds-card.gpfocus')?.getAttribute('data-appid') || document.querySelector('#deck-shelves-home-root .ds-card.is-selected')?.getAttribute('data-appid') || null`);
      const t0 = Date.now();
      await sess.dispatchKey('ArrowRight', { settleMs: 0 });
      // Poll for focus change for up to 400 ms.
      let after = before;
      const deadline = Date.now() + 400;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 16));
        after = await sess.evaluate(`document.querySelector('#deck-shelves-home-root .ds-card.gpfocus')?.getAttribute('data-appid') || document.querySelector('#deck-shelves-home-root .ds-card.is-selected')?.getAttribute('data-appid') || null`);
        if (after && after !== before) break;
      }
      const t1 = Date.now();
      samples.push({ before, after, moved: after !== before, deltaMs: t1 - t0 });
      await new Promise(r => setTimeout(r, 60)); // settle between presses
    }
    const moved = samples.filter(s => s.moved);
    console.log(JSON.stringify({
      presses: N,
      movedCount: moved.length,
      avgDeltaMs: moved.length ? Math.round(moved.reduce((s, x) => s + x.deltaMs, 0) / moved.length) : null,
      minDeltaMs: moved.length ? Math.min(...moved.map(s => s.deltaMs)) : null,
      maxDeltaMs: moved.length ? Math.max(...moved.map(s => s.deltaMs)) : null,
      samples,
    }, null, 2));
  } finally {
    sess.close();
  }
})().catch((e) => { console.error('PROBE ERROR:', e.message || e); process.exit(1); });
