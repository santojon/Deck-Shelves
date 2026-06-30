
export type AppDescriptions = {
  snippet: string;
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

// Descriptions come from Steam's store in the *current* Steam/device
// language, so scope the persistent cache by language: when the user
// switches the device language (which restarts Steam and reloads this
// module), the new language tag yields a fresh key → empty cache → the
// descriptions re-fetch in the new language instead of serving stale text.
function descriptionLangTag(): string {
  try {
    const l = (typeof navigator !== 'undefined' && (navigator as any)?.language)
      ? String((navigator as any).language) : 'en';
    return l.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'en';
  } catch { return 'en'; }
}

// Persistent cache (localStorage) survives plugin reloads — descriptions
// rarely change for an appid, so caching them across sessions saves the
// store round-trip on every plugin boot.
const STORAGE_KEY = `ds_app_descriptions_v1_${descriptionLangTag()}`;
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

export function preloadAppDescriptionsBatch(appids: number[]): void {
  for (const id of appids) preloadAppDescriptions(id);
}
