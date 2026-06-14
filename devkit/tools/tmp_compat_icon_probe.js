(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var result = {
      nativeCompatIcons: [],
      cssVarCandidates: [],
      themedClasses: [],
      rawCSSRules: [],
    };

    // ── 1. Find native compat badge elements ──
    // Steam renders Deck compat as a small badge with the Deck logo SVG + verdict icon
    // Common classes include "deckCompatibilityBadge", "AppCompatBadge", etc.
    var compatSelectors = [
      '[class*="compat"]',
      '[class*="Compat"]',
      '[class*="Badge"]',
      '[class*="badge"]',
      '[class*="verified"]',
      '[class*="Verified"]',
      '[class*="playable"]',
      '[class*="Playable"]',
      '[class*="deck_compat"]',
      '[class*="deckcompat"]',
    ];

    var foundEls = [];
    for (var si = 0; si < compatSelectors.length; si++) {
      try {
        var matches = Array.from(doc.querySelectorAll(compatSelectors[si]));
        for (var mi = 0; mi < matches.length; mi++) {
          var m = matches[mi];
          // must be visible
          var mr = m.getBoundingClientRect();
          if (mr.width < 5 || mr.height < 5) continue;
          if (m.closest('#deck-shelves-home-root')) continue;
          // deduplicate
          if (foundEls.indexOf(m) === -1) foundEls.push(m);
        }
      } catch(e) {}
    }

    // ── 2. Also look for SVG children that look like Deck logo (viewBox="0 0 20 20") ──
    var svgs = Array.from(doc.querySelectorAll('svg[viewBox="0 0 20 20"]'));
    for (var si2 = 0; si2 < svgs.length; si2++) {
      var svg = svgs[si2];
      if (svg.closest('#deck-shelves-home-root')) continue;
      var parent = svg.parentElement;
      var depth = 0;
      while (parent && depth++ < 6) {
        if (foundEls.indexOf(parent) === -1) {
          var pr = parent.getBoundingClientRect();
          if (pr.width > 5 && pr.height > 5) foundEls.push(parent);
        }
        parent = parent.parentElement;
      }
    }

    // ── 3. For each found element, record computed styles and CSS variables ──
    var varNames = [
      '--compat-verified', '--compat-playable', '--compat-unknown', '--compat-unsupported',
      '--verified-color', '--playable-color',
      '--gpCompatVerifiedColor', '--gpCompatPlayableColor',
      '--compatVerifiedColor', '--compatPlayableColor',
      '--deckVerifiedColor', '--deckPlayableColor',
      '--mColorBrandGreen', '--mColorBrandBlue',
      '--color-verified', '--color-playable',
      '--ds-compat-verified', '--ds-compat-playable',
    ];

    for (var ei = 0; ei < Math.min(foundEls.length, 15); ei++) {
      var el = foundEls[ei];
      var cs = getComputedStyle(el);
      var vars = {};
      for (var vi = 0; vi < varNames.length; vi++) {
        var v = cs.getPropertyValue(varNames[vi]).trim();
        if (v) vars[varNames[vi]] = v;
      }
      // also capture color, fill
      var svgInner = el.querySelector('svg');
      var svgCs = svgInner ? getComputedStyle(svgInner) : null;
      var iconColor = svgCs ? svgCs.color : '';
      var iconFill = svgCs ? svgCs.fill : '';

      // Walk ancestors for CSS vars
      var ancestorVars = [];
      var cur = el; var depth = 0;
      while (cur && depth++ < 12) {
        var acs = getComputedStyle(cur);
        var aVars = {};
        for (var vi2 = 0; vi2 < varNames.length; vi2++) {
          var av = acs.getPropertyValue(varNames[vi2]).trim();
          if (av) aVars[varNames[vi2]] = av;
        }
        if (Object.keys(aVars).length > 0) {
          ancestorVars.push({ tag: cur.tagName, cls: (cur.getAttribute ? cur.getAttribute('class') || '' : String(cur.className || '')).slice(0,80), vars: aVars });
        }
        cur = cur.parentElement;
      }

      result.nativeCompatIcons.push({
        tag: el.tagName,
        cls: (el.getAttribute ? el.getAttribute('class') || '' : String(el.className || '')).slice(0, 120),
        color: cs.color,
        fill: cs.fill,
        iconColor: iconColor,
        iconFill: iconFill,
        cssVars: vars,
        ancestorVars: ancestorVars,
      });
    }

    // ── 4. Scan all <style> and document stylesheets for compat-related rules ──
    var styleEls = Array.from(doc.querySelectorAll('style'));
    for (var sti = 0; sti < styleEls.length; sti++) {
      var text = styleEls[sti].textContent || '';
      if (/compat|verified|playable|Deck.*icon|deckcompat/i.test(text)) {
        // Extract matching rules
        var lines = text.split('\n');
        for (var li = 0; li < lines.length; li++) {
          if (/compat|verified|playable/i.test(lines[li])) {
            result.rawCSSRules.push(lines[li].trim().slice(0, 200));
          }
        }
      }
    }

    // Also check document.styleSheets for rules
    try {
      var sheets = Array.from(doc.styleSheets);
      for (var shi = 0; shi < Math.min(sheets.length, 50); shi++) {
        try {
          var rules = Array.from(sheets[shi].cssRules || []);
          for (var ri = 0; ri < rules.length; ri++) {
            var ruleText = rules[ri].cssText || '';
            if (/compat|verified|playable/i.test(ruleText)) {
              result.rawCSSRules.push(ruleText.slice(0, 300));
            }
          }
        } catch(e) {}
      }
    } catch(e) {}

    // deduplicate rawCSSRules
    result.rawCSSRules = result.rawCSSRules.filter(function(v, i, a){ return a.indexOf(v) === i; });

    return JSON.stringify(result, null, 2);
  } catch(e) {
    return JSON.stringify({ error: e.message, stack: (e.stack||'').slice(0,300) });
  }
})()
