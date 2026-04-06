// Inspect native Steam shelf structure (section, title, row) and compare with our injected shelves.
// Run via: python3 scripts/devtools/deck/tools/run_diag2.py scripts/devtools/deck/diag/diag_shelf_structure.cjs
// (uses SharedJSContext, accesses SP window via SteamUIStore)
(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;

    // ── Find native shelf containers (horizontal-scrollable rows) ──────────────
    var allEls = Array.from(doc.querySelectorAll('[class]'));
    var shelfRows = [];

    for (var i = 0; i < allEls.length; i++) {
      var el = allEls[i];
      try {
        // Skip our injected content
        if (el.closest('#deck-shelves-home-root')) continue;
        var cs = win.getComputedStyle(el);
        var ox = (cs.overflowX || '').toLowerCase();
        if (ox !== 'auto' && ox !== 'scroll' && ox !== 'overlay') continue;
        if (el.scrollWidth <= el.clientWidth + 10 || el.clientHeight < 80) continue;

        var rowCls = Array.from(el.classList).filter(function(c) { return c.startsWith('_') && c.length > 5; });
        if (!rowCls.length) continue;

        var parent = el.parentElement;
        var shelfCls = parent ? Array.from(parent.classList).filter(function(c) { return c.startsWith('_') && c.length > 5; }) : [];

        // Find sibling heading (font-size >= 16px) for nativeShelfTitle
        var titleEl = null;
        var titleCls = [];
        if (parent) {
          for (var j = 0; j < parent.children.length; j++) {
            var sib = parent.children[j];
            if (sib === el) continue;
            try {
              var sibCS = win.getComputedStyle(sib);
              if (parseFloat(sibCS.fontSize) >= 16) {
                titleEl = sib;
                titleCls = Array.from(sib.classList).filter(function(c) { return c.startsWith('_') && c.length > 5; });
                break;
              }
            } catch(e) {}
          }
        }

        shelfRows.push({
          rowClasses: rowCls,
          rowTag: el.tagName.toLowerCase(),
          rowRect: (function(r) { return { w: Math.round(r.width), h: Math.round(r.height) }; })(el.getBoundingClientRect()),
          shelfClasses: shelfCls,
          shelfTag: parent ? parent.tagName.toLowerCase() : null,
          titleClasses: titleCls,
          titleTag: titleEl ? titleEl.tagName.toLowerCase() : null,
          titleText: titleEl ? (titleEl.textContent || '').trim().substring(0, 60) : null,
          childCount: el.children.length,
          ariaLabel: el.getAttribute('aria-label') || parent && parent.getAttribute('aria-label') || null,
        });
      } catch(e) {}
    }

    // ── Our injected shelf elements ─────────────────────────────────────────────
    var ourRoot = doc.getElementById('deck-shelves-home-root');
    var ourShelves = [];
    if (ourRoot) {
      var ourShelfEls = Array.from(ourRoot.querySelectorAll('.ds-shelf, .Panel'));
      ourShelves = ourShelfEls.slice(0, 5).map(function(el) {
        return {
          classes: (el.className || '').split(/\s+/).filter(Boolean),
          titleClasses: (function() {
            var t = el.querySelector('.ds-shelf-title');
            return t ? (t.className || '').split(/\s+/).filter(Boolean) : [];
          })(),
          rowClasses: (function() {
            var r = el.querySelector('.ds-row-scroll');
            return r ? (r.className || '').split(/\s+/).filter(Boolean) : [];
          })(),
        };
      });
    }

    // ── CSS Loader rules targeting hashed classes ───────────────────────────────
    var cssLoaderShelfRules = [];
    try {
      var sheets = Array.from(doc.styleSheets);
      for (var s = 0; s < sheets.length; s++) {
        try {
          var rules = Array.from(sheets[s].cssRules || []);
          for (var r = 0; r < Math.min(rules.length, 200); r++) {
            var sel = rules[r].selectorText || '';
            // Only rules with obfuscated class targeting
            if (!sel.match(/\._[A-Za-z0-9_-]{4,}/)) continue;
            // Skip card-level rules already known
            if (sel.includes('WYgDg9NyCcMIVuMyZ_NBC') || sel.includes('_24_AuLm54JVe1Zc0AApCDR')) continue;
            cssLoaderShelfRules.push({
              sel: sel.substring(0, 120),
              css: (rules[r].cssText || '').substring(0, 200),
            });
          }
        } catch(e) {}
      }
    } catch(e) {}

    return JSON.stringify({
      nativeShelfRowsFound: shelfRows.length,
      nativeShelfRows: shelfRows.slice(0, 5),
      ourShelvesFound: ourShelves.length,
      ourShelves: ourShelves,
      cssLoaderShelfRulesCount: cssLoaderShelfRules.length,
      cssLoaderShelfRules: cssLoaderShelfRules.slice(0, 20),
    });
  } catch(e) {
    return JSON.stringify({ error: e.message, stack: (e.stack || '').substring(0, 500) });
  }
})()
