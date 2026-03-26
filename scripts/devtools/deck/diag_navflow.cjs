const W = require('ws');
const TARGET_ID = process.argv[2];
const w = new W('ws://127.0.0.1:8081/devtools/page/' + TARGET_ID);
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
      expression: `JSON.stringify((function(){
        var ctrl = window.FocusNavController;
        var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
        var trees = ctx.m_rgGamepadNavigationTrees || [];
        var main = trees.find(function(t){ return t.m_ID === 'GamepadUI_Full_Root'; });
        if (!main) return {error: 'no main tree'};
        var root = main.Root || main.m_Root || main;

        // Find ds-row-scroll nodes
        var dsNodes = [];
        function findDS(node, path) {
          var el = node.Element || node.m_element || node.m_Element;
          if (el && el.className && el.className.includes('ds-row-scroll')) {
            dsNodes.push({path: path, node: node});
          }
          var children = node.m_rgChildren || [];
          for (var i = 0; i < children.length; i++) {
            findDS(children[i], path + '.' + i);
          }
        }
        findDS(root, 'R');

        // For each ds-row-scroll, check the parent's flow direction and properties
        var results = dsNodes.map(function(d) {
          var parent = d.node.m_Parent;
          var parentEl = parent ? (parent.Element || parent.m_element || parent.m_Element) : null;
          
          // Check flow-children attribute
          var flowChildren = null;
          if (parentEl) {
            flowChildren = parentEl.getAttribute('flow-children');
            if (!flowChildren) {
              // Check CSS flex-direction
              try {
                var style = getComputedStyle(parentEl);
                flowChildren = 'css:' + style.flexDirection;
              } catch(e) {}
            }
          }

          // Check the node's own flow
          var nodeEl = d.node.Element || d.node.m_element || d.node.m_Element;
          var nodeFlow = nodeEl ? nodeEl.getAttribute('flow-children') : null;
          
          // Check grandparent
          var grandParent = parent ? parent.m_Parent : null;
          var gpEl = grandParent ? (grandParent.Element || grandParent.m_element || grandParent.m_Element) : null;
          var gpFlow = gpEl ? gpEl.getAttribute('flow-children') : null;
          if (!gpFlow && gpEl) {
            try { gpFlow = 'css:' + getComputedStyle(gpEl).flexDirection; } catch(e) {}
          }
          
          // Check sibling count
          var parentCC = parent ? (parent.m_rgChildren || []).length : -1;
          
          // Check focus nav properties on parent
          var parentFocusNav = parent ? {
            m_bRowFlowBackward: parent.m_bRowFlowBackward,
            m_bRowFlowWrap: parent.m_bRowFlowWrap,
            m_FocusDirection: parent.m_FocusDirection,
            m_bAutoFocus: parent.m_bAutoFocus,
          } : null;

          return {
            path: d.path,
            nodeFlow: nodeFlow,
            parentCls: parentEl ? parentEl.className.substring(0, 60) : null,
            parentFlow: flowChildren,
            parentCC: parentCC,
            parentFocusNav: parentFocusNav,
            gpFlow: gpFlow,
          };
        });

        // Also check what the container looks like (the parent of ds-row-scroll nodes)
        // How do native sections handle vertical flow?
        // Find a native section (like Recent Games) and check its flow
        var nativeInfo = [];
        function checkNative(node, path, depth) {
          if (depth > 12) return;
          var el = node.Element || node.m_element || node.m_Element;
          var cls = el ? el.className || '' : '';
          var flow = el ? el.getAttribute('flow-children') : null;
          var cc = (node.m_rgChildren || []).length;
          
          // We're interested in the container that has many children (>10) — that's the main scroll content
          if (cc > 10) {
            nativeInfo.push({
              path: path,
              cls: cls.substring(0, 80),
              flow: flow,
              cc: cc,
              childFlows: (node.m_rgChildren || []).slice(0, 5).map(function(c, i) {
                var cel = c.Element || c.m_element || c.m_Element;
                return {
                  idx: i,
                  cls: cel ? (cel.className || '').substring(0, 60) : null,
                  flow: cel ? cel.getAttribute('flow-children') : null,
                  cc: (c.m_rgChildren || []).length,
                };
              }),
            });
          }
          
          var children = node.m_rgChildren || [];
          for (var i = 0; i < children.length; i++) {
            checkNative(children[i], path + '.' + i, depth + 1);
          }
        }
        checkNative(root, 'R', 0);

        return {dsNodes: results, nativeContainers: nativeInfo};
      })())`,
      returnByValue: true,
    });
    
    console.log(JSON.stringify(JSON.parse(res.result.value), null, 2));
    w.close();
  } catch(e) { console.error('ERR:', e.message); w.close(); }
});
w.on('error', (e) => { console.error('WS_ERR:', e.message); process.exit(1); });
