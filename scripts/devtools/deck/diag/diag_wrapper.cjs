const W = require('ws');
const TARGET_ID = process.argv[2];
var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const w = new W('ws://' + HOST + ':8081/devtools/page/' + TARGET_ID);
let msgId = 0;
function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) { w.removeListener('message', handler); resolve(msg.result); }
    };
    w.on('message', handler);
    w.send(JSON.stringify({ id, method, params }));
    setTimeout(() => reject(new Error('timeout')), 15000);
  });
}

w.on('open', async () => {
  try {
    await send('Runtime.disable', {});
    const res = await send('Runtime.evaluate', {
      expression: `(function(){
        var ctrl = window.FocusNavController;
        var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
        var trees = ctx.m_rgGamepadNavigationTrees || [];
        var main; for(var i=0;i<trees.length;i++) if(trees[i].m_ID==='GamepadUI_Full_Root') main=trees[i];
        var root = main.Root || main.m_Root || main;

        // Find deck-shelves-root wrapper
        var wrapperNode = null;
        function findWrapper(node) {
          if (wrapperNode) return;
          var el = node.Element || node.m_element || node.m_Element;
          if (el && el.className && el.className.includes('deck-shelves-root')) {
            wrapperNode = node;
            return;
          }
          var ch = node.m_rgChildren || [];
          for (var i = 0; i < ch.length; i++) findWrapper(ch[i]);
        }
        findWrapper(root);

        if (!wrapperNode) return JSON.stringify({error: 'wrapper not found'});

        var wEl = wrapperNode.Element || wrapperNode.m_element || wrapperNode.m_Element;
        var wrapperFlow = wEl ? wEl.getAttribute('flow-children') : null;
        var wrapperCss = wEl ? getComputedStyle(wEl).flexDirection : null;

        // Check children
        var children = (wrapperNode.m_rgChildren || []).map(function(c, i) {
          var cel = c.Element || c.m_element || c.m_Element;
          return {
            idx: i,
            cls: cel ? (cel.className || '').substring(0, 40) : null,
            flow: cel ? cel.getAttribute('flow-children') : null,
            cc: (c.m_rgChildren || []).length,
          };
        });

        // Check parent
        var parent = wrapperNode.m_Parent;
        var pEl = parent ? (parent.Element || parent.m_element || parent.m_Element) : null;
        var parentIdx = -1;
        if (parent) {
          var pch = parent.m_rgChildren || [];
          for (var j = 0; j < pch.length; j++) {
            if (pch[j] === wrapperNode) { parentIdx = j; break; }
          }
        }

        return JSON.stringify({
          wrapperFound: true,
          wrapperCls: wEl ? wEl.className : null,
          wrapperFlow: wrapperFlow,
          wrapperCssFlex: wrapperCss,
          wrapperCC: (wrapperNode.m_rgChildren || []).length,
          children: children,
          parentCC: parent ? (parent.m_rgChildren || []).length : null,
          wrapperIdxInParent: parentIdx,
        });
      })()`,
      returnByValue: true,
    });
    
    console.log(JSON.stringify(JSON.parse(res.result.value), null, 2));
    w.close();
  } catch(e) { console.error('ERR:', e.message); w.close(); }
});
w.on('error', (e) => { console.error('WS_ERR:', e.message); process.exit(1); });
