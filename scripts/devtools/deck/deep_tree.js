(function(){
  try {
    var ctrl = window.FocusNavController;
    if (!ctrl) return JSON.stringify({error:"no controller"});
    var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
    var trees = (ctx && ctx.m_rgGamepadNavigationTrees) || [];
    var main = null;
    for (var i=0;i<trees.length;i++) {
      if(trees[i].m_ID==='GamepadUI_Full_Root') { main=trees[i]; break; }
    }
    if (!main) return JSON.stringify({error:"no main tree"});
    var root = main.Root || main;

    var found = [];
    function search(node, path) {
      var el = node.Element || node.m_element || node.m_Element;
      var cls = el ? (el.className||'') : '';
      if (cls.indexOf('ds-row-scroll')>=0 || cls.indexOf('deck-shelves-root')>=0) {
        found.push({
          path: path,
          cls: cls.substring(0,80),
          cc: (node.m_rgChildren||[]).length,
          ti: el ? el.tabIndex : null
        });
      }
      var ch = node.m_rgChildren || [];
      for (var j=0;j<ch.length;j++) { search(ch[j], path+'.'+j); }
    }
    search(root, 'R');

    var n = root;
    var trace = [];
    var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
    var mount = win.document.getElementById('deck-shelves-home-root');
    for (var d=0;d<12;d++) {
      var el = n.Element || n.m_element || n.m_Element;
      trace.push({
        d:d,
        cls:(el?(el.className||''):'').substring(0,60),
        cc:(n.m_rgChildren||[]).length,
        cm: el&&mount?el.contains(mount):null
      });
      var ch = n.m_rgChildren||[];
      var next = null;
      for (var k=0;k<ch.length;k++) {
        var ce = ch[k].Element || ch[k].m_element || ch[k].m_Element;
        if (ce && mount && ce.contains(mount)) { next = ch[k]; break; }
      }
      if (!next) break;
      n = next;
    }

    return JSON.stringify({foundNodes:found, scrollTrace:trace});
  } catch(e) {
    return JSON.stringify({error:e.message,stack:(e.stack||'').substring(0,300)});
  }
})()
