const ws = require('ws');
const c = new ws('ws://192.168.1.15:8081/devtools/page/' + process.argv[2]);
let id = 1;
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const h = (d) => { const m = JSON.parse(d); if (m.id === i) { c.removeListener('message', h); if (m.error) return rej(new Error(m.error.message)); res(m.result); } };
    c.on('message', h);
    c.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
(async () => {
  await new Promise(r => c.once('open', r));
  const r = await send('Runtime.evaluate', { expression: 'JSON.stringify({ sources: window.__ds_input_sources, log: window.__ds_input_log, last: window.__ds_input_last })', returnByValue: true });
  console.log(r.result.value);
  c.close();
})();
