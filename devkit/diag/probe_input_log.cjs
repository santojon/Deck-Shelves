const ws = require('ws');
const expr = `({ logCount: Array.isArray(window.__ds_input_log) ? window.__ds_input_log.length : null, recent: Array.isArray(window.__ds_input_log) ? window.__ds_input_log.slice(-10) : null, last: window.__ds_input_last })`;
const c = new ws('ws://192.168.1.15:8081/devtools/page/' + process.argv[2]);
let id = 1;
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const h = (data) => { const m = JSON.parse(data); if (m.id === i) { c.removeListener('message', h); if (m.error) return rej(new Error(m.error.message)); res(m.result); } };
    c.on('message', h);
    c.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
(async () => { await new Promise(r => c.once('open', r)); const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); console.log(JSON.stringify(r.result.value, null, 2)); c.close(); })();
