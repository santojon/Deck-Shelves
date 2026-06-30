import classMap from './classmap.json';

// If a non-empty class map is bundled with the plugin, write it to the
// Shared JS runtime early as a bootstrap hint. This runs in SharedJSContext,
// so it writes to globalThis (not the SP window directly). The classmap
/* reaches the SP window via localStorage, which is shared between contexts.
   homePatch.tsx will run full runtime discovery at mount time and override
   any stale entries here. The viewport hash in classmap.json may become stale
   after Steam updates — treat it as a hint, not a hard dependency.
   Imported at plugin bootstrap (`src/index.tsx`). */
try {
  const map = (classMap as Record<string, string> | null) ?? null;
  if (map && Object.keys(map).length) {
    try { (globalThis as any).__DS_CLASS_MAP = map; } catch {}
    try { globalThis.localStorage && globalThis.localStorage.setItem('ds_class_map', JSON.stringify(map)); } catch {}
  }
} catch (e) {
  // swallow errors - non-critical
}
