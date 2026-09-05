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
    setTimeout(() => reject(new Error('timeout')), 20000);
  });
}

w.on('open', async () => {
  try {
    // Evaluate in the SharedJSContext to check what our plugin's resolution chain really does
    const res = await send('Runtime.evaluate', {
      expression: `(async function(){
        // Simulate what getAllAppOverviews does
        var out = [];
        
        // Check SteamClient.Apps methods
        var sc = window.SteamClient;
        var appsApi = sc && sc.Apps;
        var apiResult = null;
        try { apiResult = await appsApi.GetAllAppOverviews(); } catch(e) {}
        if (Array.isArray(apiResult)) out.push.apply(out, apiResult);
        try { var myApps = await appsApi.GetMyApps(); if (Array.isArray(myApps)) out.push.apply(out, myApps); } catch(e) {}
        
        var apiCount = out.length;

        // Fallback: try appStore directly  
        if (!out.length) {
          var store = window.appStore || window.AppStore;
          if (store && store.m_mapApps && store.m_mapApps.size) {
            var count = 0;
            var sampleInstalled = [];
            var sampleNotInstalled = [];
            for (var v of store.m_mapApps.values()) {
              if (!v || !v.appid) continue;
              out.push(v);
              count++;
              // collect samples
              if (v.installed === true && sampleInstalled.length < 3) {
                sampleInstalled.push({
                  appid: v.appid,
                  name: v.display_name,
                  installed: v.installed,
                  hasOwnInstalled: Object.prototype.hasOwnProperty.call(v, 'installed'),
                  installedDescriptor: Object.getOwnPropertyDescriptor(v, 'installed') ? 'own' : 'proto',
                  protoHasInstalled: ('installed' in v),
                });
              }
              if (v.installed !== true && sampleNotInstalled.length < 3) {
                sampleNotInstalled.push({
                  appid: v.appid,
                  name: v.display_name,
                  installed: v.installed,
                  hasOwnInstalled: Object.prototype.hasOwnProperty.call(v, 'installed'),
                });
              }
              if (count > 2000) break;
            }
            
            // Count installed vs not
            var installedCount = 0;
            var notInstalledCount = 0;
            var undefinedInstalledCount = 0;
            var i = 0;
            for (var v2 of store.m_mapApps.values()) {
              if (!v2 || !v2.appid) continue;
              if (v2.installed === true) installedCount++;
              else if (v2.installed === false) notInstalledCount++;
              else undefinedInstalledCount++;
              i++;
              if (i > 2000) break;
            }
            
            // Check what happens after normalizing (simulating readOptionalBoolean with hasOwnProperty)
            var hasOwnInstalledCount = 0;
            i = 0;
            for (var v3 of store.m_mapApps.values()) {
              if (!v3 || !v3.appid) continue;
              if (Object.prototype.hasOwnProperty.call(v3, 'installed')) hasOwnInstalledCount++;
              i++;
              if (i > 2000) break;
            }
            
            return JSON.stringify({
              apiCount: apiCount,
              rawCount: count,
              installedCount: installedCount,
              notInstalledCount: notInstalledCount,
              undefinedInstalledCount: undefinedInstalledCount,
              hasOwnInstalledCount: hasOwnInstalledCount,
              sampleInstalled: sampleInstalled,
              sampleNotInstalled: sampleNotInstalled,
            });
          }
        }
        
        return JSON.stringify({apiCount: apiCount, rawCount: out.length, note: 'reached end'});
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    
    console.log('RESULT:', JSON.stringify(JSON.parse(res.result.value), null, 2));
    w.close();
  } catch (e) {
    console.error('ERR:', e.message);
    w.close();
  }
});
w.on('error', (e) => { console.error('WS_ERR:', e.message); process.exit(1); });
