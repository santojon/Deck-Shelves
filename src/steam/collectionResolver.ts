import { type AppOverview, appIdOf } from "./appOverview";
import type { FilterGroup } from "../types";
import type { LooseSource, ResolverContext } from "./resolverContext";
import { getCollectionApps } from "./collections";
import { applySortToIds } from "./sorting";
import { evaluateFilterGroup } from "./filterEval";
import { isContextAwareSource, resolveExternalSource } from "../core/pluginApi";
import { logInfo, logWarn } from "../runtime/logger";
import { resolveContextAwareShelf } from "../core/contextAwareShelves";
import { collectFilterGroupItemsFlat, deduplicateNonSteam, emitResolvedTotal, enrichForSort, prefetchCatalogFilterData } from "./resolveShared";

/* The collection and external sources: a Steam collection's current apps, found by id, and a plugin-provided source. */

async function applyCollectionChildFilter(ids: number[], source: LooseSource, all: AppOverview[]): Promise<number[]> {
  const cf = source.childFilter as FilterGroup | undefined;
  if (!cf || !Array.isArray(cf.items) || cf.items.length === 0) return ids;
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
  const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
  await prefetchCatalogFilterData(collectFilterGroupItemsFlat(cf), ids, byId).catch(() => {});
  return evaluateFilterGroup(cf, candidates).map((a) => appIdOf(a)).filter(Number.isFinite);
}

// A missing collection and an empty one are told apart in the log; both render nothing.
export async function _resolveCollection(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit } = ctx;
  const collectionId = String(source.collectionId ?? "").trim();
  const found = await getCollectionApps(collectionId);
  if (found === null) logWarn("STEAM", "resolveShelfAppIds(collection) not found", { collectionId });
  else logInfo("STEAM", "resolveShelfAppIds(collection) resolved", { collectionId, count: found.length });
  let ids = await applyCollectionChildFilter(found ?? [], source, all);
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
