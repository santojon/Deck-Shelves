const resolverCache = new Map<string, { ts: number; ids: number[] }>();

// Persisted so a restart can reuse a still-fresh result; freshness rules are unchanged.
const PERSIST_KEY = "ds-smart-shelf-cache-v1";
const PERSIST_MAX_ENTRIES = 200;

function loadPersistedCache(): void {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.(PERSIST_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, { ts: number; ids: number[] }>;
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.ts === "number" && Array.isArray(v.ids)) resolverCache.set(k, v);
    }
  } catch {}
}
loadPersistedCache();

function persistCache(): void {
  try {
    const entries = Array.from(resolverCache.entries())
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, PERSIST_MAX_ENTRIES);
    (globalThis as any).localStorage?.setItem?.(PERSIST_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

let cacheHits = 0;
let cacheMisses = 0;

export function getSmartShelfCacheStats(): { hits: number; misses: number } {
  return { hits: cacheHits, misses: cacheMisses };
}

export function cached(key: string, ttlMs: number, fn: () => number[]): number[] {
  const entry = resolverCache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) { cacheHits++; return entry.ids; }
  cacheMisses++;
  const ids = fn();
  resolverCache.set(key, { ts: Date.now(), ids });
  persistCache();
  return ids;
}

export function invalidateSmartShelfCache(shelfId?: string): void {
  if (!shelfId) { resolverCache.clear(); persistCache(); return; }
  const prefix = `${shelfId}:`;
  for (const k of Array.from(resolverCache.keys())) {
    if (k.startsWith(prefix)) resolverCache.delete(k);
  }
  persistCache();
}
