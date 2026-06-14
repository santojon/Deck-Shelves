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
  const g = window;
  return {
    apiAvailable: g.__ds_input_api,
    installed: g.__ds_input_installed,
    err: g.__ds_input_err,
    busLen: Array.isArray(g.__ds_input_bus) ? g.__ds_input_bus.length : null,
    lastEvent: g.__ds_input_last || null,
    logLen: Array.isArray(g.__ds_input_log) ? g.__ds_input_log.length : null,
    settings: g.__deckShelvesSettings ? {
      contextSearchEnabled: g.__deckShelvesSettings.contextSearchEnabled,
      sideNavEnabled: g.__deckShelvesSettings.sideNavEnabled,
    } : null,
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
