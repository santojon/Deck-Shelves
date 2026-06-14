// Inspect native "Recent Games" card DOM structure and CSS Loader injections.
// Run via: python3 devkit/tools/run_diag2.py devkit/diag/diag_native_card.cjs
// (uses SharedJSContext, accesses SP window via SteamUIStore)
(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;

    // ── Find native Recent Games shelf ──────────────────────────────────────
    // Look for elements with multiple portrait-sized children (recent games row)
    var allEls = Array.from(doc.querySelectorAll('[class]'));

    // Collect candidate shelf rows: elements that have 3+ children each ~133px wide
    var shelfRows = [];
    for (var i = 0; i < allEls.length; i++) {
      var el = allEls[i];
      try {
        var ch = Array.from(el.children);
        if (ch.length < 3) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 150) continue;
        // check if children look like portrait cards (~100-200px wide)
        var cardLike = ch.filter(function(c) {
          try { var cr = c.getBoundingClientRect(); return cr.width > 90 && cr.width < 220 && cr.height > 150; } catch(e) { return false; }
        });
        if (cardLike.length >= 2) {
          shelfRows.push({ el: el, cards: cardLike });
        }
      } catch(e) {}
    }

    // ── Extract class tokens from shelf and cards ────────────────────────────
    var nativeShelfClasses = [];
    var nativeCardClasses = [];
    var nativeCardImgClasses = [];
    var nativeCardInnerClasses = [];

    if (shelfRows.length > 0) {
      var shelf = shelfRows[0];
      nativeShelfClasses = (shelf.el.className || '').split(/\s+/).filter(Boolean);

      var card0 = shelf.cards[0];
      nativeCardClasses = (card0.className || '').split(/\s+/).filter(Boolean);

      // Inspect card children
      var cardChildren = Array.from(card0.querySelectorAll('[class]'));
      nativeCardInnerClasses = cardChildren.slice(0, 8).map(function(c) {
        return { tag: c.tagName.toLowerCase(), cls: (c.className || '').split(/\s+/).filter(Boolean) };
      });

      // Find img within the card
      var imgs = card0.querySelectorAll('img');
      if (imgs.length > 0) {
        nativeCardImgClasses = (imgs[0].className || '').split(/\s+/).filter(Boolean);
      }
    }

    // ── Find our .ds-card classes for comparison ─────────────────────────────
    var dsCards = Array.from(doc.querySelectorAll('.ds-card'));
    var dsCardClasses = dsCards.length > 0 ? (dsCards[0].className || '').split(/\s+/).filter(Boolean) : [];

    // ── Find CSS Loader injected stylesheets ─────────────────────────────────
    var cssLoaderRules = [];
    try {
      var sheets = Array.from(doc.styleSheets);
      for (var s = 0; s < sheets.length; s++) {
        try {
          var sheet = sheets[s];
          var rules = Array.from(sheet.cssRules || []);
          for (var r2 = 0; r2 < Math.min(rules.length, 100); r2++) {
            var rule = rules[r2];
            var sel = rule.selectorText || '';
            // Only rules targeting obfuscated hash classes (start with ._)
            if (sel.match(/\._[A-Za-z0-9_-]{4,}/)) {
              cssLoaderRules.push({
                sel: sel.substring(0, 120),
                css: (rule.cssText || '').substring(0, 200)
              });
            }
          }
        } catch(e) {}
      }
    } catch(e) {}

    // ── Obfuscated token summary ─────────────────────────────────────────────
    var allObfuscated = {};
    for (var j = 0; j < allEls.length; j++) {
      try {
        var cls2 = (allEls[j].className || '').split(/\s+/).filter(Boolean);
        for (var k = 0; k < cls2.length; k++) {
          if (cls2[k].startsWith('_') && cls2[k].length > 4) {
            allObfuscated[cls2[k]] = (allObfuscated[cls2[k]] || 0) + 1;
          }
        }
      } catch(e) {}
    }
    var topObfuscated = Object.keys(allObfuscated)
      .sort(function(a, b) { return allObfuscated[b] - allObfuscated[a]; })
      .slice(0, 20)
      .map(function(k) { return { cls: k, count: allObfuscated[k] }; });

    return JSON.stringify({
      shelfRowsFound: shelfRows.length,
      nativeShelfClasses: nativeShelfClasses,
      nativeCardClasses: nativeCardClasses,
      nativeCardImgClasses: nativeCardImgClasses,
      nativeCardInnerClasses: nativeCardInnerClasses,
      dsCardClasses: dsCardClasses,
      cssLoaderRulesCount: cssLoaderRules.length,
      cssLoaderRules: cssLoaderRules.slice(0, 30),
      topObfuscated: topObfuscated
    });
  } catch(e) {
    return JSON.stringify({ error: e.message, stack: (e.stack || '').substring(0, 500) });
  }
})()
