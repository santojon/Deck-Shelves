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
    setTimeout(() => reject(new Error('timeout')), 15000);
  });
}

w.on('open', async () => {
  try {
    // Disable runtime to stop console noise
    await send('Runtime.disable', {});
    
    const res = await send('Runtime.evaluate', {
      expression: `(function(){
        var store = window.appStore || window.AppStore;
        if (!store || !store.m_mapApps) return JSON.stringify({error: 'no map'});
        
        var compat = {0: 0, 1: 0, 2: 0, 3: 0};
        var packedSample = [];
        var count = 0;
        var hasOwnPacked = 0;
        
        for (var v of store.m_mapApps.values()) {
          if (!v || !v.appid) continue;
          count++;
          if (count > 2000) break;
          
          var packed = v.steam_hw_compat_category_packed;
          if (Object.prototype.hasOwnProperty.call(v, 'steam_hw_compat_category_packed')) hasOwnPacked++;
          
          if (packed !== undefined && packed !== 0 && packedSample.length < 5) {
            packedSample.push({
              appid: v.appid, name: v.display_name, packed: packed,
              category: Number(packed) & 0xF,
            });
          }
          var raw = Number(packed || 0);
          var category = raw & 0xF;
          if (category in compat) compat[category]++;
        }
        
        return JSON.stringify({total: count, compatCounts: compat, hasOwnPacked: hasOwnPacked, packedSample: packedSample});
      })()`,
      returnByValue: true,
    });
    
    process.stdout.write(res.result.value + '\\n');
    w.close();
  } catch (e) {
    process.stderr.write('ERR: ' + e.message + '\\n');
    w.close();
  }
});
w.on('error', (e) => { process.stderr.write('WS_ERR: ' + e.message + '\\n'); process.exit(1); });
