// Deep-probe raw overview data for shelf appids via every available API
(function(){
  try {
    var w = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var d = w.document;
    var root = d.getElementById("deck-shelves-home-root");

    // Collect appids from shelf
    var cards = root ? root.querySelectorAll('.ds-card[data-appid]') : [];
    var testIds = [];
    for (var i = 0; i < Math.min(cards.length, 4); i++) {
      var aid = Number(cards[i].getAttribute('data-appid'));
      if (aid) testIds.push(aid);
    }

    var out = {};

    // 1. Try all window-level app store accessors
    var accessors = ['appStore','AppStore','LibraryStore','appsStore'];
    for (var ai = 0; ai < accessors.length; ai++) {
      var acc = accessors[ai];
      var store = w[acc];
      if (!store) continue;

      for (var ti = 0; ti < testIds.length; ti++) {
        var appid = testIds[ti];
        var raw = null;
        try { raw = store.GetAppOverviewByAppID && store.GetAppOverviewByAppID(appid); } catch(e) {}
        if (!raw) {
          try { raw = store.m_mapAppInfo && store.m_mapAppInfo.get && store.m_mapAppInfo.get(appid); } catch(e) {}
        }
        if (raw) {
          var pcd = raw.per_client_data || raw.local_per_client_data;
          var cd = Array.isArray(pcd) ? pcd[0] : (pcd || null);
          if (!out[appid]) out[appid] = {};
          out[appid][acc] = {
            installed: raw.installed,
            is_installed: raw.is_installed,
            display_status: cd ? Number(cd.display_status || 0) : 'no_pcd',
            size_on_disk: raw.size_on_disk || raw.m_nSizeOnDisk,
            keys: Object.keys(raw).slice(0, 15).join(','),
          };
        }
      }
    }

    // 2. Try SteamUIStore for installed info
    var uis = null;
    try { uis = w.SteamUIStore; } catch(e) {}
    var uiStoreInfo = uis ? (typeof uis) + ' keys:' + Object.keys(uis).slice(0,10).join(',') : 'none';

    // 3. What window keys look app-related?
    var interestingKeys = Object.keys(w).filter(function(k) {
      return /app|library|steam|store/i.test(k);
    }).slice(0, 20);

    // 4. Check focus parent elements for animations/box-shadow
    var focused = root ? root.querySelector('.gpfocus') : null;
    var focusChain = [];
    if (focused) {
      var el = focused;
      for (var depth = 0; depth < 6 && el && el !== d.body; depth++) {
        var s = w.getComputedStyle(el);
        var sa = w.getComputedStyle(el, '::after');
        focusChain.push({
          tag: el.tagName,
          cls: (el.className||'').substring(0,80),
          outline: s.outline,
          boxShadow: (s.boxShadow||'').substring(0,80),
          afterDisplay: sa.display,
          afterContent: sa.content,
          afterAnim: (sa.animation||'').substring(0,80),
        });
        el = el.parentElement;
      }
    }

    return JSON.stringify({ appData: out, uiStoreInfo: uiStoreInfo, interestingKeys: interestingKeys, focusChain: focusChain }, null, 2);
  } catch(e) {
    return JSON.stringify({ err: e.message, stack: (e.stack||'').substring(0,300) });
  }
})()
