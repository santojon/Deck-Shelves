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
    const h = (data) => { const msg = JSON.parse(data); if (msg.id === i) { client.removeListener('message', h); if (msg.error) return rej(new Error(msg.error.message)); res(msg.result); } };
    client.on('message', h);
    client.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
const expr = `(function(){
  const root = document.getElementById('deck-shelves-home-root');
  if (!root) return { error: 'no home root' };
  const allCards = root.querySelectorAll('[data-appid]');
  const cardIdx0 = root.querySelectorAll('[data-ds-card-index="0"]');
  const cardWithIdx = Array.from(allCards).slice(0, 3).map((c) => ({
    appid: c.getAttribute('data-appid'),
    cardIndex: c.getAttribute('data-ds-card-index'),
    cls: c.className.slice(0, 80),
  }));
  const focused = document.querySelector('.gpfocus');
  return {
    total: allCards.length,
    withIndexZero: cardIdx0.length,
    sample: cardWithIdx,
    focusedClass: focused ? focused.className.slice(0,100) : null,
    focusedAppid: focused ? focused.getAttribute('data-appid') : null,
    focusedCardIndex: focused ? focused.getAttribute('data-ds-card-index') : null,
    focusedClosestCard: focused ? (() => { const c = focused.closest('[data-appid]'); return c ? { appid: c.getAttribute('data-appid'), idx: c.getAttribute('data-ds-card-index') } : null; })() : null,
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
