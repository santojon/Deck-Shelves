#!/usr/bin/env node
'use strict';
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const DUR = parseInt(process.env.PROBE_DURATION_MS || '15000', 10);
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
const arm = `(function(){
  if (window.__ds_focus_arm) return JSON.stringify({ status: 'armed' });
  window.__ds_focus_arm = { log: [] };
  var log = window.__ds_focus_arm.log;
  var pushFocus = function (label) {
    var f = document.querySelector('.gpfocus');
    log.push({ t: Date.now(), label: label, scrollY: window.scrollY, cardIdx: f && f.getAttribute('data-ds-card-index'), shelfId: f && f.closest('[data-shelfid]') && f.closest('[data-shelfid]').getAttribute('data-shelfid'), tag: f && f.tagName, cls: f && f.className && f.className.slice(0, 60) });
    if (log.length > 100) log.shift();
  };
  var obs = new MutationObserver(function () { pushFocus('mut'); });
  obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  pushFocus('init');
  return JSON.stringify({ status: 'armed' });
})()`;
const drain = `(function(){
  var s = window.__ds_focus_arm;
  if (!s) return JSON.stringify({ status: 'not_armed' });
  return JSON.stringify({ count: s.log.length, log: s.log.slice(-40) });
})()`;
(async () => {
  await new Promise((r) => client.once('open', r));
  try {
    const a = await send('Runtime.evaluate', { expression: arm, returnByValue: true });
    process.stderr.write('arm: ' + a.result.value + '\n');
    process.stderr.write('Move focus around now, ' + DUR + 'ms...\n');
    await new Promise((r) => setTimeout(r, DUR));
    const d = await send('Runtime.evaluate', { expression: drain, returnByValue: true });
    process.stdout.write(d.result.value + '\n');
    client.close();
    process.exit(0);
  } catch (e) { console.error(String(e)); process.exit(2); }
})();
