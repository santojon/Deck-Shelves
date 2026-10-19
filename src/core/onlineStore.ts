
import { call } from "../shims/host-api";
import { STEAM_STORE_BASE } from "../constants";
import { logInfo, logWarn } from "../runtime/logger";

const WISHLIST_KEY = "ds-wishlist-cache-v1";
const PRICE_KEY = "ds-price-cache-v1";
const WISHLIST_TTL = 24 * 60 * 60 * 1000;
const PRICE_TTL = 6 * 60 * 60 * 1000;

/* User's Steam store country for the specials/featured search — so the cached
   price hints come back in the same currency as the per-app appdetails path
   (which is localised by the session cookie) instead of forcing USD. Best-effort
   detection from the store cookie / current user; falls back to "us". Memoised. */
let _storeCC: string | null = null;
function ccFromCookie(g: any): string | null {
  try {
    const m = String(g?.document?.cookie ?? "").match(/steamCountry=([A-Za-z]{2})/);
    return m ? m[1].toLowerCase() : null;
  } catch { return null; }
}
function pickUserCountry(g: any): unknown {
  const app = g && g.App;
  const user = (app && app.GetCurrentUser) ? app.GetCurrentUser() : null;
  return (user && (user.strCountryCode || user.strCountry)) || (g && g.g_strCountryCode);
}
function ccFromUser(g: any): string | null {
  try {
    const raw = pickUserCountry(g);
    if (typeof raw !== "string" || !/^[A-Za-z]{2}$/.test(raw)) return null;
    return raw.toLowerCase();
  } catch { return null; }
}
export function getStoreCountryCode(): string {
  if (_storeCC) return _storeCC;
  const g: any = globalThis as any;
  _storeCC = ccFromCookie(g) || ccFromUser(g) || "us";
  return _storeCC;
}

const backoffUntil: Record<string, number> = {};

function readCache<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < ttl) return data as T;
  } catch {}
  return null;
}

function writeCache<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// ── Wishlist ──────────────────────────────────────────────────────────────────

interface WishlistCache { ids: number[] }

let wishlistInFlight: Promise<number[] | null> | null = null;

// Read the cache regardless of age — used as a fallback when the backend
// hangs or fails so shelves don't render Spinner forever waiting on a
// dead RPC. Resolver consumers prefer a slightly stale list over no list.
function readWishlistCacheAny(): WishlistCache | null {
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    if (!raw) return null;
    const { data } = JSON.parse(raw);
    return data as WishlistCache;
  } catch { return null; }
}

function rpcWithTimeout<T>(method: string, args: unknown, ms = 6000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`rpc ${method} timeout after ${ms}ms`)), ms);
    Promise.resolve(call(method, args)).then(
      (v) => { clearTimeout(timer); resolve(v as T); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

const staleWishlistIds = (): number[] | null => readWishlistCacheAny()?.ids ?? null;

/* The community profile URL from Steam's URL store:
   urlStore.m_steamUrls.userwishlist.url = "https://steamcommunity.com/id/{vanity}/wishlist/"
   (or /profiles/{id64}/). Empty when it cannot be located. */
function readCommunityWishlistUrl(): string {
  try {
    const wl = (globalThis as any).urlStore?.m_steamUrls?.userwishlist
            ?? (globalThis as any).urlStore?.m_steamUrls?.UserWishlist;
    if (wl?.url) return String(wl.url);
    if (typeof wl === "string") return wl;
  } catch {}
  return "";
}

/* Route through the Python backend to bypass CORS. The backend may take 15 s ×
   2 attempts, and a standalone host can be starting its backend (one call at a
   time) on the first request — 6 s gave up on every cold call there and then
   backed off for 10 min, so the wishlist shelf stayed empty. Null on a
   backend error or an empty list (the caller serves the stale cache). */
const WISHLIST_RPC_TIMEOUT_MS = 35000;
const WISHLIST_TIMEOUT_BACKOFF_MS = 2 * 60 * 1000;
const WISHLIST_ERROR_BACKOFF_MS = 10 * 60 * 1000;

async function fetchWishlistFromBackend(communityUrl: string): Promise<number[] | null> {
  const resp = await rpcWithTimeout<any>("get_wishlist", { community_url: communityUrl }, WISHLIST_RPC_TIMEOUT_MS);
  if (!resp?.ok || !Array.isArray(resp.ids)) {
    logWarn("ONLINE", "wishlist backend error", resp?.error ?? "unknown");
    return null;
  }
  const ids = (resp.ids as unknown[]).map(Number).filter(Number.isFinite);
  if (!ids.length) logInfo("ONLINE", "wishlist backend returned no games");
  return ids.length ? ids : null;
}

function wishlistBackoffMs(e: unknown): number {
  return /timeout/i.test(String(e)) ? WISHLIST_TIMEOUT_BACKOFF_MS : WISHLIST_ERROR_BACKOFF_MS;
}

export async function getWishlistIds(): Promise<number[] | null> {
  const cached = readCache<WishlistCache>(WISHLIST_KEY, WISHLIST_TTL);
  if (cached) return cached.ids;

  if (wishlistInFlight) return wishlistInFlight;

  wishlistInFlight = (async () => {
    try {
      // In backoff: serve stale cache rather than hang the resolver.
      if (Date.now() < (backoffUntil[WISHLIST_KEY] ?? 0)) {
        logInfo("ONLINE", "wishlist: retry backed off", { seconds: Math.round(((backoffUntil[WISHLIST_KEY] ?? 0) - Date.now()) / 1000) });
        return staleWishlistIds();
      }
      // No isOnline() guard — the Python backend handles its own connectivity.
      const communityUrl = readCommunityWishlistUrl();
      if (!communityUrl) {
        logWarn("ONLINE", "wishlist: could not locate community URL");
        return staleWishlistIds();
      }
      const ids = await fetchWishlistFromBackend(communityUrl);
      if (!ids) return staleWishlistIds();
      writeCache<WishlistCache>(WISHLIST_KEY, { ids });
      logInfo("ONLINE", "wishlist fetched via backend", { count: ids.length });
      return ids;
    } catch (e) {
      logWarn("ONLINE", "wishlist fetch failed", String(e));
      // Back off so the next resolve doesn't immediately retry the same call:
      // briefly after a timeout (a host still starting), longer after an error.
      backoffUntil[WISHLIST_KEY] = Date.now() + wishlistBackoffMs(e);
      return staleWishlistIds();
    } finally {
      wishlistInFlight = null;
    }
  })();

  return wishlistInFlight;
}

// ── Steam Store browse ────────────────────────────────────────────────────────

// v3: forces re-fetch with extended upstream coverage (specials p2/3
// + Free Weekend tag) — v2 missed free titles outside top 100 specials.
const STORE_KEY = "ds-store-cache-v3";
const STORE_TTL = 6 * 60 * 60 * 1000; // 6h

type StoreCacheV2 = {
  ids: number[];
  priceHints?: Array<{ id: number; original: number; final: number }>;
};

let storeInFlight: Promise<number[] | null> | null = null;

function replayOneHint(h: { id: number; original: number; final: number }): void {
  if (!h || typeof h.id !== "number" || h.id <= 0) return;
  const op = Number(h.original) || 0;
  const fp = Number(h.final) || 0;
  if (op <= 0) return;
  const discount = Math.max(0, Math.min(100, Math.round(((op - fp) / op) * 100)));
  const price: PriceData = { price: fp, originalPrice: op, discount, currency: "USD", isFree: false };
  try { writePriceCacheEntry(h.id, price); } catch {}
}

function replayPriceHints(hints: Array<{ id: number; original: number; final: number }> | undefined): void {
  if (!Array.isArray(hints) || !hints.length) return;
  for (const h of hints) replayOneHint(h);
}

type StoreSearchItem = { name?: string; logo?: string; final_price?: number; original_price?: number; discounted?: boolean };
type StoreHarvest = { ids: Set<number>; nameMap: Map<number, string>; priceHints: Array<{ id: number; original: number; final: number }> };

/* Each search row carries `final_price` / `original_price` (cents) besides
   `name` + `logo`. Capturing them pre-populates the price cache so a "100%
   off" / "Free now" filter has real data without a secondary api/appdetails
   fetch (which often reports success:false for free-weekend titles → cached
   unpriced → filter excludes them). Permanently-free games carry no hint. */
function harvestStoreItem(item: StoreSearchItem, h: StoreHarvest): void {
  const m = item?.logo?.match(/\/apps\/(\d+)\//);
  if (!m) return;
  const id = Number(m[1]);
  if (!Number.isFinite(id) || id <= 0) return;
  h.ids.add(id);
  if (item.name) h.nameMap.set(id, item.name);
  const op = typeof item.original_price === "number" ? item.original_price : 0;
  const fp = typeof item.final_price === "number" ? item.final_price : 0;
  if (op > 0) h.priceHints.push({ id, original: op, final: fp });
}

// The parsed JSON of a fulfilled, OK, JSON search response; null otherwise.
async function readSearchJson(result: PromiseSettledResult<Response>): Promise<any | null> {
  if (result.status !== "fulfilled") return null;
  const resp = result.value;
  if (!resp.ok) return null;
  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return null;
  return resp.json();
}

// Persist extracted names so Shelf.tsx can display them immediately.
function persistGameNames(nameMap: Map<number, string>): void {
  if (!nameMap.size) return;
  try {
    const existing: Record<number, string> = JSON.parse(
      (globalThis as any).localStorage?.getItem?.("ds-game-name-cache-v1") || "{}"
    );
    nameMap.forEach((v, k) => { existing[k] = v; });
    (globalThis as any).localStorage?.setItem?.("ds-game-name-cache-v1", JSON.stringify(existing));
  } catch {}
}

export async function getStoreGameIds(): Promise<number[] | null> {
  const cached = readCache<StoreCacheV2>(STORE_KEY, STORE_TTL);
  if (cached) {
    // Replay price hints from cache so the discount filter sees fresh data
    // even when the store cache is warm.
    replayPriceHints(cached.priceHints);
    return cached.ids;
  }

  if (storeInFlight) return storeInFlight;

  storeInFlight = (async () => {
    try {
      /* Fetch specials (on-sale), free games, and popular/featured in parallel.
         Promise.allSettled handles individual request failures so a single
         timeout or error doesn't block the other two fetches.
         Including maxprice=free ensures "free now" shelves find free games. */
      const withTimeout = (url: string, ms = 6000) => {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), ms);
        return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(tid));
      };
      // Coverage: parallel fetch across seven endpoints because no
      // single one catches every currently-free title.
      const cc = getStoreCountryCode();
      const responses = await Promise.allSettled([
        withTimeout(`${STEAM_STORE_BASE}/search/results/?specials=1&json=1&count=100&start=0&cc=${cc}`),
        withTimeout(`${STEAM_STORE_BASE}/search/results/?specials=1&json=1&count=100&start=100&cc=${cc}`),
        withTimeout(`${STEAM_STORE_BASE}/search/results/?specials=1&json=1&count=100&start=200&cc=${cc}`),
        withTimeout(`${STEAM_STORE_BASE}/search/results/?maxprice=free&json=1&count=200&cc=${cc}`),
        withTimeout(`${STEAM_STORE_BASE}/search/results/?specials=1&maxprice=free&json=1&count=200&cc=${cc}`),
        withTimeout(`${STEAM_STORE_BASE}/search/results/?category2=18&json=1&count=200&cc=${cc}`),
        withTimeout(`${STEAM_STORE_BASE}/search/results/?json=1&count=100&cc=${cc}`),
      ]);

      const h: StoreHarvest = { ids: new Set<number>(), nameMap: new Map<number, string>(), priceHints: [] };
      for (const result of responses) {
        const json = await readSearchJson(result);
        if (!json) continue;
        const items: StoreSearchItem[] = json?.items ?? [];
        for (const item of items) harvestStoreItem(item, h);
      }

      const result = [...h.ids];
      if (!result.length) return null;
      writeCache<StoreCacheV2>(STORE_KEY, { ids: result, priceHints: h.priceHints });
      // Also apply hints immediately on the cold path so the next
      // getPriceMap call inside this resolve cycle sees fresh data.
      replayPriceHints(h.priceHints);
      persistGameNames(h.nameMap);
      logInfo("ONLINE", "store fetched", { count: result.length });
      return result;
    } catch (e) {
      logWarn("ONLINE", "store fetch failed", String(e));
      return null;
    } finally {
      storeInFlight = null;
    }
  })();

  return storeInFlight;
}

// ── Prices ────────────────────────────────────────────────────────────────────

export interface PriceData {
  price: number;        // final price in cents (0 = free)
  originalPrice: number;
  discount: number;     // 0–100
  currency: string;
  isFree: boolean;
  // True when Steam returned no `price_overview` for this appid. Cached
  // as a negative entry so we don't re-issue the fetch on every shelf
  // resolve; the discount filter treats this as "no discount data".
  unpriced?: boolean;
}

type PriceCache = Record<number, { ts: number; data: PriceData }>;

/* Parsing the whole price cache per app made shelf resolution O(apps × cache) —
   with 100+ cards it blocked the UI ~2 s on every refresh. Memoise the parse
   keyed on the raw string: one resolution pass parses once, and any write (raw
   string changes) self-invalidates it — no staleness. */
let _priceCacheRaw: string | null = null;
let _priceCacheParsed: PriceCache | null = null;

function getPriceCache(): PriceCache {
  const raw = localStorage.getItem(PRICE_KEY);
  if (raw === _priceCacheRaw && _priceCacheParsed) return _priceCacheParsed;
  try { _priceCacheParsed = raw ? JSON.parse(raw) : {}; } catch { _priceCacheParsed = {}; }
  _priceCacheRaw = raw;
  return _priceCacheParsed as PriceCache;
}

function readPriceCache(appid: number): PriceData | null {
  const entry = getPriceCache()[appid];
  if (entry && Date.now() - entry.ts < PRICE_TTL) return entry.data;
  return null;
}

function writePriceCacheEntry(appid: number, data: PriceData): void {
  try {
    const raw = localStorage.getItem(PRICE_KEY);
    const cache: PriceCache = raw ? JSON.parse(raw) : {};
    cache[appid] = { ts: Date.now(), data };
    // Prune entries older than PRICE_TTL * 2 to keep storage bounded
    const cutoff = Date.now() - PRICE_TTL * 2;
    for (const k of Object.keys(cache)) {
      if ((cache[Number(k)]?.ts ?? 0) < cutoff) delete cache[Number(k)];
    }
    const next = JSON.stringify(cache);
    localStorage.setItem(PRICE_KEY, next);
    _priceCacheRaw = next; // keep the memo consistent with the just-written cache
    _priceCacheParsed = cache;
  } catch {}
}

// Fills `result` from the price cache; returns the ids still to fetch.
function collectCachedPrices(appids: number[], result: Map<number, PriceData>): number[] {
  const toFetch: number[] = [];
  for (const id of appids) {
    const c = readPriceCache(id);
    if (c) { result.set(id, c); } else { toFetch.push(id); }
  }
  return toFetch;
}

/* One appdetails batch; null means "stop fetching" (rate-limited — with the
   backoff armed —, a non-OK status, or a non-JSON body). */
async function fetchPriceBatch(batch: number[]): Promise<any | null> {
  const url = `${STEAM_STORE_BASE}/api/appdetails?appids=${batch.join(",")}&filters=price_overview`;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 5000);
  let resp: Response;
  try { resp = await fetch(url, { credentials: "include", signal: ac.signal }); }
  finally { clearTimeout(tid); }
  if (resp.status === 429) {
    backoffUntil[PRICE_KEY] = Date.now() + 60 * 60 * 1000;
    return null;
  }
  if (!resp.ok) return null;
  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return null;
  return resp.json();
}

/* `success: false` and "no price_overview" (permanently free / region-
   blocked) both become negative cache entries so the fetch is not re-issued
   every resolve — the "first 200 always re-fetched" pattern with F2P games. */
function priceDataFromEntry(entry: any): PriceData {
  if (!entry?.success) return { price: 0, originalPrice: 0, discount: 0, currency: "USD", isFree: false, unpriced: true };
  const po = entry.data?.price_overview;
  if (!po) return { price: 0, originalPrice: 0, discount: 0, currency: "USD", isFree: true, unpriced: true };
  return {
    price: po.final ?? 0,
    originalPrice: po.initial ?? po.final ?? 0,
    discount: po.discount_percent ?? 0,
    currency: po.currency ?? "USD",
    isFree: false,
  };
}

async function fetchAndCachePrices(toFetch: number[], result: Map<number, PriceData>): Promise<void> {
  if (Date.now() < (backoffUntil[PRICE_KEY] ?? 0)) return;

  /* Fetch budget is bounded by `deadline` below — the per-call cap was
     raised from 200 to 800 so store-source resolves with a discount
     filter (e.g. "100% off" / "Free now") actually cover the full
     specials list. Past 200, otherwise-promoted-free games slipped
     through uncached and the discount filter rejected them. */
  const limited = toFetch.slice(0, 800);

  const BATCH = 50;
  const deadline = Date.now() + 8000; // 8 s total budget for all batches
  for (let i = 0; i < limited.length; i += BATCH) {
    if (Date.now() > deadline) break;
    const batch = limited.slice(i, i + BATCH);
    const json = await fetchPriceBatch(batch);
    if (!json) break;
    for (const appid of batch) {
      const data = priceDataFromEntry(json?.[appid]);
      result.set(appid, data);
      writePriceCacheEntry(appid, data);
    }
  }
}

export async function getPriceMap(appids: number[]): Promise<Map<number, PriceData>> {
  const result = new Map<number, PriceData>();
  if (!appids.length) return result;

  const toFetch = collectCachedPrices(appids, result);
  if (!toFetch.length) return result;

  try {
    await fetchAndCachePrices(toFetch, result);
  } catch (e) {
    logWarn("ONLINE", "price fetch failed", String(e));
  }

  return result;
}

// ── Catalog metadata (genres/categories/VR) ─────────────────────────────────

/* Powers v3 filters (genres, categories, vrSupport, multiplayerType) for
   Store/wishlist items not in the local library — the client only exposes
   this for owned apps. Read via getCachedCatalogMeta() as a fallback inside
   v3Extensions' rawField, once pre-fetched here. */
export interface CatalogMeta {
  genres: string[];
  categories: string[];
  vrSupported: boolean;
}

const CATALOG_KEY = "ds-catalog-meta-cache-v1";
const CATALOG_TTL = 7 * 24 * 60 * 60 * 1000; // genre/category rarely changes

type CatalogCache = Record<number, { ts: number; data: CatalogMeta }>;

let _catalogCacheRaw: string | null = null;
let _catalogCacheParsed: CatalogCache | null = null;

function getCatalogCache(): CatalogCache {
  const raw = localStorage.getItem(CATALOG_KEY);
  if (raw === _catalogCacheRaw && _catalogCacheParsed) return _catalogCacheParsed;
  try { _catalogCacheParsed = raw ? JSON.parse(raw) : {}; } catch { _catalogCacheParsed = {}; }
  _catalogCacheRaw = raw;
  return _catalogCacheParsed as CatalogCache;
}

function readCatalogCache(appid: number): CatalogMeta | null {
  const entry = getCatalogCache()[appid];
  if (entry && Date.now() - entry.ts < CATALOG_TTL) return entry.data;
  return null;
}

function writeCatalogCacheEntry(appid: number, data: CatalogMeta): void {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    const cache: CatalogCache = raw ? JSON.parse(raw) : {};
    cache[appid] = { ts: Date.now(), data };
    const cutoff = Date.now() - CATALOG_TTL * 2;
    for (const k of Object.keys(cache)) {
      if ((cache[Number(k)]?.ts ?? 0) < cutoff) delete cache[Number(k)];
    }
    const next = JSON.stringify(cache);
    localStorage.setItem(CATALOG_KEY, next);
    _catalogCacheRaw = next;
    _catalogCacheParsed = cache;
  } catch {}
}

/** Synchronous — reads whatever `getCatalogMetaMap` has already cached for
 *  this appid. Never fetches; callers that need fresh data must await
 *  `getCatalogMetaMap` first (see `applyWishlistChildFilter`). */
export function getCachedCatalogMeta(appid: number): CatalogMeta | null {
  return readCatalogCache(appid);
}

// Steam's own taxonomy: category id 31 is "VR Support" — matched by
// description too, since a `success: false` response still deserves a
// cached (empty) negative entry, not a permanent re-fetch.
function parseCatalogEntry(entry: any): CatalogMeta {
  const rawCategories: any[] = Array.isArray(entry?.data?.categories) ? entry.data.categories : [];
  const rawGenres: any[] = Array.isArray(entry?.data?.genres) ? entry.data.genres : [];
  return {
    genres: rawGenres.map((g) => String(g?.description ?? "")).filter(Boolean),
    categories: rawCategories.map((c) => String(c?.description ?? "")).filter(Boolean),
    vrSupported: rawCategories.some((c) => Number(c?.id) === 31 || /\bvr\b/i.test(String(c?.description ?? ""))),
  };
}

/** false = fetch-level failure (network/429/non-ok/non-json) — never cached,
 *  so it's retried later. Anything else (including `undefined`, Steam simply
 *  having no entry for this appid) is a real response, safe to cache empty. */
async function fetchCatalogEntry(appid: number): Promise<any | false> {
  const url = `${STEAM_STORE_BASE}/api/appdetails?appids=${appid}&filters=genres,categories&l=english`;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 5000);
  let resp: Response;
  try { resp = await fetch(url, { credentials: "include", signal: ac.signal }); }
  catch { return false; }
  finally { clearTimeout(tid); }
  if (resp.status === 429) { backoffUntil[CATALOG_KEY] = Date.now() + 60 * 60 * 1000; return false; }
  if (!resp.ok) return false;
  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return false;
  const json = await resp.json();
  return json?.[appid];
}

const CATALOG_CONCURRENCY = 4;

async function fetchCatalogWorker(queue: number[], result: Map<number, CatalogMeta>, deadline: number): Promise<void> {
  while (queue.length) {
    if (Date.now() > deadline || Date.now() < (backoffUntil[CATALOG_KEY] ?? 0)) return;
    const appid = queue.shift();
    if (appid === undefined) return;
    const entry = await fetchCatalogEntry(appid);
    if (entry === false) continue; // fetch-level failure — leave uncached, retry later
    const data = parseCatalogEntry(entry);
    result.set(appid, data);
    writeCatalogCacheEntry(appid, data);
  }
}

export async function getCatalogMetaMap(appids: number[]): Promise<Map<number, CatalogMeta>> {
  const result = new Map<number, CatalogMeta>();
  if (!appids.length) return result;

  const toFetch: number[] = [];
  for (const id of appids) {
    const c = readCatalogCache(id);
    if (c) { result.set(id, c); } else { toFetch.push(id); }
  }
  if (!toFetch.length || Date.now() < (backoffUntil[CATALOG_KEY] ?? 0)) return result;

  try {
    const queue = toFetch.slice(0, 60);
    const deadline = Date.now() + 8000;
    const workers = Array.from({ length: CATALOG_CONCURRENCY }, () => fetchCatalogWorker(queue, result, deadline));
    await Promise.all(workers);
  } catch (e) {
    logWarn("ONLINE", "catalog metadata fetch failed", String(e));
  }

  return result;
}

const NAME_BATCH = 10;
const NAME_TIMEOUT_MS = 4000;
const NAME_CONCURRENCY = 3;

async function fetchBatch(batch: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), NAME_TIMEOUT_MS);
  try {
    const url = `${STEAM_STORE_BASE}/api/appdetails?appids=${batch.join(',')}&l=english`;
    const resp = await fetch(url, { credentials: 'include', signal: ac.signal });
    clearTimeout(tid);
    if (!resp.ok) return out;
    const json = await resp.json();
    for (const id of batch) {
      const n = json?.[id]?.data?.name;
      if (typeof n === 'string' && n) out.set(id, n);
    }
  } catch { clearTimeout(tid); }
  return out;
}

// ── Store screenshots (screensaver's opt-in "online screenshots") ──────────

const SCREENSHOT_KEY = "ds-screenshot-cache-v1";
const SCREENSHOT_TTL = 7 * 24 * 60 * 60 * 1000; // a store page's shots rarely change
const SCREENSHOT_BATCH = 10;
const SCREENSHOT_CONCURRENCY = 3;

type ScreenshotCache = Record<number, { ts: number; data: string[] }>;

let _screenshotCacheRaw: string | null = null;
let _screenshotCacheParsed: ScreenshotCache | null = null;

function getScreenshotCache(): ScreenshotCache {
  const raw = localStorage.getItem(SCREENSHOT_KEY);
  if (raw === _screenshotCacheRaw && _screenshotCacheParsed) return _screenshotCacheParsed;
  try { _screenshotCacheParsed = raw ? JSON.parse(raw) : {}; } catch { _screenshotCacheParsed = {}; }
  _screenshotCacheRaw = raw;
  return _screenshotCacheParsed as ScreenshotCache;
}

function readScreenshotCache(appid: number): string[] | null {
  const entry = getScreenshotCache()[appid];
  if (entry && Date.now() - entry.ts < SCREENSHOT_TTL) return entry.data;
  return null;
}

function writeScreenshotCacheEntry(appid: number, data: string[]): void {
  try {
    const raw = localStorage.getItem(SCREENSHOT_KEY);
    const cache: ScreenshotCache = raw ? JSON.parse(raw) : {};
    cache[appid] = { ts: Date.now(), data };
    const cutoff = Date.now() - SCREENSHOT_TTL * 2;
    for (const k of Object.keys(cache)) {
      if ((cache[Number(k)]?.ts ?? 0) < cutoff) delete cache[Number(k)];
    }
    const next = JSON.stringify(cache);
    localStorage.setItem(SCREENSHOT_KEY, next);
    _screenshotCacheRaw = next;
    _screenshotCacheParsed = cache;
  } catch {}
}

function extractScreenshotRows(json: any, appid: number): any[] {
  const entry = json && json[appid];
  const rows = entry && entry.data && entry.data.screenshots;
  return Array.isArray(rows) ? rows : [];
}

function parseScreenshotRows(rows: any[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const u = r && r.path_full;
    if (typeof u === "string" && u) out.push(u);
  }
  return out;
}

async function fetchScreenshotEntry(batch: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  const url = `${STEAM_STORE_BASE}/api/appdetails?appids=${batch.join(",")}&filters=screenshots`;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 5000);
  try {
    const resp = await fetch(url, { credentials: "include", signal: ac.signal });
    if (resp.status === 429) { backoffUntil[SCREENSHOT_KEY] = Date.now() + 60 * 60 * 1000; return out; }
    if (!resp.ok) return out;
    if (!(resp.headers.get("content-type") || "").includes("json")) return out;
    const json = await resp.json();
    // empty array cached too — no screenshots is a real answer
    for (const appid of batch) out.set(appid, parseScreenshotRows(extractScreenshotRows(json, appid)));
  } catch { /* leave uncached, retried on a later call */ }
  finally { clearTimeout(tid); }
  return out;
}

function collectUncachedScreenshotIds(appids: number[], result: Map<number, string[]>): number[] {
  const toFetch: number[] = [];
  for (const id of appids) {
    const c = readScreenshotCache(id);
    if (c) result.set(id, c); else toFetch.push(id);
  }
  return toFetch;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchScreenshotBatches(ids: number[], result: Map<number, string[]>): Promise<void> {
  const batches = chunk(ids, SCREENSHOT_BATCH);
  for (let i = 0; i < batches.length; i += SCREENSHOT_CONCURRENCY) {
    const group = batches.slice(i, i + SCREENSHOT_CONCURRENCY);
    const results = await Promise.all(group.map(fetchScreenshotEntry));
    for (const r of results) r.forEach((urls, appid) => { result.set(appid, urls); writeScreenshotCacheEntry(appid, urls); });
  }
}

/** Store (official/community) screenshots per app, for the screensaver's
 *  opt-in online-screenshots mode — distinct from the local-capture pool
 *  in `screensaverInject.ts`. Cached 7 days; scoped to the caller's own
 *  app list (the screensaver passes only apps already in its shelf pool,
 *  never the whole library). */
export async function getStoreScreenshots(appids: number[]): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();
  if (!appids.length) return result;

  const toFetch = collectUncachedScreenshotIds(appids, result);
  if (!toFetch.length || Date.now() < (backoffUntil[SCREENSHOT_KEY] ?? 0)) return result;

  try {
    await fetchScreenshotBatches(toFetch.slice(0, 60), result);
  } catch (e) {
    logWarn("ONLINE", "store screenshot fetch failed", String(e));
  }

  return result;
}

export async function fetchGameNames(ids: number[]): Promise<Map<number, string>> {
  const limited = ids.slice(0, 60);
  const names = new Map<number, string>();
  const batches: number[][] = [];
  for (let i = 0; i < limited.length; i += NAME_BATCH) batches.push(limited.slice(i, i + NAME_BATCH));

  // First pass: fetch in groups of NAME_CONCURRENCY
  const missed: number[] = [];
  for (let i = 0; i < batches.length; i += NAME_CONCURRENCY) {
    const results = await Promise.all(batches.slice(i, i + NAME_CONCURRENCY).map(fetchBatch));
    for (const r of results) r.forEach((v, k) => names.set(k, v));
    for (const batch of batches.slice(i, i + NAME_CONCURRENCY)) {
      for (const id of batch) if (!names.has(id)) missed.push(id);
    }
  }

  // Second pass: retry missed IDs individually (success:false in batch can be transient)
  if (missed.length) {
    await Promise.all(missed.map(async (id) => {
      const r = await fetchBatch([id]);
      r.forEach((v, k) => names.set(k, v));
    }));
  }

  return names;
}
