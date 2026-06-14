#!/usr/bin/env node
'use strict';
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const c = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
let id = 1;
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const h = (d) => { const m = JSON.parse(d); if (m.id === i) { c.removeListener('message', h); if (m.error) return rej(new Error(m.error.message)); res(m.result); } };
    c.on('message', h);
    c.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
const expr = `JSON.stringify({
  trace: window.__ds_sidenav_trace || null,
  fired: window.__ds_sidenav_fired,
  buttonLog: window.__ds_sidenav_btn_log,
  enabled: window.__ds_sidenav_enabled,
  searchEnabled: window.__ds_search_enabled,
  searchMounts: window.__ds_search_mounted,
  sidenavMounts: window.__ds_sidenav_mounted,
})`;
(async () => {
  await new Promise(r => c.once('open', r));
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const data = JSON.parse(r.result.value);
  console.log(JSON.stringify(data, null, 2));
  c.close();
})();
