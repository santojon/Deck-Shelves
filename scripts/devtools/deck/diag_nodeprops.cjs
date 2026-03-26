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
        var root = main.Root || main.m_Root || main;

        // Dump ALL properties on a nav tree node (to find flow-related properties)
        function getNodeProps(node) {
          if (!node) return null;
          var props = {};
          // Get own properties
          var ownKeys = Object.getOwnPropertyNames(node).sort();
          for (var i = 0; i < ownKeys.length; i++) {
            var k = ownKeys[i];
            if (k === 'm_rgChildren' || k === 'm_Parent' || k === 'Element' || k === 'm_element' || k === 'm_Element') continue;
            try {
              var v = node[k];
              if (typeof v === 'function') {
                props[k] = 'fn';
              } else if (typeof v === 'object' && v !== null) {
                props[k] = typeof v;
              } else {
                props[k] = v;
              }
            } catch(e) {
              props[k] = 'error';
            }
          }
          // Also check prototype
          var proto = Object.getPrototypeOf(node);
          if (proto && proto !== Object.prototype) {
            var protoKeys = Object.getOwnPropertyNames(proto).sort();
            for (var j = 0; j < protoKeys.length; j++) {
              var pk = protoKeys[j];
              if (pk === 'constructor') continue;
              if (props[pk] !== undefined) continue;
              try {
                var pv = node[pk];
                if (typeof pv === 'function') {
                  props['[proto]'+pk] = 'fn';
                } else {
                  props['[proto]'+pk] = pv;
                }
              } catch(e) {}
            }
          }
          return props;
        }

        // Find a ds-row-scroll node
        var dsNode = null;
        function findDS(node) {
          if (dsNode) return;
          var el = node.Element || node.m_element || node.m_Element;
          if (el && el.className && el.className.includes('ds-row-scroll')) {
            dsNode = node;
            return;
          }
          for (var c of (node.m_rgChildren || [])) findDS(c);
        }
        findDS(root);

        // Also find a native section node (children 0-5 of the content container)
        var parent = dsNode ? dsNode.m_Parent : null;
        var nativeNode = parent && parent.m_rgChildren && parent.m_rgChildren[0] ? parent.m_rgChildren[0] : null;

        // Find the native "Recent Games" horizontal row (a child 2-3 levels deep in a native section)
        var recentRow = null;
        function findHorizRow(node, depth) {
          if (depth > 4 || recentRow) return;
          var el = node.Element || node.m_element || node.m_Element;
          // Look for a node with many children (>5) that has a horizontal ScrollPanel-like element
          if ((node.m_rgChildren || []).length > 5 && !el?.className?.includes('ds-')) {
            recentRow = node;
            return;
          }
          for (var c of (node.m_rgChildren || [])) findHorizRow(c, depth + 1);
        }
        if (nativeNode) findHorizRow(nativeNode, 0);

        return {
          dsNodeProps: dsNode ? getNodeProps(dsNode) : 'NOT FOUND',
          parentProps: parent ? getNodeProps(parent) : 'NOT FOUND',
          nativeNodeProps: nativeNode ? getNodeProps(nativeNode) : 'NOT FOUND',
          recentRowProps: recentRow ? getNodeProps(recentRow) : 'NOT FOUND',
        };
      })())`,
      returnByValue: true,
    });
    
    console.log(JSON.stringify(JSON.parse(res.result.value), null, 2));
    w.close();
  } catch(e) { console.error('ERR:', e.message); w.close(); }
});
w.on('error', (e) => { console.error('WS_ERR:', e.message); process.exit(1); });
