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
    const h = (data) => { const m = JSON.parse(data); if (m.id === i) { client.removeListener('message', h); if (m.error) return rej(new Error(m.error.message)); res(m.result); } };
    client.on('message', h);
    client.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
const expr = `(function(){
  const dump = (w, label) => {
    try {
      const sc = w?.SteamClient;
      const inp = sc?.Input;
      return {
        label,
        hasSteamClient: !!sc,
        hasInput: !!inp,
        hasRegister: typeof inp?.RegisterForControllerInputMessages === 'function',
        opener: w?.opener ? 'yes' : 'no',
      };
    } catch (e) { return { label, err: String(e).slice(0, 200) }; }
  };
  const out = [];
  out.push(dump(window, 'window'));
  out.push(dump(window.opener, 'opener'));
  // Walk SteamUIStore
  try {
    const ui = window.SteamUIStore || window.opener?.SteamUIStore;
    out.push({ label: 'SteamUIStore', present: !!ui, focusedWindow: !!ui?.GetFocusedWindowInstance?.() });
    out.push(dump(ui?.GetFocusedWindowInstance?.()?.BrowserWindow, 'focused.BrowserWindow'));
    out.push(dump(ui?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow, 'gamepadMain.BrowserWindow'));
    const wins = ui?.WindowStore?.SteamUIWindows;
    if (Array.isArray(wins)) {
      wins.forEach((w, i) => out.push(dump(w?.BrowserWindow, 'uiWindows[' + i + '].BrowserWindow')));
    }
  } catch (e) { out.push({ err: String(e).slice(0, 200) }); }
  // Also expose home root document
  const root = document.getElementById('deck-shelves-home-root');
  if (root) {
    const view = root.ownerDocument?.defaultView;
    out.push(dump(view, 'home.ownerDocument.defaultView'));
    out.push(dump(view?.opener, 'home.opener'));
  }
  return out;
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
