// Full comparison: native shelf elements vs our ds-shelf elements.
// Captures computed styles (color, font, focus, position) for all components.
// Run via: python3 scripts/devtools/deck/tools/run_diag2.py scripts/devtools/deck/diag/diag_full_compare.cjs
(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var cs = function(el) { return win.getComputedStyle(el); };

    function getVisualProps(el) {
      if (!el) return null;
      try {
        var s = cs(el);
        var r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').substring(0, 200),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          color: s.color,
          bgColor: s.backgroundColor,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          fontFamily: (s.fontFamily || '').substring(0, 60),
          letterSpacing: s.letterSpacing,
          textTransform: s.textTransform,
          opacity: s.opacity,
          display: s.display,
          position: s.position,
          overflow: s.overflow,
          overflowX: s.overflowX,
          overflowY: s.overflowY,
          margin: s.margin,
          padding: s.padding,
          borderRadius: s.borderRadius,
          outline: s.outline,
          boxShadow: s.boxShadow !== 'none' ? s.boxShadow.substring(0, 100) : 'none',
          filter: s.filter,
          transform: s.transform !== 'none' ? s.transform.substring(0, 80) : 'none',
          cursor: s.cursor,
          zIndex: s.zIndex,
        };
      } catch(e) { return { error: e.message }; }
    }

    // ── 1. Find native "Recent Games" shelf ──────────────────────────────
    var nativeShelf = null;
    var recentLabels = ['jogos recentes', 'recent games', 'recently played', 'jogados recentemente'];
    var allAria = Array.from(doc.querySelectorAll('[aria-label]'));
    for (var i = 0; i < allAria.length; i++) {
      var lbl = (allAria[i].getAttribute('aria-label') || '').toLowerCase();
      if (recentLabels.some(function(r) { return lbl.includes(r); })) {
        // Walk up to find the containing shelf section
        var cur = allAria[i];
        for (var d = 0; d < 6 && cur; d++) {
          if (cur.parentElement && cur.parentElement.children.length > 1 && cur.parentElement !== doc.body) {
            nativeShelf = { section: cur.parentElement, row: cur, rowAria: lbl };
            break;
          }
          cur = cur.parentElement;
        }
        if (nativeShelf) break;
      }
    }

    var nativeInfo = null;
    if (nativeShelf) {
      // Find heading within section
      var heading = null;
      for (var c = 0; c < nativeShelf.section.children.length; c++) {
        var ch = nativeShelf.section.children[c];
        if (ch === nativeShelf.row) continue;
        try {
          var chS = cs(ch);
          if (parseFloat(chS.fontSize) >= 16) { heading = ch; break; }
        } catch(e) {}
      }
      // Find first card in the row
      var firstCard = null;
      var imgs = nativeShelf.row.querySelectorAll('img');
      for (var i2 = 0; i2 < imgs.length && i2 < 10; i2++) {
        var imgR = imgs[i2].getBoundingClientRect();
        if (imgR.width > 80 && imgR.height > 80) {
          // Walk up to cursor:pointer ancestor
          var p = imgs[i2].parentElement;
          var depth = 0;
          while (p && depth++ < 8) {
            try { if (cs(p).cursor === 'pointer') { firstCard = p; break; } } catch(e2) {}
            p = p.parentElement;
          }
          break;
        }
      }
      // Find a focused card if any
      var focusedNative = nativeShelf.row.querySelector('.gpfocus') || null;

      nativeInfo = {
        section: getVisualProps(nativeShelf.section),
        heading: getVisualProps(heading),
        headingText: heading ? (heading.textContent || '').trim().substring(0, 40) : null,
        row: getVisualProps(nativeShelf.row),
        firstCard: getVisualProps(firstCard),
        firstCardImg: firstCard ? getVisualProps(firstCard.querySelector('img')) : null,
        focusedCard: focusedNative ? getVisualProps(focusedNative) : null,
      };
    }

    // ── 2. Find our ds-shelf elements ────────────────────────────────────
    var ourRoot = doc.getElementById('deck-shelves-home-root');
    var ourInfo = null;
    if (ourRoot) {
      var ourShelf = ourRoot.querySelector('.ds-shelf') || ourRoot.querySelector('.Panel');
      var ourTitle = ourRoot.querySelector('.ds-shelf-title');
      var ourRow = ourRoot.querySelector('.ds-row-scroll');
      var ourFirstCard = ourRoot.querySelector('.ds-card');
      var ourFocused = ourRoot.querySelector('.ds-card.gpfocus');
      var ourCardArt = ourFirstCard ? ourFirstCard.querySelector('.ds-card-art') : null;
      var ourCardImg = ourFirstCard ? ourFirstCard.querySelector('img') : null;
      var ourCardLabel = ourFirstCard ? ourFirstCard.querySelector('.ds-card-label') : null;
      var ourLabelName = ourFirstCard ? ourFirstCard.querySelector('.ds-card-label-name') : null;
      var ourLabelStatus = ourFirstCard ? ourFirstCard.querySelector('.ds-card-status') : null;
      var ourMoreCard = ourRoot.querySelector('.ds-more-card-text');

      ourInfo = {
        root: getVisualProps(ourRoot),
        shelf: getVisualProps(ourShelf),
        title: getVisualProps(ourTitle),
        titleText: ourTitle ? (ourTitle.textContent || '').trim().substring(0, 40) : null,
        row: getVisualProps(ourRow),
        firstCard: getVisualProps(ourFirstCard),
        firstCardClasses: ourFirstCard ? (ourFirstCard.className || '') : null,
        cardArt: getVisualProps(ourCardArt),
        cardImg: getVisualProps(ourCardImg),
        cardLabel: getVisualProps(ourCardLabel),
        labelName: getVisualProps(ourLabelName),
        labelStatus: getVisualProps(ourLabelStatus),
        focusedCard: ourFocused ? getVisualProps(ourFocused) : null,
        moreCardText: getVisualProps(ourMoreCard),
      };
    }

    // ── 3. Overlap check ─────────────────────────────────────────────────
    var overlapInfo = null;
    if (nativeShelf && ourRoot) {
      var nR = nativeShelf.section.getBoundingClientRect();
      var oR = ourRoot.getBoundingClientRect();
      overlapInfo = {
        nativeRect: { x: Math.round(nR.x), y: Math.round(nR.y), w: Math.round(nR.width), h: Math.round(nR.height) },
        ourRect: { x: Math.round(oR.x), y: Math.round(oR.y), w: Math.round(oR.width), h: Math.round(oR.height) },
        overlaps: !(oR.bottom < nR.top || oR.top > nR.bottom),
        gap: Math.round(oR.top - nR.bottom),
      };
      // Check all our shelf sections
      var allOurShelves = Array.from(ourRoot.querySelectorAll('.ds-shelf, .Panel'));
      overlapInfo.ourShelves = allOurShelves.slice(0, 4).map(function(el) {
        var r = el.getBoundingClientRect();
        return { y: Math.round(r.y), h: Math.round(r.height), bottom: Math.round(r.bottom) };
      });
    }

    // ── 4. CSS variables from theme ──────────────────────────────────────
    var themeVars = {};
    try {
      var rootStyle = cs(doc.documentElement);
      var body = cs(doc.body);
      // Common theme variable names
      var varNames = [
        '--round-radius-size', '--main-color', '--accent-color',
        '--focus-color', '--focus-glow-color', '--text-color',
        '--header-color', '--card-border-radius', '--gpfocuswithin-color',
        '--ds-card-radius', '--ds-focus-color', '--ds-focus-shadow',
        '--ds-title-color', '--ds-card-title-color', '--ds-card-bg',
      ];
      for (var v = 0; v < varNames.length; v++) {
        var val = rootStyle.getPropertyValue(varNames[v]).trim();
        if (val) themeVars[varNames[v]] = val;
      }
    } catch(e) {}

    // ── 5. Theme-injected stylesheet rules ───────────────────────────────
    var themeRules = [];
    try {
      var sheets = Array.from(doc.styleSheets);
      for (var si = 0; si < sheets.length; si++) {
        try {
          var rules = Array.from(sheets[si].cssRules || []);
          for (var ri = 0; ri < Math.min(rules.length, 300); ri++) {
            var sel = rules[ri].selectorText || '';
            // Capture rules that target our classes or common theme targets
            if (sel.includes('ds-') || sel.includes('gpfocus') ||
                sel.match(/\._[A-Za-z0-9_-]{10,}/) ||
                sel.includes('deck-shelves')) {
              themeRules.push({
                sel: sel.substring(0, 150),
                css: (rules[ri].cssText || '').substring(0, 250),
              });
            }
          }
        } catch(e) {}
      }
    } catch(e) {}

    return JSON.stringify({
      native: nativeInfo,
      ours: ourInfo,
      overlap: overlapInfo,
      themeVars: themeVars,
      themeRulesCount: themeRules.length,
      themeRules: themeRules.slice(0, 40),
    });
  } catch(e) {
    return JSON.stringify({ error: e.message, stack: (e.stack || '').substring(0, 500) });
  }
})()
