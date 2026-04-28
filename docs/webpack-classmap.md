 # Webpack classmap — discovery & runtime mapping

 A short guide to discover Steam's webpack-hashed classes (viewport / shelf / cards) and inject a runtime mapping the plugin uses to locate scroll/focus elements.

 ## Purpose
 - Make selector discovery deterministic across Steam versions and themes.
 - Allow `DeckRow` to use a runtime-provided `viewport` selector before falling back to heuristics.

> **Caution:** webpack-hashed class tokens change on every Steam update without notice. Never hardcode a token (e.g. `_3PhGYbMWIcIaZCfllWN19N`) in application logic — always go through the runtime map or the heuristic fallback chain.

 ## Discovery snippet (run in CDP/CEF console)
 Paste this into the page console (or run via `cdp_probe.py` if supported):

 ```js
 (function(){
   const nodes = Array.from(document.querySelectorAll('[class]'));
   const candidates = new Set();
   nodes.forEach(n=>{
     try{
       const cs = getComputedStyle(n);
       const oy = (cs.overflowY||'').toLowerCase();
       if((oy==='auto' || oy==='scroll' || oy==='overlay') && n.scrollHeight>n.clientHeight && n.clientHeight>80){
         for(const c of Array.from(n.classList)){
           if(c && c.startsWith('_') && c.length>5) candidates.add(c);
         }
       }
     }catch(e){}
   });
   console.log('ds:candidates', Array.from(candidates));
   return Array.from(candidates);
 })();
 ```

 This snippet returns class tokens that look webpack-hashed and belong to scrollable elements (viewport candidates).

 ## Runtime injection snippet
 After identifying candidate tokens (for example `._3PhGYbMWIcIaZCfllWN19N`), inject a mapping:

 ```js
 // define in the global context (run in the Steam/CEF console)
 window.__DS_CLASS_MAP = {
   viewport: '_3PhGYbMWIcIaZCfllWN19N', // token (without leading '.') or with '.' prefixed
   row: '_39tNvaLedsTrVh0fFsP4Jm',
   card: '_CARDTOKEN_EXAMPLE'
 };

 // or persist via localStorage (the plugin reads this too)
 localStorage.setItem('ds_class_map', JSON.stringify(window.__DS_CLASS_MAP));
 ```

 Notes:
 - `DeckRow` searches, in order: (1) known hard-coded selector; (2) `window.__DS_CLASS_MAP` / `localStorage['ds_class_map']`; (3) hashed-token heuristic; (4) generic fallback.
 - Values in `__DS_CLASS_MAP` may include or omit the leading dot. If omitted, the plugin converts the token into a class selector.

 ## Verify using `cdp_probe.py`
 Use the probe to list ancestors or run `diff-focus` which captures the `viewport` and `scrollTop`:

 ```bash
 DECK_CDP_HOST=192.168.255.115 DECK_CDP_PORT=8081 python3 scripts/devtools/deck/tools/cdp_probe.py --mode ancestors
 DECK_CDP_HOST=192.168.255.115 DECK_CDP_PORT=8081 python3 scripts/devtools/deck/tools/cdp_probe.py --mode diff-focus
 ```

 Inspect the `cls` property in the output — tokens like `._3PhGYbMWIcIaZCfllWN19N` will appear there.

 ## Recommendations
 - Prefer injecting `window.__DS_CLASS_MAP` from a startup snippet (CDP) rather than relying solely on heuristics.
 - Keep a small per-version mapping file if you intend to distribute internals to QA.
 - Log tokens discovered by `cdp_probe` to build a version history.

> **Tip:** after a SteamOS update, run the discovery snippet first and compare against the previous `classmap.json` seed. If tokens changed, update the seed and redeploy — the heuristic fallback will keep things working in the meantime, but with less precision.

 ## Safety and cleanup
 - Do not persist sensitive data in `localStorage`. The mapping is safe for UI tokens.
 - Remove or update the mapping when Steam or the UI changes.
