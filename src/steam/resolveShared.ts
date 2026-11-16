import { type AppOverview, appIdOf, appNameOf, isNonSteamOf, readCollectionList, pushAppIdsFromCollection } from "./appOverview";
import type { FilterGroup, FilterItem, Settings } from "../types";
import type { ResolverContext } from "./resolverContext";
import { type SteamCollectionLike, steamCollectionStore } from "./internals";
import { isLibraryLocationsWarm, refreshLibraryLocations } from "../runtime/deviceState";
import { normalizeText } from "./collections";
import { flattenItems } from "./filterEval";
import { loadAchievements } from "./achievements";
import { loadFriendsOwned } from "./friendsOwned";

function isOnlineFeaturesEnabledRaw(): boolean {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.("deck-shelves-settings-cache-v3");
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data?.offlineModeEnabled === true) return false;
    return data?.onlineFeaturesEnabled === true;
  } catch { return false; }
}

export function isOnlineEnabledForSettings(s: Settings | null | undefined): boolean {
  if (s?.offlineModeEnabled === true) return false;
  return s?.onlineFeaturesEnabled ?? isOnlineFeaturesEnabledRaw();
}

export function collectFilterGroupItemsFlat(group: FilterGroup): FilterItem[] {
  return flattenItems(group?.items);
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

// Keyed by every "[Unifideck] …" collection so no translated collection name is matched.
let platformCache: { map: Map<number, string>; ts: number } | null = null;

function buildNonSteamPlatformMap(): Map<number, string> {
  const now = Date.now();
  if (platformCache && now - platformCache.ts < 5000) return platformCache.map;
  const map = new Map<number, string>();
  try {
    const groups = new Map<number, string[]>();
    // Raw storage map; the `userCollections` computed is MobX-unsafe.
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

// Round-robin so the final slice keeps items from every child.
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

export function emitResolvedTotal(ctx: ResolverContext, total: number): void {
  const cb = ctx.reportTotal;
  if (cb) cb(total);
}

const META_SORT_KEYS: ReadonlySet<string> = new Set(["metacritic", "review_score", "release_date"]);
const ACHIEVEMENT_SORT_KEYS: ReadonlySet<string> = new Set(["completion_percent", "closest_to_completion"]);
const FRIENDS_OWNED_SORT_KEYS: ReadonlySet<string> = new Set(["most_friends_owning", "trending_among_friends"]);

function sortKeysOf(sort: unknown): string[] {
  const keys = Array.isArray(sort) ? sort : [sort];
  return keys.filter((k): k is string => typeof k === "string");
}

function sortNeedsMeta(sort: unknown): boolean {
  return sortKeysOf(sort).some((k) => META_SORT_KEYS.has(k));
}

function sortNeedsData(sort: unknown): boolean {
  return sortKeysOf(sort).some((k) => META_SORT_KEYS.has(k) || ACHIEVEMENT_SORT_KEYS.has(k) || FRIENDS_OWNED_SORT_KEYS.has(k));
}

export async function enrichAppsForMetaSort(sort: unknown, apps: AppOverview[]): Promise<void> {
  if (!sortNeedsData(sort) || !apps.length) return;
  const keys = sortKeysOf(sort);
  if (keys.some((k) => ACHIEVEMENT_SORT_KEYS.has(k))) await loadAchievements(apps);
  if (keys.some((k) => FRIENDS_OWNED_SORT_KEYS.has(k)) && isOnlineFeaturesEnabledRaw()) await loadFriendsOwned();
  if (!sortNeedsMeta(sort)) return;
  try {
    const { enrichApps } = require("../core/onlineMetadata") as typeof import("../core/onlineMetadata");
    await enrichApps(apps);
  } catch {}
}

export async function enrichForSort(sort: unknown, ids: number[], all: AppOverview[]): Promise<void> {
  if (!sortNeedsData(sort) || !ids.length) return;
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
  await enrichAppsForMetaSort(sort, ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[]);
}

// The client never has genre or category names, even for owned games.
const WEB_CATALOG_FILTER_TYPES = new Set(["genres", "categories"]);

const LOCAL_FIRST_CATALOG_FILTER_TYPES = new Set(["vrSupport", "multiplayerType"]);

const ACHIEVEMENT_FILTER_TYPES = new Set(["achievements", "achievementPercentRange", "neverCompleted"]);

async function prefetchClientData(items: FilterItem[], ids: number[], byId: Map<number, AppOverview>): Promise<void> {
  if (items.some((item) => ACHIEVEMENT_FILTER_TYPES.has(item.type))) {
    await loadAchievements(ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[]);
  }
  if (items.some((item) => item.type === "friends") && isOnlineFeaturesEnabledRaw()) await loadFriendsOwned();
}

export async function prefetchCatalogFilterData(items: FilterItem[], ids: number[], byId: Map<number, AppOverview>): Promise<void> {
  const needsWebCatalog = items.some((item) => WEB_CATALOG_FILTER_TYPES.has(item.type));
  const needsLocalFirstCatalog = items.some((item) => LOCAL_FIRST_CATALOG_FILTER_TYPES.has(item.type));
  const needsFranchise = items.some((item) => item.type === "franchise");
  if (needsWebCatalog || needsLocalFirstCatalog) {
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
  await prefetchClientData(items, ids, byId);
  // Only the first resolve, before the event-driven refresh lands, fetches here.
  if (!isLibraryLocationsWarm() && items.some((item) => item.type === "libraryLocation")) {
    await refreshLibraryLocations();
  }
}
