(function(){
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    function snapEl(el){
      if(!el) return null;
      var cs = getComputedStyle(el);
      var pa = getComputedStyle(el, '::after');
      var r = el.getBoundingClientRect();
      return {
        cls: el.className,
        tag: el.tagName,
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        outline: cs.outline,
        outlineOffset: cs.outlineOffset,
        border: cs.border,
        boxShadow: cs.boxShadow,
        transform: cs.transform,
        pseudo_after: {
          background: pa.backgroundImage || pa.background,
          opacity: pa.opacity,
          animationName: pa.animationName,
          display: pa.display,
          backgroundSize: pa.backgroundSize
        }
      };
    }
    var shelf = win.document.querySelector('#deck-shelves-home-root .ds-card');
    var natives = [];
    var candidates = Array.from(win.document.querySelectorAll('div.Panel.Focusable'));
    for (var i = 0; i < candidates.length; i++){
      var c = candidates[i];
      if (c.classList && c.classList.contains('ds-card')) continue;
      try {
        var imgs = c.querySelectorAll('img');
        if (!imgs || imgs.length === 0) continue;
        var r = c.getBoundingClientRect();
        if (r.width >= 120 && r.height >= 150) { natives.push(c); }
      } catch (e) {}
    }
    // fallback to any Panel.Focusable not .ds-card if none matched
    if (natives.length === 0) {
      var alt = Array.from(win.document.querySelectorAll('div.Panel.Focusable:not(.ds-card)'));
      natives = natives.concat(alt.slice(0,2));
    }
    var native0 = natives.length > 0 ? natives[0] : null;
    var native1 = natives.length > 1 ? natives[1] : null;
    return JSON.stringify({ shelf: snapEl(shelf), native_first: snapEl(native0), native_second: snapEl(native1), foundNativeCount: natives.length });
  } catch (e) { return JSON.stringify({ error: String(e), stack: e.stack }); }
})()
