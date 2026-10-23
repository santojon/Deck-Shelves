import type { SteamHostWindow } from "./internals";
import { applyExternalSort, hasExternalSortOption, toPublicAppMeta } from "../core/pluginApi";
import { getSteamWindows } from "./steamAccess";
import { type AppOverview, appIdOf, appNameOf, compareByAdded, lastPlayedOf } from "./appOverview";

/* Shelf ordering: the per-key comparators, multi-key and price sorts, the stable random shuffle, and the manual order. */

// Random sort is stable for 24h per unique game set to avoid constant reshuffling.
const RANDOM_SORT_TTL = 24 * 60 * 60 * 1000;

export function hashIdSet(ids: number[]): string {
  const sorted = ids.slice().sort((a, b) => a - b);
  let h = 5381;
  for (const id of sorted) { h = ((h << 5) + h + (id & 0xffff)) & 0xffffffff; }
  return (h >>> 0).toString(16);
}

export function stableShuffleIds(ids: number[], cacheKey: string, shelfId?: string): number[] {
  // Per-shelf namespacing so two shelves with the same id set get
  // independent shuffles; legacy global key when shelfId is omitted.
  const lsKey = shelfId ? `ds-random-${shelfId}-${cacheKey}` : `ds-random-${cacheKey}`;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const { ts, order } = JSON.parse(raw);
      if (Date.now() - ts < RANDOM_SORT_TTL && Array.isArray(order)) {
        const outSet = new Set<number>(order);
        if (order.length === ids.length && ids.every(id => outSet.has(id))) return order;
      }
    }
  } catch {}
  const shuffled = ids.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  try { localStorage.setItem(lsKey, JSON.stringify({ ts: Date.now(), order: shuffled })); } catch {}
  return shuffled;
}

export function invalidateRandomSortCache(shelfId?: string): void {
  try {
    const prefix = shelfId ? `ds-random-${shelfId}-` : `ds-random-`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {}
}

export function applyManualOrder(ids: number[], manualOrder?: number[], hiddenAppIds?: number[]): number[] {
  if (!manualOrder?.length) return ids;
  // In-source entries lead (drag-order); source items not drag-ordered
  // follow; entries the source doesn't cover (e.g. via "Add to shelf"
  // menu) go at the end. Hidden entries dropped from both branches.
  const hidden = hiddenAppIds?.length ? new Set(hiddenAppIds) : null;
  const idSet = new Set(ids);
  const inSource: number[] = [];
  const notInSource: number[] = [];
  const seen = new Set<number>();
  for (const id of manualOrder) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (hidden && hidden.has(id)) continue;
    if (idSet.has(id)) inSource.push(id);
    else notInSource.push(id);
  }
  const rest = ids.filter((id) => !seen.has(id));
  return [...inSource, ...rest, ...notInSource];
}

// Comparator for a single sort key. Returns null for `manual`/`random`
// so the multi-key path drops them. Price keys use the pre-warmed
// priceMap passed in by the caller.
type PriceMap = ReadonlyMap<number, { price: number; originalPrice: number; discount: number }>;

type Cmp = (a: AppOverview, b: AppOverview) => number;

const KEY_COMPARATOR_BUILDERS: Record<string, () => Cmp> = {
  recent: () => (a, b) => lastPlayedOf(b) - lastPlayedOf(a),
  playtime: () => (a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0),
  release_date: () => (a, b) => (b.rt_original_release_date ?? 0) - (a.rt_original_release_date ?? 0),
  size_on_disk: () => (a, b) => Number(b.size_on_disk ?? 0) - Number(a.size_on_disk ?? 0),
  metacritic: () => (a, b) => (b.metacritic_score ?? 0) - (a.metacritic_score ?? 0),
  review_score: () => (a, b) => (b.review_percentage ?? 0) - (a.review_percentage ?? 0),
  added: () => compareByAdded,
  app_status: () => (a, b) => (a.display_status ?? 0) - (b.display_status ?? 0),
  deck_compat: () => (a, b) => (b.deck_compatibility_category ?? 0) - (a.deck_compatibility_category ?? 0),
  controller_support: () => (a, b) => (b.controller_support ?? 0) - (a.controller_support ?? 0),
};

function priceComparator(key: string, priceMap: PriceMap): Cmp {
  if (key === "price_low") return (a, b) => {
    const pa = priceMap.get(appIdOf(a)); const pb = priceMap.get(appIdOf(b));
    return (pa ? pa.price : 999999) - (pb ? pb.price : 999999);
  };
  if (key === "discount_high") return (a, b) => {
    const pa = priceMap.get(appIdOf(a)); const pb = priceMap.get(appIdOf(b));
    return (pb ? pb.discount : 0) - (pa ? pa.discount : 0);
  };
  return (a, b) => {
    const pa = priceMap.get(appIdOf(a)); const pb = priceMap.get(appIdOf(b));
    return (pb ? pb.originalPrice : 0) - (pa ? pa.originalPrice : 0);
  };
}

const alphaCmp: Cmp = (a, b) =>

  String(a.sort_as ?? appNameOf(a)).localeCompare(String(b.sort_as ?? appNameOf(b)));

function buildBaseComparator(key: string, priceMap?: PriceMap): Cmp {
  const builder = KEY_COMPARATOR_BUILDERS[key];
  if (builder) return builder();
  if (key === "price_low" || key === "discount_high" || key === "original_price_high") {
    return priceMap ? priceComparator(key, priceMap) : alphaCmp;
  }
  /* first-party Sort v3 comparators (v3Extensions.ts) aren't in
     KEY_COMPARATOR_BUILDERS above — without this, any multi-key chain using a
     v3-only id (most_friends_owning, owned_games, ...) silently degrades to alphabetical. */
  try {
    const { SORT_V3_COMPARATORS } = require("./v3Extensions") as typeof import("./v3Extensions");
    const v3 = SORT_V3_COMPARATORS[key];
    if (v3) return v3;
  } catch { /* fall through */ }
  // alphabetical OR unknown external key — degrade to alphabetical.
  return alphaCmp;
}

function buildKeyComparator(key: string, isReversed: boolean, priceMap?: PriceMap): Cmp | null {
  if (key === "manual" || key === "random") return null;
  const base = buildBaseComparator(key, priceMap);
  if (!isReversed) return base;
  return (a, b) => -base(a, b);
}

function readAppOverviewFromWindow(win: SteamHostWindow, id: number): AppOverview | null {
  try {
    const raw = win?.appStore?.GetAppOverviewByAppID?.(id)
      ?? win?.AppStore?.GetAppOverviewByAppID?.(id);
    return raw ?? null;
  } catch { return null; }
}

export function sortPoolLookup(id: number): AppOverview | null {
  for (const win of getSteamWindows()) {
    const raw = readAppOverviewFromWindow(win, id);
    if (raw) return raw;
  }
  return null;
}

function buildSortByIdMap(all: AppOverview[]): Map<number, AppOverview> {
  const byId = new Map<number, AppOverview>();
  for (const app of all) {
    const id = appIdOf(app);
    if (id && Number.isFinite(id)) byId.set(id, app);
  }
  return byId;
}

// Per-id raw lookup for ids missing from `all` — without this, owned
// ids that fell out of the lean `all` would silently disappear.
function hydrateAppsForSort(ids: number[], byId: Map<number, AppOverview>): AppOverview[] {
  return ids.map((id) => byId.get(id) ?? sortPoolLookup(id) ?? ({ appid: id } as unknown as AppOverview)) as AppOverview[];
}

function applyMultiKeySort(
  ids: number[],
  keys: string[],
  all: AppOverview[],
  shelfId: string | undefined,
  reverse: boolean | boolean[] | undefined,
  priceMap: ReadonlyMap<number, { price: number; originalPrice: number; discount: number }> | undefined,
): number[] {
  if (keys.length === 1) {
    const r = Array.isArray(reverse) ? !!reverse[0] : reverse;
    return applySortToIds(ids, keys[0], all, shelfId, r, priceMap);
  }
  const comparators: ((a: AppOverview, b: AppOverview) => number)[] = [];
  keys.forEach((k, i) => {
    const r = Array.isArray(reverse) ? !!reverse[i] : !!reverse;
    const cmp = buildKeyComparator(k, r, priceMap);
    if (cmp) comparators.push(cmp);
  });
  if (comparators.length === 0) return ids.slice();
  const apps = hydrateAppsForSort(ids, buildSortByIdMap(all));
  apps.sort((a, b) => {
    for (const cmp of comparators) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });
  return apps.map((a) => appIdOf(a)).filter(Number.isFinite);
}

function alphaCompare(a: AppOverview, b: AppOverview): number {
  return String(a.sort_as ?? appNameOf(a)).localeCompare(String(b.sort_as ?? appNameOf(b)));
}

type AppComparator = (a: AppOverview, b: AppOverview) => number;

const SINGLE_SORT_COMPARATORS: Record<string, AppComparator> = {
  recent: (a, b) => lastPlayedOf(b) - lastPlayedOf(a),
  playtime: (a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0),
  release_date: (a, b) => (b.rt_original_release_date ?? 0) - (a.rt_original_release_date ?? 0),
  size_on_disk: (a, b) => Number(b.size_on_disk ?? 0) - Number(a.size_on_disk ?? 0),
  metacritic: (a, b) => (b.metacritic_score ?? 0) - (a.metacritic_score ?? 0),
  review_score: (a, b) => (b.review_percentage ?? 0) - (a.review_percentage ?? 0),
  added: compareByAdded,
  app_status: (a, b) => (a.display_status ?? 0) - (b.display_status ?? 0),
  deck_compat: (a, b) => (b.deck_compatibility_category ?? 0) - (a.deck_compatibility_category ?? 0),
  controller_support: (a, b) => (b.controller_support ?? 0) - (a.controller_support ?? 0),
  alphabetical: alphaCompare,
  price_low: alphaCompare,
  discount_high: alphaCompare,
  original_price_high: alphaCompare,
};

function sortByExternalOrRandom(
  sort: string,
  ids: number[],
  apps: AppOverview[],
  byId: Map<number, AppOverview>,
  shelfId?: string,
): AppOverview[] {
  if (sort === "random") {
    const shuffled = stableShuffleIds(ids, hashIdSet(ids), shelfId);
    return shuffled.map(id => byId.get(id)).filter(Boolean) as AppOverview[];
  }
  let externalIds: number[] | null = null;
  try {
    if (hasExternalSortOption(sort)) {
      externalIds = applyExternalSort(sort, ids, apps.map(toPublicAppMeta));
    }
  } catch {}
  if (externalIds) {
    const order = new Map(externalIds.map((id, idx) => [id, idx] as const));
    return apps.slice().sort((a, b) => (order.get(appIdOf(a)) ?? 1e9) - (order.get(appIdOf(b)) ?? 1e9));
  }
  return apps.slice().sort(alphaCompare);
}

export function applySortToIds(
  ids: number[],
  sort: string | string[],
  all: AppOverview[],
  shelfId?: string,
  reverse?: boolean | boolean[],
  priceMap?: ReadonlyMap<number, { price: number; originalPrice: number; discount: number }>,
): number[] {
  if (Array.isArray(sort)) {
    const keys = sort.filter((k) => typeof k === "string" && k.length > 0) as string[];
    if (keys.length === 0) return ids.slice();
    return applyMultiKeySort(ids, keys, all, shelfId, reverse, priceMap);
  }
  // Normalise to a strict boolean — a `[false]` 1-element array is truthy.
  const reverseBool: boolean = Array.isArray(reverse) ? !!reverse[0] : !!reverse;
  const byId = buildSortByIdMap(all);
  const baseApps = hydrateAppsForSort(ids, byId);
  // first-party Sort v3 comparators live in a
  // sibling module; lookup runs before the external-or-random
  // fallback so v3 ids take precedence over registered externals.
  let v3Cmp: ((a: AppOverview, b: AppOverview) => number) | undefined;
  try {
    const { SORT_V3_COMPARATORS } = require("./v3Extensions") as typeof import("./v3Extensions");
    v3Cmp = SORT_V3_COMPARATORS[sort];
  } catch {}
  const cmp = SINGLE_SORT_COMPARATORS[sort] ?? v3Cmp;
  let apps = cmp ? baseApps.slice().sort(cmp) : sortByExternalOrRandom(sort, ids, baseApps, byId, shelfId);
  // Skip reverse for `manual` and `random`.
  if (reverseBool && sort !== "manual" && sort !== "random") apps = apps.reverse();
  return apps.map((a) => appIdOf(a)).filter(Number.isFinite);
}
