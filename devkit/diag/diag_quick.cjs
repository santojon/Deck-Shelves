const W = require('ws');
const TARGET_ID = process.argv[2];
var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const w = new W('ws://' + HOST + ':8081/devtools/page/' + TARGET_ID);
let msgId = 0;
function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) { w.removeListener('message', handler); resolve(msg.result); }
    };
    w.on('message', handler);
    w.send(JSON.stringify({ id, method, params }));
    setTimeout(() => reject(new Error('timeout')), 10000);
  });
}
w.on('open', async () => {
  try {
    const res = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        hasFNC: typeof FocusNavController !== 'undefined',
        hasFNCWindow: typeof window.FocusNavController !== 'undefined',
        hasDFL: typeof DFL !== 'undefined',
        hasSteamUIStore: typeof SteamUIStore !== 'undefined',
        windowKeys: Object.keys(window).filter(k => /focus|nav|controller/i.test(k)).slice(0, 10),
      })`,
      returnByValue: true,
    });
    process.stdout.write(res.result.value + '\n');
    w.close();
  } catch(e) { process.stderr.write('ERR:' + e.message + '\n'); w.close(); }
});
w.on('error', () => process.exit(1));
