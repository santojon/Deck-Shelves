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
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === id) {
        client.removeListener('message', handler);
        if (msg.error) return reject(new Error(method + ': ' + msg.error.message));
        resolve(msg.result);
      }
    };
    client.on('message', handler);
    client.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

const expr = `(function() {
  const root = document.getElementById('deck-shelves-home-root');
  if (!root) return { error: 'no home root' };
  const shelves = Array.from(root.querySelectorAll('[data-shelfid]'));
  const out = shelves.map((sh) => {
    const r = sh.getBoundingClientRect();
    const cs = getComputedStyle(sh);
    const fullPage = sh.getAttribute('data-ds-full-page') || cs.getPropertyValue('--ds-eff-full-page') || '';
    const title = sh.querySelector('.ds-shelf-title');
    const titleR = title ? title.getBoundingClientRect() : null;
    const hero = sh.querySelector('.ds-shelf-hero, .ds-shelf-hero-art');
    const heroR = hero ? hero.getBoundingClientRect() : null;
    const logo = sh.querySelector('.ds-shelf-logo-overlay');
    const logoR = logo ? logo.getBoundingClientRect() : null;
    const cardEls = sh.querySelectorAll('[data-appid]');
    const firstCard = cardEls[0];
    const firstR = firstCard ? firstCard.getBoundingClientRect() : null;
    return {
      shelfId: sh.getAttribute('data-shelfid'),
      forceExpanded: sh.getAttribute('data-ds-forced'),
      shelfRect: { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom },
      titleRect: titleR ? { top: titleR.top, left: titleR.left, width: titleR.width, height: titleR.height } : null,
      heroRect: heroR ? { top: heroR.top, left: heroR.left, width: heroR.width, height: heroR.height } : null,
      logoRect: logoR ? { top: logoR.top, left: logoR.left, width: logoR.width, height: logoR.height } : null,
      firstCardRect: firstR ? { top: firstR.top, left: firstR.left, width: firstR.width, height: firstR.height } : null,
      cardCount: cardEls.length,
      paddingTop: cs.paddingTop,
      marginTop: cs.marginTop,
      position: cs.position,
      zIndex: cs.zIndex,
      overflow: cs.overflow,
    };
  });
  const viewport = { w: innerWidth, h: innerHeight };
  return { viewport, shelves: out };
})()`;

(async () => {
  await new Promise((r) => client.once('open', r));
  try {
    const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    process.stdout.write(JSON.stringify(result.result.value, null, 2) + '\n');
    client.close();
    process.exit(0);
  } catch (e) {
    console.error(String(e));
    process.exit(2);
  }
})();
