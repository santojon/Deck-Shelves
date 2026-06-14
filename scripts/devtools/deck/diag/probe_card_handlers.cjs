#!/usr/bin/env node
'use strict';
// Probes whether GameCard's Focusable actually has onButtonDown
// installed AND whether the home bus has received any events.
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
let id = 1;
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const h = (data) => { const m = JSON.parse(data); if (m.id === i) { client.removeListener('message', h); if (m.error) return rej(new Error(m.error.message)); res(m.result); } };
    client.on('message', h);
    client.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
const expr = `(function(){
  var ctx = {};
  // 1. Is the home bus connected?
  ctx.lastButton = window.__ds_home_btn_last;
  ctx.lastDirection = window.__ds_home_dir_last;
  ctx.searchMounted = window.__ds_search_mounted;
  ctx.sidenavMounted = window.__ds_sidenav_mounted;
  ctx.searchEnabled = window.__ds_search_enabled;
  ctx.sidenavEnabled = window.__ds_sidenav_enabled;
  // 2. Did SearchOverlay or SideNav appear?
  ctx.searchInDOM = !!document.querySelector('.ds-search-overlay');
  ctx.sidenavInDOM = !!document.querySelector('.ds-sidenav-overlay');
  // 3. Check focus state
  var focused = document.querySelector('.gpfocus');
  ctx.focusedTag = focused && focused.tagName;
  ctx.focusedCardIndex = focused && focused.getAttribute('data-ds-card-index');
  ctx.focusedAppid = focused && focused.getAttribute('data-appid');
  return ctx;
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
