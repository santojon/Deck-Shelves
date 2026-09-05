// Diagnose install status data for shelf cards
// Checks: appStore.GetAppOverviewByAppID() raw data for each card's appid
(function(){
  try {
    var w = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var d = w.document;
    var root = d.getElementById("deck-shelves-home-root");
    var appStore = w.appStore || w.AppStore;

    // Check CSS variable
    var headingColor = d.documentElement.style.getPropertyValue('--ds-native-heading-color') || 'NOT SET';

    // Get all shelf cards with appids
    var cards = root ? root.querySelectorAll('.ds-card[data-appid]') : [];
    var appids = [];
    for (var i = 0; i < cards.length; i++) {
      var aid = Number(cards[i].getAttribute('data-appid'));
      if (aid && !appids.includes(aid)) appids.push(aid);
    }
    appids = appids.slice(0, 10);

    var results = [];
    for (var j = 0; j < appids.length; j++) {
      var appid = appids[j];
      var raw = null;
      try { raw = appStore && appStore.GetAppOverviewByAppID(appid); } catch(e) {}

      var pcd = raw ? (raw.per_client_data || raw.local_per_client_data) : null;
      var clientData = Array.isArray(pcd) ? pcd[0] : (pcd || null);

      results.push({
        appid: appid,
        raw_installed: raw ? raw.installed : 'NO_RAW',
        raw_is_installed: raw ? raw.is_installed : undefined,
        display_status: clientData ? Number(clientData.display_status || 0) : 'NO_PCD',
        bytes_to_download: clientData ? Number(clientData.bytes_to_download || 0) : undefined,
        size_on_disk: raw ? Number(raw.size_on_disk || raw.m_nSizeOnDisk || 0) : undefined,
        // What icon is actually showing
        icon_html: (function() {
          var card = cards[j];
          if (!card) return 'no_card';
          var statusEl = card.querySelector('.ds-card-status');
          return statusEl ? statusEl.innerHTML.substring(0, 120) : 'no_status';
        })(),
      });
    }

    // Also check native heading color detection
    var headingFound = null;
    var headings = d.querySelectorAll('h2[class], h3[class]');
    for (var k = 0; k < Math.min(headings.length, 5); k++) {
      var h = headings[k];
      var cls = h.className || '';
      if (/_[A-Za-z0-9_-]{5,}/.test(cls)) {
        headingFound = {
          tag: h.tagName,
          text: (h.textContent || '').trim().substring(0, 30),
          color: w.getComputedStyle(h).color,
          cls: cls.substring(0, 60),
        };
        break;
      }
    }

    // Check focus element
    var focused = root ? root.querySelector('.gpfocus') : null;
    var focusInfo = null;
    if (focused) {
      var fs = w.getComputedStyle(focused);
      var fsAfter = w.getComputedStyle(focused, '::after');
      focusInfo = {
        classes: focused.className.substring(0, 100),
        outline: fs.outline,
        boxShadow: (fs.boxShadow || '').substring(0, 80),
        afterDisplay: fsAfter.display,
        afterContent: fsAfter.content,
        afterBoxShadow: (fsAfter.boxShadow || '').substring(0, 80),
        afterAnimation: fsAfter.animation ? fsAfter.animation.substring(0, 80) : '',
      };
    }

    return JSON.stringify({
      headingColor: headingColor,
      headingFound: headingFound,
      appids: appids,
      results: results,
      focusInfo: focusInfo,
    }, null, 2);
  } catch(e) {
    return JSON.stringify({ err: e.message, stack: (e.stack||'').substring(0,300) });
  }
})()
