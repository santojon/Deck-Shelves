#!/usr/bin/env node
'use strict';
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
let msgId = 1;
function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const h = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === id) { client.removeListener('message', h); if (msg.error) return reject(new Error(msg.error.message)); resolve(msg.result); }
    };
    client.on('message', h);
    client.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
const expr = `(function() {
  const root = document.getElementById('deck-shelves-home-root');
  if (!root) return { error: 'no home root' };
  const shelves = Array.from(root.querySelectorAll('.ds-shelf'));
  const visible = shelves.map((sh) => {
    const r = sh.getBoundingClientRect();
    if (r.bottom < -100 || r.top > innerHeight + 100) return null;
    const fp = sh.querySelector('[data-ds-full-page]') ? true : false;
    const heroArt = sh.querySelector('[data-ds-hero-art]') || sh.querySelector('.ds-per-shelf-hero-art');
    const logo = sh.querySelector('.ds-shelf-logo-overlay');
    const title = sh.querySelector('.ds-shelf-title');
    const desc = sh.querySelector('.ds-shelf-logo-description');
    const firstCard = sh.querySelector('[data-appid]');
    const cs = getComputedStyle(sh);
    const rect = (el) => el ? (() => { const r2 = el.getBoundingClientRect(); return { top: r2.top|0, left: r2.left|0, w: r2.width|0, h: r2.height|0 }; })() : null;
    return {
      shelfId: sh.getAttribute('data-shelfid'),
      forceExpanded: sh.getAttribute('data-ds-forced'),
      fullPageAttr: sh.getAttribute('data-ds-full-page'),
      heroEnabledAttr: sh.getAttribute('data-ds-hero-enabled'),
      rect: rect(sh),
      cs: { paddingTop: cs.paddingTop, marginTop: cs.marginTop, minHeight: cs.minHeight, position: cs.position, overflow: cs.overflow, background: cs.background.slice(0, 40), zIndex: cs.zIndex },
      heroArt: rect(heroArt),
      logo: rect(logo),
      title: rect(title),
      desc: rect(desc),
      firstCard: rect(firstCard),
    };
  }).filter(Boolean);
  return { viewport: { w: innerWidth, h: innerHeight }, visible };
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
