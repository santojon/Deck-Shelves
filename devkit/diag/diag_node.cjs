// Comprehensive diagnostic: check mount, nav tree, plugin state
const W = require('ws');
const TARGET_ID = process.argv[2];
var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const w = new W('ws://' + HOST + ':8081/devtools/page/' + TARGET_ID);

let msgId = 0;
function evaluate(expr) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        w.removeListener('message', handler);
        const r = msg.result?.result;
        if (r?.value) {
          try { resolve(JSON.parse(r.value)); } catch { resolve(r.value); }
        } else {
          resolve(msg.result?.exceptionDetails?.text || r);
        }
      }
    };
    w.on('message', handler);
    w.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    setTimeout(() => reject(new Error('eval timeout')), 10000);
  });
}

w.on('open', async () => {
  try {
    // 1. Check mount point
    const mount = await evaluate(`JSON.stringify((function(){
      var win = SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
      if (!win) return {error:'no window'};
      var doc = win.document;
      var mount = doc.getElementById('deck-shelves-home-root');
      if (!mount) return {mounted:false};
      var cards = doc.querySelectorAll('.ds-card');
      var rows = doc.querySelectorAll('.ds-row-scroll');
      return {mounted:true, renderer:mount.dataset.deckShelvesRenderer, cards:cards.length, rows:rows.length, mountHTML:mount.innerHTML.substring(0,200)};
    })())`);
    console.log('MOUNT:', JSON.stringify(mount, null, 2));

    // 2. Check nav tree
    const navTree = await evaluate(`JSON.stringify((function(){
      var ctrl = window.FocusNavController;
      if (!ctrl) return {error:'no controller'};
      var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
      var trees = (ctx && ctx.m_rgGamepadNavigationTrees) || [];
      var main = null;
      for (var i=0;i<trees.length;i++) {
        if(trees[i].m_ID==='GamepadUI_Full_Root') { main=trees[i]; break; }
      }
      if (!main) return {error:'no main tree', treeIds: trees.map(function(t){return t.m_ID})};
      var root = main.Root || main;

      var found = [];
      function search(node, path, depth) {
        if (depth > 15) return;
        var el = node.Element || node.m_element || node.m_Element;
        var cls = el ? (el.className||'') : '';
        if (cls.indexOf('ds-row-scroll')>=0 || cls.indexOf('deck-shelves-root')>=0) {
          var parentEl = node.Parent ? (node.Parent.Element || node.Parent.m_element || node.Parent.m_Element) : null;
          found.push({
            path: path,
            cls: cls.substring(0,80),
            cc: (node.m_rgChildren||[]).length,
            parentCls: parentEl ? parentEl.className.substring(0,60) : null,
            parentCC: node.Parent ? (node.Parent.m_rgChildren||[]).length : null
          });
        }
        var ch = node.m_rgChildren || [];
        for (var j=0;j<ch.length;j++) { search(ch[j], path+'.'+j, depth+1); }
      }
      search(root, 'R', 0);
      return {found:found, rootCC:(root.m_rgChildren||[]).length};
    })())`);
    console.log('NAV_TREE:', JSON.stringify(navTree, null, 2));

    // 3. Check if our plugin is loaded
    const plugin = await evaluate(`JSON.stringify((function(){
      var dfl = window.DFL;
      return {hasDFL: !!dfl, hasFocusable: !!(dfl && dfl.Focusable)};
    })())`);
    console.log('PLUGIN:', JSON.stringify(plugin, null, 2));

  } catch (e) {
    console.error('ERROR:', e.message);
  }
  w.close();
  process.exit(0);
});

w.on('error', e => { console.error('WS_ERR:', e.message); process.exit(1); });
setTimeout(() => { console.error('GLOBAL_TIMEOUT'); process.exit(1); }, 30000);
