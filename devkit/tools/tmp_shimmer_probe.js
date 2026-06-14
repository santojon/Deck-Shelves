(function(){
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var card = doc.querySelector('#deck-shelves-home-root .ds-card');
    function snap(el){
      if(!el) return null;
      var cs = getComputedStyle(el);
      return { cls: el.className, tag: el.tagName, outline: cs.outline, outlineOffset: cs.outlineOffset, border: cs.border, boxShadow: cs.boxShadow };
    }
    var ds = snap(card);
    var after = null;
    try { after = (card ? { background: getComputedStyle(card,'::after').backgroundImage||getComputedStyle(card,'::after').background, opacity: getComputedStyle(card,'::after').opacity, anim: getComputedStyle(card,'::after').animationName } : null); } catch(e){}
    var shimmerEl = card ? card.querySelector('.ds-card-shimmer') : null;
    var shimmer = null;
    if (shimmerEl) {
      var cs2 = getComputedStyle(shimmerEl);
      shimmer = { cls: shimmerEl.className, bg: cs2.backgroundImage||cs2.background, opacity: cs2.opacity, anim: cs2.animationName };
    }
    return JSON.stringify({ ds: ds, after: after, shimmer: shimmer });
  } catch (e) { return JSON.stringify({ error: String(e), stack: e.stack }); }
})()
