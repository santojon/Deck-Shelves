import classMap from './classmap.json';

// Only a hint: it can go stale after a Steam update.
try {
  const map = (classMap as Record<string, string> | null) ?? null;
  if (map && Object.keys(map).length) {
    try { (globalThis as any).__DS_CLASS_MAP = map; } catch {}
    try { globalThis.localStorage && globalThis.localStorage.setItem('ds_class_map', JSON.stringify(map)); } catch {}
  }
} catch (e) {
}
