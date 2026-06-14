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
  const out = {};
  const seek = (root, label) => {
    if (!root) { out[label] = 'no_root'; return; }
    const sc = root.SteamClient;
    if (!sc) { out[label] = 'no_steamclient'; return; }
    const input = sc.Input || {};
    const keys = Object.keys(input).filter((k) => typeof input[k] === 'function');
    out[label] = { hasInput: true, methods: keys };
    const ui = sc.UI || {};
    const uiKeys = Object.keys(ui).filter((k) => typeof ui[k] === 'function');
    out[label + '_UI'] = { hasUI: !!sc.UI, methods: uiKeys.filter((k) => /key|input|focus/i.test(k)) };
    const kb = sc.Keyboard || sc.KeyboardLayout || null;
    if (kb) {
      out[label + '_Keyboard'] = Object.keys(kb).filter((k) => typeof kb[k] === 'function');
    }
  };
  seek(window, 'window');
  seek(window.opener, 'opener');
  try {
    const w = window.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
    seek(w, 'mainWin');
  } catch {}
  return out;
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
