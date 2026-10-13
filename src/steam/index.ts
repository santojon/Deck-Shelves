import { type AppOverview, appIdOf, appNameOf, isFavoriteOf, isHiddenOf, isInstalledOf, isNonSteamOf, lastPlayedOf } from "./appOverview";
import type { FilterGroup, FilterItem } from "../types";
import type { LooseSource, ResolverContext } from "./resolverContext";
import { type SteamCollectionLike, steamCollectionStore } from "./internals";
import { type TabMasterTab, findTabMasterContextValue, getTabAppIdsFromStore, listLibraryTabs, slugifyTab, tabIdFrom, tabNameFrom } from "./libraryTabs";
import { applySortToIds, sortPoolLookup } from "./sorting";
import { dedupeAppIdsByName } from "./dedupe";
import { evaluateFilterGroup } from "./filterEval";
import { extractAppIdsDeep, extractCollectionAppIds } from "./steamGraph";
import { getAdaptiveTimeout, recordDuration } from "../core/adaptiveTimeout";
import { getAllAppOverviews } from "./library";
import { getCollectionApps, listCollections, normalizeText } from "./collections";
import { getSteamClients, getSteamWindows, uniqNumbers } from "./steamAccess";
import { logInfo, logWarn } from "../runtime/logger";
import { withOnlineSwr } from "./onlineCache";
import { deduplicateNonSteam, enrichForSort, mergeCompositeResults } from "./resolveShared";
import { _resolveFilter } from "./filterResolver";
import { _resolveCollection, _resolveExternal } from "./collectionResolver";
import { PRICE_SORT_KEYS, _resolveStore, _resolveWishlist } from "./onlineResolvers";
import { _resolveSmart } from "./smartResolver";

// Moved into sibling modules by concern; re-exported so every importer keeps its path.
export { compareByAdded, normalizeAppOverview } from "./appOverview";
export type { AppOverview } from "./appOverview";
export { clearDeveloperCache, getAppDeveloperCached, getAppPublisherCached, getUniqueDevelopers, getUniquePublishers, preloadDeveloperData, preloadPublisherData } from "./publisherDeveloper";
export { evaluateFilterGroup, evaluateFilterItem } from "./filterEval";
export { applyManualOrder, applySortToIds, invalidateRandomSortCache } from "./sorting";
export { findTabMasterContextValue, getTabAppIdsFromStore, listLibraryTabs } from "./libraryTabs";
export { getLocalLibraryAppIds, getUnifideckCloudPlaySet, resolveAppInstalledState } from "./localLibrary";
export { enrichAppStateFlags, getAllAppOverviews, invalidateAppOverviewCache } from "./library";
export { listCollections, removeAppFromCollection } from "./collections";
export type { SteamCollection } from "./collections";
export { getAppMeta, getAppMetaBatch, getAppName } from "./appMeta";
export { invalidateOnlineResolveCache } from "./onlineCache";
export { mergeCompositeResults } from "./resolveShared";
export type { CustomFilter } from "./filterResolver";

// Keep the old name as an alias for the component that still uses it
export const findCustomFiltersContextValue = findTabMasterContextValue;

function bidirectionalContains(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

function tabContainerMatchScoreFor(id: string, name: string, needle: string): number {
  if (id === needle || name === needle) return 2;
  return (bidirectionalContains(id, needle) || bidirectionalContains(name, needle)) ? 1 : 0;
}

function tabContainerMatchScore(container: TabMasterTab | null | undefined, key: string, needle: string): number {
  return tabContainerMatchScoreFor(
    normalizeText(tabIdFrom(container, key)),
    normalizeText(tabNameFrom(container)),
    needle,
  );
}

function pickBestTabContainer(tabsMap: Map<string, any>, needle: string): any | null {
  let best: any = null;
  let bestScore = 0;
  tabsMap.forEach((container, key) => {
    const score = tabContainerMatchScore(container, key, needle);
    if (score > bestScore) { bestScore = score; best = container; }
  });
  return best;
}

function extractAppIdsFromContainer(tabContainer: any): number[] {
  const allApps = tabContainer?.collection?.allApps ?? tabContainer?.allApps;
  if (allApps instanceof Set) {
    return uniqNumbers(Array.from(allApps.values()).map(Number).filter(Number.isFinite));
  }
  return extractAppIdsDeep(allApps ?? tabContainer?.collection, 3);
}

function getCustomFiltersAppsForContainer(tabId: string): number[] {
  const ctx = findTabMasterContextValue();
  if (!(ctx?.tabsMap instanceof Map)) return [];
  const tabContainer = pickBestTabContainer(ctx.tabsMap, normalizeText(tabId));
  return tabContainer ? extractAppIdsFromContainer(tabContainer) : [];
}

const FAVORITES_LOCALIZED_NAMES = [
  "Favorites", "Favoris", "Favoriten", "Favoritos", "Preferiti",
  "Избранное", "Ulubione", "Favorieten", "Favoriler", "Обране",
  "お気に入り", "즐겨찾기", "收藏夹",
];
const FAVORITES_INTERNAL_IDS = ["favorite", "favorites", "user-collections-favorite"];
const FAVORITES_CLIENT_METHODS = ["GetFavoriteCollectionApps", "GetFavoriteApps", "GetFavoriteAppIDs"];

function favoritesFromCollectionStore(): number[] {
  for (const win of getSteamWindows()) {
    try {
      const cs = (win as any)?.collectionStore;
      if (!cs) continue;
      const favColl = cs.favoriteCollection ?? cs.GetCollection?.("favorite");
      if (!favColl) continue;
      const ids = extractCollectionAppIds(favColl);
      if (ids.length) return ids;
    } catch {}
  }
  return [];
}

async function favoritesFromClientApi(): Promise<number[]> {
  for (const sc of getSteamClients()) {
    for (const method of FAVORITES_CLIENT_METHODS) {
      try {
        const fn = (sc?.Collections as any)?.[method];
        if (typeof fn !== "function") continue;
        const res = await fn.call(sc.Collections);
        if (Array.isArray(res) && res.length) {
          return res.map((x: any) => Number(x?.appid ?? x)).filter(Number.isFinite);
        }
      } catch {}
    }
  }
  return [];
}

async function favoritesFromAllCollections(): Promise<number[]> {
  try {
    const collections = await listCollections();
    const needles = new Set([...FAVORITES_LOCALIZED_NAMES.map((n) => normalizeText(n)), ...FAVORITES_INTERNAL_IDS]);
    for (const coll of collections) {
      if (!needles.has(normalizeText(coll.id)) && !needles.has(normalizeText(coll.name))) continue;
      const ids = await getCollectionApps(coll.id, coll.name);
      if (ids.length) return ids;
    }
  } catch {}
  return [];
}

async function getFavoritesCollectionAppIds(): Promise<number[]> {
  const fromStore = favoritesFromCollectionStore();
  if (fromStore.length) return fromStore;
  const fromClient = await favoritesFromClientApi();
  if (fromClient.length) return fromClient;
  return favoritesFromAllCollections();
}

async function resolveFavoritesTab(all: AppOverview[]): Promise<AppOverview[]> {
  const byFlag = all.filter((a) => isFavoriteOf(a));
  if (byFlag.length > 0) return byFlag;
  const favIds = await getFavoritesCollectionAppIds();
  if (!favIds.length) return byFlag;
  const favSet = new Set(favIds);
  return all.filter((a) => favSet.has(appIdOf(a)));
}

function resolveInstalledTab(all: AppOverview[]): AppOverview[] {
  // Mirror native "installed" tab: drop non-Steam shortcuts + non-game
  // app types (Proton, runtime, tools).
  return all.filter((a) =>
    isInstalledOf(a) && !isNonSteamOf(a) && (a.app_type === undefined || a.app_type === 1),
  );
}

const TAB_DYNAMIC_TAG_FIELDS = ["tab", "tab_name", "collection_name", "category"];

function resolveByTags(all: AppOverview[], id: string): AppOverview[] {
  return all.filter((a: any) => {
    const tagList: string[] = [];
    for (const k of TAB_DYNAMIC_TAG_FIELDS) tagList.push(String(a?.[k] ?? ""));
    if (Array.isArray(a?.tags)) for (const t of a.tags) tagList.push(String(t ?? ""));
    return tagList.map(slugifyTab).filter(Boolean).includes(id);
  });
}

function extractIdsFromCollectionEntry(col: SteamCollectionLike | null | undefined): Set<number> | null {
  const appsSet = col?.allApps ?? col?.m_rgApps;
  if (appsSet instanceof Set) {
    return new Set(Array.from(appsSet).map(Number).filter(Number.isFinite));
  }
  if (Array.isArray(appsSet) && appsSet.length) {
    return new Set(appsSet.map((a: any) => Number(a?.appid ?? a)).filter(Number.isFinite));
  }
  return null;
}

function lookupRawCollection(tab: string, id: string): any {
  const cs = steamCollectionStore();
  const rawMap = cs?.m_mapCollectionsFromStorage ?? cs?.collectionsFromStorage;
  if (!rawMap || typeof rawMap.get !== 'function') return null;
  return rawMap.get(tab) ?? rawMap.get(id);
}

function resolveFromCollectionStoreRaw(tab: string, id: string, all: AppOverview[]): AppOverview[] | null {
  try {
    const col = lookupRawCollection(tab, id);
    if (!col) return null;
    const ids = extractIdsFromCollectionEntry(col);
    if (!ids || ids.size === 0) return null;
    return all.filter((a) => ids.has(appIdOf(a)));
  } catch { return null; }
}

const RECENT_SORTERS: Record<string, true> = { recent: true, all_apps_recent: true, allrecentapps: true };

const ALL_TAB_IDS = new Set(["all", "all_games", "allgames"]);
const NONSTEAM_TAB_IDS = new Set(["nonsteam", "epic", "gog"]);
const INSTALLED_TAB_IDS = new Set(["installed", "great_on_deck"]);

function tabIdFromPath(tab: string): string {
  return slugifyTab(tab.startsWith("/") ? tab.split("/").pop() || tab : tab);
}

function tryDirectTabResolution(id: string, all: AppOverview[]): AppOverview[] | Promise<AppOverview[]> | null {
  if (ALL_TAB_IDS.has(id)) return all;
  if (id === "favorites") return resolveFavoritesTab(all);
  if (id === "hidden") return all.filter((a) => isHiddenOf(a));
  if (NONSTEAM_TAB_IDS.has(id)) return all.filter((a) => isNonSteamOf(a));
  if (INSTALLED_TAB_IDS.has(id)) return resolveInstalledTab(all);
  if (RECENT_SORTERS[id]) return all.slice().sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a));
  return null;
}

async function resolveDynamicTab(tab: string, all: AppOverview[]): Promise<AppOverview[]> {
  const id = tabIdFromPath(tab);
  const direct = tryDirectTabResolution(id, all);
  if (direct) return await direct;
  const byTab = resolveByTags(all, id);
  if (byTab.length) return byTab;
  return resolveFromCollectionStoreRaw(tab, id, all) ?? byTab;
}

// Composite recursion bound — beyond this, returns [].
const MAX_COMPOSITE_DEPTH = 4;

function makeNativeInstalledFilter(tabSlug: string, all: AppOverview[]): (ids: number[]) => number[] {
  const matchesNativeInstalled = tabSlug === "installed" || tabSlug === "great_on_deck";
  if (!matchesNativeInstalled) return (ids) => ids;
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
  return (ids) => ids.filter((id) => {
    const a = byId.get(id);
    if (!a || isNonSteamOf(a)) return false;
    return a.app_type === undefined || a.app_type === 1;
  });
}

function makeChildFilterTab(source: LooseSource, all: AppOverview[]): (ids: number[]) => number[] {
  const cf = source.childFilter as FilterGroup | undefined;
  if (!cf || !Array.isArray(cf.items) || !cf.items.length) return (ids) => ids;
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
  return (ids) => {
    const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
    return evaluateFilterGroup(cf, candidates).map((a) => appIdOf(a)).filter(Number.isFinite);
  };
}

async function findTabAppIdsByNameOrId(rawTab: string): Promise<number[]> {
  try {
    const tabs = await listLibraryTabs();
    const needle = normalizeText(rawTab);
    const candidates = tabs.filter((tab) => {
      const id = normalizeText(tab.id);
      const name = normalizeText(tab.name);
      return id === needle || name === needle || id.includes(needle) || name.includes(needle);
    });
    for (const tab of candidates) {
      const byId = await getTabAppIdsFromStore(tab.id);
      if (byId.length) return byId;
      const byName = await getTabAppIdsFromStore(tab.name);
      if (byName.length) return byName;
    }
  } catch {}
  return [];
}

function sortDynamicTabApps(filtered: AppOverview[], rawTab: string, sort: any): AppOverview[] {
  if (sort) return filtered;
  if (slugifyTab(rawTab) === "recent") return filtered;
  return filtered.slice().sort((a, b) =>
    String(a.sort_as ?? appNameOf(a)).localeCompare(String(b.sort_as ?? appNameOf(b))),
  );
}

const TAB_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTabUuidViaTabMaster(rawTab: string, limit: number, shelfId?: string): Promise<number[] | null> {
  if (!TAB_UUID_RE.test(rawTab)) return null;
  try {
    const { getTabsFromSettingsFile } = await import('../integrations/tabmaster');
    const { convertFiltersToGroup } = await import('../domain/customfilters');
    const tmTabs = await getTabsFromSettingsFile();
    const tmTab = tmTabs.find((t) => t.id === rawTab);
    if (!tmTab || !tmTab.filters || tmTab.filters.length === 0) return null;
    const filterGroup = convertFiltersToGroup(tmTab.filters);
    try { logInfo("STEAM", "resolveShelfAppIds(tab): UUID fallback via TabMaster filters", { tab: rawTab, title: tmTab.title }); } catch {}
    return resolveShelfAppIds({ type: 'filter', filter: { filterGroup } } as any, limit, undefined, shelfId);
  } catch { return null; }
}

async function fetchTabStoreIds(rawTab: string, filterToInstalledNative: (ids: number[]) => number[]): Promise<number[]> {
  let ids = await getTabAppIdsFromStore(rawTab);
  if (ids.length) ids = filterToInstalledNative(ids);
  if (!ids.length && rawTab) ids = await findTabAppIdsByNameOrId(rawTab);
  return ids;
}

async function resolveFromDynamicTab(ctx: ResolverContext, rawTab: string): Promise<number[]> {
  const { all, sort, shelfId, sortReverse, limit } = ctx;
  const filtered = await resolveDynamicTab(rawTab, all);
  const tabApps = sortDynamicTabApps(filtered, rawTab, sort);
  let tabIds = deduplicateNonSteam(tabApps.map((a) => appIdOf(a)).filter(Number.isFinite), all);
  if (sort) tabIds = applySortToIds(tabIds, sort, all, shelfId, sortReverse);
  return tabIds.slice(0, limit);
}

async function _resolveTab(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit, limit } = ctx;
  const rawTab = String(source.tab ?? "").trim();
  const filterToInstalledNative = makeNativeInstalledFilter(slugifyTab(rawTab), all);
  const applyChildFilterTab = makeChildFilterTab(source, all);

  const customFiltersIds = getCustomFiltersAppsForContainer(rawTab);
  if (customFiltersIds.length) {
    const filtered = filterToInstalledNative(customFiltersIds);
    const ordered = sort ? applySortToIds(filtered, sort, all, shelfId, sortReverse) : filtered;
    return finish(applyChildFilterTab(ordered).slice(0, overShootLimit));
  }

  const fromTabStore = await fetchTabStoreIds(rawTab, filterToInstalledNative);
  if (fromTabStore.length) {
    try { logInfo("STEAM", "resolveShelfAppIds(tab): using store", { tab: rawTab, count: fromTabStore.length }); } catch {}
    const tabStoreIds = deduplicateNonSteam(sort ? applySortToIds(fromTabStore, sort, all, shelfId, sortReverse) : fromTabStore, all);
    return finish(applyChildFilterTab(tabStoreIds).slice(0, overShootLimit));
  }

  const ids = await resolveFromDynamicTab(ctx, rawTab);
  if (!ids.length) {
    const viaTabMaster = await resolveTabUuidViaTabMaster(rawTab, limit, shelfId);
    if (viaTabMaster) return viaTabMaster;
    const fallback = await tryBuiltInTabFallback(ctx, rawTab);
    if (fallback) return fallback;
    logWarn("STEAM", "resolveShelfAppIds(tab) empty", { tab: rawTab, allCount: all.length });
  }
  return finish(applyChildFilterTab(ids.slice(0, overShootLimit)));
}

// Built-in tabs whose semantics map cleanly to a legacy flat filter. When
// Steam's tab store returns empty (boot-time race, theme weirdness) we route
// through the filter resolver so the template still produces results.
async function tryBuiltInTabFallback(ctx: ResolverContext, rawTab: string): Promise<number[] | null> {
  const slug = slugifyTab(rawTab);
  if (slug !== "installed") return null;
  try {
    const result = await _resolveFilter({
      ...ctx,
      source: { type: "filter", filter: { installed: true } } as any,
    });
    if (result.length) {
      logInfo("STEAM", "resolveShelfAppIds(tab) using installed-filter fallback", { tab: rawTab, count: result.length });
      return result;
    }
  } catch (e) { logWarn("STEAM", "installed-filter fallback failed", String(e)); }
  return null;
}

function compositeChildFilterItems(source: LooseSource): FilterItem[] {
  const cf = source.childFilter;
  return cf && Array.isArray(cf.items) ? cf.items : [];
}

function mergeCompositeFilterIntoOnlineChild(child: LooseSource, compositeItems: FilterItem[]): LooseSource {
  const existing: FilterItem[] = (child.childFilter && Array.isArray(child.childFilter.items)) ? child.childFilter.items : [];
  return {
    ...child,
    childFilter: {
      mode: child.childFilter?.mode === "or" ? "or" : "and",
      items: [...existing, ...compositeItems],
    },
  } as LooseSource;
}

function rebuildOfflineChildIfDup(child: LooseSource, compositeFilterSig: string): LooseSource {
  if (!compositeFilterSig || !child?.childFilter || !Array.isArray(child.childFilter.items)) return child;
  if (JSON.stringify(child.childFilter.items) !== compositeFilterSig) return child;
  const { childFilter: _drop, ...rest } = child;
  return rest;
}

function rebuildCompositeChildSources(rawChildSources: LooseSource[], compositeItems: FilterItem[]): LooseSource[] {
  if (compositeItems.length === 0) return rawChildSources;
  const sig = JSON.stringify(compositeItems);
  return rawChildSources.map((child) => {
    if (child?.type !== "wishlist" && child?.type !== "store") return rebuildOfflineChildIfDup(child, sig);
    return mergeCompositeFilterIntoOnlineChild(child, compositeItems);
  });
}

/* Each child sorts + truncates to its own limit before the union is merged
   and re-sorted — a candidate outside one branch's own cutoff never reaches
   the final ranking, even if it belonged in the true combined top-N (the
   editor preview avoids this via its own much larger request). Cheap to
   raise: local evaluation is synchronous, and enrichApps caps + caches its own lookups regardless of pool size. */
function compositeChildLimit(overShootLimit: number): number {
  return Math.min(Math.max(overShootLimit * 4, 200), 600);
}

async function resolveCompositeChildren(childSources: any[], ctx: ResolverContext): Promise<number[][]> {
  const { sort, shelfId, sortReverse, options, depth: _depth, overShootLimit } = ctx;
  const childLimit = compositeChildLimit(overShootLimit);
  /* Ceiling per child (15s max) so a single hung online source can't park
     the parent composite resolve forever; a misbehaving child just resolves
     `[]`. The actual bound is learned per source type (adaptiveTimeout) — a
     local collection and a network wishlist/store call have very different
     natural latencies, so each type keeps its own rolling estimate. */
  return Promise.all(
    childSources.map((child) => {
      const timeoutKey = `composite-child:${child?.type ?? "unknown"}`;
      const ms = getAdaptiveTimeout(timeoutKey, { floor: 2000, ceiling: 15000, fallback: 15000 });
      const startedAt = Date.now();
      /* Cancel the ceiling timer once the child settles. Left running it fires
         anyway after a SUCCESSFUL resolve — logging a bogus "timed out" that
         hides which children really are slow — and leaks one pending timer per
         child per resolve, which adds up fast across home remounts. */
      let timer: ReturnType<typeof setTimeout> | null = null;
      const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
      const inner = resolveShelfAppIds(child, childLimit, sort, shelfId, sortReverse, options, _depth + 1)
        .then((r) => { recordDuration(timeoutKey, Date.now() - startedAt); clear(); return r; });
      const fallback = new Promise<number[]>((resolve) => {
        timer = setTimeout(() => {
          timer = null;
          logWarn("STEAM", "composite child resolve timed out", { type: child?.type, shelfId, ms });
          resolve([]);
        }, ms);
      });
      return Promise.race([inner, fallback])
        .catch((e) => { clear(); logWarn("STEAM", "composite child resolve failed", String(e)); return [] as number[]; });
    }),
  );
}

async function resortCompositeMerged(merged: number[], all: AppOverview[], ctx: ResolverContext): Promise<number[]> {
  const { sort, shelfId, sortReverse } = ctx;
  const sortKeys: string[] = Array.isArray(sort) ? sort : (sort ? [sort] : []);
  const primary = sortKeys[0];
  if (merged.length <= 1 || !primary || primary === "manual" || primary === "random") return merged;
  try {
    const hasPriceKey = sortKeys.some((k) => PRICE_SORT_KEYS.has(k));
    const priceMap = hasPriceKey ? await (await import("../core/onlineStore")).getPriceMap(merged) : undefined;
    const byIdAll = new Map(all.map((a) => [appIdOf(a), a] as const));
    const pool: AppOverview[] = merged.map((id) => (sortPoolLookup(id) ?? byIdAll.get(id) ?? ({ appid: id } as unknown as AppOverview)) as AppOverview);
    return applySortToIds(merged, sort!, pool, shelfId, sortReverse, priceMap);
  } catch (e) { logWarn("STEAM", "composite resort failed", String(e)); return merged; }
}

async function _resolveComposite(ctx: ResolverContext): Promise<number[]> {
  const { source, all, depth: _depth, finish, overShootLimit } = ctx;
  if (_depth >= MAX_COMPOSITE_DEPTH) {
    logWarn("STEAM", "resolveShelfAppIds(composite) depth cap reached", { depth: _depth, max: MAX_COMPOSITE_DEPTH });
    return finish([]);
  }
  const combine = source.combine === "intersection" ? "intersection" : "union";
  const rawChildSources: LooseSource[] = Array.isArray(source.sources) ? source.sources : [];
  if (!rawChildSources.length) return finish([]);
  const compositeItems = compositeChildFilterItems(source);
  const childSources = rebuildCompositeChildSources(rawChildSources, compositeItems);
  const childResults = await resolveCompositeChildren(childSources, ctx);
  let merged = mergeCompositeResults(childResults, combine);
  merged = await resortCompositeMerged(merged, all, ctx);
  logInfo("STEAM", "resolveShelfAppIds(composite) resolved", { combine, children: childSources.length, count: merged.length, hasChildFilter: !!(source as any).childFilter });
  return finish(merged.slice(0, overShootLimit));
}

// Dispatcher table keyed by `source.type`. Each entry runs in its own
// function above so the dispatcher itself stays at complexity ~3.
const SOURCE_RESOLVERS: Record<string, (ctx: ResolverContext) => Promise<number[]>> = {
  collection: _resolveCollection,
  tab: _resolveTab,
  filter: _resolveFilter,
  external: _resolveExternal,
  wishlist: withOnlineSwr("wishlist", _resolveWishlist),
  store: withOnlineSwr("store", _resolveStore),
  smart: _resolveSmart,
  composite: _resolveComposite,
};

function computeOvershootLimit(source: { type: string }, limit: number, hiddenSet: Set<number> | undefined): number {
  // Overshoot for render-time filters: hidden*2 for the picker, plus
  // max(10, 50% of limit) for online owned/name matches. Capped at 3x.
  const isOnlineShelf = source.type === "wishlist" || source.type === "store";
  const ownedOvershoot = isOnlineShelf ? Math.max(10, Math.ceil(limit * 0.5)) : 0;
  const hiddenOvershoot = hiddenSet ? hiddenSet.size * 2 : 0;
  return Math.min(limit + hiddenOvershoot + ownedOvershoot, limit * 3);
}

/* first-party Shelf Source Ecosystem v3 lives in a sibling module. Each
   resolver synchronously projects from the already-loaded `all` AppOverview
   list. The resolver receives `all` and returns the filtered AppOverview[],
   which we then map to ids + apply sort + finish overshoot trimming. */
async function resolveViaV3Extension(
  source: { type: string; [k: string]: any },
  all: AppOverview[],
  sort: string | string[] | undefined,
  shelfId: string | undefined,
  sortReverse: boolean | boolean[] | undefined,
  finish: (ids: number[]) => number[],
): Promise<number[]> {
  try {
    const { SOURCE_V3_RESOLVERS } = require("./v3Extensions") as typeof import("./v3Extensions");
    // `builtin` wraps a v3 source id (the picker's shape); a bare v3 `type`
    // is also honoured for power-users editing JSON directly.
    const v3id = source.type === "builtin" ? String((source as any).sourceId ?? "") : source.type;
    const v3 = SOURCE_V3_RESOLVERS[v3id];
    if (!v3) return [];
    const filtered = v3(all);
    const ids = filtered.map((a) => appIdOf(a)).filter(Number.isFinite);
    if (sort) await enrichForSort(sort, ids, all);
    const sorted = sort ? applySortToIds(ids, sort, all, shelfId, sortReverse) : ids;
    return finish(sorted);
  } catch { return []; /* fall through to empty */ }
}

export async function resolveShelfAppIds(
  source: { type: string; [k: string]: any },
  limit: number,
  sort?: string | string[],
  shelfId?: string,
  sortReverse?: boolean | boolean[],
  options?: { hiddenAppIds?: number[]; dedupeByName?: boolean; onResolveTotal?: (n: number) => void },
  _depth: number = 0,
): Promise<number[]> {
  const { hiddenAppIds, dedupeByName, onResolveTotal } = options ?? {};
  const hiddenSet = hiddenAppIds?.length ? new Set(hiddenAppIds) : undefined;
  const overShootLimit = computeOvershootLimit(source, limit, hiddenSet);

  let all = await getAllAppOverviews();
  // Startup readiness: if Steam hasn't loaded app data yet, retry once after a short delay
  if (!all.length) {
    await new Promise((r) => setTimeout(r, 2000));
    all = await getAllAppOverviews();
  }

  const finish = (ids: number[]): number[] => {
    let result = ids;
    if (hiddenSet) result = result.filter((id) => !hiddenSet.has(id));
    if (dedupeByName && result.length > 1) result = dedupeAppIdsByName(result, all);
    return result.slice(0, overShootLimit);
  };

  const ctx: ResolverContext = {
    source: source as LooseSource, limit, sort, shelfId, sortReverse, options,
    depth: _depth, all, overShootLimit, finish,
    reportTotal: onResolveTotal,
  };
  const handler = SOURCE_RESOLVERS[source.type];
  if (handler) return handler(ctx);
  return resolveViaV3Extension(source, all, sort, shelfId, sortReverse, finish);
}
