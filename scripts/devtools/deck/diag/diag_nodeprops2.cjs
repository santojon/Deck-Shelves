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

        function getProps(node) {
          if (!node) return null;
          var props = {};
          var keys = Object.getOwnPropertyNames(node).sort();
          for (var i=0;i<keys.length;i++) {
            var k = keys[i];
            if (k === 'm_rgChildren' || k === 'm_Parent') continue;
            try {
              var v = node[k];
              if (typeof v === 'function') props[k] = 'fn';
              else if (v && typeof v === 'object' && v.nodeType) props[k] = 'DOMElement';
              else if (v && typeof v === 'object') props[k] = '{'+Object.keys(v).slice(0,5).join(',')+'}';
              else props[k] = v;
            } catch(e) { props[k] = 'err'; }
          }
          // Also get prototype keys
          var proto = Object.getPrototypeOf(node);
          if (proto && proto !== Object.prototype) {
            var pk = Object.getOwnPropertyNames(proto);
            for(var j=0;j<pk.length;j++){
              if(pk[j]==='constructor'||props[pk[j]]!==undefined) continue;
              try{
                var pv=node[pk[j]];
                if(typeof pv==='function') props['P.'+pk[j]]='fn';
                else props['P.'+pk[j]]=pv;
              }catch(e){}
            }
          }
          return props;
        }

        // Find ds-row-scroll node
        var dsNode=null;
        function findDS(node){
          if(dsNode) return;
          var el=node.Element||node.m_element||node.m_Element;
          if(el&&el.className&&el.className.includes('ds-row-scroll')){dsNode=node;return;}
          var ch=node.m_rgChildren||[];
          for(var i=0;i<ch.length;i++) findDS(ch[i]);
        }
        findDS(root);

        var parent=dsNode?dsNode.m_Parent:null;
        // Native section (child 0 of parent)
        var native0=parent&&parent.m_rgChildren?parent.m_rgChildren[0]:null;
        // Find the horizontal row inside native0 (grandchild or deeper)
        var nativeRow=null;
        function findRow(node,d){
          if(d>3||nativeRow)return;
          if((node.m_rgChildren||[]).length>5){nativeRow=node;return;}
          var ch=node.m_rgChildren||[];
          for(var i=0;i<ch.length;i++) findRow(ch[i],d+1);
        }
        if(native0) findRow(native0,0);

        return JSON.stringify({
          dsNode: getProps(dsNode),
          parent: getProps(parent),
          native0: getProps(native0),
          nativeRow: nativeRow?getProps(nativeRow):'not found',
        });
      })()`,
      returnByValue: true,
    });
    
    console.log(JSON.stringify(JSON.parse(res.result.value), null, 2));
    w.close();
  } catch(e) { console.error('ERR:', e.message); w.close(); }
});
w.on('error', (e) => { console.error('WS_ERR:', e.message); process.exit(1); });
