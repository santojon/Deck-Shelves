import type { AppOverview } from "./index";
import { SmartShelfModeSchema, type SmartShelfMode } from "../types";
import type { SmartParams } from "./smartParams";
import { resolveQuickPlay, resolveNotStarted, resolveDeckPicks, resolveRediscover, resolveBestUnplayed, resolveInterrupted, resolveTimeOfDay, resolveDailyPick, resolveOnDeck, resolveRecentlyPlayed, resolveLongSession, resolveNonSteam, resolveSoundtracks, resolveVideos, resolveDemos, resolveCloudGames, resolveRandomPick, resolveForgotten, resolveSpareTime } from "./smartLibraryModes";
import { resolveBacklogRescue, resolveForgottenGems, resolveHiddenGems, resolveWeeklyRotation, resolveShortBattery, resolveTravelMode, resolveRecentHiddenInstalls } from "./smartHeuristicModes";
import { resolveLowBatteryMode, resolveFriendsPlaying, resolveAlmostFinished, resolveByCategory } from "./smartLiveModes";
export { TIME_OF_DAY_WINDOWS } from "./smartLibraryModes";
export { prepareSmartModes } from "./smartLiveModes";
export { SPARE_TIME_WINDOWS, isInVisibilityWindow, nextVisibilityBoundary, getModeVisibilityWindows, evalVisibilityRules, evalVisibility, nextVisibilityFlip } from "./visibilityRules";
export { evalProfileTrigger, resolveTriggeredProfile, nextProfileTriggerFlip } from "./profileTriggerRules";
import { cached } from "./smartShelfCache";
export { getSmartShelfCacheStats, invalidateSmartShelfCache } from "./smartShelfCache";

const DEFAULT_SMART_TTL_MS = 60 * 60 * 1000;

type ModeResolver = (apps: AppOverview[], limit: number, params?: SmartParams, shelfId?: string) => number[];

const resolveNone: ModeResolver = () => [];

const MODE_RESOLVERS: Partial<Record<SmartShelfMode, ModeResolver>> = {
  quick_play: (apps, limit, params) => resolveQuickPlay(apps, limit, params),
  not_started: (apps, limit, params) => resolveNotStarted(apps, limit, params),
  deck_picks: (apps, limit, params) => resolveDeckPicks(apps, limit, params),
  rediscover: (apps, limit, params) => resolveRediscover(apps, limit, params),
  best_unplayed: (apps, limit, params) => resolveBestUnplayed(apps, limit, params),
  interrupted: (apps, limit, params) => resolveInterrupted(apps, limit, params),
  time_of_day: (apps, limit, params) => resolveTimeOfDay(apps, limit, params),
  daily_pick: (apps, limit) => resolveDailyPick(apps, limit),
  on_deck: (apps, limit, params) => resolveOnDeck(apps, limit, params),
  recently_played: (apps, limit, params) => resolveRecentlyPlayed(apps, limit, params),
  long_session: (apps, limit, params) => resolveLongSession(apps, limit, params),
  non_steam: (apps, limit) => resolveNonSteam(apps, limit),
  random_pick: (apps, limit) => resolveRandomPick(apps, limit),
  forgotten: (apps, limit, params) => resolveForgotten(apps, limit, params),
  spare_time: (apps, limit, params) => resolveSpareTime(apps, limit, params),
  soundtracks: (apps, limit) => resolveSoundtracks(apps, limit),
  videos: (apps, limit) => resolveVideos(apps, limit),
  demos: (apps, limit) => resolveDemos(apps, limit),
  cloud_games: (apps, limit) => resolveCloudGames(apps, limit),
  backlog_rescue: (apps, limit, params, shelfId) => resolveBacklogRescue(apps, limit, params, shelfId),
  forgotten_gems: (apps, limit, params) => resolveForgottenGems(apps, limit, params),
  hidden_gems: (apps, limit, params) => resolveHiddenGems(apps, limit, params),
  weekly_rotation: (apps, limit, params, shelfId) => resolveWeeklyRotation(apps, limit, params, shelfId),
  short_battery: (apps, limit, params) => resolveShortBattery(apps, limit, params),
  travel_mode: (apps, limit, params) => resolveTravelMode(apps, limit, params),
  recent_hidden_installs: (apps, limit, params) => resolveRecentHiddenInstalls(apps, limit, params),
  low_battery_mode: (apps, limit, params) => resolveLowBatteryMode(apps, limit, params),
  friends_playing: (apps, limit, params) => resolveFriendsPlaying(apps, limit, params),
  almost_finished: (apps, limit, params) => resolveAlmostFinished(apps, limit, params),
  couch_gaming: (apps, limit, params) => resolveByCategory("couch_gaming", apps, limit, params),
  coop_ready: (apps, limit, params) => resolveByCategory("coop_ready", apps, limit, params),
  party_games: (apps, limit, params) => resolveByCategory("party_games", apps, limit, params),
  custom: resolveNone,
};

export const RETIRED_SMART_MODES: ReadonlySet<string> = new Set([
  "long_session_night", "never_touched_classics", "monthly_spotlight", "seasonal_rotation",
]);

export function resolveSmartShelf(
  mode: SmartShelfMode,
  apps: AppOverview[],
  limit: number,
  params?: SmartParams,
  ttlMs?: number,
  shelfId?: string,
): number[] {
  // Friends state changes live, so never serve a cached result.
  const ttl = mode === "friends_playing"
    ? 0
    : typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : DEFAULT_SMART_TTL_MS;
  const paramsKey = params ? JSON.stringify(params) : "";
  // Keyed per shelf so refreshing one shelf doesn't disturb another.
  const cacheKey = shelfId
    ? `${shelfId}:${mode}:${limit}:${paramsKey}:${ttl}`
    : `${mode}:${limit}:${paramsKey}:${ttl}`;
  return cached(cacheKey, ttl, () => {
    try {
      return (MODE_RESOLVERS[mode] ?? resolveNone)(apps, limit, params, shelfId);
    } catch {
      return [];
    }
  });
}

export const INTERNAL_SMART_MODES = new Set<string>(SmartShelfModeSchema.options.filter((m) => !RETIRED_SMART_MODES.has(m)));
