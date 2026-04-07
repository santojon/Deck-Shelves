// Check SteamClient.Apps data for shelf appids + installed list
(function(){
  try {
    var w = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var d = w.document;
    var root = d.getElementById("deck-shelves-home-root");

    // Get first 4 appids from shelf
    var cards = root ? root.querySelectorAll('.ds-card[data-appid]') : [];
    var testIds = [];
    for (var i = 0; i < Math.min(cards.length, 4); i++) {
      var aid = Number(cards[i].getAttribute('data-appid'));
      if (aid) testIds.push(aid);
    }

    // Check SteamClient.Apps methods available
    var sc = w.SteamClient;
    var appsKeys = sc && sc.Apps ? Object.keys(sc.Apps).filter(function(k) {
      return /install|overview|app/i.test(k);
    }) : [];

    // Try to get overview data via SteamClient.Apps
    // These might be async but we try anyway
    var overviewResults = {};
    if (sc && sc.Apps) {
      for (var j = 0; j < testIds.length; j++) {
        var appid = testIds[j];
        try {
          var ov = sc.Apps.GetAppOverview && sc.Apps.GetAppOverview(appid);
          // If it's a Promise-like, note that
          if (ov && typeof ov.then === 'function') {
            overviewResults[appid] = 'ASYNC_PROMISE';
          } else if (ov) {
            var pcd = ov.per_client_data || ov.local_per_client_data;
            var cd = Array.isArray(pcd) ? pcd[0] : (pcd || null);
            overviewResults[appid] = {
              installed: ov.installed,
              display_status: cd ? Number(cd.display_status || 0) : 'no_pcd',
              size_on_disk: ov.size_on_disk,
              keys: Object.keys(ov).slice(0,12).join(','),
            };
          } else {
            overviewResults[appid] = 'NULL';
          }
        } catch(e) { overviewResults[appid] = 'ERR: ' + e.message; }
      }
    }

    // Check all windows accessible from here
    var windowData = [];
    try {
      var allWins = SteamUIStore.WindowStore.m_mapBrowserWindows;
      if (allWins && allWins.forEach) {
        allWins.forEach(function(bw, key) {
          try {
            var bwWin = bw.BrowserWindow;
            var hasAppStore = !!(bwWin && (bwWin.appStore || bwWin.AppStore));
            var canGetOverview = !!(bwWin && bwWin.appStore && bwWin.appStore.GetAppOverviewByAppID);
            var testOv = null;
            if (canGetOverview && testIds.length > 0) {
              try {
                testOv = bwWin.appStore.GetAppOverviewByAppID(testIds[0]);
              } catch(e) {}
            }
            windowData.push({
              key: String(key).substring(0,40),
              hasAppStore: hasAppStore,
              canGetOverview: canGetOverview,
              testOvForFirstId: testOv ? {
                installed: testOv.installed,
                display_status: testOv.per_client_data ? Number((testOv.per_client_data[0] || testOv.per_client_data).display_status || 0) : 'no_pcd',
                keys: Object.keys(testOv).slice(0, 10).join(','),
              } : 'null',
            });
          } catch(e) {}
        });
      }
    } catch(e) {}

    // Check which shelf these cards are from (shelf title)
    var shelfTitles = [];
    var shelfEls = root ? root.querySelectorAll('.ds-shelf') : [];
    for (var s = 0; s < shelfEls.length; s++) {
      var titleEl = shelfEls[s].querySelector('.ds-shelf-title');
      var cardCount = shelfEls[s].querySelectorAll('.ds-card[data-appid]').length;
      shelfTitles.push({
        title: titleEl ? titleEl.textContent.trim() : 'no_title',
        cardCount: cardCount,
      });
    }

    return JSON.stringify({ testIds: testIds, appsKeys: appsKeys, overviewResults: overviewResults, windowData: windowData, shelfTitles: shelfTitles }, null, 2);
  } catch(e) {
    return JSON.stringify({ err: e.message, stack: (e.stack||'').substring(0,400) });
  }
})()
