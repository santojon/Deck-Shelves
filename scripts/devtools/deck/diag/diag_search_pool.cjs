// Dump every game the built-in Quick Search provider can see — the
// pool is the union of all `[data-name]` attributes across rendered
// `.ds-shelf` containers in BP. Use this when "search doesn't find X":
// if X is not in the dump, the game isn't in the resolved set (likely
// the owning shelf's `limit` cuts it off), so any algorithm change
// won't help — the data has to enter the pool first.
//
// Usage:
//   node scripts/devtools/deck/diag/diag_search_pool.cjs              # full dump
//   node scripts/devtools/deck/diag/diag_search_pool.cjs lucius       # filter by substring
'use strict';

const { runProbe } = require('./_lib/cdp.cjs');

const needle = (process.argv[2] || '').toLowerCase();

const expr = `(() => {
  const g = globalThis;
  const view = g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
  const doc = view?.document;
  if (!doc) return { err: 'no BP doc' };
  const root = doc.querySelector('.deck-shelves-root') ?? doc;
  const out = { totalCards: 0, shelfTitles: [], items: [], matches: [] };
  const shelves = root.querySelectorAll('.ds-shelf[data-shelfid]');
  const needle = ${JSON.stringify(needle)};
  for (const s of shelves) {
    const titleEl = s.querySelector('.ds-shelf-title');
    const title = titleEl?.textContent?.trim() ?? '(no title)';
    out.shelfTitles.push(title);
    const cards = s.querySelectorAll('[data-appid]');
    for (const c of cards) {
      const appid = c.getAttribute('data-appid');
      const name = c.getAttribute('data-name') ?? '';
      const item = { shelf: title, appid, name };
      out.items.push(item);
      out.totalCards++;
      if (needle && name.toLowerCase().includes(needle)) out.matches.push(item);
    }
  }
  return out;
})()`;

runProbe('shared', expr)
  .then((v) => {
    console.log('Total cards:', v.totalCards);
    console.log('Shelves:', v.shelfTitles?.join(', '));
    if (needle) {
      console.log('\\nFilter:', JSON.stringify(needle));
      if (v.matches && v.matches.length) {
        console.log('Matches:');
        console.log(JSON.stringify(v.matches, null, 2));
      } else {
        console.log('Matches: NONE — game is not in the rendered pool.');
      }
    } else {
      console.log('\\nFull dump:');
      console.log(JSON.stringify(v.items, null, 2));
    }
    process.exit(0);
  })
  .catch((e) => { console.error('PROBE ERROR:', e.message || e); process.exit(1); });
