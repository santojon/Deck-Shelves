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
    setTimeout(() => reject(new Error('timeout')), 30000);
  });
}

w.on('open', async () => {
  try {
    const res = await send('Runtime.evaluate', {
      expression: `(async function(){
        // Simulate extractAppOverviewsFromCandidate on appStore
        var store = window.appStore || window.AppStore;
        if (!store) return JSON.stringify({error: 'no appStore'});
        
        // Check if Object.entries finds m_mapApps
        var entries = Object.entries(store);
        var entryKeys = entries.map(function(e){ return e[0]; });
        var hasMapApps = entryKeys.indexOf('m_mapApps') >= 0;
        
        // Check Object.keys
        var ownKeys = Object.keys(store);
        var hasMapAppsOwn = ownKeys.indexOf('m_mapApps') >= 0;
        
        // Check getOwnPropertyNames
        var propNames = Object.getOwnPropertyNames(store);
        var hasMapAppsProp = propNames.indexOf('m_mapApps') >= 0;
        
        // Check 'in' operator
        var hasMapAppsIn = 'm_mapApps' in store;
        
        // Check proto
        var proto = Object.getPrototypeOf(store);
        var protoKeys = proto ? Object.getOwnPropertyNames(proto).slice(0, 40) : [];
        
        // Try the actual extraction - count what normalizeAppOverview would find
        // from Object.entries traversal
        var fromEntries = 0;
        var visited = 0;
        var maxDepth = 0;
        
        function visit(node, depth) {
          if (!node || visited > 5000 || depth > 6) return;
          if (typeof node !== 'object') return;
          visited++;
          if (depth > maxDepth) maxDepth = depth;
          
          // Check if this looks like an app overview
          var appid = Number(node.appid || node.appId || 0);
          if (Number.isFinite(appid) && appid > 0) {
            fromEntries++;
            return; // don't recurse into apps
          }
          
          // Map-like
          if (node && typeof node.values === 'function' && typeof node.get === 'function') {
            try {
              var count = 0;
              for (var v of node.values()) {
                visit(v, depth + 1);
                count++;
                if (count > 2000) break;
              }
            } catch(e) {}
            return;
          }
          
          // Array
          if (Array.isArray(node)) {
            for (var i = 0; i < Math.min(node.length, 2000); i++) {
              visit(node[i], depth + 1);
            }
            return;
          }
          
          // Object - iterate entries
          try {
            var ents = Object.entries(node);
            for (var j = 0; j < ents.length; j++) {
              var key = ents[j][0];
              var val = ents[j][1];
              if (!val || typeof val !== 'object') continue;
              if (/(apps|app|overview|library|map|list|items|entries|collection|recent|favorite|installed)/i.test(key) || depth < 2) {
                visit(val, depth + 1);
              }
            }
          } catch(e) {}
        }
        
        visit(store, 0);
        
        // Also check what SteamClient.Apps methods exist
        var sc = window.SteamClient;
        var appsMethods = [];
        if (sc && sc.Apps) {
          var desc = Object.getOwnPropertyNames(sc.Apps);
          appsMethods = desc.filter(function(k){
            return typeof sc.Apps[k] === 'function' && /app|overview|installed|library/i.test(k);
          }).slice(0, 20);
        }
        
        return JSON.stringify({
          entryKeysCount: entryKeys.length,
          hasMapAppsEntries: hasMapApps,
          hasMapAppsOwn: hasMapAppsOwn,
          hasMapAppsProp: hasMapAppsProp,
          hasMapAppsIn: hasMapAppsIn,
          protoKeys: protoKeys,
          entryKeySample: entryKeys.slice(0, 30),
          fromEntriesCount: fromEntries,
          visited: visited,
          maxDepth: maxDepth,
          appsMethods: appsMethods,
        });
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
