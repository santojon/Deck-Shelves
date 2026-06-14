(function(){
  try {
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var doc = win.document;
    var out = [];
    var candidates = Array.from(win.document.querySelectorAll('div.Panel.Focusable'));
    for (var i = 0; i < candidates.length; i++){
      var c = candidates[i];
      try {
        var r = c.getBoundingClientRect();
        if (r.width >= 120 && r.height >= 150) {
          var pa = getComputedStyle(c,'::after');
          out.push({cls: c.className, rect:{w: r.width,h: r.height,top:r.top,left:r.left}, pseudo_after:{bg: pa.backgroundImage||pa.background, opacity: pa.opacity, anim: pa.animationName}});
        }
      } catch (e) {}
    }
    return JSON.stringify(out.slice(0,40));
  } catch (e) { return JSON.stringify({ error: String(e), stack: e.stack }); }
})()
