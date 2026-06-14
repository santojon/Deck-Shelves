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
  const ds = window.deckShelves;
  const wkeys = Object.keys(window).filter((k) => /^(_|ds|deck|shelf|settings)/i.test(k)).slice(0, 30);
  // Look for settings json on disk path through any exposed bridge.
  return {
    deckShelves: ds ? { keys: Object.keys(ds) } : null,
    windowKeys: wkeys,
    inputApi: window.__ds_input_api,
    busLen: Array.isArray(window.__ds_input_bus) ? window.__ds_input_bus.length : null,
    dsApi: ds?.api ? { version: ds.api.version, hasGetSh: typeof ds.api.getShelves } : null,
    // probe settings via the api
    settings: (() => {
      try {
        const sh = ds?.api?.getShelves?.();
        return sh ? { shelfCount: sh.length, sample: sh.slice(0,2).map((s) => ({ id: s.id, title: s.title })) } : null;
      } catch (e) { return { err: String(e).slice(0, 100) }; }
    })(),
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
