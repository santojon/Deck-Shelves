#!/usr/bin/env node
'use strict';
// Install short-lived keydown listeners on multiple targets and report
// what fires when. Useful to debug whether SearchOverlay / ShelfSideNav
// hooks can receive the events they need in the live BP page.
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const DURATION = parseInt(process.env.PROBE_DURATION_MS || '6000', 10);
const client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
let id = 1;
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const h = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === i) { client.removeListener('message', h); if (msg.error) return rej(new Error(msg.error.message)); res(msg.result); }
    };
    client.on('message', h);
    client.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}

const expr = `(function(){
  if (window.__ds_probe_state) return JSON.stringify({ status: 'already_armed' });
  window.__ds_probe_state = { events: [] };
  const log = (where, e) => {
    window.__ds_probe_state.events.push({
      where,
      key: e.key,
      code: e.code,
      target: e.target && e.target.tagName,
      ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey,
      ts: Date.now(),
    });
  };
  document.addEventListener('keydown', (e) => log('document.capture', e), true);
  document.addEventListener('keydown', (e) => log('document.bubble', e), false);
  window.addEventListener('keydown', (e) => log('window.capture', e), true);
  if (document.body) document.body.addEventListener('keydown', (e) => log('body.capture', e), true);
  const root = document.getElementById('deck-shelves-home-root');
  if (root) root.addEventListener('keydown', (e) => log('root.capture', e), true);
  return JSON.stringify({ status: 'armed', root: !!root });
})()`;
const drainExpr = `(function(){
  const s = window.__ds_probe_state;
  if (!s) return JSON.stringify({ status: 'not_armed' });
  const out = JSON.stringify({ status: 'drain', count: s.events.length, events: s.events.slice(0, 200) });
  delete window.__ds_probe_state;
  return out;
})()`;

(async () => {
  await new Promise((r) => client.once('open', r));
  try {
    const arm = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    process.stderr.write('armed: ' + arm.result.value + '\n');
    process.stderr.write('Type/press input now. Sampling for ' + DURATION + 'ms…\n');
    await new Promise((r) => setTimeout(r, DURATION));
    const drain = await send('Runtime.evaluate', { expression: drainExpr, returnByValue: true });
    process.stdout.write(drain.result.value + '\n');
    client.close();
    process.exit(0);
  } catch (e) { console.error(String(e)); process.exit(2); }
})();
