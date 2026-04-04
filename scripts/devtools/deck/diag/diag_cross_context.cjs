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
        if (exc) resolve({ exception: exc.text || exc.exception?.description });
        else if (r?.value) { try { resolve(JSON.parse(r.value)); } catch { resolve(r.value); } }
        else resolve(r);
      }
    };
    w.on('message', handler);
    w.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    setTimeout(() => reject(new Error('timeout')), 10000);
  });
}

w.on('open', async () => {
  try {
    const result = await evaluate(`JSON.stringify((function(){
      var results = {};
      results.currentContext = {
        url: (window.location || {}).href || 'unknown',
        hasFocusNavController: typeof FocusNavController !== 'undefined',
        dsCentering: typeof globalThis.__ds_centering !== 'undefined' ? globalThis.__ds_centering : 'not set'
      };
      try {
        var spWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
        results.spWindow = {
          url: (spWin.location || {}).href || 'unknown',
          hasFocusNavController: 'FocusNavController' in spWin,
          dsCentering: typeof spWin.__ds_centering !== 'undefined' ? spWin.__ds_centering : 'not set',
          hasMount: !!spWin.document.getElementById('deck-shelves-home-root'),
          hasDeckShelvesRoot: !!spWin.document.querySelector('.deck-shelves-root')
        };
        results.globalThisSame = globalThis === spWin;
      } catch(e) {
        results.spError = e.message;
      }
      try {
        var ctrl = FocusNavController;
        var ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
        var trees = (ctx && ctx.m_rgGamepadNavigationTrees) || [];
        var main = null;
        for (var i = 0; i < trees.length; i++) {
          if (trees[i].m_ID === 'GamepadUI_Full_Root') { main = trees[i]; break; }
        }
        if (main) {
          var root = main.Root || main.m_Root || main;
          var proto = Object.getPrototypeOf(root);
          var hasBTry = !!(proto && typeof proto.BTryInternalNavigation === 'function');
          var src = hasBTry ? proto.BTryInternalNavigation.toString().substring(0, 200) : '';
          var isPatched = src.includes('ds-row-scroll');
          results.navTreePatch = {
            hasBTryInternalNavigation: hasBTry,
            isEdgePatched: isPatched,
            hasCenteringGate: src.includes('__ds_centering'),
            srcPreview: src
          };
        } else {
          results.navTreePatch = { error: 'no GamepadUI_Full_Root tree', treeIds: trees.map(function(t){ return t.m_ID; }) };
        }
      } catch(e) {
        results.navTreeError = e.message;
      }
      return results;
    })())`);

    console.log(JSON.stringify(result, null, 2));

  } catch(e) {
    console.error("ERROR:", e.message);
  }
  w.close();
  process.exit(0);
});

w.on('error', e => { console.error('ERR:' + e.message); process.exit(1); });
setTimeout(() => { process.exit(1); }, 15000);
