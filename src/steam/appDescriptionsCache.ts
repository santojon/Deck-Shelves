/**
 * Best-effort cache for Steam's `appDetailsStore.GetDescriptions(appid)`.
 *
 * The descriptions store carries the store-page snippet (`strSnippet`) and
 * the full HTML description (`strFullDescription`). Both are useful for
 * richer card UIs (tooltips, list views, search) but neither is in the
 * standard `AppOverview` blob, so they need a separate fetch.
 *
 * Cold path: when a caller asks for descriptions that haven't been fetched
 * yet, we kick off `RequestDescriptionsData(appid)` and return null. The
 * data lands in the store asynchronously; the next call returns the
 * cached value. Same TTL-and-retry pattern the appDetailsCache uses for
 * categories / achievements.
 *
 * Graceful degradation: `appDetailsStore` isn't present in test harnesses
 * or older SteamOS builds — every getter returns null in that case.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AppDescriptions = {
  /** Short snippet (~150 chars) — store-page lead, plain text. */
  snippet: string;
  /** Full HTML description from the store page. */
  fullHtml: string;
};

const cache = new Map<number, AppDescriptions>();
const pending = new Set<number>();
const failureCount = new Map<number, number>();
const MAX_RETRIES = 2;

function getStore(): any {
  return (globalThis as any).appDetailsStore;
}

/** Returns the cached descriptions for `appid`, or `null` when not yet
 *  fetched. Always synchronous — callers that need fresh data should
 *  pair this with `preloadAppDescriptions` and a retry on the next tick. */
export function getAppDescriptions(appid: number): AppDescriptions | null {
  return cache.get(appid) ?? null;
}

/** Schedules a background fetch for `appid` if not already cached or
 *  pending. Returns immediately. Result lands in the cache on the
 *  store's own callback path; subsequent `getAppDescriptions` calls
 *  return the populated value. */
export function preloadAppDescriptions(appid: number): void {
  if (cache.has(appid) || pending.has(appid)) return;
  if ((failureCount.get(appid) ?? 0) >= MAX_RETRIES) return;
  const store = getStore();
  if (!store?.RequestDescriptionsData || !store?.GetDescriptions) return;
  pending.add(appid);
  try {
    store.RequestDescriptionsData(appid);
  } catch {
    pending.delete(appid);
    failureCount.set(appid, (failureCount.get(appid) ?? 0) + 1);
    return;
  }
  // The store doesn't expose a callback for descriptions specifically.
  // Poll a few times — descriptions arrive within a few hundred ms when
  // the network is healthy. Bounded so a permanently-failed fetch doesn't
  // leak listeners.
  const startedAt = Date.now();
  const TIMEOUT_MS = 5000;
  const POLL_MS = 100;
  const tick = (): void => {
    if (!pending.has(appid)) return;
    try {
      const desc = store.GetDescriptions?.(appid);
      const snippet = typeof desc?.strSnippet === "string" ? desc.strSnippet : "";
      const fullHtml = typeof desc?.strFullDescription === "string" ? desc.strFullDescription : "";
      if (snippet || fullHtml) {
        cache.set(appid, { snippet, fullHtml });
        pending.delete(appid);
        failureCount.delete(appid);
        return;
      }
    } catch {}
    if (Date.now() - startedAt > TIMEOUT_MS) {
      pending.delete(appid);
      failureCount.set(appid, (failureCount.get(appid) ?? 0) + 1);
      return;
    }
    setTimeout(tick, POLL_MS);
  };
  setTimeout(tick, POLL_MS);
}

/** Schedules background fetches for a batch of appids. Same caching /
 *  dedup rules as the single-appid call. Useful when populating a shelf
 *  so every card's description warms in parallel. */
export function preloadAppDescriptionsBatch(appids: number[]): void {
  for (const id of appids) preloadAppDescriptions(id);
}
