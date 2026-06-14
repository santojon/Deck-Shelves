// Detailed container children diagnostic
const W = require('ws');
const TARGET_ID = process.argv[2];
var HOST = process.env.DECK_CDP_HOST || '127.0.0.1';
const w = new W('ws://' + HOST + ':8081/devtools/page/' + TARGET_ID);

const expr = `JSON.stringify((function(){
  var ctrl=window.FocusNavController;
  var ctx=ctrl.m_ActiveContext||ctrl.m_LastActiveContext;
  var trees=ctx.m_rgGamepadNavigationTrees||[];
  var main;
  for(var i=0;i<trees.length;i++){
    if(trees[i].m_ID==='GamepadUI_Full_Root'){main=trees[i];break;}
  }
  var root=main.Root||main;
  var win=SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
  var mount=win.document.getElementById('deck-shelves-home-root');
  
  // Walk to deepest container holding mount
  var n=root;
  for(var d=0;d<15;d++){
    var ch=n.m_rgChildren||[];
    var next=null;
    for(var k=0;k<ch.length;k++){
      var ce=ch[k].Element||ch[k].m_element||ch[k].m_Element;
      if(ce&&mount&&ce.contains(mount)){next=ch[k];break;}
    }
    if(next===null)break;
    n=next;
  }
  
  var el=n.Element||n.m_element||n.m_Element;
  var containerCC=(n.m_rgChildren||[]).length;
  var containerCls=el?(el.className||'').substring(0,80):'';
  
  // List ALL children of this container with details
  var children=[];
  var ch2=n.m_rgChildren||[];
  for(var j=0;j<ch2.length;j++){
    var ce=ch2[j].Element||ch2[j].m_element||ch2[j].m_Element;
    var cls=ce?(ce.className||''):'';
    var hasParent = 'Parent' in ch2[j];
    var parentRef = ch2[j].Parent;
    children.push({
      idx:j,
      cls:cls.substring(0,60),
      cc:(ch2[j].m_rgChildren||[]).length,
      hasParent: hasParent,
      parentMatch: parentRef===n,
      parentCls: parentRef ? ((parentRef.Element||parentRef.m_element||parentRef.m_Element||{}).className||'').substring(0,60) : 'none',
      parentCC: parentRef ? (parentRef.m_rgChildren||[]).length : -1
    });
  }
  
  // Also check node.m_Parent if Parent doesn't exist
  var ch3=n.m_rgChildren||[];
  var propNames=[];
  if(ch3.length>0){
    var sample=ch3[0];
    for(var p in sample){
      if(p.toLowerCase().indexOf('parent')>=0) propNames.push(p);
    }
  }
  
  return {
    containerCls:containerCls,
    containerCC:containerCC,
    parentPropNames:propNames,
    children:children.slice(-5) // last 5 children (where our rows should be)
  };
})())`;

w.on('open', () => {
  w.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true}}));
});
w.on('message', d => {
  const msg = JSON.parse(d.toString());
  if(msg.id === 1){
    try {
      const val = msg.result.result.value;
      console.log(JSON.stringify(JSON.parse(val), null, 2));
    } catch(e) {
      console.log(JSON.stringify(msg.result, null, 2));
    }
    w.close();
    process.exit(0);
  }
});
w.on('error', e => { console.error('ERR:'+e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
