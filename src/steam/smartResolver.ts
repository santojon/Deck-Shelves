import { type AppOverview, appIdOf } from "./appOverview";
import type { LooseSource, ResolverContext } from "./resolverContext";
import { applySortToIds } from "./sorting";
import { evaluateFilterGroup } from "./filterEval";
import { getAllAppOverviews } from "./library";
import { hasExternalSmartSource, resolveExternalSmartSource } from "../core/pluginApi";
import { logInfo, logWarn } from "../runtime/logger";
import { collectFilterGroupItemsFlat, mergeCompositeResults, prefetchCatalogFilterData } from "./resolveShared";

/* The smart source: one or more smart modes resolved and merged, then the smart shelf's own filter group. */

type SmartResolverDeps = {
  apps: AppOverview[];
  internalModes: ReadonlySet<string>;
  resolveSmart: (mode: any, apps: AppOverview[], limit: number, params: any, ttlMs: number | undefined, shelfId?: string) => number[];
  hasExternal: (mode: string) => boolean;
  resolveExternal: (mode: string, limit: number, params: Record<string, number>) => Promise<number[]>;
};

async function resolveSmartModeIds(
  mode: string,
  smartFetchLimit: number,
  smartParams: Record<string, number> | undefined,
  ttlMs: number | undefined,
  shelfId: string | undefined,
  deps: SmartResolverDeps,
): Promise<number[]> {
  if (mode === "custom") return deps.apps.map((a) => appIdOf(a)).filter(Number.isFinite);
  if (deps.internalModes.has(mode)) {
    return deps.resolveSmart(mode as any, deps.apps, smartFetchLimit, smartParams, ttlMs, shelfId);
  }
  if (deps.hasExternal(mode)) {
    return deps.resolveExternal(mode, smartFetchLimit, smartParams ?? {});
  }
  return [];
}

function uniqueModes(modes: string[]): string[] {
  const seen = new Set<string>();
  return modes.filter((m) => seen.has(m) ? false : (seen.add(m), true));
}

async function resolveSmartCompositeIds(
  source: LooseSource,
  smartFetchLimit: number,
  smartParams: Record<string, number> | undefined,
  ttlMs: number | undefined,
  shelfId: string | undefined,
  deps: SmartResolverDeps,
): Promise<number[]> {
  const combine = source.compositeCombine === "intersection" ? "intersection" : "union";
  const modes = uniqueModes([source.mode, ...(source.compositeModes as string[])]);
  const childResults: number[][] = [];
  for (const m of modes) {
    try {
      const childShelfId = shelfId ? `${shelfId}:${m}` : undefined;
      childResults.push(await resolveSmartModeIds(m, smartFetchLimit, smartParams, ttlMs, childShelfId, deps));
    } catch (e) {
      logWarn("STEAM", "composite smart child failed", { mode: m, err: String(e) });
      childResults.push([]);
    }
  }
  return mergeCompositeResults(childResults, combine);
}

async function applySmartFilterGroup(ids: number[], filterGroup: any, apps: AppOverview[]): Promise<number[]> {
  if (!filterGroup || !Array.isArray(filterGroup.items) || filterGroup.items.length === 0) return ids;
  const byId = new Map(apps.map((a) => [appIdOf(a), a] as const));
  const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
  await prefetchCatalogFilterData(collectFilterGroupItemsFlat(filterGroup), ids, byId).catch(() => {});
  return evaluateFilterGroup(filterGroup, candidates).map((a) => appIdOf(a)).filter(Number.isFinite);
}

export async function _resolveSmart(ctx: ResolverContext): Promise<number[]> {
  const { source, sort, shelfId, sortReverse, finish, overShootLimit, limit } = ctx;
  try {
    const { resolveSmartShelf, INTERNAL_SMART_MODES } = await import("./smartShelves");
    const apps = await getAllAppOverviews();
    const smartFilterGroup = source.filterGroup;
    const smartParams = source.smartParams as Record<string, number> | undefined;
    const refreshIntervalMinutes = source.refreshIntervalMinutes as number | undefined;
    const ttlMs = typeof refreshIntervalMinutes === "number" && refreshIntervalMinutes > 0
      ? refreshIntervalMinutes * 60 * 1000
      : undefined;
    const wantsPostProcess = !!smartFilterGroup || !!sort;
    const smartFetchLimit = wantsPostProcess ? Math.max(limit * 4, 200) : limit;
    const deps: SmartResolverDeps = {
      apps, internalModes: INTERNAL_SMART_MODES,
      resolveSmart: resolveSmartShelf as any,
      hasExternal: hasExternalSmartSource,
      resolveExternal: resolveExternalSmartSource,
    };
    const compositeModes = Array.isArray(source.compositeModes) ? source.compositeModes as string[] : [];
    const rawIds = compositeModes.length > 0
      ? await resolveSmartCompositeIds(source, smartFetchLimit, smartParams, ttlMs, shelfId, deps)
      : await resolveSmartModeIds(source.mode, smartFetchLimit, smartParams, ttlMs, shelfId, deps);
    let ids = await applySmartFilterGroup(rawIds, smartFilterGroup, apps);
    if (sort && sort !== "manual") ids = applySortToIds(ids, sort, apps, shelfId, sortReverse);
    logInfo("STEAM", "resolveShelfAppIds(smart) resolved", { mode: source.mode, count: ids.length, hasFilter: !!smartFilterGroup, sort });
    return finish(ids.slice(0, overShootLimit));
  } catch {
    return [];
  }
}
