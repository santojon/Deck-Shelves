import type { AppOverview } from "./index";
import { getCachedCatalogMeta } from "../core/onlineStore";
import { steamAppStore, steamClient } from "./internals";
import { customTagsFor, historyIds, pinnedIds, sessionQueueIds, temporaryQueueIds } from "../runtime/gameLists";
import { shortcutTagsFor } from "../runtime/shortcutTags";
import { achievementPercent, achievementsOf } from "./achievements";
import { dynamicCollectionAppIds, normalizeText } from "./collections";
import { friendsOwningCount } from "./friendsOwned";

function appIdOf(a: any): number {
  return Number(a?.appid ?? a?.m_unAppID ?? 0);
}

// Strictly local; never falls back to fetched catalog data.
function rawLocalOverview(appid: number): any | null {
  try {
    const store = steamAppStore();
    return store?.GetAppOverviewByAppID?.(appid) ?? null;
  } catch { return null; }
}

// Franchise has no local field; the client's store-details cache is the only source.
const _franchiseCache = new Map<number, string | null>();

function getCachedFranchise(appid: number): string | undefined {
  return _franchiseCache.has(appid) ? (_franchiseCache.get(appid) ?? undefined) : undefined;
}

function extractFranchiseName(raw: any): string | null {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const assoc = Array.isArray(parsed) ? parsed.find((s: unknown) => (s as Record<number, unknown> | null | undefined)?.[0] === "associations") : null;
  const franchises = assoc?.[1]?.data?.rgFranchises;
  return Array.isArray(franchises) && franchises[0]?.strName ? String(franchises[0].strName) : null;
}

async function fetchOneFranchise(appid: number): Promise<void> {
  const client = steamClient();
  try {
    const raw = await client?.Apps?.GetCachedAppDetails?.(appid);
    _franchiseCache.set(appid, extractFranchiseName(raw));
  } catch { _franchiseCache.set(appid, null); }
}

export async function prefetchFranchise(appids: number[]): Promise<void> {
  const toFetch = appids.filter((id) => !_franchiseCache.has(id)).slice(0, 60);
  await Promise.all(toFetch.map(fetchOneFranchise));
}

function namedList(values: string[] | undefined): Array<{ name: string }> {
  return (values ?? []).map((name) => ({ name }));
}

// Fallback for ids the client has never seen; never for ownership or play history.
function catalogFallbackOverview(appid: number): any | null {
  try {
    const meta = getCachedCatalogMeta(appid);
    const franchise = getCachedFranchise(appid);
    if (!meta && franchise === undefined) return null;
    const categories = namedList(meta?.categories);
    const genres = namedList(meta?.genres);
    return {
      categories, store_categories: categories, store_tags: categories,
      genres, rt_genres: genres,
      vr_supported: meta?.vrSupported, rt_vr_supported: meta?.vrSupported, vr_support: meta?.vrSupported,
      franchise, rt_franchise: franchise,
    };
  } catch { return null; }
}

// Per field: owned games have a local overview but lack genre and franchise data.
function rawField<T = unknown>(appid: number, ...keys: string[]): T | undefined {
  const local = rawLocalOverview(appid);
  if (local) {
    for (const k of keys) {
      if (local[k] !== undefined && local[k] !== null) return local[k] as T;
    }
  }
  const fetched = catalogFallbackOverview(appid);
  if (!fetched) return undefined;
  for (const k of keys) {
    if (fetched[k] !== undefined && fetched[k] !== null) return fetched[k] as T;
  }
  return undefined;
}

export type FilterEvaluator = (item: any, app: AppOverview) => boolean;

function evalGenres(item: any, app: AppOverview): boolean {
  const want: string[] = Array.isArray(item.params?.genres) ? item.params.genres.map((g: string) => String(g).toLowerCase()) : [];
  if (!want.length) return true;
  const raw = rawField<any[]>(appIdOf(app), "rt_genres", "genres", "store_categories");
  if (!Array.isArray(raw)) return false;
  const have = raw.map((g) => String((g as any)?.name ?? (g as any)?.display_name ?? g).toLowerCase());
  return want.some((g) => have.includes(g));
}

function evalCategories(item: any, app: AppOverview): boolean {
  const want: string[] = Array.isArray(item.params?.categories) ? item.params.categories.map((c: string) => String(c).toLowerCase()) : [];
  if (!want.length) return true;
  const raw = rawField<any[]>(appIdOf(app), "categories", "store_categories", "store_tags");
  if (!Array.isArray(raw)) return false;
  const have = raw.map((c) => String((c as any)?.name ?? c).toLowerCase());
  return want.some((c) => have.includes(c));
}

function evalFranchise(item: any, app: AppOverview): boolean {
  const want = String(item.params?.franchise ?? "").trim().toLowerCase();
  if (!want) return true;
  const raw = rawField<string>(appIdOf(app), "franchise", "rt_franchise");
  return typeof raw === "string" && raw.toLowerCase().includes(want);
}

const VR_ONLY_IDS = [401];
const VR_SUPPORTED_IDS = [402, 31];
type VrLevel = "only" | "supported" | "none";

function vrLevelFromLocal(appid: number): VrLevel | null {
  const local = rawLocalOverview(appid);
  if (!local || typeof local.BHasStoreCategory !== "function") return null;
  if (VR_ONLY_IDS.some((id) => local.BHasStoreCategory(id))) return "only";
  if (VR_SUPPORTED_IDS.some((id) => local.BHasStoreCategory(id))) return "supported";
  return null;
}

function vrLevelFromCatalog(appid: number): VrLevel | null {
  const cats = getCachedCatalogMeta(appid)?.categories ?? [];
  if (cats.some((c) => /\bvr only\b/i.test(c))) return "only";
  if (cats.some((c) => /\bvr support(ed)?\b/i.test(c))) return "supported";
  return null;
}

function vrLevelOf(app: AppOverview): VrLevel {
  const appid = appIdOf(app);
  const known = vrLevelFromLocal(appid) ?? vrLevelFromCatalog(appid);
  if (known) return known;
  const raw = rawField<boolean | number>(appid, "vr_supported", "rt_vr_supported", "vr_support");
  return raw === true || raw === 1 ? "supported" : "none";
}

// Filters saved without `levels` match any VR title.
function evalVrSupport(item: any, app: AppOverview): boolean {
  const level = vrLevelOf(app);
  const levels: string[] = Array.isArray(item?.params?.levels) ? item.params.levels : [];
  return levels.length ? levels.includes(level) : level !== "none";
}

export const STORE_CATEGORY = {
  multiplayer: 1,
  singlePlayer: 2,
  coop: 9,
  sharedScreen: 24,
  crossPlatformMultiplayer: 27,
  onlinePvp: 36,
  sharedScreenPvp: 37,
  onlineCoop: 38,
  sharedScreenCoop: 39,
  lanCoop: 48,
  pvp: 49,
  partialController: 18,
  steamAchievements: 22,
  steamCloud: 23,
  fullController: 28,
  workshop: 30,
  vrSupport: 31,
  remotePlayTogether: 44,
  hdr: 61,
} as const;
const C = STORE_CATEGORY;

const MP_CATEGORY_IDS: Record<string, number[]> = {
  single: [C.singlePlayer],
  multi: [C.multiplayer],
  coop: [C.coop, C.onlineCoop, C.sharedScreenCoop, C.lanCoop],
  online: [C.crossPlatformMultiplayer, C.onlinePvp, C.onlineCoop],
  any: [C.multiplayer, C.coop, C.crossPlatformMultiplayer, C.onlinePvp, C.onlineCoop, C.sharedScreenCoop, C.lanCoop, C.pvp],
};

export function hasStoreCategory(appid: number, ids: readonly number[]): boolean | null {
  const local = rawLocalOverview(appid);
  if (!local || typeof local.BHasStoreCategory !== "function") return null;
  return ids.some((id) => local.BHasStoreCategory(id));
}

function evalMultiplayerTypeLocal(app: AppOverview, want: string): boolean | null {
  const ids = MP_CATEGORY_IDS[want];
  return ids ? hasStoreCategory(appIdOf(app), ids) : false;
}

function evalMultiplayerTypeFetched(app: AppOverview, want: string): boolean {
  const raw = rawField<any[]>(appIdOf(app), "categories", "store_categories");
  if (!Array.isArray(raw)) return false;
  const names = raw.map((c) => String((c as any)?.name ?? c).toLowerCase());
  if (want === "any") return names.some((n) => /player|coop|multi|online/.test(n));
  if (want === "single") return names.some((n) => /single.player/.test(n));
  if (want === "multi")  return names.some((n) => /multi.player|multi.online/.test(n));
  if (want === "coop")   return names.some((n) => /co.?op/.test(n));
  if (want === "online") return names.some((n) => /online/.test(n));
  return false;
}

function evalMultiplayerType(item: any, app: AppOverview): boolean {
  const want = String(item.params?.kind ?? "any").toLowerCase();
  const local = evalMultiplayerTypeLocal(app, want);
  return local != null ? local : evalMultiplayerTypeFetched(app, want);
}

function evalPlayedOnce(item: any, app: AppOverview): boolean {
  const max = Number(item.params?.maxMinutes ?? 60);
  const played = Number(app.playtime_forever ?? 0);
  return played > 0 && played <= max;
}

function evalInstalledSizeRange(item: any, app: AppOverview): boolean {
  const size = Number(app.size_on_disk ?? 0);
  if (!size) return false;
  const sizeMb = size / (1024 * 1024);
  const min = Number(item.params?.minMB ?? 0);
  const max = Number(item.params?.maxMB ?? Number.POSITIVE_INFINITY);
  return sizeMb >= min && sizeMb <= max;
}

function anyTagMatches(item: any, tags: readonly string[]): boolean {
  const want: string[] = Array.isArray(item.params?.tags) ? item.params.tags.map((t: string) => String(t).toLowerCase()) : [];
  if (!want.length) return true;
  const have = tags.map((t) => t.toLowerCase());
  return want.some((t) => have.includes(t));
}

function evalCustomTags(item: any, app: AppOverview): boolean {
  return anyTagMatches(item, customTagsFor(appIdOf(app)));
}

function evalParserCategories(item: any, app: AppOverview): boolean {
  return anyTagMatches(item, shortcutTagsFor(appIdOf(app)));
}

function reviewScoreOf(app: AppOverview, source: string): number | undefined {
  const key = source === "steam" ? "review_percentage" : "metacritic_score";
  const v = (app as any)[key];
  return typeof v === "number" ? v : undefined;
}
function evalReviewScore(item: any, app: AppOverview): boolean {
  const value = Number(item.params?.value ?? 0);
  const op = String(item.params?.op ?? ">=");
  const score = reviewScoreOf(app, String(item.params?.source ?? "metacritic"));
  if (score == null) return false;
  return op === "<=" ? score <= value : score >= value;
}

// No `ts` yet doesn't constrain; "unknown" matches an app without the date.
function dateMatches(sec: number, item: any): boolean {
  const op = String(item.params?.op ?? "after");
  if (op === "unknown") return !sec;
  const ts = Number(item.params?.ts ?? 0);
  if (!ts) return true;
  if (!sec) return false;
  return op === "before" ? sec <= ts : sec >= ts;
}

function releaseSecOf(app: AppOverview): number {
  return Number(app.rt_original_release_date ?? (app as any).rt_steam_release_date ?? 0);
}
function evalReleaseDate(item: any, app: AppOverview): boolean {
  return dateMatches(releaseSecOf(app), item);
}
function evalPurchaseDate(item: any, app: AppOverview): boolean {
  return dateMatches(Number(app.rt_purchased_time ?? 0), item);
}

function evalStoreCategory(item: any, app: AppOverview): boolean {
  const ids: number[] = Array.isArray(item.params?.ids) ? item.params.ids.map(Number).filter(Number.isFinite) : [];
  if (!ids.length) return true;
  const has = (id: number) => hasStoreCategory(appIdOf(app), [id]) === true;
  return item.params?.mode === "all" ? ids.every(has) : ids.some(has);
}

function evalComingSoon(_item: any, app: AppOverview): boolean {
  const rel = releaseSecOf(app);
  return rel > Date.now() / 1000;
}

function wantedTags(item: any): string[] {
  const tags: unknown[] = Array.isArray(item.params?.tags) ? item.params.tags : [];
  return tags.map((t) => normalizeText(String(t))).filter(Boolean);
}

function tagNameOf(id: number): string {
  try { return normalizeText(String(steamAppStore()?.GetLocalizationForStoreTag?.(id) ?? "")); } catch { return ""; }
}

function evalStoreTag(item: any, app: AppOverview): boolean {
  const want = wantedTags(item);
  if (!want.length) return true;
  const local = rawLocalOverview(appIdOf(app));
  if (typeof local?.GetStoreTags !== "function") return false;
  const have = new Set<string>();
  for (const id of local.GetStoreTags() ?? []) { have.add(String(id)); have.add(tagNameOf(id)); }
  return item.params?.mode === "all" ? want.every((t) => have.has(t)) : want.some((t) => have.has(t));
}

function evalFriends(item: any, app: AppOverview): boolean {
  const min = Math.max(1, Number(item.params?.min ?? 1));
  const among: number[] = Array.isArray(item.params?.friends) ? item.params.friends.map(Number) : [];
  return friendsOwningCount(appIdOf(app), among) >= min;
}

function evalAchievements(item: any, app: AppOverview): boolean {
  const counts = achievementsOf(appIdOf(app));
  if (!counts || counts.total === 0) return false;
  const min = Number(item.params?.min ?? 1);
  const max = Number(item.params?.max ?? Number.POSITIVE_INFINITY);
  return counts.achieved >= min && counts.achieved <= (max > 0 ? max : Number.POSITIVE_INFINITY);
}

function evalAchievementPercentRange(item: any, app: AppOverview): boolean {
  const pct = achievementPercent(appIdOf(app));
  if (pct === undefined) return false;
  return pct >= Number(item.params?.min ?? 0) && pct <= Number(item.params?.max ?? 100);
}

function evalNeverCompleted(_item: any, app: AppOverview): boolean {
  const pct = achievementPercent(appIdOf(app));
  return pct !== undefined && pct < 100;
}

function isBorrowed(app: AppOverview): boolean {
  try { return rawLocalOverview(appIdOf(app))?.BIsBorrowed?.() === true; } catch { return false; }
}

export const FILTER_V3_EVALUATORS: Record<string, FilterEvaluator> = {
  genres: evalGenres,
  categories: evalCategories,
  franchise: evalFranchise,
  vrSupport: evalVrSupport,
  multiplayerType: evalMultiplayerType,
  playedOnce: evalPlayedOnce,
  installedSizeRange: evalInstalledSizeRange,
  customTags: evalCustomTags,
  parserCategories: evalParserCategories,
  reviewScore: evalReviewScore,
  releaseDate: evalReleaseDate,
  comingSoon: evalComingSoon,
  storeTag: evalStoreTag,
  storeCategory: evalStoreCategory,
  purchaseDate: evalPurchaseDate,
  friends: evalFriends,
  achievements: evalAchievements,
  achievementPercentRange: evalAchievementPercentRange,
  neverCompleted: evalNeverCompleted,
  familySharing: (_item, app) => isBorrowed(app),
};

export type SortComparator = (a: AppOverview, b: AppOverview) => number;

function friendsPlayingCountOf(app: AppOverview): number {
  try {
    const { getFriendsInApp } = require("../runtime/friendsState");
    return getFriendsInApp(appIdOf(app), false).length;
  } catch { return 0; }
}

// Merged pools hold bare `{ appid }` placeholders for unowned items, so ask the client.
function isOwnedLocally(app: AppOverview): boolean {
  return rawLocalOverview(appIdOf(app)) !== null;
}

const pctOf = (app: AppOverview) => achievementPercent(appIdOf(app)) ?? -1;
// Nearest to 100% first; finished games and games without progress go last.
const remainingOf = (app: AppOverview) => { const pct = pctOf(app); return pct < 0 || pct >= 100 ? Number.POSITIVE_INFINITY : 100 - pct; };
const owningOf = (app: AppOverview) => friendsOwningCount(appIdOf(app));
const trendingOf = (app: AppOverview) => friendsPlayingCountOf(app) * 10 + owningOf(app);

export const SORT_V3_COMPARATORS: Record<string, SortComparator> = {
  friends_playing_now:    (a, b) => friendsPlayingCountOf(b) - friendsPlayingCountOf(a),
  owned_games:            (a, b) => (isOwnedLocally(b) ? 1 : 0) - (isOwnedLocally(a) ? 1 : 0),
  completion_percent:     (a, b) => pctOf(b) - pctOf(a),
  closest_to_completion:  (a, b) => remainingOf(a) - remainingOf(b),
  most_friends_owning:    (a, b) => owningOf(b) - owningOf(a),
  trending_among_friends: (a, b) => trendingOf(b) - trendingOf(a),
  family_shared_games:    (a, b) => (isBorrowed(b) ? 1 : 0) - (isBorrowed(a) ? 1 : 0),
};

export type ShelfSourceResolver = (all: AppOverview[]) => AppOverview[];

function fromIdList(all: AppOverview[], ids: number[]): AppOverview[] {
  if (!ids.length) return [];
  const byId = new Map(all.map((a) => [appIdOf(a), a] as const));
  return [...new Set(ids)].map((id) => byId.get(id)).filter((a): a is AppOverview => !!a);
}

export const SOURCE_V3_RESOLVERS: Record<string, ShelfSourceResolver> = {
  dynamic_collections: (all) => { const ids = dynamicCollectionAppIds(); return all.filter((a) => ids.has(appIdOf(a))); },
  // Last pinned first.
  pinned_games: (all) => fromIdList(all, pinnedIds().slice().reverse()),
  history_source: (all) => fromIdList(all, historyIds()),
  session_queue_source: (all) => fromIdList(all, sessionQueueIds()),
  temporary_queue_source: (all) => fromIdList(all, temporaryQueueIds()),
};

export interface V3Descriptor {
  id: string;
  displayName: string;
  category?: string;
}

export const V3_FILTER_DESCRIPTORS: V3Descriptor[] = [
  { id: "genres",             displayName: "Genres",             category: "steam-metadata" },
  { id: "categories",         displayName: "Categories",         category: "steam-metadata" },
  { id: "franchise",          displayName: "Franchise",          category: "steam-metadata" },
  { id: "vrSupport",          displayName: "VR support",         category: "steam-metadata" },
  { id: "multiplayerType",    displayName: "Multiplayer type",   category: "steam-metadata" },
  { id: "reviewScore",        displayName: "Review score",       category: "steam-metadata" },
  { id: "releaseDate",        displayName: "Release date",       category: "steam-metadata" },
  { id: "comingSoon",         displayName: "Coming soon",        category: "steam-metadata" },
  { id: "playedOnce",         displayName: "Played once only",   category: "user-behaviour" },
  { id: "installedSizeRange", displayName: "Installed size",     category: "storage" },
  { id: "customTags",         displayName: "Custom tags",        category: "advanced-non-steam" },
  { id: "parserCategories",   displayName: "Parser categories",  category: "advanced-non-steam" },
  { id: "storeTag",           displayName: "Store tag",          category: "steam-metadata" },
  { id: "storeCategory",      displayName: "Steam features",     category: "steam-metadata" },
  { id: "purchaseDate",       displayName: "Purchase date",      category: "steam-metadata" },
  { id: "familySharing",      displayName: "Family sharing",     category: "steam-metadata" },
  { id: "friends",            displayName: "Friends who own",    category: "social" },
  { id: "achievements",       displayName: "Achievements",       category: "user-behaviour" },
  { id: "achievementPercentRange", displayName: "Achievement percentage", category: "user-behaviour" },
  { id: "neverCompleted",     displayName: "Never completed",    category: "user-behaviour" },
  { id: "weightedFilter",     displayName: "Weighted filter",    category: "composite" },
  { id: "priorityFilter",     displayName: "Priority filter",    category: "composite" },
  { id: "exclusionGroup",     displayName: "Exclusion group",    category: "composite" },
];

export const V3_SORT_DESCRIPTORS: V3Descriptor[] = [
  { id: "friends_playing_now",    displayName: "Friends playing now" },
  { id: "owned_games",            displayName: "Games I own" },
  { id: "completion_percent",     displayName: "Completion %" },
  { id: "closest_to_completion",  displayName: "Closest to completion" },
  { id: "most_friends_owning",    displayName: "Most friends owning" },
  { id: "trending_among_friends", displayName: "Trending among friends" },
  { id: "family_shared_games",    displayName: "Family-shared games" },
];

export const V3_SOURCE_DESCRIPTORS: V3Descriptor[] = [
  { id: "dynamic_collections",    displayName: "Dynamic collections", category: "steam" },
  { id: "pinned_games",           displayName: "Pinned games",    category: "manual" },
  { id: "history_source",         displayName: "Play history",    category: "manual" },
  { id: "session_queue_source",   displayName: "Session queue",   category: "manual" },
  { id: "temporary_queue_source", displayName: "Temporary queue", category: "manual" },
];
