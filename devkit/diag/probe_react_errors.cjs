#!/usr/bin/env node
'use strict';
const ws = require('ws');
const target = process.argv[2];
const HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const PORT = process.env.DECK_CDP_PORT || '8081';
const DUR = parseInt(process.env.PROBE_DURATION_MS || '3000', 10);
const client = new ws('ws://' + HOST + ':' + PORT + '/devtools/page/' + target);
let id = 1;
const logs = [];
client.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Log.entryAdded') {
    logs.push(msg);
  }
});
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const handler = (data) => { const msg = JSON.parse(data); if (msg.id === i) { client.removeListener('message', handler); if (msg.error) return rej(new Error(msg.error.message)); res(msg.result); } };
    client.on('message', handler);
    client.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
(async () => {
  await new Promise((r) => client.once('open', r));
  try {
    await send('Runtime.enable', {});
    await send('Log.enable', {});
    // Force a settings nudge to trigger re-renders / effects.
    await send('Runtime.evaluate', { expression: "window.dispatchEvent(new Event('deck-shelves-debug-poke'))", returnByValue: true });
    // Probe what was attempted
    const r = await send('Runtime.evaluate', { expression: "({ dsInputInstalled: window.__ds_input_installed, dsInputApi: window.__ds_input_api, dsInputErr: window.__ds_input_err, busLen: Array.isArray(window.__ds_input_bus) ? window.__ds_input_bus.length : null })", returnByValue: true });
    process.stderr.write('state: ' + JSON.stringify(r.result.value) + '\n');
    await new Promise((r) => setTimeout(r, DUR));
    const recent = logs.filter((m) => {
      const t = m.params?.type || m.params?.entry?.level;
      const text = (m.params?.args || []).map((a) => a.value || a.description || '').join(' ') || m.params?.entry?.text || '';
      return /deck-shelves|searchoverlay|sidenav|controllerinput|input_api|input_err/i.test(text) || /\berror\b/i.test(text);
    });
    process.stdout.write(JSON.stringify({ recentLogs: recent.slice(0, 30) }, null, 2) + '\n');
    client.close();
    process.exit(0);
  } catch (e) { console.error(String(e)); process.exit(2); }
})();
