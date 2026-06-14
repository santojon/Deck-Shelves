#!/usr/bin/env node
'use strict';
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const DUR = parseInt(process.env.PROBE_DURATION_MS || '10000', 10);
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
const arm = `(function(){
  if (window.__ds_sn) return JSON.stringify({ status: 'armed' });
  const state = { events: [], focusLog: [] };
  window.__ds_sn = state;
  const ic = window.SteamClient?.Input || window.opener?.SteamClient?.Input;
  let reg = null;
  if (ic && ic.RegisterForControllerInputMessages) {
    try {
      reg = ic.RegisterForControllerInputMessages((slot, button, pressed) => {
        const f = document.querySelector('.gpfocus');
        state.events.push({
          button, pressed, slot, ts: Date.now(),
          focusedAppid: f?.getAttribute('data-appid'),
          focusedCardIndex: f?.getAttribute('data-ds-card-index'),
          focusedTag: f?.tagName,
          focusedCls: f?.className?.slice(0, 80),
        });
      });
    } catch (e) { state.events.push({ error: String(e).slice(0, 200) }); }
  }
  state.reg = reg;
  return JSON.stringify({
    status: 'armed',
    hasInputApi: !!ic?.RegisterForControllerInputMessages,
    registered: !!reg,
  });
})()`;
const drain = `(function(){
  const s = window.__ds_sn;
  if (!s) return JSON.stringify({ status: 'not_armed' });
  try { s.reg?.unregister?.(); } catch {}
  const out = JSON.stringify({ status: 'drain', count: s.events.length, events: s.events.slice(-50) });
  delete window.__ds_sn;
  return out;
})()`;
(async () => {
  await new Promise((r) => client.once('open', r));
  try {
    const a = await send('Runtime.evaluate', { expression: arm, returnByValue: true });
    process.stderr.write('arm: ' + a.result.value + '\n');
    process.stderr.write('press dpad/buttons now, ' + DUR + 'ms\n');
    await new Promise((r) => setTimeout(r, DUR));
    const d = await send('Runtime.evaluate', { expression: drain, returnByValue: true });
    process.stdout.write(d.result.value + '\n');
    client.close();
    process.exit(0);
  } catch (e) { console.error(String(e)); process.exit(2); }
})();
