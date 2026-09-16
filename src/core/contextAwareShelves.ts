/* Context-aware shelf resolution — sits between a context-aware external
   source (`registerContextAwareShelfSource` in pluginApi.ts) and the
   resolver (`_resolveExternal` in steam/index.ts). Owns what a provider
   should never implement itself: centralized focus state, debounced
   invalidation, cancelling a superseded resolve, and a short cache. */

import { getFocusedCard, subscribeFocusedCard } from "./focusedCardTracker";
import {
  contextAwareSourceRequiresFocus,
  resolveContextAwareExternalSource,
} from "./pluginApi";
import type { ShelfResolveContext } from "@deck-shelves/api";

// ── Focus-change invalidation (debounced) ──────────────────────────────────

// Controller navigation can fire several focus changes within a few frames;
// coalesce to the final one rather than resolving every intermediate card.
const DEBOUNCE_MS = 180;

/** Fires `cb` when the focused appid changes (debounced), never on the
 *  initial subscribe (that's just seeding, not a real change) and never
 *  when only `shelfId` changes with the same appid — matches the "similar
 *  to the game currently selected on Home" semantic regardless of which
 *  shelf the focus is on. Returns an unsubscribe function. */
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

/** Subscribes `cb` to focus-driven invalidation only when `source` needs it
 *  — returns null otherwise. One unconditional call at the call site keeps
 *  the branch out of the caller's own complexity; most shelves take the
 *  cheap `null` path and never touch focus tracking at all. */
export function maybeSubscribeContextInvalidation(
  source: { type?: string; sourceId?: unknown } | undefined,
  cb: () => void,
): (() => void) | null {
  if (source?.type !== "external") return null;
  const sourceId = String(source.sourceId ?? "");
  if (!sourceId || !contextAwareSourceRequiresFocus(sourceId)) return null;
  return subscribeContextInvalidation(cb);
}

// ── Cancellation ─────────────────────────────────────────────────────────

/* Keyed by `${shelfId}:${sourceId}` — a newer resolve for the SAME shelf +
   source aborts whatever it superseded, so a slow provider call can't win a
   race against a fresher one. Shelf.tsx's own generation counter is the
   belt to this suspenders' braces: an ignored `signal` still can never win. */
const inFlight = new Map<string, AbortController>();

function beginResolve(shelfId: string, sourceId: string): AbortSignal {
  const key = `${shelfId}:${sourceId}`;
  inFlight.get(key)?.abort();
  const controller = new AbortController();
  inFlight.set(key, controller);
  return controller.signal;
}

// ── Cache ────────────────────────────────────────────────────────────────

// Deliberately short-lived and in-memory only (never persisted) — a
// recommendation going stale after a restart is fine; looking stale to the
// user while they're actively browsing is the thing worth avoiding.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;

type CacheEntry = { ids: number[]; at: number };
const cache = new Map<string, CacheEntry>();

// Stable regardless of key-insertion order, so the same logical params
// object always produces the same cache key.
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
  // Bump to most-recently-used (Map preserves insertion order).
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

/** Test-only: clears cache + in-flight state so specs don't leak between
 *  cases. Not part of the module's real runtime surface. */
export function __resetContextAwareShelvesForTest(): void {
  cache.clear();
  inFlight.clear();
}

// ── Resolution ───────────────────────────────────────────────────────────

function currentContext(): ShelfResolveContext {
  const info = getFocusedCard();
  return info ? { focusedAppid: info.appid, shelfId: info.shelfId } : { focusedAppid: null, shelfId: null };
}

/** The single entry point `_resolveExternal` calls for a context-aware
 *  source. Skips the call entirely when focus is required but absent (an
 *  empty shelf beats a wasted call). Otherwise: cache → cancel-and-resolve
 *  → cache. Never throws — a bad provider degrades to empty, not a break. */
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
  // Own guarantee, not borrowed from pluginApi.ts's own catch — this
  // function's "never throws" contract must hold on its own.
  const ids = await resolveContextAwareExternalSource(sourceId, limit, params, context, signal).catch(() => []);
  /* A resolve that lost the cancellation race already has its result
     discarded by Shelf.tsx's own generation counter — just skip the write
     rather than caching a superseded context's result. */
  if (!signal.aborted) writeCache(key, ids);
  return ids;
}
