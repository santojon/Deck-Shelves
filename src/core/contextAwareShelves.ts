import { getFocusedCard, subscribeFocusedCard } from "./focusedCardTracker";
import {
  contextAwareSourceRequiresFocus,
  resolveContextAwareExternalSource,
} from "./pluginApi";
import type { ShelfResolveContext } from "@deck-shelves/api";

// Controller navigation fires several focus changes in a few frames; only the last one counts.
const DEBOUNCE_MS = 180;

// Debounced; never fires on the initial subscribe or when only the shelf changes.
export function subscribeContextInvalidation(cb: () => void): () => void {
  let seeded = false;
  let lastAppid: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = subscribeFocusedCard((info) => {
    const appid = info?.appid ?? null;
    if (!seeded) { seeded = true; lastAppid = appid; return; }
    if (appid === lastAppid) return;
    lastAppid = appid;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; cb(); }, DEBOUNCE_MS);
  });
  return () => {
    unsub();
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };
}

// Returns null when the source doesn't need focus tracking.
export function maybeSubscribeContextInvalidation(
  source: { type?: string; sourceId?: unknown } | undefined,
  cb: () => void,
): (() => void) | null {
  if (source?.type !== "external") return null;
  const sourceId = String(source.sourceId ?? "");
  if (!sourceId || !contextAwareSourceRequiresFocus(sourceId)) return null;
  return subscribeContextInvalidation(cb);
}

// A newer resolve for the same shelf and source aborts the one it superseded.
const inFlight = new Map<string, AbortController>();

function beginResolve(shelfId: string, sourceId: string): AbortSignal {
  const key = `${shelfId}:${sourceId}`;
  inFlight.get(key)?.abort();
  const controller = new AbortController();
  inFlight.set(key, controller);
  return controller.signal;
}

// Short-lived and in memory only: stale after a restart is fine, stale while browsing isn't.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;

type CacheEntry = { ids: number[]; at: number };
const cache = new Map<string, CacheEntry>();

// Stable regardless of key order, so equal params give the same cache key.
function stableParamsKey(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const keys = Object.keys(params).sort();
  return JSON.stringify(keys.map((k) => [k, params[k]]));
}

function cacheKey(sourceId: string, shelfId: string, paramsKey: string, focusedAppid: number | null): string {
  return `${sourceId}|${shelfId}|${paramsKey}|${focusedAppid ?? ""}`;
}

function readCache(key: string): number[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  cache.delete(key);
  cache.set(key, entry);
  return entry.ids;
}

function writeCache(key: string, ids: number[]): void {
  cache.delete(key);
  cache.set(key, { ids, at: Date.now() });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function __resetContextAwareShelvesForTest(): void {
  cache.clear();
  inFlight.clear();
}

function currentContext(): ShelfResolveContext {
  const info = getFocusedCard();
  return info ? { focusedAppid: info.appid, shelfId: info.shelfId } : { focusedAppid: null, shelfId: null };
}

// Skips the call when focus is required but absent. Never throws.
export async function resolveContextAwareShelf(
  sourceId: string,
  shelfId: string,
  limit: number,
  params: Record<string, unknown> | undefined,
): Promise<number[]> {
  const context = currentContext();
  if (contextAwareSourceRequiresFocus(sourceId) && context.focusedAppid == null) {
    return [];
  }

  const paramsKey = stableParamsKey(params);
  const key = cacheKey(sourceId, shelfId, paramsKey, context.focusedAppid);
  const cached = readCache(key);
  if (cached) return cached;

  const signal = beginResolve(shelfId, sourceId);
  const ids = await resolveContextAwareExternalSource(sourceId, limit, params, context, signal).catch(() => []);
  // A resolve that lost the race is discarded anyway, so don't cache it.
  if (!signal.aborted) writeCache(key, ids);
  return ids;
}
