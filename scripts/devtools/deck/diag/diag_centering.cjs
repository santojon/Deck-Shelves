const W = require('ws');
const TARGET_ID = process.argv[2];
var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const w = new W('ws://' + HOST + ':8081/devtools/page/' + TARGET_ID);
let msgId = 0;

function evaluate(expr) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        w.removeListener('message', handler);
        const r = msg.result?.result;
        const exc = msg.result?.exceptionDetails;
        if (exc) resolve({ exception: exc.text || exc.exception?.description });
        else if (r?.value) { try { resolve(JSON.parse(r.value)); } catch { resolve(r.value); } }
        else resolve(r);
      }
    };
    w.on('message', handler);
    w.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    setTimeout(() => reject(new Error('timeout')), 10000);
  });
}

w.on('open', async () => {
  try {
    const result = await evaluate(`JSON.stringify((function(){
      var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
      var doc = win.document;
      var mount = doc.getElementById('deck-shelves-home-root');
      if (!mount) return { error: 'no mount found' };
      var rows = Array.from(mount.querySelectorAll('.ds-row-scroll'));
      var centeringFlag = typeof globalThis.__ds_centering !== 'undefined' ? globalThis.__ds_centering : 'not set';
      var supportsScrollend = 'onscrollend' in doc.createElement('div');
      return {
        centeringFlag: centeringFlag,
        supportsScrollend: supportsScrollend,
        rowCount: rows.length,
        rows: rows.map(function(row, i) {
          var focused = row.querySelector('.ds-card.ds-focused');
          return {
            idx: i,
            scrollLeft: Math.round(row.scrollLeft),
            scrollWidth: row.scrollWidth,
            clientWidth: row.clientWidth,
            maxScroll: row.scrollWidth - row.clientWidth,
            scrollBehavior: win.getComputedStyle(row).scrollBehavior,
            cardCount: row.querySelectorAll('.ds-card').length,
            focusedAppid: focused ? focused.getAttribute('data-appid') : null
          };
        })
      };
    })())`);

    console.log(JSON.stringify(result, null, 2));

  } catch(e) {
    console.error("ERROR:", e.message);
  }
  w.close();
  process.exit(0);
});

w.on('error', e => { console.error('ERR:' + e.message); process.exit(1); });
setTimeout(() => { process.exit(1); }, 15000);
