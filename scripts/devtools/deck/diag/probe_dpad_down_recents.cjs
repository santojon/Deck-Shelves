// Investigates the regression where d-pad Down from native Steam recents
// occasionally stops responding (user report: "às vezes o dpad down para
// de funcionar a partir dos recentes nativos"). Drives a sequence:
//   focus a native recents card → press Down N times → on each press,
//   capture the active element and its rect to detect when Down does
//   nothing vs. lands on a DS shelf.
//
// Usage: node scripts/devtools/deck/diag/probe_dpad_down_recents.cjs [presses]
//   presses: number of ArrowDown presses (default 6)
'use strict';
const { openSession } = require('./_lib/cdp.cjs');

const N = Number(process.argv[2] || '6');

const SNAPSHOT_EXPR = `(function(){
  const el = document.activeElement;
  const root = document.getElementById('deck-shelves-home-root');
  const dsCard = el?.closest?.('.ds-card');
  // Native cards have a couple of stable class tokens — we accept either
  // a Library / Focusable card not inside our root or any card with an
  // appid attribute that lives outside the DS root.
  const insideDs = root && root.contains(el);
  const nativeCard = !insideDs && (el?.closest?.('[class*="LibraryCard"], [class*="GameCard"], [tabindex]'));
  const rect = el?.getBoundingClientRect?.();
  return {
    tag: el?.tagName,
    cls: (el?.className || '').toString().substring(0, 100),
    insideDs: !!insideDs,
    dsAppid: dsCard?.getAttribute?.('data-appid') || null,
    dsShelfId: dsCard?.getAttribute?.('data-shelfid') || null,
    rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
  };
})()`;

(async () => {
  const sess = await openSession('bp');
  try {
    // Step 1: try to focus a native recents card by sending Tab presses
    // from the top of the home — if a card is already focused we keep it.
    // The user said they have native recents on with no hero art, so the
    // home should show native recents at the top.
    let start = await sess.evaluate(SNAPSHOT_EXPR);
    console.log('starting focus:', JSON.stringify(start));
    if (!start?.tag || start.insideDs) {
      // Move focus to the top — send Up a few times then Tab to surface
      // the native recents row.
      for (let i = 0; i < 4; i++) await sess.dispatchKey('ArrowUp');
      start = await sess.evaluate(SNAPSHOT_EXPR);
      console.log('after ArrowUp x4:', JSON.stringify(start));
    }

    // Step 2: press Down N times and snapshot after each.
    const samples = [];
    for (let i = 0; i < N; i++) {
      const before = await sess.evaluate(SNAPSHOT_EXPR);
      const t0 = Date.now();
      await sess.dispatchKey('ArrowDown', { settleMs: 150 });
      const after = await sess.evaluate(SNAPSHOT_EXPR);
      samples.push({
        step: i + 1,
        beforeCls: before?.cls,
        afterCls: after?.cls,
        moved: JSON.stringify(before?.rect) !== JSON.stringify(after?.rect),
        beforeY: before?.rect?.y,
        afterY: after?.rect?.y,
        leavedDsAfter: !before?.insideDs && after?.insideDs,
        stayedNative: !before?.insideDs && !after?.insideDs,
        elapsedMs: Date.now() - t0,
        afterTag: after?.tag,
        afterInsideDs: after?.insideDs,
      });
    }

    console.log(JSON.stringify({
      presses: N,
      movedCount: samples.filter(s => s.moved).length,
      stuckCount: samples.filter(s => !s.moved).length,
      samples,
    }, null, 2));
  } finally {
    sess.close();
  }
})().catch((e) => { console.error('PROBE ERROR:', e.message || e); process.exit(1); });
