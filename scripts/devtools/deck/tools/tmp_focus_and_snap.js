(function(){
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    function snapEl(el){
      if(!el) return null;
      var cs = getComputedStyle(el);
      var pa = getComputedStyle(el,'::after');
      var r = el.getBoundingClientRect();
      return { cls: el.className, tag: el.tagName, rect: {top: r.top, left: r.left, width: r.width, height: r.height}, outline: cs.outline, outlineOffset: cs.outlineOffset, border: cs.border, boxShadow: cs.boxShadow, transform: cs.transform, pseudo_after: { background: pa.backgroundImage||pa.background, opacity: pa.opacity, animationName: pa.animationName, display: pa.display, backgroundSize: pa.backgroundSize } };
    }
    var dsCard = win.document.querySelector('#deck-shelves-home-root .ds-card');
    // find native recent-like candidate by known token fragment
    var native = Array.from(win.document.querySelectorAll('div.Panel.Focusable')).find(function(c){ return c.className && c.className.indexOf('WYgDg9Ny')!==-1; });
    if (native) {
      try { native.focus(); } catch(e) {}
      try { native.classList.add('gpfocus'); } catch(e) {}
    }
    // let focus effects settle
    var t0 = Date.now(); while (Date.now()-t0 < 220) {}
    return JSON.stringify({ ds: snapEl(dsCard), native: snapEl(native), foundNative: !!native });
  } catch (e) { return JSON.stringify({ error: String(e), stack: e.stack }); }
})()
