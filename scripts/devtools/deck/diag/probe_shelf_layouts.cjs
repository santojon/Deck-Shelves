#!/usr/bin/env node
'use strict';
// Compare layout of:
// - first shelf (forced/recents replacement)
// - any shelf with fullPageShelf=true
// - regular shelves
// to find what makes the first shelf look correct and full-page break.
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
let id = 1;
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const h = (data) => { const msg = JSON.parse(data); if (msg.id === i) { client.removeListener('message', h); if (msg.error) return rej(new Error(msg.error.message)); res(msg.result); } };
    client.on('message', h);
    client.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
const expr = `(function(){
  const root = document.getElementById('deck-shelves-home-root');
  if (!root) return { error: 'no home root' };
  const settings = window.__deckShelvesSettings || null;
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top|0, left: r.left|0, w: r.width|0, h: r.height|0, bottom: r.bottom|0 }; };
  const css = (el, ...props) => { if (!el) return null; const cs = getComputedStyle(el); const out = {}; for (const p of props) out[p] = cs.getPropertyValue(p); return out; };
  const shelves = Array.from(root.querySelectorAll('.ds-shelf'));
  return {
    viewport: { w: innerWidth, h: innerHeight, scrollY: window.scrollY },
    forceCssLoaderThemes: !!(settings?.forceCssLoaderThemes),
    globalFullPageShelf: !!(settings?.globalFullPageShelf),
    rootStyle: css(root, 'margin-top', 'padding-top', 'position', 'min-height'),
    shelves: shelves.map((sh, idx) => {
      const hero = sh.querySelector('[data-ds-per-shelf-hero]');
      const isFullPage = hero ? hero.getAttribute('data-ds-hero-full-page') === 'true' : false;
      const heroEnabled = sh.getAttribute('data-ds-hero-enabled') === 'true';
      const firstCard = sh.querySelector('[data-appid]');
      const cardRow = sh.querySelector('[data-ds-card-index="0"]')?.parentElement || null;
      const title = sh.querySelector('.ds-shelf-title');
      const logo = sh.querySelector('.ds-shelf-logo-overlay');
      const promotedLabel = sh.querySelector('.ds-promoted-hero-label');
      return {
        idx,
        shelfId: sh.getAttribute('data-shelfid'),
        heroEnabled,
        isFullPage,
        shelfRect: rect(sh),
        shelfStyle: css(sh, 'position', 'min-height', 'padding-top', 'margin-top', 'margin-bottom', 'overflow', 'background', 'display', 'flex-direction', 'justify-content', 'z-index'),
        heroRect: rect(hero),
        heroStyle: hero ? css(hero, 'position', 'top', 'left', 'right', 'height', 'z-index', 'opacity') : null,
        titleRect: rect(title),
        logoRect: rect(logo),
        promotedLabelRect: rect(promotedLabel),
        firstCardRect: rect(firstCard),
        cardRowRect: rect(cardRow),
        cardCount: sh.querySelectorAll('[data-appid]').length,
      };
    }),
  };
})()`;
(async () => {
  await new Promise((r) => client.once('open', r));
  try {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    process.stdout.write(JSON.stringify(r.result.value, null, 2) + '\n');
    client.close();
    process.exit(0);
  } catch (e) { console.error(String(e)); process.exit(2); }
})();
