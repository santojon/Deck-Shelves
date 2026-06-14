// Check shelf positions, viewport bounds, and overlap with native sections
(function(){
  try {
    var w = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var d = w.document;
    var root = d.getElementById("deck-shelves-home-root");
    if (!root) return JSON.stringify({err: "no root"});
    var cs = function(el) { return el ? w.getComputedStyle(el) : null; };
    var rect = function(el) {
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return {y: Math.round(r.y), h: Math.round(r.height), b: Math.round(r.bottom)};
    };

    // Our shelves
    var shelves = root.querySelectorAll(".ds-shelf");
    var shelfList = [];
    for (var i = 0; i < shelves.length; i++) {
      var title = shelves[i].querySelector(".ds-shelf-title");
      shelfList.push({
        title: title ? (title.textContent || "").trim().substring(0, 30) : null,
        rect: rect(shelves[i])
      });
    }

    // deck-shelves-root inner wrapper
    var innerRoot = root.querySelector(".deck-shelves-root");
    var innerPT = innerRoot ? cs(innerRoot).paddingTop : null;

    // Viewport
    var allEls = Array.from(d.querySelectorAll("[class]"));
    var viewport = null;
    for (var v = 0; v < allEls.length; v++) {
      var oy = cs(allEls[v]).overflowY;
      if ((oy === "auto" || oy === "scroll") && allEls[v].scrollHeight > allEls[v].clientHeight + 50) {
        viewport = allEls[v];
        break;
      }
    }

    // "What's New" / "Novidades" section
    var whatsNew = null;
    try {
      var btns = d.querySelectorAll("button, [role=tab]");
      for (var j = 0; j < btns.length; j++) {
        var t = (btns[j].textContent || "").trim().toLowerCase();
        if (t === "novidades" || t === "what's new") {
          whatsNew = {
            text: t,
            btnRect: rect(btns[j]),
            parentRect: rect(btns[j].parentElement),
            grandRect: rect(btns[j].parentElement ? btns[j].parentElement.parentElement : null)
          };
          break;
        }
      }
    } catch(e) {}

    // Native Recent Games section
    var nativeSection = d.querySelector("._282X0J4BtrSF1IXctmOe-X");

    // All siblings of our mount
    var parent = root.parentElement;
    var mountIdx = -1;
    var sibRects = [];
    if (parent) {
      for (var s = 0; s < parent.children.length; s++) {
        var ch = parent.children[s];
        if (ch === root) mountIdx = s;
        sibRects.push({
          idx: s,
          id: ch.id || null,
          cls: (ch.className || "").substring(0, 60),
          pos: cs(ch).position,
          rect: rect(ch),
          isOurs: ch === root
        });
      }
    }

    return JSON.stringify({
      shelves: shelfList,
      innerPaddingTop: innerPT,
      rootRect: rect(root),
      viewport: viewport ? {
        cls: (viewport.className || "").substring(0, 60),
        rect: rect(viewport),
        scrollTop: Math.round(viewport.scrollTop),
        scrollHeight: Math.round(viewport.scrollHeight),
        clientHeight: Math.round(viewport.clientHeight)
      } : null,
      nativeSection: nativeSection ? {
        cls: (nativeSection.className || "").substring(0, 60),
        rect: rect(nativeSection)
      } : null,
      whatsNew: whatsNew,
      parentSiblings: sibRects,
      mountIndex: mountIdx
    });
  } catch(e) {
    return JSON.stringify({err: e.message, stack: (e.stack||"").substring(0,300)});
  }
})()
