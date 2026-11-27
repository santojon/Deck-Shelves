
import { call } from "../shims/host-api";
import { STEAM_STORE_BASE } from "../constants";
import { logInfo, logWarn } from "../runtime/logger";
import { decodeHtmlEntities } from "../domain/sourceUtils";
import { readSteamId } from "../runtime/steamAccount";

const WISHLIST_KEY = "ds-wishlist-cache-v1";
const PRICE_KEY = "ds-price-cache-v1";
const WISHLIST_TTL = 24 * 60 * 60 * 1000;
const PRICE_TTL = 6 * 60 * 60 * 1000;

// Store country so cached price hints match the currency of the per-app path; falls back to "us".
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

// Every appdetails call shares one limit per address, and Steam's 429 carries no CORS header, so in the
// client it arrives as a failed fetch: either one stops all of them for a while.
const STORE_API_KEY = "store-api";
const STORE_API_429_BACKOFF_MS = 60 * 60 * 1000;
const STORE_API_FAILURE_BACKOFF_MS = 15 * 60 * 1000;

function storeApiBlocked(): boolean {
  return Date.now() < (backoffUntil[STORE_API_KEY] ?? 0);
}

async function storeApiFetch(url: string, timeoutMs: number): Promise<Response | null> {
  if (storeApiBlocked()) return null;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { credentials: "include", signal: ac.signal });
    if (resp.status === 429) backoffUntil[STORE_API_KEY] = Date.now() + STORE_API_429_BACKOFF_MS;
    return resp;
  } catch {
    if (!ac.signal.aborted) backoffUntil[STORE_API_KEY] = Date.now() + STORE_API_FAILURE_BACKOFF_MS;
    return null;
  } finally {
    clearTimeout(tid);
  }
}

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

interface WishlistCache { ids: number[] }

let wishlistInFlight: Promise<number[] | null> | null = null;

// Any age: a stale list beats a spinner when the backend hangs.
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

// From Steam's URL store (userwishlist); empty when it can't be found.
function readCommunityWishlistUrl(): string {
  try {
    const wl = (globalThis as any).urlStore?.m_steamUrls?.userwishlist
            ?? (globalThis as any).urlStore?.m_steamUrls?.UserWishlist;
    if (wl?.url) return String(wl.url);
    if (typeof wl === "string") return wl;
  } catch {}
  return "";
}

// Goes through the backend to bypass CORS; the timeout allows for a slow or cold-starting backend.
const WISHLIST_RPC_TIMEOUT_MS = 35000;
const WISHLIST_TIMEOUT_BACKOFF_MS = 2 * 60 * 1000;
const WISHLIST_ERROR_BACKOFF_MS = 10 * 60 * 1000;

// Why the last fetch came back empty, so the resolver can warn once per backoff window.
export type WishlistEmptyReason = { reason: string; backoffUntil?: number };
let wishlistEmptyReason: WishlistEmptyReason | null = null;

export function getWishlistEmptyReason(): WishlistEmptyReason | null {
  return wishlistEmptyReason;
}

function noWishlist(reason: string, backoffDeadline?: number): null {
  wishlistEmptyReason = backoffDeadline === undefined ? { reason } : { reason, backoffUntil: backoffDeadline };
  return null;
}

async function fetchWishlistFromBackend(communityUrl: string): Promise<number[] | null> {
  const resp = await rpcWithTimeout<any>("get_wishlist", { community_url: communityUrl, steamid: readSteamId() ?? undefined }, WISHLIST_RPC_TIMEOUT_MS);
  if (!resp?.ok || !Array.isArray(resp.ids)) {
    logInfo("ONLINE", "wishlist backend error", resp?.error ?? "unknown");
    return noWishlist(`backend error ${resp?.error ?? "unknown"}`);
  }
  const ids = (resp.ids as unknown[]).map(Number).filter(Number.isFinite);
  if (!ids.length) {
    logInfo("ONLINE", "wishlist backend returned no games");
    return noWishlist("backend returned none");
  }
  return ids;
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
      const deadline = backoffUntil[WISHLIST_KEY] ?? 0;
      if (Date.now() < deadline) {
        const seconds = Math.round((deadline - Date.now()) / 1000);
        logInfo("ONLINE", "wishlist: retry backed off", { seconds });
        return staleWishlistIds() ?? noWishlist(`backoff, retry in ${seconds}s`, deadline);
      }
      // No isOnline() guard: the backend handles its own connectivity.
      const communityUrl = readCommunityWishlistUrl();
      if (!communityUrl) {
        logInfo("ONLINE", "wishlist: could not locate community URL");
        return staleWishlistIds() ?? noWishlist("no community url");
      }
      const ids = await fetchWishlistFromBackend(communityUrl);
      if (!ids) return staleWishlistIds();
      writeCache<WishlistCache>(WISHLIST_KEY, { ids });
      wishlistEmptyReason = null;
      logInfo("ONLINE", "wishlist fetched via backend", { count: ids.length });
      return ids;
    } catch (e) {
      logInfo("ONLINE", "wishlist fetch failed", String(e));
      // Short backoff after a timeout (a host still starting), longer after an error.
      backoffUntil[WISHLIST_KEY] = Date.now() + wishlistBackoffMs(e);
      return staleWishlistIds() ?? noWishlist(`backend error ${String(e)}`);
    } finally {
      wishlistInFlight = null;
    }
  })();

  return wishlistInFlight;
}

const STORE_KEY = "ds-store-cache-v3";
const STORE_TTL = 6 * 60 * 60 * 1000;

type StoreCacheV2 = {
  ids: number[];
  priceHints?: Array<{ id: number; original: number; final: number }>;
};

let storeInFlight: Promise<number[] | null> | null = null;

function hintPrice(h: { id: number; original: number; final: number }): PriceData | null {
  if (!h || typeof h.id !== "number" || h.id <= 0) return null;
  const op = Number(h.original) || 0;
  const fp = Number(h.final) || 0;
  if (op <= 0) return null;
  const discount = Math.max(0, Math.min(100, Math.round(((op - fp) / op) * 100)));
  return { price: fp, originalPrice: op, discount, currency: "USD", isFree: false };
}

// A store price with its own currency or text says more than the USD hint.
function isStorePrice(data: PriceData | undefined): boolean {
  return !!data && !data.unpriced && (!!data.formatted || data.currency !== "USD");
}

// Warm replays only refresh entries past half the TTL, and leave a fresh store price alone.
function keepOnWarmReplay(entry: PriceCache[number] | undefined, now: number): boolean {
  if (!entry) return false;
  const age = now - entry.ts;
  return age < PRICE_TTL / 2 || (age < PRICE_TTL && isStorePrice(entry.data));
}

function replayPriceHints(hints: Array<{ id: number; original: number; final: number }> | undefined, warm = false): void {
  if (!Array.isArray(hints) || !hints.length) return;
  try {
    const now = Date.now();
    const current = getPriceCache();
    const next: PriceCache = { ...current };
    let changed = false;
    for (const h of hints) {
      const price = hintPrice(h);
      if (!price || (warm && keepOnWarmReplay(current[h.id], now))) continue;
      next[h.id] = { ts: now, data: price };
      changed = true;
    }
    if (changed) savePriceCache(next, now);
  } catch {}
}

type StoreSearchItem = { name?: string; logo?: string; final_price?: number; original_price?: number; discounted?: boolean };
type StoreHarvest = { ids: Set<number>; nameMap: Map<number, string>; priceHints: Array<{ id: number; original: number; final: number }> };

// Price hints from search rows fill the price cache, so discount filters work without extra appdetails calls.
function harvestStoreItem(item: StoreSearchItem, h: StoreHarvest): void {
  const m = item?.logo?.match(/\/apps\/(\d+)\//);
  if (!m) return;
  const id = Number(m[1]);
  if (!Number.isFinite(id) || id <= 0) return;
  h.ids.add(id);
  if (item.name) h.nameMap.set(id, decodeHtmlEntities(item.name));
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
    // Replay cached price hints so the discount filter sees them even on a warm cache.
    replayPriceHints(cached.priceHints, true);
    return cached.ids;
  }

  if (storeInFlight) return storeInFlight;

  storeInFlight = (async () => {
    try {
      // allSettled so one failing request doesn't block the others.
      const withTimeout = (url: string, ms = 6000) => {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), ms);
        return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(tid));
      };
      // No single endpoint catches every currently-free title.
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

export interface PriceData {
  price: number;        // final price in cents (0 = free)
  originalPrice: number;
  discount: number;     // 0–100
  currency: string;
  isFree: boolean;
  // The sale price as the store writes it in the user's currency and format ("$4.99", "R$ 4,99").
  formatted?: string;
  // No `price_overview` from Steam; cached as a negative entry so it isn't fetched every resolve.
  unpriced?: boolean;
}

type PriceCache = Record<number, { ts: number; data: PriceData }>;

// Memoised on the raw string: one parse per resolution pass, and any write invalidates it.
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
    savePriceCache(cache, Date.now());
  } catch {}
}

function savePriceCache(cache: PriceCache, now: number): void {
  const cutoff = now - PRICE_TTL * 2;
  for (const k of Object.keys(cache)) {
    if ((cache[Number(k)]?.ts ?? 0) < cutoff) delete cache[Number(k)];
  }
  const next = JSON.stringify(cache);
  localStorage.setItem(PRICE_KEY, next);
  _priceCacheRaw = next;
  _priceCacheParsed = cache;
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

// null means stop fetching: rate-limited, a non-OK status or a non-JSON body.
async function fetchPriceBatch(batch: number[]): Promise<any | null> {
  const resp = await storeApiFetch(`${STEAM_STORE_BASE}/api/appdetails?appids=${batch.join(",")}&filters=price_overview`, 5000);
  if (!resp?.ok) return null;
  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return null;
  return resp.json();
}

// Both become negative cache entries so the fetch isn't repeated every resolve.
function formattedOf(po: any): string | undefined {
  return typeof po?.final_formatted === "string" && po.final_formatted ? po.final_formatted : undefined;
}

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
    formatted: formattedOf(po),
  };
}

async function fetchAndCachePrices(toFetch: number[], result: Map<number, PriceData>): Promise<void> {
  if (storeApiBlocked()) return;

  // Bounded by the deadline below, so the cap can cover the full specials list.
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

// Cached prices only, for callers that must not go online.
export function getCachedPriceMap(appids: number[]): Map<number, PriceData> {
  const result = new Map<number, PriceData>();
  collectCachedPrices(appids, result);
  return result;
}

// The client only exposes these fields for owned apps, so store and wishlist items need them fetched.
export interface CatalogMeta {
  genres: string[];
  categories: string[];
  vrSupported: boolean;
  // Entries cached by older versions have no ids; they are read as they are and fetched again.
  categoryIds?: number[];
}

const CATALOG_KEY = "ds-catalog-meta-cache-v1";
const CATALOG_TTL = 7 * 24 * 60 * 60 * 1000;

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

// Never fetches; await `getCatalogMetaMap` first for fresh data.
export function getCachedCatalogMeta(appid: number): CatalogMeta | null {
  return readCatalogCache(appid);
}

// Category 31 is Steam's "VR Support".
function parseCatalogEntry(entry: any): CatalogMeta {
  const rawCategories: any[] = Array.isArray(entry?.data?.categories) ? entry.data.categories : [];
  const rawGenres: any[] = Array.isArray(entry?.data?.genres) ? entry.data.genres : [];
  return {
    genres: rawGenres.map((g) => String(g?.description ?? "")).filter(Boolean),
    categories: rawCategories.map((c) => String(c?.description ?? "")).filter(Boolean),
    categoryIds: rawCategories.map((c) => Number(c?.id)).filter((id) => Number.isInteger(id) && id > 0),
    vrSupported: rawCategories.some((c) => Number(c?.id) === 31 || /\bvr\b/i.test(String(c?.description ?? ""))),
  };
}

// false = fetch-level failure, never cached; anything else is a real answer and safe to cache.
async function fetchCatalogEntry(appid: number): Promise<any | false> {
  const resp = await storeApiFetch(`${STEAM_STORE_BASE}/api/appdetails?appids=${appid}&filters=genres,categories&l=english`, 5000);
  if (!resp?.ok) return false;
  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return false;
  const json = await resp.json();
  return json?.[appid];
}

const CATALOG_CONCURRENCY = 4;

async function fetchCatalogWorker(queue: number[], result: Map<number, CatalogMeta>, deadline: number): Promise<void> {
  while (queue.length) {
    if (Date.now() > deadline || storeApiBlocked()) return;
    const appid = queue.shift();
    if (appid === undefined) return;
    const entry = await fetchCatalogEntry(appid);
    if (entry === false) continue;
    const data = parseCatalogEntry(entry);
    result.set(appid, data);
    writeCatalogCacheEntry(appid, data);
  }
}

export async function getCatalogMetaMap(appids: number[]): Promise<Map<number, CatalogMeta>> {
  const result = new Map<number, CatalogMeta>();
  if (!appids.length) return result;

  const missing: number[] = [];
  const withoutIds: number[] = [];
  for (const id of appids) {
    const c = readCatalogCache(id);
    if (c) result.set(id, c);
    if (!c) missing.push(id);
    else if (!Array.isArray(c.categoryIds)) withoutIds.push(id);
  }
  const toFetch = [...missing, ...withoutIds];
  if (!toFetch.length || storeApiBlocked()) return result;

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

const NAME_LIMIT = 60;
const NAME_TIMEOUT_MS = 4000;
const NAME_CONCURRENCY = 3;
// Shelves ask again while a pass is still running; an id asked for once is not asked again meanwhile.
const namesInFlight = new Set<number>();

// One id per request: appdetails answers several ids only for the price filter.
async function fetchName(appid: number): Promise<string | null> {
  const resp = await storeApiFetch(`${STEAM_STORE_BASE}/api/appdetails?appids=${appid}&filters=basic&l=english`, NAME_TIMEOUT_MS);
  if (!resp?.ok) return null;
  try {
    const name = (await resp.json())?.[appid]?.data?.name;
    return typeof name === "string" && name ? name : null;
  } catch { return null; }
}

const SCREENSHOT_KEY = "ds-screenshot-cache-v1";
const SCREENSHOT_TTL = 7 * 24 * 60 * 60 * 1000;
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
  const resp = await storeApiFetch(`${STEAM_STORE_BASE}/api/appdetails?appids=${batch.join(",")}&filters=screenshots`, 5000);
  if (!resp?.ok || !(resp.headers.get("content-type") || "").includes("json")) return out;
  try {
    const json = await resp.json();
    // no screenshots is a real answer
    for (const appid of batch) out.set(appid, parseScreenshotRows(extractScreenshotRows(json, appid)));
  } catch { /* leave uncached, retried on a later call */ }
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

// Scoped to the caller's app list, never the whole library.
export async function getStoreScreenshots(appids: number[]): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();
  if (!appids.length) return result;

  const toFetch = collectUncachedScreenshotIds(appids, result);
  if (!toFetch.length || storeApiBlocked()) return result;

  try {
    await fetchScreenshotBatches(toFetch.slice(0, 60), result);
  } catch (e) {
    logWarn("ONLINE", "store screenshot fetch failed", String(e));
  }

  return result;
}

export async function fetchGameNames(ids: number[]): Promise<Map<number, string>> {
  const queue = ids.filter((id) => !namesInFlight.has(id)).slice(0, NAME_LIMIT);
  queue.forEach((id) => namesInFlight.add(id));
  const names = new Map<number, string>();
  const worker = async () => {
    while (queue.length && !storeApiBlocked()) {
      const id = queue.shift() as number;
      const name = await fetchName(id);
      namesInFlight.delete(id);
      if (name) names.set(id, name);
    }
  };
  try {
    await Promise.all(Array.from({ length: NAME_CONCURRENCY }, worker));
  } finally {
    queue.forEach((id) => namesInFlight.delete(id));
  }
  return names;
}
