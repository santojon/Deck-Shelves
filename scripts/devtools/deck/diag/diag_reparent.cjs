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
      if (msg.id === id) {
        w.removeListener('message', handler);
        resolve(msg.result);
      }
    };
    w.on('message', handler);
    w.send(JSON.stringify({ id, method, params }));
    setTimeout(() => reject(new Error('timeout')), 10000);
  });
}

w.on('open', async () => {
  try {
    // Enable console
    await send('Runtime.enable', {});
    
    // Collect console messages
    const logs = [];
    w.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.method === 'Runtime.consoleAPICalled') {
        const args = (msg.params?.args || []).map(a => a.value || a.description || '').join(' ');
        if (args.includes('reparent') || args.includes('HOME') || args.includes('deck-shelves') || args.includes('Deck Shelves')) {
          logs.push(args.substring(0, 200));
        }
      }
    });
    
    // Wait a bit for console messages
    await new Promise(r => setTimeout(r, 2000));
    
    // Also search existing console history by evaluating
    const history = await send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        // Check if reparent was called by looking for our nav nodes in deep container
        var ctrl=window.FocusNavController;
        var ctx=ctrl.m_ActiveContext||ctrl.m_LastActiveContext;
        var trees=ctx.m_rgGamepadNavigationTrees||[];
        var main;
        for(var i=0;i<trees.length;i++){
          if(trees[i].m_ID==="GamepadUI_Full_Root"){main=trees[i];break;}
        }
        var root=main.Root||main;
        
        // Force-trigger the reparent by calling it manually
        var win=SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
        var mount=win.document.getElementById("deck-shelves-home-root");
        
        // Find ds-row-scroll in tree
        var dsNodes=[];
        function findDS(n,path){
          var el=n.Element||n.m_element||n.m_Element;
          if(el&&(el.className||"").indexOf("ds-row-scroll")>=0){
            dsNodes.push({path:path, parentCC:(n.m_Parent||{}).m_rgChildren?(n.m_Parent.m_rgChildren||[]).length:-1});
          }
          var ch=n.m_rgChildren||[];
          for(var i=0;i<ch.length;i++) findDS(ch[i],path+"."+i);
        }
        findDS(root,"R");
        
        // Find deepest container holding mount
        function findDeep(n){
          var ch=n.m_rgChildren||[];
          for(var i=0;i<ch.length;i++){
            var ce=ch[i].Element||ch[i].m_element||ch[i].m_Element;
            if(ce&&ce.contains(mount)){
              var deeper=findDeep(ch[i]);
              return deeper||ch[i];
            }
          }
          var el=n.Element||n.m_element||n.m_Element;
          if(el&&el.contains(mount)) return n;
          return null;
        }
        var container=findDeep(root);
        var containerCls=container?(container.Element||container.m_element||container.m_Element||{}).className:"none";
        var containerCC=container?(container.m_rgChildren||[]).length:-1;
        
        return {
          dsNodes: dsNodes,
          containerCls: (containerCls||"").substring(0,60),
          containerCC: containerCC,
          mountFound: mount!==null&&mount!==undefined
        };
      })())`,
      returnByValue: true
    });
    
    const val = history?.result?.value;
    if (val) {
      console.log("STATE:", JSON.stringify(JSON.parse(val), null, 2));
    } else {
      console.log("STATE:", JSON.stringify(history, null, 2));
    }
    console.log("CONSOLE_LOGS:", JSON.stringify(logs));
    
  } catch(e) {
    console.error("ERROR:", e.message);
  }
  w.close();
  process.exit(0);
});

w.on('error', e => { console.error('ERR:' + e.message); process.exit(1); });
setTimeout(() => { process.exit(1); }, 30000);
