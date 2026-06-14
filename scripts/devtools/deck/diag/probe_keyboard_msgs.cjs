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
const armExpr = `(function(){
  if (window.__ds_kb) return JSON.stringify({ status: 'already' });
  const state = { events: [], regs: [] };
  window.__ds_kb = state;
  const opener = window.opener || null;
  const candidates = [
    { obj: opener?.SteamClient?.Input, label: 'opener.Input' },
    { obj: window.SteamClient?.Input, label: 'window.Input' },
  ];
  const tryReg = (obj, label, method) => {
    if (!obj || typeof obj[method] !== 'function') return;
    try {
      const reg = obj[method]((...args) => {
        state.events.push({ source: label + '.' + method, args: args.map((a) => typeof a === 'object' ? JSON.stringify(a).slice(0, 200) : String(a)), ts: Date.now() });
      });
      state.regs.push({ label, method, reg });
    } catch (e) {
      state.events.push({ source: label + '.' + method, error: String(e).slice(0, 200), ts: Date.now() });
    }
  };
  for (const c of candidates) {
    tryReg(c.obj, c.label, 'RegisterForUserKeyboardMessages');
    tryReg(c.obj, c.label, 'RegisterForGameKeyboardMessages');
    tryReg(c.obj, c.label, 'RegisterForUserDismissKeyboardMessages');
    tryReg(c.obj, c.label, 'RegisterForControllerInputMessages');
    tryReg(c.obj, c.label, 'RegisterForControllerCommandMessages');
  }
  return JSON.stringify({ status: 'armed', registrations: state.regs.length });
})()`;
const drainExpr = `(function(){
  const s = window.__ds_kb;
  if (!s) return JSON.stringify({ status: 'not_armed' });
  for (const r of s.regs) { try { r.reg?.unregister?.(); } catch {} }
  const out = JSON.stringify({ status: 'drain', count: s.events.length, events: s.events.slice(0, 200) });
  delete window.__ds_kb;
  return out;
})()`;
(async () => {
  await new Promise((r) => client.once('open', r));
  try {
    const arm = await send('Runtime.evaluate', { expression: armExpr, returnByValue: true });
    process.stderr.write('arm: ' + arm.result.value + '\n');
    process.stderr.write('press buttons / type now for ' + DUR + 'ms\n');
    await new Promise((r) => setTimeout(r, DUR));
    const drain = await send('Runtime.evaluate', { expression: drainExpr, returnByValue: true });
    process.stdout.write(drain.result.value + '\n');
    client.close();
    process.exit(0);
  } catch (e) { console.error(String(e)); process.exit(2); }
})();
