const W = require('ws');
const TARGET_ID = process.argv[2];
const w = new W('ws://127.0.0.1:8081/devtools/page/' + TARGET_ID);
let msgId = 0;

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        w.removeListener('message', handler);
        resolve(msg.result);
      }
    };
    w.on('message', handler);
    w.send(JSON.stringify({ id, method, params }));
    setTimeout(() => reject(new Error('timeout')), 15000);
  });
}

w.on('open', async () => {
  try {
    const res = await send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        // Get appStore from various paths
        var stores = [
          window.appStore,
          window.AppStore,
          window.SteamUIStore,
          window.collectionStore,
        ].filter(Boolean);
        
        // Check SteamClient.Apps
        var sc = window.SteamClient;
        var appsApi = sc && sc.Apps;
        var hasGetAll = !!(appsApi && appsApi.GetAllAppOverviews);
        var hasGetMyApps = !!(appsApi && appsApi.GetMyApps);
        
        // Try to get a single app overview
        var sampleApp = null;
        var sampleKeys = [];
        var appCount = 0;
        
        // Check appStore.m_mapApps
        var mapApps = null;
        if (window.appStore && window.appStore.m_mapApps) mapApps = window.appStore.m_mapApps;
        if (!mapApps && window.AppStore && window.AppStore.m_mapApps) mapApps = window.AppStore.m_mapApps;
        
        if (mapApps && mapApps.size) {
          appCount = mapApps.size;
          var iter = mapApps.values();
          var first = iter.next();
          if (first && first.value) {
            sampleApp = first.value;
            sampleKeys = Object.getOwnPropertyNames(first.value).slice(0, 80);
          }
        }
        
        // Check collectionStore
        var cs = window.collectionStore;
        var csInfo = null;
        if (cs) {
          var agc = cs.allGamesCollection || cs.localGamesCollection;
          csInfo = {
            allGamesCollection: !!cs.allGamesCollection,
            localGamesCollection: !!cs.localGamesCollection,
            allAppsCollection: !!cs.allAppsCollection,
            allApps: agc ? !!(agc.allApps) : null,
            visibleApps: agc ? !!(agc.visibleApps) : null,
            allAppsCount: agc && agc.allApps ? (agc.allApps.length || agc.allApps.size || '?') : null,
          };
        }
        
        // examine the sample app's relevant fields
        var appFields = null;
        if (sampleApp) {
          appFields = {
            appid: sampleApp.appid,
            display_name: sampleApp.display_name,
            sort_as: sampleApp.sort_as,
            installed: sampleApp.installed,
            is_installed: sampleApp.is_installed,
            m_bInstalled: sampleApp.m_bInstalled,
            bInstalled: sampleApp.bInstalled,
            is_favorite: sampleApp.is_favorite,
            favorite: sampleApp.favorite,
            m_bIsFavorite: sampleApp.m_bIsFavorite,
            is_hidden: sampleApp.is_hidden,
            hidden: sampleApp.hidden,
            m_bHidden: sampleApp.m_bHidden,
            is_steam: sampleApp.is_steam,
            is_non_steam: sampleApp.is_non_steam,
            m_eAppType: sampleApp.m_eAppType,
            app_type: sampleApp.app_type,
            last_played: sampleApp.last_played,
            rt_last_time_played: sampleApp.rt_last_time_played,
            m_ulLastPlayed: sampleApp.m_ulLastPlayed,
            deck_compatibility_category: sampleApp.deck_compatibility_category,
            per_client_data: sampleApp.per_client_data ? 'exists' : undefined,
            m_setStoreCategories: sampleApp.m_setStoreCategories ? 'exists' : undefined,
          };
        }
        
        // Check tabStore / TabStore for tab resolution
        var tabStores = [
          window.tabStore,
          window.TabStore,
          window.libraryStore,
          window.LibraryStore,
        ].filter(Boolean);
        var tabStoreInfo = tabStores.map(function(ts, i) {
          var keys = Object.getOwnPropertyNames(ts).filter(function(k) {
            return k.toLowerCase().includes('tab') || k.toLowerCase().includes('filter');
          }).slice(0, 20);
          return {idx: i, keys: keys};
        });
        
        return {
          storeCount: stores.length,
          hasGetAll: hasGetAll,
          hasGetMyApps: hasGetMyApps,
          mapAppsCount: appCount,
          sampleKeys: sampleKeys,
          appFields: appFields,
          csInfo: csInfo,
          tabStoreInfo: tabStoreInfo,
        };
      })())`,
      returnByValue: true,
    });
    
    var data = JSON.parse(res.result.value);
    console.log('APP_DATA:', JSON.stringify(data, null, 2));
    
    w.close();
  } catch (e) {
    console.error('ERR:', e.message);
    w.close();
  }
});
w.on('error', (e) => { console.error('WS_ERR:', e.message); process.exit(1); });
