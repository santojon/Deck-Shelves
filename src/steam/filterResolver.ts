import { type AppOverview, appIdOf, appNameOf, compareByAdded, isFavoriteOf, isHiddenOf, isInstalledOf, isNonSteamOf, lastPlayedOf } from "./appOverview";
import { type FilterEvalContext, evaluateFilterGroup, isDeckCompatMatch } from "./filterEval";
import type { FilterGroup, FilterItem } from "../types";
import type { ResolverContext } from "./resolverContext";
import { applySortToIds, hashIdSet, stableShuffleIds } from "./sorting";
import { getCollectionApps } from "./collections";
import { logInfo, logWarn } from "../runtime/logger";
import { preloadDeveloperData, preloadPublisherData } from "./publisherDeveloper";
import { collectFilterGroupItemsFlat, deduplicateNonSteam, emitResolvedTotal, enrichAppsForMetaSort, prefetchCatalogFilterData } from "./resolveShared";

/* The filter source: a filter group (or the legacy flat filter) evaluated over the library, then sorted. */

export type CustomFilter = {
  favorites?: boolean;
  hidden?: boolean | "only";
  nonSteam?: boolean;
  installed?: boolean;
  playedWithinDays?: number;
  nameIncludes?: string;
  nameRegex?: string;
  deckCompatibility?: Array<"verified" | "playable" | "unsupported" | "unknown">;
  sort?: "alphabetical" | "recent" | "playtime" | "release_date" | "size_on_disk" | "metacritic" | "review_score" | "added";
  minPlaytimeMinutes?: number;
  maxPlaytimeMinutes?: number;
  updatePending?: boolean;
};

function pushCollectionIdFromItem(item: FilterItem, ids: string[]): void {
  if (item.type !== "collection") return;
  const id = String(item.params?.collectionId ?? "").trim();
  if (id) ids.push(id);
}

function pushMergeCollectionIds(item: FilterItem, ids: string[]): void {
  if (item.type !== "merge" || !Array.isArray(item.params?.items)) return;
  ids.push(...collectCollectionIdsFromGroup({ mode: item.params.mode ?? "and", items: item.params.items as FilterItem[] }));
}

function collectCollectionIdsFromGroup(group: FilterGroup): string[] {
  const ids: string[] = [];
  for (const item of group.items ?? []) {
    pushCollectionIdFromItem(item, ids);
    pushMergeCollectionIds(item, ids);
  }
  return ids;
}

// Pre-warm developer/publisher caches before evaluation — without
// this, dev/pub filters return zero matches on the home.
function filterGroupNeedsDevPubPreload(group: FilterGroup): { needsDev: boolean; needsPub: boolean } {
  let needsDev = false;
  let needsPub = false;
  const walk = (g: FilterGroup) => {
    for (const item of g.items ?? []) {
      if (item.type === "developer") needsDev = true;
      else if (item.type === "publisher") needsPub = true;
      else if (item.type === "merge" && Array.isArray(item.params?.items)) {
        walk({ mode: (item.params.mode ?? "and") as "and" | "or", items: item.params.items as FilterItem[] });
      }
    }
  };
  walk(group);
  return { needsDev, needsPub };
}

// Dispatch table for `f.sort`; fallthrough sorts alphabetically.
const FILTER_SORT_DISPATCH: Record<string, (apps: AppOverview[], shelfId?: string) => AppOverview[]> = {
  recent: (apps) => apps.slice().sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a)),
  playtime: (apps) => apps.slice().sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0)),
  release_date: (apps) => apps.slice().sort((a, b) => (b.rt_original_release_date ?? 0) - (a.rt_original_release_date ?? 0)),
  size_on_disk: (apps) => apps.slice().sort((a, b) => Number(b.size_on_disk ?? 0) - Number(a.size_on_disk ?? 0)),
  metacritic: (apps) => apps.slice().sort((a, b) => (b.metacritic_score ?? 0) - (a.metacritic_score ?? 0)),
  review_score: (apps) => apps.slice().sort((a, b) => (b.review_percentage ?? 0) - (a.review_percentage ?? 0)),
  added: (apps) => apps.slice().sort(compareByAdded),
  random: (apps, shelfId) => {
    const fIds = apps.map((a) => appIdOf(a)).filter(Number.isFinite);
    const fById = new Map<number, AppOverview>();
    for (const a of apps) { const id = appIdOf(a); if (id) fById.set(id, a); }
    return stableShuffleIds(fIds, hashIdSet(fIds), shelfId).map((id) => fById.get(id)).filter(Boolean) as AppOverview[];
  },
};

function sortAppsByFilterKey(filtered: AppOverview[], fSort: string | undefined, shelfId?: string): AppOverview[] {
  const handler = fSort ? FILTER_SORT_DISPATCH[fSort] : undefined;
  if (handler) return handler(filtered, shelfId);
  return filtered.slice().sort((a, b) => String(a.sort_as ?? appNameOf(a)).localeCompare(String(b.sort_as ?? appNameOf(b))));
}

function resolveFilterReverse(f: CustomFilter, fallback: boolean | boolean[] | undefined): boolean {
  const eff = (f as any).sortReverse ?? fallback;
  return Array.isArray(eff) ? !!eff[0] : !!eff;
}

function hasNonEmptyString(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

const LEGACY_BOOL_FLAGS: Array<keyof CustomFilter> = ["favorites", "nonSteam", "installed"];

function hasLegacyHiddenFlag(f: CustomFilter): boolean {
  return f.hidden === "only" || f.hidden === true || f.hidden === false;
}

function hasLegacyNumberRanges(f: CustomFilter): boolean {
  return typeof f.playedWithinDays === "number"
    || typeof f.minPlaytimeMinutes === "number"
    || typeof f.maxPlaytimeMinutes === "number";
}

function hasLegacyFlatFilter(f: CustomFilter): boolean {
  if (LEGACY_BOOL_FLAGS.some((k) => !!f[k])) return true;
  if (hasLegacyHiddenFlag(f)) return true;
  if (hasNonEmptyString(f.nameIncludes) || hasNonEmptyString(f.nameRegex)) return true;
  if (Array.isArray(f.deckCompatibility) && f.deckCompatibility.length > 0) return true;
  if (hasLegacyNumberRanges(f)) return true;
  return f.updatePending === true || f.updatePending === false;
}

function applyLegacyBoolFlags(filtered: AppOverview[], f: CustomFilter): AppOverview[] {
  if (f.favorites) filtered = filtered.filter(isFavoriteOf);
  if (f.hidden === "only" || f.hidden === true) filtered = filtered.filter(isHiddenOf);
  if (f.hidden === false) filtered = filtered.filter((a) => !isHiddenOf(a));
  if (f.nonSteam) filtered = filtered.filter(isNonSteamOf);
  if (f.installed) filtered = filtered.filter(isInstalledOf);
  return filtered;
}

function applyLegacyNameFilters(filtered: AppOverview[], f: CustomFilter): AppOverview[] {
  if (hasNonEmptyString(f.nameIncludes)) {
    const needle = f.nameIncludes!.toLowerCase();
    filtered = filtered.filter((a) => appNameOf(a).toLowerCase().includes(needle));
  }
  if (hasNonEmptyString(f.nameRegex)) {
    try {
      const re = new RegExp(f.nameRegex!, "i");
      filtered = filtered.filter((a) => re.test(appNameOf(a)));
    } catch {}
  }
  return filtered;
}

function applyLegacyRangeFilters(filtered: AppOverview[], f: CustomFilter): AppOverview[] {
  if (typeof f.playedWithinDays === "number") {
    const min = Math.floor(Date.now() / 1000) - Math.floor(f.playedWithinDays * 86400);
    filtered = filtered.filter((a) => lastPlayedOf(a) >= min);
  }
  if (typeof f.minPlaytimeMinutes === "number") {
    filtered = filtered.filter((a) => (a.playtime_forever ?? 0) >= f.minPlaytimeMinutes!);
  }
  if (typeof f.maxPlaytimeMinutes === "number") {
    filtered = filtered.filter((a) => (a.playtime_forever ?? 0) <= f.maxPlaytimeMinutes!);
  }
  return filtered;
}

function applyLegacyMiscFilters(filtered: AppOverview[], f: CustomFilter): AppOverview[] {
  if (f.deckCompatibility && f.deckCompatibility.length > 0) {
    filtered = filtered.filter((a) => isDeckCompatMatch(a.deck_compatibility_category, f.deckCompatibility));
  }
  if (f.updatePending === true) filtered = filtered.filter((a) => a.update_pending === true);
  else if (f.updatePending === false) filtered = filtered.filter((a) => !a.update_pending);
  return filtered;
}

function applyLegacyFlatFilter(all: AppOverview[], f: CustomFilter): AppOverview[] {
  let filtered = applyLegacyBoolFlags(all, f);
  filtered = applyLegacyNameFilters(filtered, f);
  filtered = applyLegacyRangeFilters(filtered, f);
  filtered = applyLegacyMiscFilters(filtered, f);
  return filtered;
}

function applyFilterGroupSort(
  filtered: AppOverview[],
  fSort: string | string[] | undefined,
  f: CustomFilter,
  all: AppOverview[],
  shelfId: string | undefined,
  sortReverse: boolean | boolean[] | undefined,
): AppOverview[] {
  if (Array.isArray(fSort)) {
    /* Multi-key chain — sortAppsByFilterKey only understands a single string id
       (an array would silently miss FILTER_SORT_DISPATCH and fall back to
       alphabetical for every key). applySortToIds already handles per-key
       reverse via applyMultiKeySort, so no separate reverse pass is needed. */
    const preIds = filtered.map((a) => appIdOf(a)).filter(Number.isFinite);
    const sortedIds = applySortToIds(preIds, fSort, all, shelfId, (f as any).sortReverse ?? sortReverse);
    const byId = new Map(filtered.map((a) => [appIdOf(a), a] as const));
    return sortedIds.map((id) => byId.get(id)).filter((a): a is AppOverview => !!a);
  }
  let sorted = sortAppsByFilterKey(filtered, fSort, shelfId);
  /* Asc/desc inversion. Prefer the filter's own `sortReverse` (the editor writes
     there on filter shelves; shelf-level `sortReverse` is never populated for
     filter sources). Skipped for `manual` / `random`. */
  if (resolveFilterReverse(f, sortReverse) && fSort !== "manual" && fSort !== "random") {
    sorted = sorted.slice().reverse();
  }
  return sorted;
}

async function _resolveFilterGroupPath(
  ctx: ResolverContext,
  f: CustomFilter,
  filterGroup: FilterGroup,
): Promise<number[]> {
  const { all, shelfId, sortReverse, finish, overShootLimit } = ctx;
  const evalCtx: FilterEvalContext = { collectionAppIds: new Map() };
  const colIds = collectCollectionIdsFromGroup(filterGroup);
  await Promise.all(colIds.map(async (colId) => {
    try {
      const ids = await getCollectionApps(colId);
      // Always set, even on empty result, so the evaluator can tell
      // "lookup completed with 0 apps" from "lookup never attempted".
      evalCtx.collectionAppIds.set(colId, new Set(ids));
    } catch {}
  }));
  // Warm developer / publisher caches before evaluation — cold caches
  // make those filter items match zero apps on the home (the editor
  // warms via its filter pickers; the home doesn't go through them).
  const needs = filterGroupNeedsDevPubPreload(filterGroup);
  const allAppIds = all.map((a) => appIdOf(a)).filter(Number.isFinite);
  if (needs.needsDev || needs.needsPub) {
    await Promise.all([
      needs.needsDev ? preloadDeveloperData(allAppIds).catch(() => {}) : Promise.resolve(),
      needs.needsPub ? preloadPublisherData(allAppIds).catch(() => {}) : Promise.resolve(),
    ]);
  }
  // Same reasoning as dev/pub above: genres/categories/franchise have no
  // usable local data even for games you own, so a genre/category/franchise
  // filter on a plain library shelf needs this warmed first too.
  const flatItems = collectFilterGroupItemsFlat(filterGroup);
  const byIdAll = new Map(all.map((a) => [appIdOf(a), a] as const));
  await prefetchCatalogFilterData(flatItems, allAppIds, byIdAll).catch(() => {});
  // Hosts whose local Steam client omits per-platform availability leave
  // `available_on_current_platform` undefined (the system-compatibility filter
  // would then pass everything) — fill it from the store first when present.
  if (flatItems.some((it: any) => it?.type === "systemCompatibility")) {
    const om = await import("../core/onlineMetadata");
    if (om.onlineStoreFallbackOn()) await om.enrichPlatformAvailability(all).catch(() => {});
  }
  let filtered = evaluateFilterGroup(filterGroup, all, evalCtx);
  const fSort = (ctx.source.filter as any)?.sort as string | string[] | undefined;
  await enrichAppsForMetaSort(fSort, filtered);
  filtered = applyFilterGroupSort(filtered, fSort, f, all, shelfId, sortReverse);
  const ids = deduplicateNonSteam(filtered.map((a) => appIdOf(a)).filter(Number.isFinite), all);
  if (!ids.length) logWarn("STEAM", "resolveShelfAppIds(filterGroup) empty", { filter: f, allCount: all.length });
  else logInfo("STEAM", "resolveShelfAppIds(filterGroup) resolved", { count: ids.length, allCount: all.length });
  emitResolvedTotal(ctx, ids.length);
  return finish(ids.slice(0, overShootLimit));
}

function pickLegacySortKey(f: CustomFilter): string | undefined {
  if (f.sort === "recent" || typeof f.playedWithinDays === "number") return "recent";
  return f.sort as string | undefined;
}

function _resolveFilterLegacyPathMultiKey(
  ctx: ResolverContext, f: CustomFilter, filtered: AppOverview[],
): number[] {
  const { all, shelfId, sortReverse, finish, overShootLimit } = ctx;
  const sortedIds = applySortToIds(
    filtered.map((a) => appIdOf(a)).filter(Number.isFinite),
    f.sort as unknown as string[], all, shelfId, (f as any).sortReverse ?? sortReverse,
  );
  const ids = deduplicateNonSteam(sortedIds, all);
  if (!ids.length) logWarn("STEAM", "resolveShelfAppIds(filter) empty", { filter: f, allCount: all.length });
  else logInfo("STEAM", "resolveShelfAppIds(filter) resolved", { count: ids.length, allCount: all.length });
  emitResolvedTotal(ctx, ids.length);
  return finish(ids.slice(0, overShootLimit));
}

function _resolveFilterLegacyPath(
  ctx: ResolverContext,
  f: CustomFilter,
): number[] {
  const { all, shelfId, sortReverse, finish, overShootLimit } = ctx;
  let filtered = applyLegacyFlatFilter(all, f);
  if (Array.isArray(f.sort)) return _resolveFilterLegacyPathMultiKey(ctx, f, filtered);
  const fSort = pickLegacySortKey(f);
  filtered = sortAppsByFilterKey(filtered, fSort, shelfId);
  // Legacy `f.sort` enum doesn't include "manual" or "random", so the
  // reverse is unconditional.
  if (resolveFilterReverse(f, sortReverse)) filtered = filtered.slice().reverse();
  const ids = deduplicateNonSteam(filtered.map((a) => appIdOf(a)).filter(Number.isFinite), all);
  if (!ids.length) {
    logWarn("STEAM", "resolveShelfAppIds(filter) empty", {
      filter: f,
      allCount: all.length,
      sampleApp: all[0] ? { appid: all[0].appid, name: all[0].display_name, installed: all[0].installed } : null,
      afterInstalled: f.installed ? all.filter(isInstalledOf).length : "skip",
      afterInstalledLenient: f.installed ? all.filter((a) => (a as any).installed !== false).length : "skip",
    });
  } else {
    logInfo("STEAM", "resolveShelfAppIds(filter) resolved", { count: ids.length, allCount: all.length });
  }
  return finish(ids.slice(0, overShootLimit));
}

export async function _resolveFilter(ctx: ResolverContext): Promise<number[]> {
  const { source, finish } = ctx;
  const f: CustomFilter = (source.filter ?? {}) as CustomFilter;
  const filterGroup = (source.filter as any)?.filterGroup as FilterGroup | undefined;
  if (filterGroup && Array.isArray(filterGroup.items) && filterGroup.items.length > 0) {
    return _resolveFilterGroupPath(ctx, f, filterGroup);
  }
  const hasSort = Array.isArray(f.sort) ? f.sort.length > 0 : (typeof f.sort === "string" && f.sort.length > 0);
  if (!hasLegacyFlatFilter(f) && !hasSort) {
    logInfo("STEAM", "resolveShelfAppIds(filter) empty — no filters configured", { filter: f });
    return finish([]);
  }
  return _resolveFilterLegacyPath(ctx, f);
}
