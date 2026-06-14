#!/usr/bin/env node
'use strict';
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
let id = 1;
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const h = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === i) { client.removeListener('message', h); if (msg.error) return rej(new Error(msg.error.message)); res(msg.result); }
    };
    client.on('message', h);
    client.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
const expr = `(function(){
  const root = document.getElementById('deck-shelves-home-root');
  if (!root) return { error: 'no home root' };
  const heroes = Array.from(document.querySelectorAll('[data-ds-per-shelf-hero]'));
  const fullPageHeroes = heroes.filter((h) => h.getAttribute('data-ds-hero-full-page') === 'true');
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top|0, left: r.left|0, w: r.width|0, h: r.height|0, bottom: r.bottom|0 }; };
  const focused = document.querySelector('.gpfocus');
  const focusedShelf = focused ? focused.closest('[data-shelfid]') : null;
  const allShelves = Array.from(root.querySelectorAll('.ds-shelf'));
  return {
    viewport: { w: innerWidth, h: innerHeight, scrollY: window.scrollY },
    focusedTag: focused ? focused.tagName : null,
    focusedClass: focused ? focused.className.slice(0,80) : null,
    focusedShelfId: focusedShelf ? focusedShelf.getAttribute('data-shelfid') : null,
    focusedCardIndex: focused ? focused.getAttribute('data-ds-card-index') : null,
    focusedAppid: focused ? focused.getAttribute('data-appid') : null,
    totalShelves: allShelves.length,
    totalHeroes: heroes.length,
    fullPageHeroes: fullPageHeroes.length,
    heroDetails: heroes.map((h) => {
      const sh = h.closest('[data-shelfid]');
      const cs = getComputedStyle(h);
      return {
        shelfId: sh ? sh.getAttribute('data-shelfid') : null,
        isFullPage: h.getAttribute('data-ds-hero-full-page') === 'true',
        position: cs.position,
        top: cs.top,
        height: cs.height,
        zIndex: cs.zIndex,
        opacity: cs.opacity,
        rect: rect(h),
      };
    }),
    visibleShelves: allShelves
      .map((sh) => ({ id: sh.getAttribute('data-shelfid'), rect: rect(sh), cs: { minHeight: getComputedStyle(sh).minHeight, position: getComputedStyle(sh).position } }))
      .filter((s) => s.rect && s.rect.bottom > -100 && s.rect.top < innerHeight + 100),
  };
})()`;
(async () => {
  await new Promise((r) => client.once('open', r));
  try {
    const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    process.stdout.write(JSON.stringify(result.result.value, null, 2) + '\n');
    client.close();
    process.exit(0);
  } catch (e) { console.error(String(e)); process.exit(2); }
})();
