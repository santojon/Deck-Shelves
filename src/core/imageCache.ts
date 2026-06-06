/**
 * Image cache for shelf cards.
 *
 * Two layers:
 *  1. In-memory LRU (hot path) — sync get(), returns blob URL for instant
 *     re-render. Capped at HOT_CACHE_LIMIT entries to keep memory bounded.
 *  2. Cache Storage API (persistent) — blobs survive Steam restarts.
 *     Loaded into the hot cache on first access via background fetch.
 *
 * Each cached response carries an `x-ds-cached-at` header (ms epoch) used
 * for staleness checks. Entries older than STALE_AFTER_MS trigger a
 * background revalidation on access; entries older than EVICT_AFTER_MS are
 * removed on the next pruneCache() pass.
 */

const STORAGE_NAME = "ds-images-v1";
// 320 entries fits ~150-200 visible cards (portrait + hero each) with
// headroom; eviction below this caused mid-tick broken-image flashes.
const HOT_CACHE_LIMIT = 320;
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days  → revalidate
const EVICT_AFTER_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days → drop
const TIMESTAMP_HEADER = "x-ds-cached-at";

type HotEntry = { blobUrl: string; storedAt: number };
const hot = new Map<string, HotEntry>();
const inflight = new Set<string>();

function touchHot(url: string, entry: HotEntry): void {
  hot.delete(url);
  hot.set(url, entry);
  while (hot.size > HOT_CACHE_LIMIT) {
    const oldestKey = hot.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = hot.get(oldestKey);
    if (oldest) {
      // Defer revoke by 30 s — gives any card still rendering with
      // this blob URL time to detect via onError (or re-render with a
      // fresh resolution) before the URL becomes invalid. Immediate
      // revocation was visible as a broken-image flash on cards whose
      // resolved src happened to be the entry that just evicted.
      const dead = oldest.blobUrl;
      setTimeout(() => { try { URL.revokeObjectURL(dead); } catch {} }, 30_000);
    }
    hot.delete(oldestKey);
  }
}

function supported(): boolean {
  try { return typeof caches !== "undefined" && typeof fetch !== "undefined"; }
  catch { return false; }
}

/** Local + loopback URLs are already filesystem-served and don't
 *  benefit from blob caching; cache only remote CDN URLs which also
 *  carry cache-bust via `?c=mtime`. */
function cacheable(url: string): boolean {
  if (typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (/^https?:\/\/(?:[^/]+\.)?steamloopback\.host/i.test(url)) return false;
  return true;
}

/** First URL in the chain that the cache can store (HTTPS, non-loopback).
 *  Use instead of `urls[0]` when warming — urls[0] is typically a
 *  /customimages/ local 404 path that the cache can't store anyway. */
export function firstCacheableUrl(urls: ReadonlyArray<string>): string | null {
  for (const u of urls) if (cacheable(u)) return u;
  return null;
}

/**
 * Sync hot-cache lookup. Returns a blob URL ready to feed to `<img src>`
 * if the URL is in memory; otherwise returns null and the caller should
 * use the original URL while warmCacheBackground() populates the cache.
 */
export function getHotCachedImageSrc(url: string): string | null {
  if (!cacheable(url)) return null;
  const hit = hot.get(url);
  if (!hit) return null;
  // LRU touch
  hot.delete(url);
  hot.set(url, hit);
  // Background revalidate when stale
  if (Date.now() - hit.storedAt > STALE_AFTER_MS) {
    revalidate(url);
  }
  return hit.blobUrl;
}

/**
 * Best-effort async cache warmer: populates hot + Cache Storage in the
 * background. Safe to call repeatedly for the same URL — concurrent calls
 * dedupe via the inflight set. No-op for local (non-http) URLs.
 */
export function warmCacheBackground(url: string): void {
  if (!cacheable(url) || !supported()) return;
  if (hot.has(url) || inflight.has(url)) return;
  inflight.add(url);
  (async () => {
    try {
      const cache = await caches.open(STORAGE_NAME);
      const cached = await cache.match(url);
      if (cached && cached.ok) {
        const blob = await cached.blob();
        if (blob.size > 0) {
          const storedAt = parseInt(cached.headers.get(TIMESTAMP_HEADER) || "0", 10) || Date.now();
          const blobUrl = URL.createObjectURL(blob);
          touchHot(url, { blobUrl, storedAt });
          if (Date.now() - storedAt > STALE_AFTER_MS) {
            revalidate(url);
          }
          return;
        }
      }
      // Cold — fetch from network and persist
      await fetchAndStore(url, cache);
    } catch { /* swallow — caller falls back to direct URL */ }
    finally { inflight.delete(url); }
  })();
}

async function fetchAndStore(url: string, cacheArg?: Cache): Promise<void> {
  const response = await fetch(url, { credentials: "omit" }).catch(() => null);
  if (!response || !response.ok) return;
  const blob = await response.blob().catch(() => null);
  if (!blob || blob.size === 0) return;
  const storedAt = Date.now();
  const blobUrl = URL.createObjectURL(blob);
  touchHot(url, { blobUrl, storedAt });
  try {
    const cache = cacheArg ?? (await caches.open(STORAGE_NAME));
    const newHeaders = new Headers(response.headers);
    newHeaders.set(TIMESTAMP_HEADER, String(storedAt));
    await cache.put(url, new Response(blob, { headers: newHeaders, status: 200 }));
  } catch { /* persistence is best-effort */ }
}

function revalidate(url: string): void {
  if (inflight.has(url)) return;
  inflight.add(url);
  (async () => {
    try { await fetchAndStore(url); }
    finally { inflight.delete(url); }
  })();
}

type HydrationCandidate = { url: string; storedAt: number };

async function listFreshCacheCandidates(cache: Cache): Promise<HydrationCandidate[]> {
  const keys = await cache.keys();
  const now = Date.now();
  const out: HydrationCandidate[] = [];
  for (const req of keys) {
    const res = await cache.match(req);
    if (!res) continue;
    const storedAt = parseInt(res.headers.get(TIMESTAMP_HEADER) || "0", 10) || 0;
    if (storedAt && now - storedAt > EVICT_AFTER_MS) continue;
    out.push({ url: req.url, storedAt });
  }
  out.sort((a, b) => b.storedAt - a.storedAt);
  return out;
}

async function hydrateOne(cache: Cache, url: string, storedAt: number): Promise<boolean> {
  try {
    const res = await cache.match(url);
    if (!res) return false;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return false;
    const blobUrl = URL.createObjectURL(blob);
    touchHot(url, { blobUrl, storedAt: storedAt || Date.now() });
    return true;
  } catch { return false; }
}

/** Pre-loads the hot cache from persistent Cache Storage on boot so
 *  the first focus on every card is a blob-URL hit. Capped at
 *  HOT_CACHE_LIMIT entries (newest first), idempotent. */
export async function hydrateHotCacheFromStorage(): Promise<{ hydrated: number; skipped: number }> {
  if (!supported()) return { hydrated: 0, skipped: 0 };
  let hydrated = 0;
  let skipped = 0;
  try {
    const cache = await caches.open(STORAGE_NAME);
    const candidates = await listFreshCacheCandidates(cache);
    for (const { url, storedAt } of candidates) {
      if (hot.has(url) || hot.size >= HOT_CACHE_LIMIT) { skipped++; continue; }
      if (await hydrateOne(cache, url, storedAt)) hydrated++;
      else skipped++;
    }
  } catch {}
  return { hydrated, skipped };
}

/**
 * Periodic cleanup: removes Cache Storage entries older than
 * EVICT_AFTER_MS. Safe to call on plugin init; idempotent + async.
 */
export async function pruneCache(): Promise<{ removed: number; kept: number }> {
  if (!supported()) return { removed: 0, kept: 0 };
  let removed = 0;
  let kept = 0;
  try {
    const cache = await caches.open(STORAGE_NAME);
    const keys = await cache.keys();
    const now = Date.now();
    for (const req of keys) {
      const res = await cache.match(req);
      if (!res) continue;
      const storedAt = parseInt(res.headers.get(TIMESTAMP_HEADER) || "0", 10) || 0;
      if (storedAt && now - storedAt > EVICT_AFTER_MS) {
        await cache.delete(req);
        removed++;
      } else {
        kept++;
      }
    }
  } catch {}
  return { removed, kept };
}

/** Hot-cache stats — used by diagnostics / tests, not by hot-path code. */
export function imageCacheStats(): { hotEntries: number; inflight: number } {
  return { hotEntries: hot.size, inflight: inflight.size };
}
