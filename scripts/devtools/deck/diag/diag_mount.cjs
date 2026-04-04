const W = require('ws');
const TARGET_ID = process.argv[2];
var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const w = new W('ws://' + HOST + ':8081/devtools/page/' + TARGET_ID);

function evaluate(expr) {
  return new Promise((resolve, reject) => {
    const id = 1;
    w.on('message', function handler(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        w.removeListener('message', handler);
        const r = msg.result?.result;
        if (r?.value) {
          try { resolve(JSON.parse(r.value)); } catch { resolve(r.value); }
        } else {
          resolve(msg.result?.exceptionDetails || r);
        }
      }
    });
    w.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    setTimeout(() => reject(new Error('timeout')), 10000);
  });
}

w.on('open', async () => {
  try {
    // 1. Mount DOM path
    const mountPath = await evaluate(`JSON.stringify((function(){
      var win=SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
      var doc=win.document;
      var mount=doc.getElementById("deck-shelves-home-root");
      if(mount===null||mount===undefined) return {error:"no mount"};
      var path=[];
      var el=mount;
      while(el){
        path.unshift((el.id||"")+"."+((el.className||"").substring(0,50)));
        el=el.parentElement;
        if(path.length>15) break;
      }
      // Also check what the scroll container looks like
      var scrollArea=null;
      var allDivs=doc.querySelectorAll("div");
      for(var i=0;i<allDivs.length;i++){
        if((allDivs[i].className||"").indexOf("_2RXNRKWY8jL7xwgGYUfLfU")>=0){
          scrollArea=allDivs[i]; break;
        }
      }
      var scrollContains = scrollArea ? scrollArea.contains(mount) : null;
      return {mountPath:path, scrollContainsMount:scrollContains};
    })())`);
    console.log("MOUNT_PATH:", JSON.stringify(mountPath, null, 2));

    // 2. Check nav tree structure around _1DLmEVjfX3d7Ec8CW7vJnt
    const treeInfo = await evaluate(`JSON.stringify((function(){
      var ctrl=window.FocusNavController;
      var ctx=ctrl.m_ActiveContext||ctrl.m_LastActiveContext;
      var trees=ctx.m_rgGamepadNavigationTrees||[];
      var main;
      for(var i=0;i<trees.length;i++){
        if(trees[i].m_ID==="GamepadUI_Full_Root"){main=trees[i];break;}
      }
      var root=main.Root||main;
      
      // Find _1DLmEVjfX3d7Ec8CW7vJnt node
      function findNode(n, cls) {
        var el=n.Element||n.m_element||n.m_Element;
        if(el&&(el.className||"").indexOf(cls)>=0) return n;
        var ch=n.m_rgChildren||[];
        for(var j=0;j<ch.length;j++){
          var f=findNode(ch[j],cls);
          if(f) return f;
        }
        return null;
      }
      var parentNode = findNode(root, "_1DLmEVjfX3d7Ec8CW7vJnt");
      if(parentNode===null||parentNode===undefined) return {error:"no parent node"};
      
      var children=[];
      var ch=parentNode.m_rgChildren||[];
      for(var j=0;j<ch.length;j++){
        var el=ch[j].Element||ch[j].m_element||ch[j].m_Element;
        var cls=el?(el.className||""):"";
        children.push({
          idx:j,
          cls:cls.substring(0,60),
          cc:(ch[j].m_rgChildren||[]).length
        });
      }
      
      // Walk inside child 0 (scroll area) to see its deep structure
      var scrollNode = ch[0];
      var depth=[];
      var n=scrollNode;
      for(var d=0;d<12;d++){
        if(n===null||n===undefined) break;
        var el2=n.Element||n.m_element||n.m_Element;
        depth.push({
          d:d,
          cls:el2?(el2.className||"").substring(0,50):"",
          cc:(n.m_rgChildren||[]).length
        });
        var ch2=n.m_rgChildren||[];
        if(ch2.length===0) break;
        // Follow the child with most children (main content branch)
        var best=ch2[0];
        for(var k=1;k<ch2.length;k++){
          if((ch2[k].m_rgChildren||[]).length > (best.m_rgChildren||[]).length) best=ch2[k];
        }
        n=best;
      }
      
      return {parentCC:ch.length, children:children, scrollDepth:depth};
    })())`);
    console.log("TREE:", JSON.stringify(treeInfo, null, 2));

  } catch(e) {
    console.error("ERROR:", e.message);
  }
  w.close();
  process.exit(0);
});

w.on('error', e => { console.error('ERR:' + e.message); process.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 30000);
