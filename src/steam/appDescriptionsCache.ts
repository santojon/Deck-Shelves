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

export type AppDescriptions = {
  /** Short snippet (~150 chars) — store-page lead, plain text. */
  snippet: string;
  /** Full HTML description from the store page. */
  fullHtml: string;
};

type StoreShape = {
  RequestDescriptionsData?: (appid: number) => void;
  GetDescriptions?: (appid: number) => { strSnippet?: string; strFullDescription?: string } | null | undefined;
};

const cache = new Map<number, AppDescriptions>();
const pending = new Set<number>();
const failureCount = new Map<number, number>();
const MAX_RETRIES = 2;
const TIMEOUT_MS = 5000;
const POLL_MS = 100;

// Persistent cache (localStorage) survives plugin reloads — descriptions
// rarely change for an appid, so caching them across sessions saves the
// store round-trip on every plugin boot.
const STORAGE_KEY = 'ds_app_descriptions_v1';
const STORAGE_MAX = 1500;          // cap entries to keep the JSON blob small
const STORAGE_SAVE_DEBOUNCE = 1500;
let saveScheduled = false;

// eslint-disable-next-line complexity
function loadFromStorage(): void {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return;
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data)) {
        const appid = Number(k);
        const desc = v as Partial<AppDescriptions>;
        if (Number.isFinite(appid) && appid > 0 && (desc?.snippet || desc?.fullHtml)) {
          cache.set(appid, { snippet: desc.snippet ?? '', fullHtml: desc.fullHtml ?? '' });
        }
      }
    }
  } catch { /* swallow — bad JSON / quota / privacy mode */ }
}

function saveToStorageDebounced(): void {
  if (saveScheduled) return;
  saveScheduled = true;
  setTimeout(() => {
    saveScheduled = false;
    try {
      const ls = (globalThis as { localStorage?: Storage }).localStorage;
      if (!ls) return;
      // Cap to STORAGE_MAX most-recently-set entries (Map preserves insertion order).
      const entries = Array.from(cache.entries());
      const trimmed = entries.length > STORAGE_MAX ? entries.slice(-STORAGE_MAX) : entries;
      const obj = Object.fromEntries(trimmed);
      ls.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch { /* swallow — quota / privacy mode */ }
  }, STORAGE_SAVE_DEBOUNCE);
}

// Eagerly hydrate the in-memory cache on module load.
loadFromStorage();

function getStore(): StoreShape | undefined {
  return (globalThis as unknown as { appDetailsStore?: StoreShape }).appDetailsStore;
}

/** Returns the cached descriptions for `appid`, or `null` when not yet
 *  fetched. Always synchronous — callers that need fresh data should
 *  pair this with `preloadAppDescriptions` and a retry on the next tick. */
export function getAppDescriptions(appid: number): AppDescriptions | null {
  return cache.get(appid) ?? null;
}

function markFailure(appid: number): void {
  pending.delete(appid);
  failureCount.set(appid, (failureCount.get(appid) ?? 0) + 1);
}

function readDescriptions(store: StoreShape, appid: number): AppDescriptions | null {
  try {
    const desc = store.GetDescriptions?.(appid);
    const snippet = typeof desc?.strSnippet === "string" ? desc.strSnippet : "";
    const fullHtml = typeof desc?.strFullDescription === "string" ? desc.strFullDescription : "";
    return (snippet || fullHtml) ? { snippet, fullHtml } : null;
  } catch {
    return null;
  }
}

function pollUntilReady(store: StoreShape, appid: number): void {
  const startedAt = Date.now();
  const tick = (): void => {
    if (!pending.has(appid)) return;
    const found = readDescriptions(store, appid);
    if (found) {
      cache.set(appid, found);
      saveToStorageDebounced();
      pending.delete(appid);
      failureCount.delete(appid);
      return;
    }
    if (Date.now() - startedAt > TIMEOUT_MS) {
      markFailure(appid);
      return;
    }
    setTimeout(tick, POLL_MS);
  };
  setTimeout(tick, POLL_MS);
}

/** Schedules a background fetch for `appid` if not already cached or
 *  pending. Returns immediately. Result lands in the cache on the
 *  store's own callback path; subsequent `getAppDescriptions` calls
 *  return the populated value. */
export function preloadAppDescriptions(appid: number): void {
  if (cache.has(appid) || pending.has(appid)) return;
  if ((failureCount.get(appid) ?? 0) >= MAX_RETRIES) return;
  const store = getStore();
  if (!store?.RequestDescriptionsData || !store.GetDescriptions) return;
  pending.add(appid);
  try {
    store.RequestDescriptionsData(appid);
  } catch {
    markFailure(appid);
    return;
  }
  pollUntilReady(store, appid);
}

/** Schedules background fetches for a batch of appids. Same caching /
 *  dedup rules as the single-appid call. Useful when populating a shelf
 *  so every card's description warms in parallel. */
export function preloadAppDescriptionsBatch(appids: number[]): void {
  for (const id of appids) preloadAppDescriptions(id);
}
