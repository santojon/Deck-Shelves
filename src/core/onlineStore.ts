
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

export async function getWishlistIds(): Promise<number[] | null> {
  const cached = readCache<WishlistCache>(WISHLIST_KEY, WISHLIST_TTL);
  if (cached) return cached.ids;

  if (wishlistInFlight) return wishlistInFlight;

  wishlistInFlight = (async () => {
    try {
      if (Date.now() < (backoffUntil[WISHLIST_KEY] ?? 0)) {
        // In backoff: serve stale cache rather than hang the resolver.
        return readWishlistCacheAny()?.ids ?? null;
      }
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
        return readWishlistCacheAny()?.ids ?? null;
      }

      // Route through Python backend to bypass CORS. Hard 6 s timeout so
      // a hung Decky RPC can't park composite/wishlist resolves forever.
      const resp = await rpcWithTimeout<any>("get_wishlist", { community_url: communityUrl }, 6000);
      if (!resp?.ok || !Array.isArray(resp.ids)) {
        logWarn("ONLINE", "wishlist backend error", resp?.error ?? "unknown");
        return readWishlistCacheAny()?.ids ?? null;
      }
      const ids = (resp.ids as unknown[]).map(Number).filter(Number.isFinite);
      if (!ids.length) return readWishlistCacheAny()?.ids ?? null;
      writeCache<WishlistCache>(WISHLIST_KEY, { ids });
      logInfo("ONLINE", "wishlist fetched via backend", { count: ids.length });
      return ids;
    } catch (e) {
      logWarn("ONLINE", "wishlist fetch failed", String(e));
      // Soft-backoff for 10 min so the next resolve doesn't immediately
      // retry the same hung RPC.
      backoffUntil[WISHLIST_KEY] = Date.now() + 10 * 60 * 1000;
      return readWishlistCacheAny()?.ids ?? null;
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

function replayPriceHints(hints: Array<{ id: number; original: number; final: number }> | undefined): void {
  if (!Array.isArray(hints) || !hints.length) return;
  for (const h of hints) {
    if (!h || typeof h.id !== "number" || h.id <= 0) continue;
    const op = Number(h.original) || 0;
    const fp = Number(h.final) || 0;
    if (op <= 0) continue;
    const discPct = Math.max(0, Math.min(100, Math.round(((op - fp) / op) * 100)));
    const price: PriceData = {
      price: fp,
      originalPrice: op,
      discount: discPct,
      currency: "USD",
      isFree: false,
    };
    try { writePriceCacheEntry(h.id, price); } catch {}
  }
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
      // Fetch specials (on-sale), free games, and popular/featured in parallel.
      // Promise.allSettled handles individual request failures so a single
      // timeout or error doesn't block the other two fetches.
      // Including maxprice=free ensures "free now" shelves find free games.
      const withTimeout = (url: string, ms = 6000) => {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), ms);
        return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(tid));
      };
      // Coverage: parallel fetch across seven endpoints because no
      // single one catches every currently-free title.
      const [
        specialsP1Resp, specialsP2Resp, specialsP3Resp,
        freeResp, freeWeekendIntersectionResp, freeWeekendCategoryResp,
        popularResp,
      ] = await Promise.allSettled([
        withTimeout("https://store.steampowered.com/search/results/?specials=1&json=1&count=100&start=0&cc=us"),
        withTimeout("https://store.steampowered.com/search/results/?specials=1&json=1&count=100&start=100&cc=us"),
        withTimeout("https://store.steampowered.com/search/results/?specials=1&json=1&count=100&start=200&cc=us"),
        withTimeout("https://store.steampowered.com/search/results/?maxprice=free&json=1&count=200&cc=us"),
        withTimeout("https://store.steampowered.com/search/results/?specials=1&maxprice=free&json=1&count=200&cc=us"),
        withTimeout("https://store.steampowered.com/search/results/?category2=18&json=1&count=200&cc=us"),
        withTimeout("https://store.steampowered.com/search/results/?json=1&count=100&cc=us"),
      ]);

      const ids = new Set<number>();
      const nameMap = new Map<number, string>();
      const priceHints: Array<{ id: number; original: number; final: number }> = [];
      for (const result of [
        specialsP1Resp, specialsP2Resp, specialsP3Resp,
        freeResp, freeWeekendIntersectionResp, freeWeekendCategoryResp,
        popularResp,
      ]) {
        if (result.status !== "fulfilled") continue;
        const resp = result.value;
        if (!resp.ok) continue;
        const ct = resp.headers.get("content-type") ?? "";
        if (!ct.includes("json")) continue;
        const json = await resp.json();
        // Each item carries `final_price` / `original_price` (cents) /
        // `discounted` (bool) in addition to `name` + `logo`. Capturing
        // these lets us pre-populate the price cache so a "100% off" /
        // "Free now" discount filter has real data without waiting on a
        // secondary api/appdetails fetch (which often returns success:false
        // for free-weekend titles → cached unpriced → filter excludes them).
        const items: Array<{ name?: string; logo?: string; final_price?: number; original_price?: number; discounted?: boolean }> = json?.items ?? [];
        for (const item of items) {
          const m = item?.logo?.match(/\/apps\/(\d+)\//);
          if (m) {
            const id = Number(m[1]);
            if (Number.isFinite(id) && id > 0) {
              ids.add(id);
              if (item.name) nameMap.set(id, item.name);
              // Capture price hint from the search row (catches free-
              // weekend titles that api/appdetails would miss). Skip
              // permanently-free games — getPriceMap handles those.
              const op = typeof item.original_price === "number" ? item.original_price : 0;
              const fp = typeof item.final_price === "number" ? item.final_price : 0;
              if (op > 0) {
                priceHints.push({ id, original: op, final: fp });
              }
            }
          }
        }
      }

      const result = [...ids];
      if (!result.length) return null;
      writeCache<StoreCacheV2>(STORE_KEY, { ids: result, priceHints });
      // Also apply hints immediately on the cold path so the next
      // getPriceMap call inside this resolve cycle sees fresh data.
      replayPriceHints(priceHints);
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
