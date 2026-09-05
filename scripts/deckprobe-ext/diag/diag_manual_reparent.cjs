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
        const exc = msg.result?.exceptionDetails;
        if (exc) {
          resolve({ exception: exc.text || exc.exception?.description || JSON.stringify(exc) });
        } else if (r?.value) {
          try { resolve(JSON.parse(r.value)); } catch { resolve(r.value); }
        } else {
          resolve(r);
        }
      }
    };
    w.on('message', handler);
    w.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    setTimeout(() => reject(new Error('timeout')), 15000);
  });
}

w.on('open', async () => {
  try {
    // Manually replicate reparentNavTreeNodes logic with detailed logging
    const result = await evaluate(`JSON.stringify((function(){
      var log = [];
      try {
        var ctrl = window.FocusNavController;
        if (ctrl === null || ctrl === undefined) { log.push("no controller"); return {log:log}; }
        
        var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
        var trees = (ctx && ctx.m_rgGamepadNavigationTrees) || [];
        var main = null;
        for (var i=0; i<trees.length; i++) {
          if (trees[i].m_ID === "GamepadUI_Full_Root") { main = trees[i]; break; }
        }
        if (main === null) { log.push("no main tree"); return {log:log}; }
        
        var root = main.Root || main.m_Root || main;
        log.push("root cc=" + (root.m_rgChildren||[]).length);
        
        // Find ds-row-scroll nodes
        var ourNodes = [];
        function findDS(node, path) {
          var el = node.Element || node.m_element || node.m_Element;
          if (el && typeof el.className === "string" && el.className.indexOf("ds-row-scroll") >= 0) {
            ourNodes.push({node: node, path: path, el: el});
          }
          var ch = node.m_rgChildren || [];
          for (var j=0; j<ch.length; j++) findDS(ch[j], path + "." + j);
        }
        findDS(root, "R");
        log.push("found ds-row-scroll: " + ourNodes.length);
        if (ourNodes.length === 0) return {log: log};
        
        // Get mount element
        var win = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
        var mount = win.document.getElementById("deck-shelves-home-root");
        if (mount === null || mount === undefined) { log.push("no mount"); return {log:log}; }
        log.push("mount found");
        
        // Find deepest container holding mount
        function findDeep(node) {
          var ch = node.m_rgChildren || [];
          for (var i=0; i<ch.length; i++) {
            var ce = ch[i].Element || ch[i].m_element || ch[i].m_Element;
            if (ce && ce.contains(mount)) {
              var deeper = findDeep(ch[i]);
              return deeper || ch[i];
            }
          }
          var el = node.Element || node.m_element || node.m_Element;
          if (el && el.contains(mount)) return node;
          return null;
        }
        var target = findDeep(root);
        if (target === null || target === undefined) { log.push("no container found"); return {log:log}; }
        
        var targetEl = target.Element || target.m_element || target.m_Element;
        log.push("target found: cls=" + (targetEl ? (targetEl.className||"").substring(0,50) : "none") + " cc=" + (target.m_rgChildren||[]).length);
        
        // Find parent of each ourNode
        function findParent(searchFrom, tgt) {
          var ch = searchFrom.m_rgChildren || [];
          for (var j=0; j<ch.length; j++) {
            if (ch[j] === tgt) return searchFrom;
          }
          for (var j=0; j<ch.length; j++) {
            var r = findParent(ch[j], tgt);
            if (r) return r;
          }
          return null;
        }
        
        var moved = 0;
        for (var n=0; n<ourNodes.length; n++) {
          var ourNode = ourNodes[n].node;
          var currentParent = findParent(root, ourNode);
          if (currentParent === null || currentParent === undefined) {
            log.push("node " + n + " (" + ourNodes[n].path + "): no parent found");
            continue;
          }
          if (currentParent === target) {
            log.push("node " + n + " (" + ourNodes[n].path + "): already in target");
            continue;
          }
          
          var parentEl = currentParent.Element || currentParent.m_element || currentParent.m_Element;
          log.push("node " + n + " (" + ourNodes[n].path + "): parent cls=" + (parentEl ? (parentEl.className||"").substring(0,40) : "none"));
          
          var idx = (currentParent.m_rgChildren || []).indexOf(ourNode);
          if (idx < 0) { log.push("node " + n + ": not in parent children array"); continue; }
          
          // Remove from current parent
          currentParent.m_rgChildren.splice(idx, 1);
          
          // Find correct insert position using compareDocumentPosition
          var targetChildren = target.m_rgChildren || [];
          var ourEl = ourNode.Element || ourNode.m_element || ourNode.m_Element;
          var insertIdx = targetChildren.length;
          if (ourEl) {
            for (var i=0; i<targetChildren.length; i++) {
              var childEl = targetChildren[i].Element || targetChildren[i].m_element || targetChildren[i].m_Element;
              if (childEl && ourEl.compareDocumentPosition(childEl) & 4) { // DOCUMENT_POSITION_FOLLOWING
                insertIdx = i;
                break;
              }
            }
          }
          targetChildren.splice(insertIdx, 0, ourNode);
          
          // Update parent references
          if ("m_Parent" in ourNode) ourNode.m_Parent = target;
          if ("Parent" in ourNode) ourNode.Parent = target;
          
          moved++;
          log.push("node " + n + ": moved to idx " + insertIdx + " of " + targetChildren.length);
        }
        
        log.push("total moved: " + moved);
        log.push("target now cc=" + (target.m_rgChildren||[]).length);
        
        // Verify
        var verify = [];
        findDS.foundForVerify = [];
        var verifyNodes = [];
        function findDSVerify(node, path) {
          var el = node.Element || node.m_element || node.m_Element;
          if (el && typeof el.className === "string" && el.className.indexOf("ds-row-scroll") >= 0) {
            verifyNodes.push({path: path, cc: (node.m_rgChildren||[]).length, parentMatch: node.m_Parent === target});
          }
          var ch = node.m_rgChildren || [];
          for (var j=0; j<ch.length; j++) findDSVerify(ch[j], path + "." + j);
        }
        findDSVerify(root, "R");
        
        return {log: log, verify: verifyNodes};
      } catch(e) {
        log.push("ERROR: " + e.message + " " + (e.stack||"").substring(0,200));
        return {log: log};
      }
    })())`);
    
    console.log(JSON.stringify(result, null, 2));
    
  } catch(e) {
    console.error("ERROR:", e.message);
  }
  w.close();
  process.exit(0);
});

w.on('error', e => { console.error('ERR:' + e.message); process.exit(1); });
setTimeout(() => { process.exit(1); }, 30000);
