// Scan ALL windows reachable from SharedJSContext for appStore + installed data
(function(){
  try {
    var testIds = [19680, 32500, 12840, 218640];
    var windows = [];

    function tryAddWin(win, label) {
      if (!win || typeof win !== 'object') return;
      try { if (!win.document) return; } catch(e) { return; }
      windows.push({ win: win, label: label });
    }

    // All known entry points
    tryAddWin(window, 'SharedJS');
    try {
      var ws = SteamUIStore.WindowStore;
      tryAddWin(ws.GamepadUIMainWindowInstance && ws.GamepadUIMainWindowInstance.BrowserWindow, 'GamepadUI');
      var uiWins = ws.SteamUIWindows || ws.m_mapBrowserWindows;
      if (uiWins) {
        var arrLike = typeof uiWins.forEach === 'function' ? uiWins : Object.values(uiWins);
        var idx = 0;
        arrLike.forEach(function(entry) {
          var bw = entry && (entry.BrowserWindow || entry);
          tryAddWin(bw, 'UIWin' + (idx++));
        });
      }
      var focused = SteamUIStore.GetFocusedWindowInstance && SteamUIStore.GetFocusedWindowInstance();
      tryAddWin(focused && focused.BrowserWindow, 'Focused');
    } catch(e) {}

    // Try nav tree approach
    try {
      var navTrees = SteamUIStore.GamepadNavigationController.m_rgGamepadNavigationTrees;
      for (var i = 0; i < navTrees.length; i++) {
        var t = navTrees[i];
        if (t && t.Root && t.Root.Element) {
          tryAddWin(t.Root.Element.ownerDocument.defaultView, 'NavTree_' + (t.m_ID || i));
        }
      }
    } catch(e) {}

    var results = [];
    for (var w = 0; w < windows.length; w++) {
      var entry = windows[w];
      var win = entry.win;
      var label = entry.label;
      try {
        var href = (win.location && win.location.href || '').substring(0, 80);
        var appStores = [win.appStore, win.AppStore, win.LibraryStore].filter(Boolean);
        var foundData = false;
        var appData = {};

        for (var s = 0; s < appStores.length; s++) {
          var as = appStores[s];
          for (var ti = 0; ti < testIds.length; ti++) {
            var appid = testIds[ti];
            var raw = null;
            try { raw = as.GetAppOverviewByAppID && as.GetAppOverviewByAppID(appid); } catch(e) {}
            if (!raw) { try { raw = as.m_mapAppInfo && as.m_mapAppInfo.get && as.m_mapAppInfo.get(appid); } catch(e) {} }
            if (raw) {
              foundData = true;
              var pcd = raw.per_client_data || raw.local_per_client_data;
              var cd = Array.isArray(pcd) ? pcd[0] : (pcd || null);
              appData[appid] = {
                installed: raw.installed,
                display_status: cd ? Number(cd.display_status || 0) : 'no_pcd',
                pcd_keys: cd ? Object.keys(cd).slice(0, 8).join(',') : '',
              };
            }
          }
          if (foundData) break;
        }

        results.push({
          label: label,
          href: href,
          hasAppStore: appStores.length > 0,
          foundData: foundData,
          appData: appData,
        });
      } catch(e) {
        results.push({ label: label, error: e.message });
      }
    }

    return JSON.stringify({ windowCount: windows.length, results: results }, null, 2);
  } catch(e) {
    return JSON.stringify({ err: e.message, stack: (e.stack||'').substring(0, 400) });
  }
})()
