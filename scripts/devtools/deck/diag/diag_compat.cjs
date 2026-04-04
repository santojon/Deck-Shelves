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
    const res = await send('Runtime.evaluate', {
      expression: `(function(){
        var store = window.appStore || window.AppStore;
        if (!store || !store.m_mapApps) return JSON.stringify({error: 'no map'});
        
        // Check deck compat fields on raw apps
        var compat = {0: 0, 1: 0, 2: 0, 3: 0};
        var noCompat = 0;
        var packedSample = [];
        var count = 0;
        
        for (var v of store.m_mapApps.values()) {
          if (!v || !v.appid) continue;
          count++;
          if (count > 2000) break;
          
          var packed = v.steam_hw_compat_category_packed;
          var dcc = v.deck_compatibility_category;
          var m_e = v.m_eDeckCompatibilityCategory;
          
          if (packed !== undefined && packed !== 0 && packedSample.length < 5) {
            packedSample.push({
              appid: v.appid,
              name: v.display_name,
              packed: packed,
              dcc: dcc,
              m_e: m_e,
              installed: v.installed,
            });
          }
          
          // Check what the actual compat value is
          // steam_hw_compat_category_packed format: packed >> 0 & 0xF for the category
          var raw = Number(packed || 0);
          var category = raw & 0xF;  // low nibble
          
          if (category in compat) compat[category]++;
          else noCompat++;
        }
        
        return JSON.stringify({
          total: count,
          compatCounts: compat,
          noCompat: noCompat,
          packedSample: packedSample,
        });
      })()`,
      returnByValue: true,
    });
    
    console.log('COMPAT:', JSON.stringify(JSON.parse(res.result.value), null, 2));
    w.close();
  } catch (e) {
    console.error('ERR:', e.message);
    w.close();
  }
});
w.on('error', (e) => { console.error('WS_ERR:', e.message); process.exit(1); });
