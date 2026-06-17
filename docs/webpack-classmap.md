 # Webpack classmap — discovery & runtime mapping

 A short guide to discover Steam's webpack-hashed classes (viewport / shelf / cards / native sections) and inject a runtime mapping the plugin uses to locate scroll/focus elements and to mirror native styling on injected shelves.

 ## Purpose
 - Make selector discovery deterministic across Steam versions and themes.
 - Allow `DeckRow` to use a runtime-provided `viewport` selector before falling back to heuristics.
 - Allow injected shelves to inherit native classes (`nativeShelf`, `nativeShelfTitle`, `nativeShelfRow`, `nativeCard*`) so CSS Loader themes — including ArtHero and TiltedHome — apply automatically.

> **Caution:** webpack-hashed class tokens change on every Steam update without notice. Never hardcode a token (e.g. `_3PhGYbMWIcIaZCfllWN19N`) in application logic — always go through the runtime map or the heuristic fallback chain.

## Runtime tokens (current keys)

The runtime map (`window.__DS_CLASS_MAP__` and the seed in `src/runtime/classmap.json`) carries these keys. New keys are filled in by `discoverClassMap()` on each mount; existing values from the seed win on conflicts so a partial discovery never erases a known-good token.

| Key | Discovered from | Use |
|---|---|---|
| `viewport` | first ancestor with vertical overflow + meaningful height | `DeckRow` scroll-center math, focus restore |
| `row` | shelf row container | (legacy; reserved) |
| `card` | game card root | (legacy; reserved) |
| `nativeShelf` | shelf-level wrapper around the title + row | additive promotion of the first DS shelf to the recents slot when CSS Loader is active |
| `nativeShelfTitle` | sibling heading element (font-size ≥ 16px) | match native title typography |
| `nativeShelfRow` | row sibling of the title | match native row spacing/transitions |
| `nativeCard*` | native game card tokens (`Panel`, art, label, status, badge) | apply native styles to our `.ds-card` and friends |
| `nativeSection*` | section-level tokens around the recents block | restore wrapper class on promoted first shelf |

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
 - **Discovery + seed merge order:** on each mount `homePatch` calls `getRuntimeClassMap()` (existing) and `discoverClassMap()` (fresh), then merges with **existing wins on conflicts**. This protects manually-pinned tokens while still filling in missing keys after a SteamOS update.

 ## Verify using the unified CDP CLI

 The CDP CLI (`devkit/cdp.py`, see [cdp.md](./cdp.md)) replaces the older `cdp_probe.py`. To inspect the live classmap on a running Deck:

 ```bash
 # List the current runtime classmap (after the plugin mounts)
 python3 devkit/cdp.py eval bp 'JSON.stringify(window.__DS_CLASS_MAP__ || null)'

 # Inspect a focused element's class chain
 python3 devkit/cdp.py eval bp 'document.activeElement?.className'

 # Force a re-discovery (development helper)
 python3 devkit/cdp.py eval bp 'window.__DS_CLASS_MAP__ = null; location.reload()'
 ```

 Tokens like `_3PhGYbMWIcIaZCfllWN19N` appear as values of the runtime map keys.

 ## Recommendations
 - Prefer injecting `window.__DS_CLASS_MAP` from a startup snippet (CDP) rather than relying solely on heuristics.
 - Keep a small per-version mapping file if you intend to distribute internals to QA.
 - Log tokens discovered by `cdp_probe` to build a version history.

> **Tip:** after a SteamOS update, run the discovery snippet first and compare against the previous `classmap.json` seed. If tokens changed, update the seed and redeploy — the heuristic fallback will keep things working in the meantime, but with less precision.

 ## Safety and cleanup
 - Do not persist sensitive data in `localStorage`. The mapping is safe for UI tokens.
 - Remove or update the mapping when Steam or the UI changes.
