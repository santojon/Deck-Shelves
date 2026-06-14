#!/usr/bin/env node
'use strict';
// Arms a log array in homeInputBus that records every button + direction
// event seen. User presses buttons during sample window; on drain we
// print what came through.
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
    const h = (data) => { const m = JSON.parse(data); if (m.id === i) { client.removeListener('message', h); if (m.error) return rej(new Error(m.error.message)); res(m.result); } };
    client.on('message', h);
    client.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
const arm = `(function(){
  if (window.__ds_bus_arm) return JSON.stringify({ status: 'armed' });
  window.__ds_bus_arm = { log: [] };
  var log = window.__ds_bus_arm.log;
  // hook into the dispatchers by monkey-patching the global accessors,
  // OR by just reading __ds_home_btn_last / __ds_home_dir_last over time.
  window.__ds_bus_arm.timer = setInterval(function () {
    var b = window.__ds_home_btn_last;
    var d = window.__ds_home_dir_last;
    if (b && b.t !== window.__ds_bus_arm.lastBt) {
      log.push({ kind: 'btn', button: b.button, t: b.t });
      window.__ds_bus_arm.lastBt = b.t;
      if (log.length > 100) log.shift();
    }
    if (d && d.t !== window.__ds_bus_arm.lastDt) {
      log.push({ kind: 'dir', button: d.button, t: d.t });
      window.__ds_bus_arm.lastDt = d.t;
      if (log.length > 100) log.shift();
    }
  }, 50);
  return JSON.stringify({ status: 'armed' });
})()`;
const drain = `(function(){
  var s = window.__ds_bus_arm;
  if (!s) return JSON.stringify({ status: 'not_armed' });
  clearInterval(s.timer);
  var out = JSON.stringify({ count: s.log.length, log: s.log });
  delete window.__ds_bus_arm;
  return out;
})()`;
(async () => {
  await new Promise((r) => client.once('open', r));
  try {
    const a = await send('Runtime.evaluate', { expression: arm, returnByValue: true });
    process.stderr.write('arm: ' + a.result.value + '\n');
    process.stderr.write('Press L1+R1 and dpad-left on first card for ' + DUR + 'ms\n');
    await new Promise((r) => setTimeout(r, DUR));
    const d = await send('Runtime.evaluate', { expression: drain, returnByValue: true });
    process.stdout.write(d.result.value + '\n');
    client.close();
    process.exit(0);
  } catch (e) { console.error(String(e)); process.exit(2); }
})();
