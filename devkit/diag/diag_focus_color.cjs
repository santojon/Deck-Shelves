// Diagnose focus animation color variables on shelf cards vs native cards.
// Focus a shelf card before running this script.
(function(){
  try {
    var w = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var d = w.document;

    // Gather variable values from a given element
    function getVars(el, label) {
      var cs = w.getComputedStyle(el);
      var vars = [
        '--custom-sp-color-border',
        '--custom-sp-color-border-grow-0',
        '--custom-sp-color-border-grow-01',
        '--custom-sp-color-border-grow-100',
        '--custom-sp-color-border-fade-0',
        '--custom-sp-color-border-fade-100',
        '--ds-focus-color',
        '--ds-native-heading-color',
      ];
      var result = { label: label, cls: (el.className||'').substring(0,80) };
      vars.forEach(function(v) {
        result[v] = cs.getPropertyValue(v).trim() || '(unset)';
      });
      result.animation = cs.animationName || 'none';
      result.border = cs.border || '';
      result.outline = cs.outline || '';
      result.boxShadow = (cs.boxShadow||'').substring(0,80);
      return result;
    }

    var root = d.getElementById('deck-shelves-home-root');

    // 1. Check :root vars
    var rootEl = d.documentElement;
    var rootVars = getVars(rootEl, 'html/:root');

    // 2. Body element (often where theme sets vars)
    var bodyVars = getVars(d.body, 'body');

    // 3. Focused shelf card
    var focusedCard = root ? root.querySelector('.ds-card.gpfocus, .ds-card:focus') : null;
    var shelfVars = focusedCard ? getVars(focusedCard, 'ds-card (focused)') : null;

    // 4. Find a native card for comparison
    var nativeCard = d.querySelector('.WYgDg9NyCcMIVuMyZ_NBC:not(.ds-card)');
    var nativeVars = nativeCard ? getVars(nativeCard, 'native-card') : null;

    // 5. Find native focused card
    var nativeFocused = d.querySelector('.WYgDg9NyCcMIVuMyZ_NBC.gpfocus:not(.ds-card), .WYgDg9NyCcMIVuMyZ_NBC:focus:not(.ds-card)');
    var nativeFocusedVars = nativeFocused ? getVars(nativeFocused, 'native-card (focused)') : null;

    // 6. Keyframe rules for animation used on shelf card
    var keyframeRules = [];
    if (focusedCard) {
      var cs = w.getComputedStyle(focusedCard);
      var animNames = (cs.animationName||'').split(',').map(function(s){return s.trim();});
      var sheets = Array.from(d.styleSheets);
      sheets.forEach(function(sheet) {
        try {
          var rules = Array.from(sheet.cssRules || []);
          rules.forEach(function(rule) {
            if (rule.type === CSSRule.KEYFRAMES_RULE) {
              if (animNames.indexOf(rule.name) !== -1) {
                var frames = [];
                Array.from(rule.cssRules||[]).forEach(function(kf) {
                  frames.push({ key: kf.keyText, text: kf.cssText.substring(0,200) });
                });
                keyframeRules.push({ name: rule.name, frames: frames });
              }
            }
          });
        } catch(e) {}
      });
    }

    // 7. Also scan all keyframe rules that reference custom-sp-color-border
    var themeKeyframes = [];
    var allSheets = Array.from(d.styleSheets);
    allSheets.forEach(function(sheet) {
      try {
        Array.from(sheet.cssRules||[]).forEach(function(rule) {
          if (rule.type === CSSRule.KEYFRAMES_RULE && rule.cssText.indexOf('custom-sp-color-border') !== -1) {
            themeKeyframes.push({ name: rule.name, preview: rule.cssText.substring(0,300) });
          }
        });
      } catch(e) {}
    });

    return JSON.stringify({
      rootVars: rootVars,
      bodyVars: bodyVars,
      shelfCard: shelfVars,
      nativeCard: nativeVars,
      nativeFocused: nativeFocusedVars,
      keyframesOnFocusedCard: keyframeRules,
      themeKeyframesUsingBorderVar: themeKeyframes.slice(0, 5),
    }, null, 2);
  } catch(e) {
    return JSON.stringify({ err: e.message, stack: (e.stack||'').substring(0,300) });
  }
})()
