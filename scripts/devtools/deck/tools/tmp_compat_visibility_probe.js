(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var result = {
      nativeCompatBadgesOnHomeScreen: [],
      compatRelatedCSSVars: {},
      hideCompatCSSRules: [],
      compatBadgeDisplay: {},
      deckCompatCategories: [],
    };

    // ── 1. Find all visible compat badges on the home screen (not in our shelves) ──
    var allBadgeSelectors = [
      '[class*="Badge"]',
      '[class*="badge"]',
      '[class*="compat"]',
      '[class*="Compat"]',
    ];
    var badgeEls = [];
    for (var si = 0; si < allBadgeSelectors.length; si++) {
      try {
        var matches = Array.from(doc.querySelectorAll(allBadgeSelectors[si]));
        for (var mi = 0; mi < matches.length; mi++) {
          var m = matches[mi];
          if (m.closest('#deck-shelves-home-root')) continue;
          var mr = m.getBoundingClientRect();
          if (mr.width < 5 || mr.height < 5) continue;
          if (badgeEls.indexOf(m) === -1) badgeEls.push(m);
        }
      } catch(e) {}
    }

    for (var bi = 0; bi < Math.min(badgeEls.length, 10); bi++) {
      var el = badgeEls[bi];
      var cs = getComputedStyle(el);
      result.nativeCompatBadgesOnHomeScreen.push({
        cls: (el.getAttribute ? el.getAttribute('class') || '' : '').slice(0, 120),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        color: cs.color,
      });
    }

    // ── 2. Check CSS vars on :root that might control compat visibility ──
    var rootCs = getComputedStyle(doc.documentElement);
    var visibilityVars = [
      '--compat-display',
      '--compat-visibility',
      '--compat-icons-display',
      '--compat-icons-visibility',
      '--compat-badge-display',
      '--hide-compat',
      '--show-compat',
      '--custom-compat-display',
      '--custom-compat-visibility',
      '--custom-compat-icons-display',
      '--custom-compat-icons-visibility',
      '--custom-compat-icons-deck',
      '--custom-compat-icons-verified',
      '--custom-compat-icons-playable',
      '--custom-compat-icons-unsupported',
      '--custom-compat-icons-unknown',
    ];
    for (var vi = 0; vi < visibilityVars.length; vi++) {
      var v = rootCs.getPropertyValue(visibilityVars[vi]).trim();
      if (v) result.compatRelatedCSSVars[visibilityVars[vi]] = v;
    }

    // ── 3. Scan stylesheets for "hide" or "display:none" rules on compat elements ──
    try {
      var sheets = Array.from(doc.styleSheets);
      for (var shi = 0; shi < Math.min(sheets.length, 100); shi++) {
        try {
          var rules = Array.from(sheets[shi].cssRules || []);
          for (var ri = 0; ri < rules.length; ri++) {
            var ruleText = rules[ri].cssText || '';
            if (/compat|badge|Badge/i.test(ruleText) && /none|hidden|0/i.test(ruleText)) {
              result.hideCompatCSSRules.push(ruleText.slice(0, 300));
            }
          }
        } catch(e) {}
      }
    } catch(e) {}

    // ── 4. Check actual display of our own compat elements ──
    var ourCompatEls = Array.from(doc.querySelectorAll('.ds-compat'));
    for (var oi = 0; oi < Math.min(ourCompatEls.length, 5); oi++) {
      var oel = ourCompatEls[oi];
      var ocs = getComputedStyle(oel);
      var deckIcon = oel.querySelector('.ds-compat-deck-icon');
      var verdictIcon = oel.querySelector('.ds-compat-verdict-icon');
      result.compatBadgeDisplay['ds-compat-' + oi] = {
        cls: (oel.getAttribute ? oel.getAttribute('class') || '' : '').slice(0, 80),
        display: ocs.display,
        opacity: ocs.opacity,
        deckIconColor: deckIcon ? getComputedStyle(deckIcon).color : 'N/A',
        verdictIconColor: verdictIcon ? getComputedStyle(verdictIcon).color : 'N/A',
      };
    }

    // ── 5. Sample deckCompatCategory values from native game cards ──
    // Look at cards in the recent games row (not our shelves)
    var appCards = Array.from(doc.querySelectorAll('[data-appid]:not([data-shelfid])'));
    var seen = new Set();
    for (var ai = 0; ai < Math.min(appCards.length, 20); ai++) {
      var appid = appCards[ai].getAttribute('data-appid');
      if (!appid || seen.has(appid)) continue;
      seen.add(appid);
      // Check if it has a compat badge child
      var badge = appCards[ai].querySelector('[class*="badge"], [class*="Badge"], [class*="compat"]');
      result.deckCompatCategories.push({
        appid: appid,
        hasBadge: !!badge,
        badgeCls: badge ? (badge.getAttribute ? badge.getAttribute('class') || '' : '').slice(0, 80) : '',
        badgeDisplay: badge ? getComputedStyle(badge).display : 'N/A',
      });
    }

    return JSON.stringify(result, null, 2);
  } catch(e) {
    return JSON.stringify({ error: e.message, stack: (e.stack||'').slice(0, 300) });
  }
})()
