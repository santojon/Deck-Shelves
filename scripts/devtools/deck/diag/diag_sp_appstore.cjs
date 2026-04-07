// Check appStore in SP window (library) vs GamepadUI window
(function(){
  try {
    // Get SP window via nav tree
    var spWin = null;
    try {
      var navTrees = SteamUIStore.GamepadNavigationController.m_rgGamepadNavigationTrees;
      if (navTrees) {
        for (var i = 0; i < navTrees.length; i++) {
          var t = navTrees[i];
          if (t && (t.m_ID === 'GamepadUI_Full_Root' || t.m_ID === 'root_1_')) {
            spWin = t.Root && t.Root.Element && t.Root.Element.ownerDocument && t.Root.Element.ownerDocument.defaultView;
            break;
          }
        }
      }
    } catch(e) {}

    var gpuWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;

    // Test appids from our shelf
    var root = gpuWin.document.getElementById("deck-shelves-home-root");
    var cards = root ? root.querySelectorAll('.ds-card[data-appid]') : [];
    var testIds = [];
    for (var j = 0; j < Math.min(cards.length, 6); j++) {
      var aid = Number(cards[j].getAttribute('data-appid'));
      if (aid && !testIds.includes(aid)) testIds.push(aid);
    }

    function probeWindow(win, label) {
      if (!win) return { label: label, error: 'NULL_WINDOW' };
      var as = win.appStore || win.AppStore;
      var result = {
        label: label,
        hasAppStore: !!as,
        asKeys: as ? Object.keys(as).filter(function(k){ return /install|GetApp|overview|clientdata/i.test(k); }).slice(0, 15) : [],
        appData: {},
      };
      if (as && testIds.length) {
        for (var k = 0; k < testIds.length; k++) {
          var appid = testIds[k];
          var raw = null;
          try { raw = as.GetAppOverviewByAppID && as.GetAppOverviewByAppID(appid); } catch(e) {}
          if (!raw) {
            try { raw = as.m_mapAppInfo && as.m_mapAppInfo.get && as.m_mapAppInfo.get(appid); } catch(e) {}
          }
          if (raw) {
            var pcd = raw.per_client_data || raw.local_per_client_data;
            var cd = Array.isArray(pcd) ? pcd[0] : (pcd || null);
            result.appData[appid] = {
              installed: raw.installed,
              is_installed: raw.is_installed,
              display_status: cd ? Number(cd.display_status || 0) : 'no_pcd',
              size_on_disk: raw.size_on_disk,
              rawKeys: Object.keys(raw).slice(0, 12).join(','),
            };
          } else {
            result.appData[appid] = 'null';
          }
        }
      }
      return result;
    }

    // Also probe installed apps list
    function getInstalledIds(win, label) {
      var as = win && (win.appStore || win.AppStore);
      if (!as) return { label: label, ids: 'no_appstore' };
      var installed = null;
      try { installed = as.GetInstalledApps && as.GetInstalledApps(); } catch(e) {}
      if (!installed) {
        try { installed = as.installedApps || as.m_rgInstalledApps || as.m_setInstalledApps; } catch(e) {}
      }
      if (!installed) return { label: label, ids: 'not_found' };
      var ids = Array.isArray(installed) ? installed.slice(0, 20) : (typeof installed.size === 'number' ? Array.from(installed).slice(0, 20) : 'type:' + typeof installed);
      return { label: label, count: Array.isArray(ids) ? ids.length : '?', sample: ids };
    }

    return JSON.stringify({
      testIds: testIds,
      gpuWin: probeWindow(gpuWin, 'GamepadUI'),
      spWin: probeWindow(spWin, 'SP'),
      installedGpu: getInstalledIds(gpuWin, 'GamepadUI'),
      installedSp: getInstalledIds(spWin, 'SP'),
      spWinFound: !!spWin,
    }, null, 2);
  } catch(e) {
    return JSON.stringify({ err: e.message, stack: (e.stack||'').substring(0, 400) });
  }
})()
