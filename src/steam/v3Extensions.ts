import type { AppOverview } from "./index";

function appIdOf(a: any): number {
  return Number(a?.appid ?? a?.m_unAppID ?? 0);
}
function isNonSteamOf(a: any): boolean {
  return a?.app_type === 1073741824 || a?.is_non_steam === true;
}
function isInstalledOf(a: any): boolean {
  return a?.installed === true || a?.is_installed === true;
}

function rawOverview(appid: number): any | null {
  try {
    const store = (globalThis as any).appStore;
    return store?.GetAppOverviewByAppID?.(appid) ?? null;
  } catch { return null; }
}

function rawField<T = unknown>(appid: number, ...keys: string[]): T | undefined {
  const raw = rawOverview(appid);
  if (!raw) return undefined;
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return raw[k] as T;
  }
  return undefined;
}

function parseLaunchOptions(appid: number): string[] {
  const raw = rawField<string>(appid, "rt_launch_command_line", "launch_options");
  if (!raw || typeof raw !== "string") return [];
  return raw.split(/\s+/).filter(Boolean);
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

function evalVrSupport(_item: any, app: AppOverview): boolean {
  const raw = rawField<boolean | number>(appIdOf(app), "vr_supported", "rt_vr_supported", "vr_support");
  return raw === true || raw === 1;
}

function evalMultiplayerType(item: any, app: AppOverview): boolean {
  const want = String(item.params?.kind ?? "any").toLowerCase();
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

function evalFamilySharing(_item: any, app: AppOverview): boolean {
  const raw = rawField<boolean>(appIdOf(app), "family_sharing", "rt_family_sharing", "family_shareable");
  return raw === true;
}

function evalDlcOwned(item: any, app: AppOverview): boolean {
  const min = Number(item.params?.minCount ?? 1);
  const raw = rawField<number[]>(appIdOf(app), "rt_owned_dlc", "owned_dlc", "dlc_owned");
  if (!Array.isArray(raw)) return false;
  return raw.length >= min;
}

function evalSoundtrackOwned(_item: any, app: AppOverview): boolean {
  const raw = rawField<number[] | boolean>(appIdOf(app), "rt_owned_soundtrack", "soundtrack_owned");
  if (typeof raw === "boolean") return raw;
  return Array.isArray(raw) && raw.length > 0;
}

function evalLaunchCount(item: any, app: AppOverview): boolean {
  const min = Number(item.params?.min ?? 0);
  const max = Number(item.params?.max ?? Number.POSITIVE_INFINITY);
  const totalMinutes = Number((app as any).playtime_forever ?? 0);
  const launchCount = rawField<number>(appIdOf(app), "rt_launch_count", "launch_count")
    ?? Math.floor(totalMinutes / 45); // 45-min session proxy
  return launchCount >= min && launchCount <= max;
}

function evalAvgSessionMinutes(item: any, app: AppOverview): boolean {
  const minM = Number(item.params?.min ?? 0);
  const maxM = Number(item.params?.max ?? Number.POSITIVE_INFINITY);
  const totalMinutes = Number((app as any).playtime_forever ?? 0);
  const launchCount = rawField<number>(appIdOf(app), "rt_launch_count", "launch_count") ?? Math.floor(totalMinutes / 45);
  if (!launchCount) return false;
  const avg = totalMinutes / launchCount;
  return avg >= minM && avg <= maxM;
}

function evalNeverCompleted(_item: any, app: AppOverview): boolean {
  const pct = rawField<number>(appIdOf(app), "rt_achievement_completion", "achievement_completion", "achievement_percentage");
  return typeof pct === "number" ? pct < 100 : false;
}

function evalRecentlyAbandoned(item: any, app: AppOverview): boolean {
  const last = Number((app as any).last_played ?? 0);
  if (!last) return false;
  const minDaysAgo = Number(item.params?.minDaysAgo ?? 7);
  const maxDaysAgo = Number(item.params?.maxDaysAgo ?? 60);
  const daysAgo = (Date.now() / 1000 - last) / 86400;
  return daysAgo >= minDaysAgo && daysAgo <= maxDaysAgo;
}

function evalInstalledNeverPlayed(_item: any, app: AppOverview): boolean {
  const installed = isInstalledOf(app);
  const played = Number((app as any).playtime_forever ?? 0);
  return installed && played === 0;
}

function evalPlayedOnce(item: any, app: AppOverview): boolean {
  const max = Number(item.params?.maxMinutes ?? 60);
  const played = Number((app as any).playtime_forever ?? 0);
  return played > 0 && played <= max;
}

function evalAchievementPercentRange(item: any, app: AppOverview): boolean {
  const pct = rawField<number>(appIdOf(app), "rt_achievement_completion", "achievement_completion", "achievement_percentage");
  if (typeof pct !== "number") return false;
  const min = Number(item.params?.min ?? 0);
  const max = Number(item.params?.max ?? 100);
  return pct >= min && pct <= max;
}

function evalStorageDevice(item: any, app: AppOverview): boolean {
  const want = String(item.params?.device ?? "ssd").toLowerCase();
  const folder = rawField<string>(appIdOf(app), "install_folder", "rt_install_folder", "path");
  if (!folder) return false;
  const isSd = /\/run\/media\/mmcblk|\/mmcblk|sd\sCard/i.test(folder);
  return want === "sd" ? isSd : !isSd;
}

function evalInstalledSizeRange(item: any, app: AppOverview): boolean {
  const size = Number(rawField<number>(appIdOf(app), "size_on_disk", "rt_size_on_disk") ?? 0);
  if (!size) return false;
  const sizeMb = size / (1024 * 1024);
  const min = Number(item.params?.minMB ?? 0);
  const max = Number(item.params?.maxMB ?? Number.POSITIVE_INFINITY);
  return sizeMb >= min && sizeMb <= max;
}

function evalCompatDataQuality(_item: any, app: AppOverview): boolean {
  const cat = Number((app as any).deck_compatibility_category ?? 0);
  // 0 = unknown, 1 = unsupported, 2 = playable, 3 = verified.
  return cat > 0;
}

function execContains(appid: number, ...needles: string[]): boolean {
  const cmd = rawField<string>(appid, "rt_launch_command_line", "launch_options") ?? "";
  const exe = rawField<string>(appid, "rt_exe", "exe") ?? "";
  const haystack = (cmd + " " + exe).toLowerCase();
  return needles.some((n) => haystack.includes(n.toLowerCase()));
}

function evalEmuDeckSystem(_item: any, app: AppOverview): boolean {
  if (!isNonSteamOf(app)) return false;
  return execContains(appIdOf(app), "emudeck", "EmuDeck/", "Emulation/");
}
function evalRetroDeckSystem(_item: any, app: AppOverview): boolean {
  if (!isNonSteamOf(app)) return false;
  return execContains(appIdOf(app), "retrodeck", "RetroDECK/", "/retrodeck");
}
function evalHeroicLauncher(_item: any, app: AppOverview): boolean {
  if (!isNonSteamOf(app)) return false;
  return execContains(appIdOf(app), "heroic", "Heroic/", "heroic-launcher");
}
function evalLutrisApp(_item: any, app: AppOverview): boolean {
  if (!isNonSteamOf(app)) return false;
  return execContains(appIdOf(app), "lutris", "lutris-wrapper");
}
function evalChiakiApp(_item: any, app: AppOverview): boolean {
  if (!isNonSteamOf(app)) return false;
  return execContains(appIdOf(app), "chiaki", "chiaki-ng");
}
function evalMoonlightApp(_item: any, app: AppOverview): boolean {
  if (!isNonSteamOf(app)) return false;
  return execContains(appIdOf(app), "moonlight", "moonlight-qt");
}

function evalExecutableType(item: any, app: AppOverview): boolean {
  const want = String(item.params?.ext ?? "").toLowerCase().replace(/^\./, "");
  if (!want) return true;
  const cmd = rawField<string>(appIdOf(app), "rt_launch_command_line", "launch_options") ?? "";
  const exe = rawField<string>(appIdOf(app), "rt_exe", "exe") ?? "";
  return cmd.toLowerCase().includes("." + want) || exe.toLowerCase().endsWith("." + want);
}

function evalLaunchOptionTags(item: any, app: AppOverview): boolean {
  const want: string[] = Array.isArray(item.params?.tags) ? item.params.tags.map((t: string) => String(t).toLowerCase()) : [];
  if (!want.length) return true;
  const tokens = parseLaunchOptions(appIdOf(app)).map((t) => t.toLowerCase());
  return want.some((t) => tokens.includes(t));
}

function evalCustomTags(item: any, app: AppOverview): boolean {
  const want: string[] = Array.isArray(item.params?.tags) ? item.params.tags.map((t: string) => String(t).toLowerCase()) : [];
  if (!want.length) return true;
  const cache = (globalThis as any).__ds_custom_tags_v1 ?? {};
  const tags = (cache[appIdOf(app)] ?? []) as string[];
  const have = tags.map((t) => t.toLowerCase());
  return want.some((t) => have.includes(t));
}

function evalParserCategories(item: any, app: AppOverview): boolean {
  return evalCustomTags(item, app);
}

function evalHiddenLauncherShortcuts(_item: any, app: AppOverview): boolean {
  return isNonSteamOf(app) && (app as any).is_hidden === true;
}

function evalWeighted(item: any, app: AppOverview): boolean {
  // Treat as OR but require sum-of-weights ≥ threshold.
  const children: any[] = Array.isArray(item.params?.children) ? item.params.children : [];
  const threshold = Number(item.params?.threshold ?? 1);
  let sum = 0;
  for (const c of children) {
    const w = Number(c.weight ?? 1);
    const evaluator = FILTER_V3_EVALUATORS[c.type] ?? null;
    if (evaluator && evaluator(c, app)) sum += w;
  }
  return sum >= threshold;
}

function evalPriority(item: any, app: AppOverview): boolean {
  // First child that matches wins (and reports true).
  const children: any[] = Array.isArray(item.params?.children) ? item.params.children : [];
  for (const c of children) {
    const evaluator = FILTER_V3_EVALUATORS[c.type] ?? null;
    if (evaluator && evaluator(c, app)) return true;
  }
  return false;
}

function evalExclusionGroup(item: any, app: AppOverview): boolean {
  // ANY child matches → exclude (returns false).
  const children: any[] = Array.isArray(item.params?.children) ? item.params.children : [];
  return !children.some((c) => {
    const evaluator = FILTER_V3_EVALUATORS[c.type] ?? null;
    return evaluator ? evaluator(c, app) : false;
  });
}

export const FILTER_V3_EVALUATORS: Record<string, FilterEvaluator> = {
  genres: evalGenres,
  categories: evalCategories,
  franchise: evalFranchise,
  vrSupport: evalVrSupport,
  multiplayerType: evalMultiplayerType,
  familySharing: evalFamilySharing,
  dlcOwned: evalDlcOwned,
  soundtrackOwned: evalSoundtrackOwned,
  launchCount: evalLaunchCount,
  avgSessionMinutes: evalAvgSessionMinutes,
  neverCompleted: evalNeverCompleted,
  recentlyAbandoned: evalRecentlyAbandoned,
  installedNeverPlayed: evalInstalledNeverPlayed,
  playedOnce: evalPlayedOnce,
  achievementPercentRange: evalAchievementPercentRange,
  storageDevice: evalStorageDevice,
  installedSizeRange: evalInstalledSizeRange,
  compatDataQuality: evalCompatDataQuality,
  emuDeckSystem: evalEmuDeckSystem,
  retroDeckSystem: evalRetroDeckSystem,
  heroicLauncher: evalHeroicLauncher,
  lutrisApp: evalLutrisApp,
  chiakiApp: evalChiakiApp,
  moonlightApp: evalMoonlightApp,
  executableType: evalExecutableType,
  launchOptionTags: evalLaunchOptionTags,
  customTags: evalCustomTags,
  parserCategories: evalParserCategories,
  hiddenLauncherShortcuts: evalHiddenLauncherShortcuts,
  weightedFilter: evalWeighted,
  priorityFilter: evalPriority,
  exclusionGroup: evalExclusionGroup,
};

export type SortComparator = (a: AppOverview, b: AppOverview) => number;

const cmpDesc = (na: number, nb: number) => nb - na;
const cmpAsc  = (na: number, nb: number) => na - nb;

function launchCountOf(app: AppOverview): number {
  const explicit = rawField<number>(appIdOf(app), "rt_launch_count", "launch_count");
  if (typeof explicit === "number") return explicit;
  const total = Number((app as any).playtime_forever ?? 0);
  return Math.floor(total / 45); // 45-min session proxy
}

function avgSessionMinutesOf(app: AppOverview): number {
  const total = Number((app as any).playtime_forever ?? 0);
  const count = launchCountOf(app);
  if (!count) return 0;
  return total / count;
}

function completionPctOf(app: AppOverview): number {
  return rawField<number>(appIdOf(app), "rt_achievement_completion", "achievement_completion", "achievement_percentage") ?? 0;
}

function rarityScoreOf(app: AppOverview): number {
  return rawField<number>(appIdOf(app), "rt_rarest_achievement_score", "rare_achievement_score") ?? 0;
}

function installDateOf(app: AppOverview): number {
  return rawField<number>(appIdOf(app), "rt_install_date", "install_date") ?? 0;
}

function purchaseDateOf(app: AppOverview): number {
  return Number((app as any).rt_purchased_time ?? 0);
}

function sizeOnDiskOf(app: AppOverview): number {
  return Number(rawField<number>(appIdOf(app), "size_on_disk", "rt_size_on_disk") ?? 0);
}

function storageBitOf(app: AppOverview): 0 | 1 {
  const folder = rawField<string>(appIdOf(app), "install_folder", "rt_install_folder", "path");
  if (!folder) return 0;
  return /\/run\/media\/mmcblk|\/mmcblk/i.test(folder) ? 1 : 0; // 1 = SD card
}

function friendsPlayingCountOf(app: AppOverview): number {
  try {
    const { getFriendsPlayingAppIds } = require("../runtime/friendsState");
    return getFriendsPlayingAppIds().has(appIdOf(app)) ? 1 : 0;
  } catch { return 0; }
}

function friendsOwnCountOf(app: AppOverview): number {
  return rawField<number>(appIdOf(app), "rt_friends_owning_count", "friends_owning") ?? 0;
}

export const SORT_V3_COMPARATORS: Record<string, SortComparator> = {
  most_launched:           (a, b) => cmpDesc(launchCountOf(a), launchCountOf(b)),
  least_launched:          (a, b) => cmpAsc(launchCountOf(a), launchCountOf(b)),
  longest_session:         (a, b) => cmpDesc(avgSessionMinutesOf(a), avgSessionMinutesOf(b)),
  shortest_session:        (a, b) => cmpAsc(avgSessionMinutesOf(a), avgSessionMinutesOf(b)),
  most_ignored: (a, b) => {
    const aIdle = Date.now()/1000 - Number((a as any).last_played ?? 0);
    const bIdle = Date.now()/1000 - Number((b as any).last_played ?? 0);
    return cmpDesc(aIdle, bIdle);
  },
  rediscovered_recently: (a, b) => {
    const aIdle = Date.now()/1000 - Number((a as any).last_played ?? 0);
    const bIdle = Date.now()/1000 - Number((b as any).last_played ?? 0);
    return cmpAsc(aIdle, bIdle);
  },
  completion_percent:      (a, b) => cmpDesc(completionPctOf(a), completionPctOf(b)),
  closest_to_completion:   (a, b) => {
    const ax = completionPctOf(a); const bx = completionPctOf(b);
    return cmpAsc(Math.abs(100 - ax), Math.abs(100 - bx));
  },
  rarest_achievements:     (a, b) => cmpDesc(rarityScoreOf(a), rarityScoreOf(b)),
  newest_installed:        (a, b) => cmpDesc(installDateOf(a), installDateOf(b)),
  oldest_installed:        (a, b) => cmpAsc(installDateOf(a), installDateOf(b)),
  oldest_unplayed: (a, b) => {
    const ax = Number((a as any).playtime_forever ?? 0) === 0 ? installDateOf(a) : Number.MAX_SAFE_INTEGER;
    const bx = Number((b as any).playtime_forever ?? 0) === 0 ? installDateOf(b) : Number.MAX_SAFE_INTEGER;
    return cmpAsc(ax, bx);
  },
  newest_purchased:        (a, b) => cmpDesc(purchaseDateOf(a), purchaseDateOf(b)),
  largest_install:         (a, b) => cmpDesc(sizeOnDiskOf(a), sizeOnDiskOf(b)),
  smallest_install:        (a, b) => cmpAsc(sizeOnDiskOf(a), sizeOnDiskOf(b)),
  ssd_priority:            (a, b) => cmpAsc(storageBitOf(a), storageBitOf(b)),
  sd_priority:             (a, b) => cmpDesc(storageBitOf(a), storageBitOf(b)),
  friends_playing_now:     (a, b) => cmpDesc(friendsPlayingCountOf(a), friendsPlayingCountOf(b)),
  most_friends_owning:     (a, b) => cmpDesc(friendsOwnCountOf(a), friendsOwnCountOf(b)),
  trending_among_friends:  (a, b) => cmpDesc(
    friendsPlayingCountOf(a) * 10 + friendsOwnCountOf(a),
    friendsPlayingCountOf(b) * 10 + friendsOwnCountOf(b),
  ),
  weighted_random:         () => 0,
  smart_random:            () => 0,
  seeded_random:           () => 0,
  rotating_daily_random:   () => 0,
  avoid_recently_shown:    () => 0,
};

export type ShelfSourceResolver = (all: AppOverview[]) => AppOverview[];

function bySteamFlag(all: AppOverview[], pred: (a: AppOverview) => boolean): AppOverview[] {
  return all.filter(pred);
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Number.isFinite);
}

function pinnedIdsFromStorage(): Set<number> {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.("ds-pinned-games-v1");
    return new Set(asNumberArray(JSON.parse(raw ?? "[]")));
  } catch { return new Set(); }
}

function historyIdsFromStorage(): number[] {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.("ds-history-v1");
    return asNumberArray(JSON.parse(raw ?? "[]"));
  } catch { return []; }
}

function sessionQueueIds(): number[] {
  try {
    const raw = (globalThis as any).__ds_session_queue;
    return asNumberArray(raw);
  } catch { return []; }
}

function temporaryQueueIds(): number[] {
  try {
    const raw = (globalThis as any).__ds_temp_queue;
    return asNumberArray(raw);
  } catch { return []; }
}

export const SOURCE_V3_RESOLVERS: Record<string, ShelfSourceResolver> = {
  // Steam-side
  dynamic_collections: (all) => {
    try {
      const cs: any = (globalThis as any).collectionStore;
      const list: any[] = cs?.userCollections ?? [];
      const dynamic = list.filter((c) => c?.bIsDynamic === true || c?.m_bIsDynamic === true);
      const ids = new Set<number>();
      for (const c of dynamic) {
        const apps = c?.allApps ?? c?.m_rgApps ?? [];
        for (const a of apps) {
          const id = Number(a?.appid);
          if (Number.isFinite(id)) ids.add(id);
        }
      }
      return all.filter((a) => ids.has(appIdOf(a)));
    } catch { return []; }
  },
  followed_games: (all) => bySteamFlag(all, (a) => {
    return rawField<boolean>(appIdOf(a), "rt_followed", "followed") === true;
  }),
  ignored_games: (all) => bySteamFlag(all, (a) => {
    return rawField<boolean>(appIdOf(a), "rt_ignored", "ignored") === true;
  }),
  dlc_source: (all) => bySteamFlag(all, (a) => (a as any).app_type === 32),
  soundtrack_source: (all) => bySteamFlag(all, (a) => (a as any).app_type === 8192),
  // Manual
  pinned_games: (all) => {
    const pinned = pinnedIdsFromStorage();
    if (!pinned.size) return [];
    return all.filter((a) => pinned.has(appIdOf(a)));
  },
  history_source: (all) => {
    const order = historyIdsFromStorage();
    if (!order.length) return [];
    const set = new Set(order);
    const filtered = all.filter((a) => set.has(appIdOf(a)));
    // Preserve history order.
    return filtered.sort((a, b) => order.indexOf(appIdOf(a)) - order.indexOf(appIdOf(b)));
  },
  session_queue_source: (all) => {
    const ids = sessionQueueIds();
    if (!ids.length) return [];
    const set = new Set(ids);
    return all.filter((a) => set.has(appIdOf(a)));
  },
  temporary_queue_source: (all) => {
    const ids = temporaryQueueIds();
    if (!ids.length) return [];
    const set = new Set(ids);
    return all.filter((a) => set.has(appIdOf(a)));
  },
  // Contextual
  recently_updated: (all) => bySteamFlag(all, (a) => {
    const ts = Number((a as any).rt_recent_activity_time ?? 0);
    if (!ts) return false;
    const daysAgo = (Date.now() / 1000 - ts) / 86400;
    return daysAgo <= 14;
  }),
  with_events: (all) => bySteamFlag(all, (a) => {
    return rawField<boolean>(appIdOf(a), "rt_has_event", "has_event") === true;
  }),
  with_workshop_updates: (all) => bySteamFlag(all, (a) => {
    return rawField<boolean>(appIdOf(a), "rt_workshop_update", "workshop_updated") === true;
  }),
  controller_specific_source: (all) => bySteamFlag(all, (a) => {
    const n = Number((a as any).controller_support ?? 0);
    return n >= 2;
  }),
  emudeck_collections:   (all) => filterByLauncherNames(all, "emudeck"),
  retrodeck_collections: (all) => filterByLauncherNames(all, "retrodeck"),
  heroic_library:        (all) => filterByLauncherNames(all, "heroic"),
  lutris_library:        (all) => filterByLauncherNames(all, "lutris"),
  moonlight_sessions:    (all) => filterByLauncherNames(all, "moonlight"),
  chiaki_sessions:       (all) => filterByLauncherNames(all, "chiaki"),
};

function normaliseTitle(s: string): string {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function filterByLauncherNames(all: AppOverview[], launcherId: string): AppOverview[] {
  try {
    const cache = (globalThis as any).__ds_launcher_cache;
    const list = (cache?.games?.[launcherId] ?? []) as Array<{ name: string }>;
    if (!list.length) return [];
    const wanted = new Set(list.map((g) => normaliseTitle(g.name)));
    return all.filter((a) => isNonSteamOf(a) && wanted.has(normaliseTitle((a as any).display_name ?? (a as any).name ?? "")));
  } catch { return []; }
}

export interface V3Descriptor {
  id: string;
  displayName: string;
  category?: string;
}

export const V3_FILTER_DESCRIPTORS: V3Descriptor[] = [
  // Steam metadata
  { id: "genres",                 displayName: "Genres",                 category: "steam-metadata" },
  { id: "categories",             displayName: "Categories",             category: "steam-metadata" },
  { id: "franchise",              displayName: "Franchise",              category: "steam-metadata" },
  { id: "vrSupport",              displayName: "VR support",             category: "steam-metadata" },
  { id: "multiplayerType",        displayName: "Multiplayer type",       category: "steam-metadata" },
  { id: "familySharing",          displayName: "Family sharing",         category: "steam-metadata" },
  { id: "dlcOwned",               displayName: "DLC owned",              category: "steam-metadata" },
  { id: "soundtrackOwned",        displayName: "Soundtrack owned",       category: "steam-metadata" },
  // User behaviour
  { id: "launchCount",            displayName: "Launch count",           category: "user-behaviour" },
  { id: "avgSessionMinutes",      displayName: "Avg session length",     category: "user-behaviour" },
  { id: "neverCompleted",         displayName: "Never completed",        category: "user-behaviour" },
  { id: "recentlyAbandoned",      displayName: "Recently abandoned",     category: "user-behaviour" },
  { id: "installedNeverPlayed",   displayName: "Installed but never played", category: "user-behaviour" },
  { id: "playedOnce",             displayName: "Played once only",       category: "user-behaviour" },
  { id: "achievementPercentRange", displayName: "Achievement percentage", category: "user-behaviour" },
  // Storage / device
  { id: "storageDevice",          displayName: "Storage device",         category: "storage" },
  { id: "installedSizeRange",     displayName: "Installed size",         category: "storage" },
  { id: "compatDataQuality",      displayName: "Compat-data quality",    category: "storage" },
  // External ecosystem
  { id: "emuDeckSystem",          displayName: "EmuDeck system",         category: "external" },
  { id: "retroDeckSystem",        displayName: "RetroDECK system",       category: "external" },
  { id: "heroicLauncher",         displayName: "Heroic launcher",        category: "external" },
  { id: "lutrisApp",              displayName: "Lutris app",             category: "external" },
  { id: "chiakiApp",              displayName: "Chiaki app",             category: "external" },
  { id: "moonlightApp",           displayName: "Moonlight app",          category: "external" },
  // Advanced non-Steam
  { id: "executableType",         displayName: "Executable type",        category: "advanced-non-steam" },
  { id: "launchOptionTags",       displayName: "Launch option tags",     category: "advanced-non-steam" },
  { id: "customTags",             displayName: "Custom tags",            category: "advanced-non-steam" },
  { id: "parserCategories",       displayName: "Parser categories",      category: "advanced-non-steam" },
  { id: "hiddenLauncherShortcuts", displayName: "Hidden launcher shortcuts", category: "advanced-non-steam" },
  // Composite
  { id: "weightedFilter",         displayName: "Weighted filter",        category: "composite" },
  { id: "priorityFilter",         displayName: "Priority filter",        category: "composite" },
  { id: "exclusionGroup",         displayName: "Exclusion group",        category: "composite" },
];

export const V3_SORT_DESCRIPTORS: V3Descriptor[] = [
  { id: "most_launched",          displayName: "Most launched" },
  { id: "least_launched",         displayName: "Least launched" },
  { id: "longest_session",        displayName: "Longest session" },
  { id: "shortest_session",       displayName: "Shortest session" },
  { id: "most_ignored",           displayName: "Most ignored" },
  { id: "rediscovered_recently",  displayName: "Rediscovered recently" },
  { id: "completion_percent",     displayName: "Completion %" },
  { id: "closest_to_completion",  displayName: "Closest to completion" },
  { id: "rarest_achievements",    displayName: "Rarest achievements owned" },
  { id: "newest_installed",       displayName: "Newest installed" },
  { id: "oldest_installed",       displayName: "Oldest installed" },
  { id: "oldest_unplayed",        displayName: "Oldest unplayed" },
  { id: "newest_purchased",       displayName: "Newest purchased" },
  { id: "largest_install",        displayName: "Largest install" },
  { id: "smallest_install",       displayName: "Smallest install" },
  { id: "ssd_priority",           displayName: "SSD priority" },
  { id: "sd_priority",            displayName: "SD card priority" },
  { id: "friends_playing_now",    displayName: "Friends playing now" },
  { id: "most_friends_owning",    displayName: "Most friends owning" },
  { id: "trending_among_friends", displayName: "Trending among friends" },
  { id: "weighted_random",        displayName: "Weighted random" },
  { id: "smart_random",           displayName: "Smart random" },
  { id: "seeded_random",          displayName: "Seeded random" },
  { id: "rotating_daily_random",  displayName: "Rotating daily random" },
  { id: "avoid_recently_shown",   displayName: "Avoid recently shown" },
];

export const V3_SOURCE_DESCRIPTORS: V3Descriptor[] = [
  { id: "dynamic_collections",      displayName: "Dynamic collections",   category: "steam" },
  { id: "followed_games",           displayName: "Followed games",        category: "steam" },
  { id: "ignored_games",            displayName: "Ignored games",         category: "steam" },
  { id: "dlc_source",               displayName: "DLC",                   category: "steam" },
  { id: "soundtrack_source",        displayName: "Soundtracks",           category: "steam" },
  { id: "pinned_games",             displayName: "Pinned games",          category: "manual" },
  { id: "history_source",           displayName: "Play history",          category: "manual" },
  { id: "session_queue_source",     displayName: "Session queue",         category: "manual" },
  { id: "temporary_queue_source",   displayName: "Temporary queue",       category: "manual" },
  { id: "recently_updated",         displayName: "Recently updated",      category: "contextual" },
  { id: "with_events",              displayName: "With events",           category: "contextual" },
  { id: "with_workshop_updates",    displayName: "With workshop updates", category: "contextual" },
  { id: "controller_specific_source", displayName: "Controller-specific", category: "contextual" },
  { id: "emudeck_collections",      displayName: "EmuDeck collections",   category: "external" },
  { id: "retrodeck_collections",    displayName: "RetroDECK collections", category: "external" },
  { id: "heroic_library",           displayName: "Heroic library",        category: "external" },
  { id: "lutris_library",           displayName: "Lutris library",        category: "external" },
  { id: "moonlight_sessions",       displayName: "Moonlight sessions",    category: "external" },
  { id: "chiaki_sessions",          displayName: "Chiaki sessions",       category: "external" },
];
