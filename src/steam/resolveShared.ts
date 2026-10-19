import { type AppOverview, appIdOf, appNameOf, isNonSteamOf, readCollectionList, pushAppIdsFromCollection } from "./appOverview";
import type { FilterGroup, FilterItem, Settings } from "../types";
import type { ResolverContext } from "./resolverContext";
import { type SteamCollectionLike, steamCollectionStore } from "./internals";
import { isLibraryLocationsWarm, refreshLibraryLocations } from "../runtime/deviceState";
import { normalizeText } from "./collections";

/* Helpers several source resolvers share: the online-feature gate, catalog-data prefetch for catalog filters, meta enrichment for meta sorts, non-Steam duplicate removal, composite merging and the resolved-total report. */

function isOnlineFeaturesEnabledRaw(): boolean {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.("deck-shelves-settings-cache-v3");
    if (!raw) return false;
    const data = JSON.parse(raw);
    // Offline mode overrides every online toggle while active so no
    // resolver in this file fans out a request when it's on.
    if (data?.offlineModeEnabled === true) return false;
    return data?.onlineFeaturesEnabled === true;
  } catch { return false; }
}

// Online resolvers (wishlist / store) gate on this. Offline mode wins
// over every other toggle; otherwise honour the live setting, then the
// localStorage-cached raw value as a fallback.
export function isOnlineEnabledForSettings(s: Settings | null | undefined): boolean {
  if (s?.offlineModeEnabled === true) return false;
  return s?.onlineFeaturesEnabled ?? isOnlineFeaturesEnabledRaw();
}

// Flattens a filter group's items (walking `merge` nesting, same as the
// dev/pub preload above) — used to pre-warm genre/category/franchise data
// before evaluation, the same reason dev/pub caches are warmed here.
export function collectFilterGroupItemsFlat(group: FilterGroup): FilterItem[] {
  const out: FilterItem[] = [];
  const walk = (g: FilterGroup) => {
    for (const item of g.items ?? []) {
      out.push(item);
      if (item.type === "merge" && Array.isArray(item.params?.items)) {
        walk({ mode: (item.params?.mode ?? "and") as "and" | "or", items: item.params?.items as FilterItem[] });
      }
    }
  };
  walk(group);
  return out;
}

function readUnifideckPlatformLabel(c: SteamCollectionLike): string | null {
  const name = String(c?.displayName ?? c?.m_strName ?? "");
  const m = name.match(/^\[Unifideck\]\s+(.+)/i);
  if (!m) return null;
  return m[1].trim().toLowerCase();
}

function indexAppsToPlatform(c: SteamCollectionLike, platform: string, groups: Map<number, string[]>): void {
  const ids = new Set<number>();
  pushAppIdsFromCollection(c, ids);
  for (const n of ids) {
    const list = groups.get(n);
    if (list) list.push(platform); else groups.set(n, [platform]);
  }
}

// Each Unifideck game keyed by ALL its "[Unifideck] …" collections, so a store is never
// overwritten by "Installed" / "All Games" and no translated collection name is matched.
let platformCache: { map: Map<number, string>; ts: number } | null = null;

function buildNonSteamPlatformMap(): Map<number, string> {
  const now = Date.now();
  if (platformCache && now - platformCache.ts < 5000) return platformCache.map;
  const map = new Map<number, string>();
  try {
    const groups = new Map<number, string[]>();
    // Raw storage map, not the `userCollections` computed (MobX-unsafe).
    for (const c of readCollectionList(steamCollectionStore())) {
      const platform = readUnifideckPlatformLabel(c);
      if (platform) indexAppsToPlatform(c, platform, groups);
    }
    for (const [id, labels] of groups) map.set(id, labels.sort().join("\x00"));
  } catch {}
  platformCache = { map, ts: now };
  return map;
}

export function __resetPlatformMapForTest(): void { platformCache = null; }

export function deduplicateNonSteam(ids: number[], all: AppOverview[]): number[] {
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const id = appIdOf(a); if (id) byId.set(id, a); }
  const platformMap = buildNonSteamPlatformMap();
  const seen = new Set<string>();
  return ids.filter((id) => {
    const app = byId.get(id);
    if (!app || !isNonSteamOf(app)) return true;
    const name = normalizeText(appNameOf(app));
    if (!name) return false;
    const platform = platformMap.get(id) ?? "";
    const key = `${name}\x00${platform}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Pure merge for composite child results. Round-robin union ensures
// the final overShootLimit slice keeps items from every child instead
// of being dominated by the longest one.
export function mergeCompositeResults(childResults: ReadonlyArray<ReadonlyArray<number>>, combine: "union" | "intersection"): number[] {
  if (childResults.length === 0) return [];
  if (combine === "intersection") {
    const others = childResults.slice(1).map((arr) => new Set(arr));
    const first = childResults[0] ?? [];
    return first.filter((id) => others.every((s) => s.has(id)));
  }
  const seen = new Set<number>();
  const merged: number[] = [];
  const cursors = childResults.map(() => 0);
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (let i = 0; i < childResults.length; i++) {
      const arr = childResults[i];
      // Skip past already-merged ids (de-dupe) until this child yields a
      // fresh entry or exhausts its list.
      while (cursors[i] < arr.length && seen.has(arr[cursors[i]])) cursors[i]++;
      if (cursors[i] < arr.length) {
        const id = arr[cursors[i]++];
        seen.add(id);
        merged.push(id);
        advanced = true;
      }
    }
  }
  return merged;
}

// Report a resolver's pre-limit match count without spreading an optional-call
// branch across every resolver that opts in.
export function emitResolvedTotal(ctx: ResolverContext, total: number): void {
  const cb = ctx.reportTotal;
  if (cb) cb(total);
}

/* Sort keys whose data (metacritic / review% / release date) is often absent
   from the local overview — non-Steam and uninstalled titles. When selected we
   optionally fetch it online first (gated + bounded + cached in enrichApps). */
const META_SORT_KEYS: ReadonlySet<string> = new Set(["metacritic", "review_score", "release_date"]);

function sortNeedsMeta(sort: unknown): boolean {
  const keys = Array.isArray(sort) ? sort : [sort];
  return keys.some((k) => typeof k === "string" && META_SORT_KEYS.has(k));
}

// Enrich (in place, best-effort) the given app overviews so a metacritic /
// review / release sort has values to work with. No-op unless the sub-toggle
// is on (checked inside enrichApps) and the sort actually needs the metadata.
export async function enrichAppsForMetaSort(sort: unknown, apps: AppOverview[]): Promise<void> {
  if (!sortNeedsMeta(sort) || !apps.length) return;
  try {
    const { enrichApps } = require("../core/onlineMetadata") as typeof import("../core/onlineMetadata");
    await enrichApps(apps);
  } catch { /* sort falls back to whatever's local */ }
}

export async function enrichForSort(sort: unknown, ids: number[], all: AppOverview[]): Promise<void> {
  if (!sortNeedsMeta(sort) || !ids.length) return;
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
  await enrichAppsForMetaSort(sort, ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[]);
}

/* genres/categories: the local client never carries these as name strings,
   even for owned games — always needs the fetch. vrSupport/multiplayerType
   have a fast local path for owned games (see v3Extensions.ts) and only
   need the fetch for ids the client has never seen. */
const WEB_CATALOG_FILTER_TYPES = new Set(["genres", "categories"]);

const LOCAL_FIRST_CATALOG_FILTER_TYPES = new Set(["vrSupport", "multiplayerType"]);

export async function prefetchCatalogFilterData(items: FilterItem[], ids: number[], byId: Map<number, AppOverview>): Promise<void> {
  const needsWebCatalog = items.some((item) => WEB_CATALOG_FILTER_TYPES.has(item.type));
  const needsLocalFirstCatalog = items.some((item) => LOCAL_FIRST_CATALOG_FILTER_TYPES.has(item.type));
  const needsFranchise = items.some((item) => item.type === "franchise");
  if (needsWebCatalog || needsLocalFirstCatalog) {
    // genres/categories need every id (local never has the data); vrSupport/
    // multiplayerType only need ids the client has never seen.
    const targetIds = needsWebCatalog ? ids : ids.filter((id) => !byId.has(id));
    if (targetIds.length) {
      const { getCatalogMetaMap } = await import("../core/onlineStore");
      await getCatalogMetaMap(targetIds);
    }
  }
  if (needsFranchise) {
    const { prefetchFranchise } = await import("./v3Extensions");
    await prefetchFranchise(ids);
  }
  // libraryLocation reads a cache kept warm by deviceState.ts's own event-driven
  // refresh; only force a fetch here for the very first resolve, before that
  // refresh has landed — later resolves reuse the already-warm cache.
  if (!isLibraryLocationsWarm() && items.some((item) => item.type === "libraryLocation")) {
    await refreshLibraryLocations();
  }
}
