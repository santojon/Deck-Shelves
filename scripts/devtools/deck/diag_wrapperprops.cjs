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
      expression: `(function(){
        var ctrl = window.FocusNavController;
        var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
        var trees = ctx.m_rgGamepadNavigationTrees || [];
        var main; 
        for (var i = 0; i < trees.length; i++) {
          if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
        }
        var root = main.Root || main.m_Root || main;

        // Find deck-shelves-root wrapper
        var wn = null;
        function findWrapper(node) {
          if (wn) return;
          var el = node.Element || node.m_element || node.m_Element;
          if (el && el.className && el.className.includes('deck-shelves-root')) {
            wn = node; return;
          }
          var ch = node.m_rgChildren || [];
          for (var i = 0; i < ch.length; i++) findWrapper(ch[i]);
        }
        findWrapper(root);

        if (!wn) return JSON.stringify({err: 'not found'});
        
        var own = Object.getOwnPropertyNames(wn).sort();
        var vals = {};
        for (var i = 0; i < own.length; i++) {
          var k = own[i];
          if (k === 'm_rgChildren' || k === 'm_Parent') continue;
          try {
            var v = wn[k];
            if (typeof v === 'function') vals[k] = 'fn';
            else if (v && typeof v === 'object' && v.nodeType) vals[k] = '<DOM>';
            else if (v && typeof v === 'object') vals[k] = '{'+Object.keys(v).slice(0,4).join(',')+'}' ;
            else vals[k] = v;
          } catch(e) { vals[k] = 'err'; }
        }
        // Proto
        var proto = Object.getPrototypeOf(wn);
        var pVals = {};
        if (proto && proto !== Object.prototype) {
          var pks = Object.getOwnPropertyNames(proto);
          for (var j = 0; j < pks.length; j++) {
            var pk = pks[j];
            if (pk === 'constructor') continue;
            try {
              var pv = wn[pk];
              if (typeof pv === 'function') pVals[pk] = 'fn';
              else pVals[pk] = pv;
            } catch(e) { pVals[pk] = 'err'; }
          }
        }
        // Also get a native section node's keys for comparison
        var parent = wn.m_Parent;
        var native0 = parent && parent.m_rgChildren ? parent.m_rgChildren[0] : null;
        var nativeKeys = native0 ? Object.getOwnPropertyNames(native0).sort() : [];
        
        return JSON.stringify({own: vals, proto: pVals, nativeOwnKeys: nativeKeys});
      })()`,
      returnByValue: true,
    });
    
    process.stdout.write(res.result.value + '\n');
    w.close();
  } catch(e) { console.error('ERR:', e.message); w.close(); }
});
w.on('error', (e) => { console.error('WS_ERR:', e.message); process.exit(1); });


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

        // Get ALL properties on the wrapper node (own + proto)
        var ownKeys = Object.getOwnPropertyNames(wrapperNode).sort();
        var ownValues = {};
        for (var i = 0; i < ownKeys.length; i++) {
          var k = ownKeys[i];
          if (k === 'm_rgChildren' || k === 'm_Parent') { ownValues[k] = 'SKIPPED'; continue; }
          try {
            var v = wrapperNode[k];
            if (typeof v === 'function') ownValues[k] = 'fn()';
            else if (v && typeof v === 'object' && v.nodeType) ownValues[k] = '<DOM>';
            else if (v && typeof v === 'object') ownValues[k] = 'obj:' + Object.keys(v).length + 'keys';
            else ownValues[k] = v;
          } catch(e) { ownValues[k] = 'Error'; }
        }

        // Proto
        var proto = Object.getPrototypeOf(wrapperNode);
        var protoKeys = proto ? Object.getOwnPropertyNames(proto).sort() : [];
        var protoValues = {};
        for (var j = 0; j < protoKeys.length; j++) {
          var pk = protoKeys[j];
          if (pk === 'constructor') continue;
          try {
            var pv = wrapperNode[pk];
            if (typeof pv === 'function') protoValues[pk] = 'fn()';
            else protoValues[pk] = pv;
          } catch(e) { protoValues[pk] = 'Error'; }
        }

        // Also compare with a native section node
        var parent = wrapperNode.m_Parent;
        var native0 = parent && parent.m_rgChildren ? parent.m_rgChildren[0] : null;
        var nativeOwnKeys = native0 ? Object.getOwnPropertyNames(native0).sort() : [];

        return JSON.stringify({
          ownProps: ownValues,
          protoProps: protoValues,
          nativeOwnKeys: nativeOwnKeys,
        });
      })()`,
      returnByValue: true,
    });
    
    console.log(JSON.stringify(JSON.parse(res.result.value), null, 2));
    w.close();
  } catch(e) { console.error('ERR:', e.message); w.close(); }
});
w.on('error', (e) => { console.error('WS_ERR:', e.message); process.exit(1); });
