const ws = require('ws');
const target = process.argv[2];
const expr = require('fs').readFileSync('/tmp/probe_all_flags.js', 'utf8');
const client = new ws('ws://192.168.1.15:8081/devtools/page/' + target);
let id = 1;
function send(method, params) {
  return new Promise((res, rej) => {
    const i = id++;
    const h = (data) => { const m = JSON.parse(data); if (m.id === i) { client.removeListener('message', h); if (m.error) return rej(new Error(m.error.message)); res(m.result); } };
    client.on('message', h);
    client.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
}
(async () => {
  await new Promise((r) => client.once('open', r));
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(JSON.stringify(r.result.value, null, 2));
  client.close();
})();
