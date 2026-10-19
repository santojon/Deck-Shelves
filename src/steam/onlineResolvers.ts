import { type AppOverview, appIdOf } from "./appOverview";
import type { FilterGroup, FilterItem, Settings } from "../types";
import type { LooseSource, ResolverContext } from "./resolverContext";
import { applySortToIds } from "./sorting";
import { evaluateFilterItem } from "./filterEval";
import { getLocalLibraryAppIds } from "./localLibrary";
import { logInfo, logWarn } from "../runtime/logger";
import { isOnlineEnabledForSettings, prefetchCatalogFilterData } from "./resolveShared";

/* The wishlist and store sources: owned-game hiding, child filters (price, catalog) and price sorts over the online results. */

async function applyPriceSort(ids: number[], sort: "price_low" | "discount_high" | "original_price_high", reverse?: boolean): Promise<number[]> {
  try {
    const { getPriceMap } = await import("../core/onlineStore");
    const priceMap = await getPriceMap(ids);
    const sorted = ids.slice().sort((a, b) => {
      const pa = priceMap.get(a);
      const pb = priceMap.get(b);
      if (sort === "price_low") {
        const va = pa ? pa.price : 999999;
        const vb = pb ? pb.price : 999999;
        return va - vb;
      } else if (sort === "original_price_high") {
        const va = pa ? pa.originalPrice : 0;
        const vb = pb ? pb.originalPrice : 0;
        return vb - va;
      } else {
        const va = pa ? pa.discount : 0;
        const vb = pb ? pb.discount : 0;
        return vb - va;
      }
    });
    return reverse ? sorted.reverse() : sorted;
  } catch {
    return ids;
  }
}

type WishlistHideFlags = { hideOwned: boolean; hideOwnedNonSteam: boolean; hideOwnedNonSteamCloud: boolean };

function resolveCloudHideFlag(source: LooseSource | null | undefined, s: Settings | null | undefined, hideOwnedNonSteam: boolean): boolean {
  if (!hideOwnedNonSteam) return false;
  const perShelf = source?.hideOwnedNonSteamCloud;
  if (perShelf === true) return true;
  if (perShelf === undefined) return s?.onlineHideOwnedNonSteamCloud === true;
  return false;
}

function computeWishlistHideFlags(source: LooseSource | null | undefined, s: Settings | null | undefined): WishlistHideFlags {
  const globalHideOwned = s?.onlineHideOwnedGames === true;
  const globalHideNonSteam = s?.onlineHideOwnedNonSteam === true;
  const srcExcludeOwned = source?.excludeOwned === true;
  const srcExcludeNonSteam = srcExcludeOwned && source?.excludeOwnedNonSteam === true;
  const hideOwned = globalHideOwned || srcExcludeOwned;
  const hideOwnedNonSteam = hideOwned && ((globalHideOwned && globalHideNonSteam) || srcExcludeNonSteam);
  const hideOwnedNonSteamCloud = resolveCloudHideFlag(source, s, hideOwnedNonSteam);
  return { hideOwned, hideOwnedNonSteam, hideOwnedNonSteamCloud };
}

export const PRICE_SORT_KEYS = new Set(["price_low", "discount_high", "original_price_high"]);

// Pure catalog/store metadata (not personal play-history) — meaningful for
// any appid, owned or not, once fetched via getCatalogMetaMap.
const CATALOG_FILTER_TYPES = new Set(["genres", "categories", "franchise", "vrSupport", "multiplayerType"]);

async function applyWishlistChildFilter(ids: number[], childFilter: FilterGroup | null | undefined, all: AppOverview[]): Promise<number[]> {
  if (!childFilter || !Array.isArray(childFilter.items) || childFilter.items.length === 0) return ids;
  const hasPriceFilter = childFilter.items.some((item) => item.type === "discount" || item.type === "priceRange");
  if (hasPriceFilter) {
    const { getPriceMap } = await import("../core/onlineStore");
    await getPriceMap(ids);
  }
  const byId = new Map(all.map((a) => [appIdOf(a), a] as const));
  await prefetchCatalogFilterData(childFilter.items, ids, byId);
  return ids.filter((id) => {
    const app = byId.get(id);
    return childFilter.items.every((item) => evaluateWishlistChildItem(item, id, app));
  });
}

function evaluateWishlistChildItem(item: FilterItem, id: number, app: AppOverview | undefined): boolean {
  // Price-cache filters (discount / priceRange) only need the appid, so a store
  // game absent from the local library must still be checked against the cache —
  // never waved through, or unowned/free titles leak past a price bound.
  if (item.type === "discount" || item.type === "priceRange") return evaluateFilterItem(item, { appid: id } as any, undefined);
  // Catalog filters read v3Extensions' rawField, which falls back to fetched
  // Store metadata for ids not in `all` — a bare `{ appid }` is enough.
  if (CATALOG_FILTER_TYPES.has(item.type)) return evaluateFilterItem(item, (app ?? { appid: id }) as any, undefined);
  if (!app) return true; // personal/play-history filters don't apply to unowned items
  return evaluateFilterItem(item, app, undefined);
}

async function applyWishlistSort(
  ids: number[],
  sort: string | string[] | undefined,
  sortReverse: boolean | boolean[] | undefined,
  all: AppOverview[],
  shelfId: string | undefined,
  getPriceMap: (ids: number[]) => Promise<ReadonlyMap<number, { price: number; originalPrice: number; discount: number }>>,
): Promise<number[]> {
  if (!sort) return ids;
  if (!Array.isArray(sort) && PRICE_SORT_KEYS.has(sort)) {
    const reverse = Array.isArray(sortReverse) ? !!sortReverse[0] : sortReverse;
    return applyPriceSort(ids, sort as "price_low" | "discount_high" | "original_price_high", reverse);
  }
  // Multi-key / single non-price: sort the local subset, leave remote
  // ids at the tail in wishlist order. Pre-fetch prices only if needed.
  const sortKeys: string[] = Array.isArray(sort) ? sort : [sort];
  const hasPriceKey = sortKeys.some((k) => PRICE_SORT_KEYS.has(k));
  const localPriceMap = hasPriceKey ? await getPriceMap(ids) : undefined;
  const byId = new Map(all.map((a) => [appIdOf(a), a] as const));
  const pool: AppOverview[] = ids.map((id) => byId.get(id) ?? ({ appid: id } as unknown as AppOverview));
  return applySortToIds(ids, sort, pool, shelfId, sortReverse, localPriceMap);
}

export async function _resolveWishlist(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit } = ctx;
  try {
    const { getCurrentSettings } = await import("../store/settingsStore");
    const { getWishlistIds, getPriceMap } = await import("../core/onlineStore");
    const s = getCurrentSettings();
    const onlineEnabled = isOnlineEnabledForSettings(s);
    if (!onlineEnabled || s?.onlineWishlistEnabled === false) {
      logInfo("STEAM", "resolveShelfAppIds(wishlist) skipped", { onlineEnabled, wishlistEnabled: s?.onlineWishlistEnabled !== false });
      return [];
    }
    const wishlistIds = await getWishlistIds();
    if (!wishlistIds) {
      logInfo("STEAM", "resolveShelfAppIds(wishlist) no wishlist ids");
      return [];
    }

    const flags = computeWishlistHideFlags(source, s);
    const ownedSet = flags.hideOwned
      ? getLocalLibraryAppIds(flags.hideOwnedNonSteam, flags.hideOwnedNonSteamCloud)
      : new Set<number>();
    let ids = flags.hideOwned ? wishlistIds.filter((id) => !ownedSet.has(id)) : [...wishlistIds];
    ids = await applyWishlistChildFilter(ids, (source as any).childFilter, all);
    ids = await applyWishlistSort(ids, sort, sortReverse, all, shelfId, getPriceMap);
    logInfo("STEAM", "resolveShelfAppIds(wishlist) resolved", { count: ids.length });
    return finish(ids.slice(0, overShootLimit));
  } catch (e) {
    logWarn("STEAM", "resolveShelfAppIds(wishlist) failed", String(e));
    return [];
  }
}

export async function _resolveStore(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit } = ctx;
  try {
    const { getCurrentSettings } = await import("../store/settingsStore");
    const { getStoreGameIds, getPriceMap } = await import("../core/onlineStore");
    const s = getCurrentSettings();
    const onlineEnabled = isOnlineEnabledForSettings(s);
    if (!onlineEnabled) return [];
    let ids = await getStoreGameIds();
    if (!ids) return [];

    const flags = computeWishlistHideFlags(source, s);
    if (flags.hideOwned) {
      const ownedSetStore = getLocalLibraryAppIds(flags.hideOwnedNonSteam, flags.hideOwnedNonSteamCloud);
      ids = ids.filter((id) => !ownedSetStore.has(id));
    }
    ids = await applyWishlistChildFilter(ids, (source as any).childFilter, all);
    ids = await applyWishlistSort(ids, sort, sortReverse, all, shelfId, getPriceMap);
    logInfo("STEAM", "resolveShelfAppIds(store) resolved", { count: ids.length });
    return finish(ids.slice(0, overShootLimit));
  } catch (e) {
    logWarn("STEAM", "resolveShelfAppIds(store) failed", String(e));
    return [];
  }
}
