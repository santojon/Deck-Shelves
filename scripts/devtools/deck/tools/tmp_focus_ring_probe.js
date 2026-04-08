(function() {
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;

    // Find a native Recent Games card (portrait img NOT inside our mount)
    var imgs = Array.from(doc.querySelectorAll('img'));
    var nativeCard = null;
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.closest('#deck-shelves-home-root')) continue;
      var r = img.getBoundingClientRect();
      if (r.width < 90 || r.width > 220 || r.height < 120) continue;
      var el = img.parentElement;
      var depth = 0;
      while (el && depth++ < 10) {
        if (getComputedStyle(el).cursor === 'pointer') { nativeCard = el; break; }
        el = el.parentElement;
      }
      if (nativeCard) break;
    }

    if (!nativeCard) return JSON.stringify({ error: 'no-native-card' });

    try { nativeCard.focus(); } catch(e) {}
    try { nativeCard.classList.add('gpfocus'); } catch(e) {}
    var t0 = Date.now(); while (Date.now() - t0 < 150) {}

    var cs   = getComputedStyle(nativeCard);
    var csAf = getComputedStyle(nativeCard, '::after');
    var csBf = getComputedStyle(nativeCard, '::before');

    var vars = [
      '--custom-sp-color-border',
      '--custom-sp-color-border-grow-0','--custom-sp-color-border-grow-01',
      '--custom-sp-color-border-grow-100',
      '--custom-sp-color-border-fade-0','--custom-sp-color-border-fade-100',
      '--gpFocusColor','--baseFocusGlowColor',
    ].reduce(function(acc,v){ var val=cs.getPropertyValue(v).trim(); if(val) acc[v]=val; return acc; },{});

    var ancVars = [];
    var cur = nativeCard; var d = 0;
    while (cur && d++ < 12) {
      var acs = getComputedStyle(cur);
      var b = acs.getPropertyValue('--custom-sp-color-border').trim();
      var g = acs.getPropertyValue('--custom-sp-color-border-grow-100').trim();
      if (b || g) ancVars.push({ tag: cur.tagName, cls: (cur.className||'').slice(0,60), border: b, grow100: g });
      cur = cur.parentElement;
    }

    return JSON.stringify({
      cardClass: (nativeCard.className||'').slice(0,120),
      focused: doc.activeElement === nativeCard,
      el: { outline: cs.outline, outlineColor: cs.outlineColor, outlineWidth: cs.outlineWidth,
            outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow, filter: cs.filter,
            animation: cs.animationName, animationDuration: cs.animationDuration, color: cs.color },
      after: { content: csAf.content, boxShadow: csAf.boxShadow, background: csAf.backgroundColor,
               opacity: csAf.opacity, animation: csAf.animationName, animDuration: csAf.animationDuration,
               inset: csAf.inset, filter: csAf.filter, zIndex: csAf.zIndex },
      before: { content: csBf.content, boxShadow: csBf.boxShadow, animation: csBf.animationName },
      cssVars: vars,
      ancestorVars: ancVars
    });
  } catch(e) {
    return JSON.stringify({ error: e.message, stack: (e.stack||'').slice(0,300) });
  }
})()
