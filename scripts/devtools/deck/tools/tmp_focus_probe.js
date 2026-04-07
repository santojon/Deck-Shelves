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
    var native = null;
    // Prefer a Panel.Focusable element (not .ds-card) that contains an image and
    // whose size approximates a game card (>=120x150). This aims to find native Recent cards.
    var candidates = Array.from(win.document.querySelectorAll('div.Panel.Focusable'));
    for (var i = 0; i < candidates.length; i++){
      var c = candidates[i];
      if (c.classList && c.classList.contains('ds-card')) continue;
      try {
        var imgs = c.querySelectorAll('img');
        if (!imgs || imgs.length === 0) continue;
        var r = c.getBoundingClientRect();
        if (r.width >= 120 && r.height >= 150) { native = c; break; }
      } catch (e) {}
    }
    if (!native) native = win.document.querySelector('div.Panel.Focusable:not(.ds-card)');
    return JSON.stringify({ shelf: snapEl(shelf), native: snapEl(native), foundNative: !!native });
  } catch (e) { return JSON.stringify({ error: String(e), stack: e.stack }); }
})()
