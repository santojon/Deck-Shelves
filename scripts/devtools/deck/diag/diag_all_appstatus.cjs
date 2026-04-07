// Get display_status for ALL appids in all shelves + check distribution
(function(){
  try {
    var gpuWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var root = gpuWin.document.getElementById("deck-shelves-home-root");
    // Get appStore from SharedJS (library) window = window itself
    var as = window.appStore || window.AppStore;

    // Collect all appids from all shelves
    var allCards = root ? root.querySelectorAll('.ds-card[data-appid]') : [];
    var allIds = [];
    for (var i = 0; i < allCards.length; i++) {
      var aid = Number(allCards[i].getAttribute('data-appid'));
      if (aid && !allIds.includes(aid)) allIds.push(aid);
    }

    // For each, get raw data
    var statusMap = {};
    var installedExplicit = [], notInstalledExplicit = [], noInstalledField = [];
    for (var j = 0; j < allIds.length; j++) {
      var appid = allIds[j];
      var raw = null;
      try { raw = as && as.GetAppOverviewByAppID && as.GetAppOverviewByAppID(appid); } catch(e) {}
      if (!raw) { try { raw = as && as.m_mapAppInfo && as.m_mapAppInfo.get && as.m_mapAppInfo.get(appid); } catch(e) {} }

      if (raw) {
        var pcd = raw.per_client_data || raw.local_per_client_data;
        var cd = Array.isArray(pcd) ? pcd[0] : (pcd || null);
        var ds = cd ? Number(cd.display_status || 0) : -1;
        var pcdInstalled = cd ? cd.installed : undefined;
        var rawInstalled = raw.installed;

        statusMap[appid] = { ds: ds, pcd_installed: pcdInstalled, raw_installed: rawInstalled };

        // Categorize
        if (rawInstalled === true || pcdInstalled === true) installedExplicit.push(appid);
        else if (rawInstalled === false || pcdInstalled === false) notInstalledExplicit.push(appid);
        else noInstalledField.push({ appid: appid, ds: ds });
      } else {
        statusMap[appid] = { ds: 'NO_RAW' };
        noInstalledField.push({ appid: appid, ds: 'NO_RAW' });
      }
    }

    // Count display_status distribution
    var dsDist = {};
    Object.keys(statusMap).forEach(function(id) {
      var ds = String(statusMap[id].ds);
      dsDist[ds] = (dsDist[ds] || 0) + 1;
    });

    // Sample: a few games from each shelf title
    var shelfSamples = [];
    var shelfEls = root ? root.querySelectorAll('.ds-shelf') : [];
    for (var s = 0; s < shelfEls.length; s++) {
      var titleEl = shelfEls[s].querySelector('.ds-shelf-title');
      var titleText = titleEl ? titleEl.textContent.trim() : 'no_title';
      var shelfCards = shelfEls[s].querySelectorAll('.ds-card[data-appid]');
      var sample = [];
      for (var sc = 0; sc < Math.min(shelfCards.length, 4); sc++) {
        var scid = Number(shelfCards[sc].getAttribute('data-appid'));
        sample.push({ appid: scid, status: statusMap[scid] || 'unknown' });
      }
      shelfSamples.push({ title: titleText, cardCount: shelfCards.length, sample: sample });
    }

    return JSON.stringify({
      totalCards: allIds.length,
      installedExplicitCount: installedExplicit.length,
      notInstalledExplicitCount: notInstalledExplicit.length,
      notInstalledSample: notInstalledExplicit.slice(0, 5),
      noInstalledFieldCount: noInstalledField.length,
      noInstalledFieldSample: noInstalledField.slice(0, 8),
      dsDist: dsDist,
      shelfSamples: shelfSamples,
    }, null, 2);
  } catch(e) {
    return JSON.stringify({ err: e.message, stack: (e.stack||'').substring(0, 400) });
  }
})()
