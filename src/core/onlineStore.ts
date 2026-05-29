/**
 * Online Steam Store data — wishlist + price/discount. Opt-in, demand-driven,
 * single-flight per feature, cached in localStorage with explicit TTLs.
 * Returns null when offline + cache empty; callers treat null as "hidden".
 */

import { call } from "../shims/decky-api";
import { logInfo, logWarn } from "../runtime/logger";

const WISHLIST_KEY = "ds-wishlist-cache-v1";
const PRICE_KEY = "ds-price-cache-v1";
const WISHLIST_TTL = 24 * 60 * 60 * 1000;
const PRICE_TTL = 6 * 60 * 60 * 1000;

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

/**
 * Returns wishlist appids for the current user, or null if unavailable.
 *
 * The Steam wishlist API (`store.steampowered.com/wishlist/id/…`) is blocked
 * by CORS in the SharedJSContext (different origin). The fetch is routed
 * through the plugin's Python backend (`get_wishlist` in main.py), which
 * runs without browser CORS restrictions and uses urllib.request directly.
 */
export async function getWishlistIds(): Promise<number[] | null> {
  const cached = readCache<WishlistCache>(WISHLIST_KEY, WISHLIST_TTL);
  if (cached) return cached.ids;

  if (wishlistInFlight) return wishlistInFlight;

  wishlistInFlight = (async () => {
    try {
      if (Date.now() < (backoffUntil[WISHLIST_KEY] ?? 0)) return null;
      // No isOnline() guard — the Python backend handles its own connectivity.

      // Get the community profile URL from Steam's URL store.
      // The shape is urlStore.m_steamUrls.userwishlist.url =
      // "https://steamcommunity.com/id/{vanity}/wishlist/" (or /profiles/{id64}/).
      let communityUrl = "";
      try {
        const wl = (globalThis as any).urlStore?.m_steamUrls?.userwishlist
                ?? (globalThis as any).urlStore?.m_steamUrls?.UserWishlist;
        if (wl?.url) communityUrl = String(wl.url);
        else if (typeof wl === "string") communityUrl = wl;
      } catch {}
      if (!communityUrl) {
        logWarn("ONLINE", "wishlist: could not locate community URL");
        return null;
      }

      // Route through Python backend to bypass CORS.
      const resp = await call("get_wishlist", { community_url: communityUrl }) as any;
      if (!resp?.ok || !Array.isArray(resp.ids)) {
        logWarn("ONLINE", "wishlist backend error", resp?.error ?? "unknown");
        return null;
      }
      const ids = (resp.ids as unknown[]).map(Number).filter(Number.isFinite);
      if (!ids.length) return null;
      writeCache<WishlistCache>(WISHLIST_KEY, { ids });
      logInfo("ONLINE", "wishlist fetched via backend", { count: ids.length });
      return ids;
    } catch (e) {
      logWarn("ONLINE", "wishlist fetch failed", String(e));
      return null;
    } finally {
      wishlistInFlight = null;
    }
  })();

  return wishlistInFlight;
}

// ── Steam Store browse ────────────────────────────────────────────────────────

const STORE_KEY = "ds-store-cache-v1";
const STORE_TTL = 6 * 60 * 60 * 1000; // 6h

let storeInFlight: Promise<number[] | null> | null = null;

/**
 * Returns a broad set of appids from the Steam Store (featured/popular +
 * currently on-sale games). Accessible from the browser — no CORS restriction
 * for the public search JSON endpoint. Appids are extracted from item logo URLs.
 * 6-hour cache (`ds-store-cache-v1`).
 *
 * Callers that apply a `discount` childFilter should also call
 * `getPriceMap(ids)` before evaluating the filter so the price cache is warm.
 */
export async function getStoreGameIds(): Promise<number[] | null> {
  const cached = readCache<{ ids: number[] }>(STORE_KEY, STORE_TTL);
  if (cached) return cached.ids;

  if (storeInFlight) return storeInFlight;

  storeInFlight = (async () => {
    try {
      // Fetch specials (on-sale), free games, and popular/featured in parallel.
      // Promise.allSettled handles individual request failures so a single
      // timeout or error doesn't block the other two fetches.
      // Including maxprice=free ensures "free now" shelves find free games.
      const withTimeout = (url: string, ms = 6000) => {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), ms);
        return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(tid));
      };
      const [specialsResp, freeResp, popularResp] = await Promise.allSettled([
        withTimeout("https://store.steampowered.com/search/results/?specials=1&json=1&count=500&cc=us"),
        withTimeout("https://store.steampowered.com/search/results/?maxprice=free&json=1&count=200&cc=us"),
        withTimeout("https://store.steampowered.com/search/results/?json=1&count=100&cc=us"),
      ]);

      const ids = new Set<number>();
      const nameMap = new Map<number, string>();
      for (const result of [specialsResp, freeResp, popularResp]) {
        if (result.status !== "fulfilled") continue;
        const resp = result.value;
        if (!resp.ok) continue;
        const ct = resp.headers.get("content-type") ?? "";
        if (!ct.includes("json")) continue;
        const json = await resp.json();
        const items: Array<{ name?: string; logo?: string }> = json?.items ?? [];
        for (const item of items) {
          const m = item?.logo?.match(/\/apps\/(\d+)\//);
          if (m) {
            const id = Number(m[1]);
            if (Number.isFinite(id) && id > 0) {
              ids.add(id);
              // Cache name from search response — avoids needing api/appdetails
              if (item.name) nameMap.set(id, item.name);
            }
          }
        }
      }

      const result = [...ids];
      if (!result.length) return null;
      writeCache(STORE_KEY, { ids: result });
      // Persist extracted names so Shelf.tsx can display them immediately.
      if (nameMap.size) {
        try {
          const existing: Record<number, string> = JSON.parse(
            (globalThis as any).localStorage?.getItem?.("ds-game-name-cache-v1") || "{}"
          );
          nameMap.forEach((v, k) => { existing[k] = v; });
          (globalThis as any).localStorage?.setItem?.("ds-game-name-cache-v1", JSON.stringify(existing));
        } catch {}
      }
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

function readPriceCache(appid: number): PriceData | null {
  try {
    const raw = localStorage.getItem(PRICE_KEY);
    if (!raw) return null;
    const cache: PriceCache = JSON.parse(raw);
    const entry = cache[appid];
    if (entry && Date.now() - entry.ts < PRICE_TTL) return entry.data;
  } catch {}
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
    localStorage.setItem(PRICE_KEY, JSON.stringify(cache));
  } catch {}
}

/**
 * Fetches price/discount data for a batch of appids.
 * Returns a map appid → PriceData. Missing entries mean "no data" (free game
 * without a price_overview, region block, etc.) — callers should treat null as
 * free / unknown.
 */
export async function getPriceMap(appids: number[]): Promise<Map<number, PriceData>> {
  const result = new Map<number, PriceData>();
  if (!appids.length) return result;

  const toFetch: number[] = [];
  for (const id of appids) {
    const c = readPriceCache(id);
    if (c) { result.set(id, c); } else { toFetch.push(id); }
  }
  if (!toFetch.length) return result;

  try {
    if (Date.now() < (backoffUntil[PRICE_KEY] ?? 0)) return result;

    // Fetch budget is bounded by `deadline` below — the per-call cap was
    // raised from 200 to 800 so store-source resolves with a discount
    // filter (e.g. "100% off" / "Free now") actually cover the full
    // specials list. Past 200, otherwise-promoted-free games slipped
    // through uncached and the discount filter rejected them.
    const limited = toFetch.slice(0, 800);

    const BATCH = 50;
    const deadline = Date.now() + 8000; // 8 s total budget for all batches
    for (let i = 0; i < limited.length; i += BATCH) {
      if (Date.now() > deadline) break;
      const batch = limited.slice(i, i + BATCH);
      const url = `https://store.steampowered.com/api/appdetails?appids=${batch.join(",")}&filters=price_overview`;
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 5000);
      let resp: Response;
      try { resp = await fetch(url, { credentials: "include", signal: ac.signal }); }
      finally { clearTimeout(tid); }
      if (resp.status === 429) {
        backoffUntil[PRICE_KEY] = Date.now() + 60 * 60 * 1000;
        break;
      }
      if (!resp.ok) break;
      const ct = resp.headers.get("content-type") ?? "";
      if (!ct.includes("json")) break;
      const json = await resp.json();

      for (const appid of batch) {
        const entry = json?.[appid];
        if (!entry?.success) {
          // Steam returned `success: false` — record a negative entry so
          // we don't re-issue this fetch every resolve. Same effect as
          // "no price_overview" downstream.
          const data: PriceData = { price: 0, originalPrice: 0, discount: 0, currency: "USD", isFree: false, unpriced: true };
          result.set(appid, data);
          writePriceCacheEntry(appid, data);
          continue;
        }
        const po = entry.data?.price_overview;
        if (!po) {
          // Permanently free / region-blocked — also cached as negative
          // entry. Avoids the "first 200 always re-fetched" pattern when
          // the store source returns many F2P games.
          const data: PriceData = { price: 0, originalPrice: 0, discount: 0, currency: "USD", isFree: true, unpriced: true };
          result.set(appid, data);
          writePriceCacheEntry(appid, data);
          continue;
        }
        const data: PriceData = {
          price: po.final ?? 0,
          originalPrice: po.initial ?? po.final ?? 0,
          discount: po.discount_percent ?? 0,
          currency: po.currency ?? "USD",
          isFree: false,
        };
        result.set(appid, data);
        writePriceCacheEntry(appid, data);
      }
    }
  } catch (e) {
    logWarn("ONLINE", "price fetch failed", String(e));
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
    const url = `https://store.steampowered.com/api/appdetails?appids=${batch.join(',')}&l=english`;
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
