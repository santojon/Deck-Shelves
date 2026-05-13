/**
 * Online Steam Store data — wishlist + price/discount.
 *
 * All fetches are opt-in (gated by onlineFeaturesEnabled in settings), demand-
 * driven (never polled), single-flight per feature type, and locally cached in
 * localStorage with explicit TTLs.
 *
 * Offline degradation: functions return null when the device is offline and the
 * cache is empty or expired. Callers treat null as "hidden" — the shelf is
 * omitted from the home screen rather than rendered broken.
 */

import { isOnline } from "./connectivity";
import { logInfo, logWarn } from "../runtime/logger";

// Cache keys and TTLs
const WISHLIST_KEY = "ds-wishlist-cache-v1";
const PRICE_KEY = "ds-price-cache-v1";
const WISHLIST_TTL = 24 * 60 * 60 * 1000;
const PRICE_TTL = 6 * 60 * 60 * 1000;

// Backoff state for rate-limit handling
const backoffUntil: Record<string, number> = {};

function getSteamId(): string | null {
  try {
    const id = (globalThis as any).SteamClient?.User?.GetSteamID?.()
      ?? (globalThis as any).App?.GetCurrentUser?.()?.strSteamID
      ?? (globalThis as any).SteamClient?.User?.GetLoginUsers?.()[0]?.strSteamLogin;
    return id ? String(id) : null;
  } catch { return null; }
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

// ── Wishlist ──────────────────────────────────────────────────────────────────

interface WishlistCache { ids: number[] }

let wishlistInFlight: Promise<number[] | null> | null = null;

/** Returns wishlist appids for the current user, or null if unavailable. */
export async function getWishlistIds(): Promise<number[] | null> {
  const cached = readCache<WishlistCache>(WISHLIST_KEY, WISHLIST_TTL);
  if (cached) return cached.ids;

  if (wishlistInFlight) return wishlistInFlight;

  wishlistInFlight = (async () => {
    try {
      if (!(await isOnline())) return null;
      if (Date.now() < (backoffUntil[WISHLIST_KEY] ?? 0)) return null;

      // Prefer the internal wishlist URL from the Steam URL store when available.
      let url: string | null = null;
      try {
        const u = (globalThis as any).urlStore?.m_steamUrls?.UserWishlist;
        if (typeof u === "string" && u.startsWith("http")) url = u;
      } catch {}
      if (!url) {
        const steamId = getSteamId();
        if (!steamId) return null;
        url = `https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/?p=0`;
      }

      const resp = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      if (resp.status === 429) {
        backoffUntil[WISHLIST_KEY] = Date.now() + 60 * 60 * 1000;
        return readCache<WishlistCache>(WISHLIST_KEY, Infinity)?.ids ?? null;
      }
      if (!resp.ok) return null;
      const ct = resp.headers.get("content-type") ?? "";
      if (!ct.includes("json")) return null; // HTML = session expired

      const json = await resp.json();
      // Steam returns { "<appid>": { priority, added, ... }, ... }
      const ids = Object.keys(json ?? {}).map(Number).filter(Number.isFinite);
      if (!ids.length) return null;
      writeCache<WishlistCache>(WISHLIST_KEY, { ids });
      logInfo("ONLINE", "wishlist fetched", { count: ids.length });
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

// ── Prices ────────────────────────────────────────────────────────────────────

export interface PriceData {
  price: number;        // final price in cents (0 = free)
  originalPrice: number;
  discount: number;     // 0–100
  currency: string;
  isFree: boolean;
}

type PriceCache = Record<number, { ts: number; data: PriceData }>;

let priceInFlight = new Map<number, Promise<PriceData | null>>();

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
    if (!(await isOnline())) return result;
    if (Date.now() < (backoffUntil[PRICE_KEY] ?? 0)) return result;

    // Steam API: max 50 ids per request
    const BATCH = 50;
    for (let i = 0; i < toFetch.length; i += BATCH) {
      const batch = toFetch.slice(i, i + BATCH);
      const url = `https://store.steampowered.com/api/appdetails?appids=${batch.join(",")}&filters=price_overview`;
      const resp = await fetch(url, { credentials: "include" });
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
        if (!entry?.success) continue;
        const po = entry.data?.price_overview;
        if (!po) continue;
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
