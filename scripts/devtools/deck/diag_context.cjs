const W = require('ws');
const TARGET_ID = process.argv[2];
const w = new W('ws://127.0.0.1:8081/devtools/page/' + TARGET_ID);
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
    // Check where FocusNavController lives
    const result = await evaluate(`JSON.stringify((function(){
      var results = {};
      
      // Check in SharedJSContext (current context)
      results.inGlobal = typeof FocusNavController !== "undefined";
      results.inWindow = typeof window.FocusNavController !== "undefined";
      
      // Check SteamUIStore  
      results.hasSteamUIStore = typeof SteamUIStore !== "undefined";
      
      // Get the SP window
      var spWin = null;
      try {
        spWin = SteamUIStore.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;
        results.hasSPWindow = true;
        results.inSPWindow = typeof spWin.FocusNavController !== "undefined";
        results.spWindowURL = (spWin.location||{}).href || "unknown";
      } catch(e) {
        results.hasSPWindow = false;
        results.spError = e.message;
      }
      
      // Check available approaches in SP window
      if (spWin) {
        results.spHasFNC = "FocusNavController" in spWin;
        results.spHasGamepadNavTree = "GamepadNavTree" in spWin;
        results.spHasDFL = "DFL" in spWin;
      }
      
      // Current window URL
      results.currentURL = (window.location||{}).href || "unknown";
      
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
