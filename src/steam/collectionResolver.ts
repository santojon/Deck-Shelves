import { type AppOverview, appIdOf } from "./appOverview";
import type { FilterGroup } from "../types";
import type { LooseSource, ResolverContext } from "./resolverContext";
import { type SteamCollection, candidateCollectionIds, getCollectionApps, listCollections, normalizeText } from "./collections";
import { applySortToIds } from "./sorting";
import { evaluateFilterGroup } from "./filterEval";
import { isContextAwareSource, resolveExternalSource } from "../core/pluginApi";
import { logInfo, logWarn } from "../runtime/logger";
import { resolveContextAwareShelf } from "../core/contextAwareShelves";
import { collectFilterGroupItemsFlat, deduplicateNonSteam, emitResolvedTotal, enrichForSort, prefetchCatalogFilterData } from "./resolveShared";

/* The collection and external sources: a Steam collection's apps (found by id, by name markers or a fallback probe), and a plugin-provided source. */

function collectTextMarkers(value: unknown): string[] {
  const out: string[] = [];
  const push = (entry: unknown) => {
    const normalized = normalizeText(String(entry ?? ""));
    if (normalized) out.push(normalized);
  };
  if (Array.isArray(value)) {
    value.forEach(push);
  } else {
    push(value);
  }
  return out;
}

const APP_COLLECTION_MARKER_KEYS = [
  "collection", "collection_id", "collectionId",
  "collection_name", "collectionName",
  "tab", "tab_name",
  "category", "category_name",
  "tags", "rgTags", "m_rgTags",
  "collections", "m_rgCollections",
  "categories", "m_rgCategories",
];

function appMatchesCollectionMarker(app: AppOverview, markers: Set<string>): boolean {
  if (!markers.size) return false;
  const appAny = app as any;
  for (const key of APP_COLLECTION_MARKER_KEYS) {
    for (const marker of collectTextMarkers(appAny?.[key])) {
      if (markers.has(marker)) return true;
    }
  }
  return false;
}

type CollectionMatches = { exactMatches: SteamCollection[]; softMatches: SteamCollection[] };

function partitionCollectionsByNeedle(collections: SteamCollection[], rawCollectionId: string): CollectionMatches {
  const needle = normalizeText(rawCollectionId);
  const exactMatches = collections.filter((c) => {
    const id = normalizeText(c.id);
    const name = normalizeText(c.name);
    return id === needle || name === needle;
  });
  const softMatches = exactMatches.length ? [] : collections.filter((c) => {
    const id = normalizeText(c.id);
    const name = normalizeText(c.name);
    return id.includes(needle) || name.includes(needle);
  });
  return { exactMatches, softMatches };
}

async function probeCollectionMatchesForIds(matches: SteamCollection[]): Promise<number[]> {
  for (const match of matches) {
    const probeKeys = Array.from(new Set([match.id, match.name].filter(Boolean)));
    for (const key of probeKeys) {
      const ids = await getCollectionApps(key, match.name);
      if (ids.length) return ids;
    }
  }
  return [];
}

function resolveCollectionByMarkers(rawCollectionId: string, matches: SteamCollection[], all: AppOverview[]): number[] {
  if (!all.length) return [];
  const markers = new Set<string>();
  for (const id of candidateCollectionIds(rawCollectionId)) {
    const marker = normalizeText(id);
    if (marker) markers.add(marker);
  }
  for (const match of matches) {
    const idMarker = normalizeText(match.id);
    const nameMarker = normalizeText(match.name);
    if (idMarker) markers.add(idMarker);
    if (nameMarker) markers.add(nameMarker);
  }
  if (!markers.size) return [];
  return all.filter((app) => appMatchesCollectionMarker(app, markers)).map((app) => appIdOf(app));
}

async function resolveCollectionFallback(rawCollectionId: string, all: AppOverview[]): Promise<number[]> {
  try {
    const collections = await listCollections();
    const { exactMatches, softMatches } = partitionCollectionsByNeedle(collections, rawCollectionId);
    const ordered = [...exactMatches, ...softMatches];
    const probed = await probeCollectionMatchesForIds(ordered);
    if (probed.length) return probed;
    return resolveCollectionByMarkers(rawCollectionId, ordered, all);
  } catch { return []; }
}

async function applyCollectionChildFilter(ids: number[], source: LooseSource, all: AppOverview[]): Promise<number[]> {
  const cf = source.childFilter as FilterGroup | undefined;
  if (!cf || !Array.isArray(cf.items) || cf.items.length === 0) return ids;
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
  const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
  await prefetchCatalogFilterData(collectFilterGroupItemsFlat(cf), ids, byId).catch(() => {});
  return evaluateFilterGroup(cf, candidates).map((a) => appIdOf(a)).filter(Number.isFinite);
}

export async function _resolveCollection(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit } = ctx;
  const rawCollectionId = String(source.collectionId ?? "").trim();
  let ids = await getCollectionApps(rawCollectionId);
  if (!ids.length && rawCollectionId) ids = await resolveCollectionFallback(rawCollectionId, all);
  if (!ids.length) {
    logWarn("STEAM", "resolveShelfAppIds(collection) empty", { collectionId: rawCollectionId, allCount: all.length });
  } else {
    logInfo("STEAM", "resolveShelfAppIds(collection) resolved", { collectionId: rawCollectionId, count: ids.length });
  }
  ids = await applyCollectionChildFilter(ids, source, all);
  if (sort) { await enrichForSort(sort, ids, all); ids = applySortToIds(ids, sort, all, shelfId, sortReverse); }
  ids = deduplicateNonSteam(ids, all);
  emitResolvedTotal(ctx, ids.length);
  return finish(ids.slice(0, overShootLimit));
}

export async function _resolveExternal(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit, limit } = ctx;
    const sourceId = String(source.sourceId ?? "");
    try {
      /* Context-aware sources resolve through a dedicated orchestrator
         (focus context, cancellation, a short cache — debounced
         invalidation lives at the shelf-subscription level); everything
         else about resolution (sort, dedupe, overshoot) is shared. */
      let ids = isContextAwareSource(sourceId)
        ? await resolveContextAwareShelf(sourceId, shelfId ?? sourceId, limit, undefined)
        : await resolveExternalSource(sourceId, limit);
      logInfo("STEAM", "resolveShelfAppIds(external) resolved", { sourceId: source.sourceId, count: ids.length });
      if (sort) ids = applySortToIds(ids, sort, all, shelfId, sortReverse);
      ids = deduplicateNonSteam(ids, all);
      return finish(ids.slice(0, overShootLimit));
    } catch {
      return [];
    }
}
