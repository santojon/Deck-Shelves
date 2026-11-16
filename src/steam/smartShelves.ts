import type { AppOverview } from "./index";
import { SmartShelfModeSchema, type SmartShelfMode } from "../types";
import { getParam, type SmartParams } from "./smartParams";
import { weightedRank, multiFactorRank, timeDecayScore, applyCooldown, rotateWindow } from "./heuristics";
import { getBatteryState } from "../runtime/batteryState";
import { evalDeviceRule, isDeviceRuleKind, getDeviceProfile, deviceRuleHasData } from "../runtime/deviceState";
import { compatCategoryForFamily } from "../domain/deviceProfile";
import { evalTimeContextRule, isTimeContextKind } from "../domain/timeContext";
import { evalSessionRule, isSessionRuleKind } from "../runtime/sessionState";
import { evalPerfRule, isPerfRuleKind, perfRuleHasData } from "../runtime/perfState";
import { evalPeripheralRule, isPeripheralRuleKind, peripheralRuleHasData } from "../runtime/peripheralsState";
import { getFriendsPlayingAppIds, getFriendsRecentlyPlayedAppIds } from "../runtime/friendsState";
import { getCurrentSettings } from "../store/settingsStore";
import { achievementPercent, loadAchievements } from "./achievements";
import { STORE_CATEGORY, hasStoreCategory } from "./v3Extensions";

const resolverCache = new Map<string, { ts: number; ids: number[] }>();
const DEFAULT_SMART_TTL_MS = 60 * 60 * 1000;

// Persisted so a restart can reuse a still-fresh result; freshness rules are unchanged.
const PERSIST_KEY = "ds-smart-shelf-cache-v1";
const PERSIST_MAX_ENTRIES = 200;

function loadPersistedCache(): void {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.(PERSIST_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, { ts: number; ids: number[] }>;
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.ts === "number" && Array.isArray(v.ids)) resolverCache.set(k, v);
    }
  } catch {}
}
loadPersistedCache();

function persistCache(): void {
  try {
    const entries = Array.from(resolverCache.entries())
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, PERSIST_MAX_ENTRIES);
    (globalThis as any).localStorage?.setItem?.(PERSIST_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

let cacheHits = 0;
let cacheMisses = 0;

export function getSmartShelfCacheStats(): { hits: number; misses: number } {
  return { hits: cacheHits, misses: cacheMisses };
}

function cached(key: string, ttlMs: number, fn: () => number[]): number[] {
  const entry = resolverCache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) { cacheHits++; return entry.ids; }
  cacheMisses++;
  const ids = fn();
  resolverCache.set(key, { ts: Date.now(), ids });
  persistCache();
  return ids;
}

function playtimeMinutes(app: AppOverview): number {
  return Number(app.playtime_forever ?? 0);
}

function lastPlayedSec(app: AppOverview): number {
  return Number(app.last_played ?? 0);
}

function deckCompat(app: AppOverview): number {
  const own = compatCategoryForFamily(getDeviceProfile().family, {
    deckCompatCategory: app.deck_compatibility_category,
    machineCompatCategory: (app as any).machine_compatibility_category,
    frameCompatCategory: (app as any).frame_compatibility_category,
  });
  return Number(own ?? app.deck_compatibility_category ?? 0);
}

function resolveQuickPlay(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const maxPt = getParam("quick_play", params, "maxPlaytimeMinutes");
  const minDeck = getParam("quick_play", params, "minDeckLevel");
  return apps
    .filter(
      (a) =>
        a.installed &&
        // app_type 1 is a game; unknown is allowed through to avoid false negatives.
        (a.app_type === undefined || a.app_type === 1) &&
        deckCompat(a) >= minDeck &&
        playtimeMinutes(a) < maxPt,
    )
    .sort((a, b) => deckCompat(b) - deckCompat(a) || lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveNotStarted(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minDeck = getParam("not_started", params, "minDeckLevel");
  return apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      playtimeMinutes(a) === 0 && lastPlayedSec(a) === 0 &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => deckCompat(b) - deckCompat(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveDeckPicks(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minDeck = getParam("deck_picks", params, "minDeckLevel");
  return apps
    .filter((a) => (a.app_type === undefined || a.app_type === 1) && deckCompat(a) >= minDeck)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveRediscover(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const months = getParam("rediscover", params, "monthsAgo");
  const minPt = getParam("rediscover", params, "minPlaytimeMinutes");
  const minDeck = getParam("rediscover", params, "minDeckLevel");
  const monthsAgoSec = Math.floor(Date.now() / 1000) - months * 30 * 24 * 3600;
  return apps
    .filter(
      (a) =>
        (a.app_type === undefined || a.app_type === 1) &&
        lastPlayedSec(a) > 0 &&
        lastPlayedSec(a) < monthsAgoSec &&
        playtimeMinutes(a) > minPt &&
        deckCompat(a) >= minDeck,
    )
    .sort((a, b) => playtimeMinutes(b) - playtimeMinutes(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveBestUnplayed(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minDeck = getParam("best_unplayed", params, "minDeckLevel");
  return apps
    .filter((a) => a.installed && (a.app_type === undefined || a.app_type === 1) && playtimeMinutes(a) === 0 && lastPlayedSec(a) === 0 && deckCompat(a) >= minDeck)
    .sort((a, b) => deckCompat(b) - deckCompat(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveInterrupted(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minPt = getParam("interrupted", params, "minPlaytimeMinutes");
  const maxPt = getParam("interrupted", params, "maxPlaytimeMinutes");
  const minDeck = getParam("interrupted", params, "minDeckLevel");
  return apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      playtimeMinutes(a) >= minPt && playtimeMinutes(a) <= maxPt &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

export const TIME_OF_DAY_WINDOWS: ReadonlyArray<{ start: number; end: number; subMode: SmartShelfMode }> = [
  { start: 5,  end: 12, subMode: "quick_play" },
  { start: 12, end: 18, subMode: "deck_picks" },
  { start: 18, end: 5,  subMode: "rediscover" },
];

function resolveTimeOfDay(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return resolveQuickPlay(apps, limit, params);
  if (hour >= 12 && hour < 18) return resolveDeckPicks(apps, limit, params);
  return resolveRediscover(apps, limit, params);
}

function resolveDailyPick(apps: AppOverview[], limit: number): number[] {
  const dayIndex = Math.floor(Date.now() / 86400000);
  const eligible = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    (a.installed || playtimeMinutes(a) > 0),
  );
  if (!eligible.length) return [];
  const start = dayIndex % eligible.length;
  const rotated = [...eligible.slice(start), ...eligible.slice(0, start)];
  return rotated.slice(0, limit).map((a) => a.appid);
}

function resolveOnDeck(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minDeck = getParam("on_deck", params, "minDeckLevel");
  return apps
    .filter(
      (a) =>
        a.installed &&
        (a.app_type === undefined || a.app_type === 1) &&
        deckCompat(a) >= minDeck,
    )
    .sort((a, b) => deckCompat(b) - deckCompat(a) || lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveRecentlyPlayed(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const days = getParam("recently_played", params, "daysAgo");
  const cutoff = Math.floor(Date.now() / 1000) - days * 24 * 3600;
  return apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      lastPlayedSec(a) > cutoff,
    )
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveLongSession(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minPt = getParam("long_session", params, "minPlaytimeMinutes");
  const minDeck = getParam("long_session", params, "minDeckLevel");
  return apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      a.installed &&
      playtimeMinutes(a) > minPt &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => playtimeMinutes(b) - playtimeMinutes(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveNonSteam(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => a.is_non_steam)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveSoundtracks(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => !a.is_non_steam && a.app_type === 8192)
    .sort((a, b) => String((a as any).sort_as ?? a.display_name ?? "").localeCompare(String((b as any).sort_as ?? b.display_name ?? "")))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveVideos(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => !a.is_non_steam && a.app_type === 2048)
    .sort((a, b) => String((a as any).sort_as ?? a.display_name ?? "").localeCompare(String((b as any).sort_as ?? b.display_name ?? "")))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveDemos(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => !a.is_non_steam && a.app_type === 8)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a)
      || String((a as any).sort_as ?? a.display_name ?? "").localeCompare(String((b as any).sort_as ?? b.display_name ?? "")))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveCloudGames(apps: AppOverview[], limit: number): number[] {
  // Empty without a cloud collection; falling back to any non-Steam would mislabel the row.
  try {
    // Lazy require to avoid a circular import.
    const { getUnifideckCloudPlaySet } = require("./index") as {
      getUnifideckCloudPlaySet?: () => Set<number>;
    };
    const cloud = typeof getUnifideckCloudPlaySet === "function" ? getUnifideckCloudPlaySet() : new Set<number>();
    if (cloud.size === 0) return [];
    return apps
      .filter((a) => a.is_non_steam && cloud.has(a.appid))
      .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
      .slice(0, limit)
      .map((a) => a.appid);
  } catch {
    return [];
  }
}

function resolveRandomPick(apps: AppOverview[], limit: number): number[] {
  const arr = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1),
  );
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, limit).map((a) => a.appid);
}

function rtAcquired(app: AppOverview): number {
  return Number(app.rt_purchased_time ?? app.user_added_ts ?? 0);
}

function resolveForgotten(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const years = getParam("forgotten", params, "yearsAgo");
  const cutoff = Math.floor(Date.now() / 1000) - years * 365 * 24 * 3600;
  return apps
    .filter(
      (a) =>
        !a.is_non_steam &&
        (a.app_type === undefined || a.app_type === 1) &&
        playtimeMinutes(a) === 0 &&
        lastPlayedSec(a) === 0 &&
        rtAcquired(a) > 0 &&
        rtAcquired(a) < cutoff,
    )
    .sort((a, b) => rtAcquired(a) - rtAcquired(b))
    .slice(0, limit)
    .map((a) => a.appid);
}

export const SPARE_TIME_WINDOWS: ReadonlyArray<{ start: number; end: number }> = [
  { start: 6, end: 9 },
  { start: 12, end: 14 },
  { start: 19, end: 22 },
];

function resolveSpareTime(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const maxPt = getParam("spare_time", params, "maxPlaytimeMinutes");
  const minDeck = getParam("spare_time", params, "minDeckLevel");
  return apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      a.installed &&
      playtimeMinutes(a) <= maxPt &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => deckCompat(b) - deckCompat(a) || lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveBacklogRescue(apps: AppOverview[], limit: number, params?: SmartParams, shelfId?: string): number[] {
  const minPt = getParam("backlog_rescue", params, "minPlaytimeMinutes");
  const stalenessDays = getParam("backlog_rescue", params, "stalenessDays");
  const cooldownDays = getParam("backlog_rescue", params, "cooldownDays");
  const minDeck = getParam("backlog_rescue", params, "minDeckLevel");
  const cutoff = Math.floor(Date.now() / 1000) - stalenessDays * 86400;
  const pool = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    a.installed &&
    playtimeMinutes(a) >= minPt &&
    lastPlayedSec(a) > 0 && lastPlayedSec(a) < cutoff &&
    deckCompat(a) >= minDeck,
  );
  const ranked = weightedRank(
    pool,
    [
      { key: "playtime", get: (a) => Math.min(playtimeMinutes(a), 6000) },
      { key: "staleness", get: (a) => 1 - timeDecayScore(lastPlayedSec(a), 60) },
      { key: "deck", get: (a) => deckCompat(a) * 100 },
    ],
    { playtime: 1, staleness: 200, deck: 1 },
  );
  return applyCooldown(ranked, `backlog_rescue:${shelfId ?? "_"}`, cooldownDays, limit).map((a) => (a as any).appid);
}

function resolveForgottenGems(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minMeta = getParam("forgotten_gems", params, "minMetacritic");
  const minReview = getParam("forgotten_gems", params, "minReviewScore");
  const minDeck = getParam("forgotten_gems", params, "minDeckLevel");
  const pool = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    playtimeMinutes(a) === 0 &&
    lastPlayedSec(a) === 0 &&
    (((a as any).review_percentage ?? 0) >= minReview ||
      ((a as any).metacritic_score ?? 0) >= minMeta) &&
    deckCompat(a) >= minDeck,
  );
  const ranked = multiFactorRank(pool, [
    { get: (a) => ((a as any).review_percentage ?? 0) },
    { get: (a) => ((a as any).metacritic_score ?? 0) },
    { get: (a) => Number((a as any).rt_purchased_time ?? 0) },
  ]);
  return ranked.slice(0, limit).map((a) => (a as any).appid);
}

function resolveHiddenGems(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minReview = getParam("hidden_gems", params, "minReviewScore");
  const minDeck = getParam("hidden_gems", params, "minDeckLevel");
  return apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      playtimeMinutes(a) === 0 &&
      lastPlayedSec(a) === 0 &&
      ((a as any).review_percentage ?? 0) >= minReview &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => (((b as any).review_percentage ?? 0) - ((a as any).review_percentage ?? 0)))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveWeeklyRotation(apps: AppOverview[], limit: number, params?: SmartParams, shelfId?: string): number[] {
  const rotateDays = getParam("weekly_rotation", params, "rotateEveryDays");
  const minDeck = getParam("weekly_rotation", params, "minDeckLevel");
  const pool = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    a.installed &&
    deckCompat(a) >= minDeck,
  );
  return rotateWindow(pool, `weekly_rotation:${shelfId ?? "_"}`, rotateDays, limit).map((a) => (a as any).appid);
}

function sizeOnDiskBytes(app: AppOverview): number {
  return Number((app as any).size_on_disk ?? 0);
}

function resolveShortBattery(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const maxPt = getParam("short_battery", params, "maxPlaytimeMinutes");
  const maxSizeMb = getParam("short_battery", params, "maxSizeMb");
  const minDeck = getParam("short_battery", params, "minDeckLevel");
  const maxBytes = maxSizeMb * 1024 * 1024;
  return apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      a.installed &&
      playtimeMinutes(a) <= maxPt &&
      sizeOnDiskBytes(a) > 0 && sizeOnDiskBytes(a) <= maxBytes &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => deckCompat(b) - deckCompat(a) || lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveTravelMode(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const maxSizeMb = getParam("travel_mode", params, "maxSizeMb");
  const minDeck = getParam("travel_mode", params, "minDeckLevel");
  const maxBytes = maxSizeMb * 1024 * 1024;
  return apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      a.installed &&
      sizeOnDiskBytes(a) > 0 && sizeOnDiskBytes(a) <= maxBytes &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => sizeOnDiskBytes(a) - sizeOnDiskBytes(b))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveRecentHiddenInstalls(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const days = getParam("recent_hidden_installs", params, "daysAgo");
  const minDeck = getParam("recent_hidden_installs", params, "minDeckLevel");
  const cutoff = Math.floor(Date.now() / 1000) - days * 24 * 3600;
  return apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      a.installed &&
      playtimeMinutes(a) === 0 &&
      lastPlayedSec(a) === 0 &&
      rtAcquired(a) >= cutoff &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => rtAcquired(b) - rtAcquired(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveLowBatteryMode(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const threshold = getParam("low_battery_mode", params, "batteryThresholdPct") / 100;
  const maxPt = getParam("low_battery_mode", params, "maxPlaytimeMinutes");
  const maxSizeMb = getParam("low_battery_mode", params, "maxSizeMb");
  const minDeck = getParam("low_battery_mode", params, "minDeckLevel");
  const maxBytes = maxSizeMb * 1024 * 1024;
  const battery = getBatteryState();
  const isOnBatteryLow = battery?.hasBattery === true && battery.state === "discharging" && battery.level > 0 && battery.level <= threshold;
  const pool = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    a.installed &&
    playtimeMinutes(a) <= maxPt &&
    Number((a as any).size_on_disk ?? 0) > 0 &&
    Number((a as any).size_on_disk ?? 0) <= maxBytes &&
    deckCompat(a) >= minDeck,
  );
  if (isOnBatteryLow) {
    return pool
      .sort((a, b) => (Number((a as any).size_on_disk ?? 0) - Number((b as any).size_on_disk ?? 0)) || (playtimeMinutes(a) - playtimeMinutes(b)))
      .slice(0, limit)
      .map((a) => a.appid);
  }
  return pool
    .sort((a, b) => deckCompat(b) - deckCompat(a) || lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

// Friends data follows the online master toggle.
function friendsDataAllowed(): boolean {
  try {
    const s = getCurrentSettings();
    return (s as any)?.offlineModeEnabled !== true && s?.onlineFeaturesEnabled === true;
  } catch { return false; }
}

function resolveFriendsPlaying(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  if (!friendsDataAllowed()) return [];
  const minDeck = getParam("friends_playing", params, "minDeckLevel");
  const includeRecent = getParam("friends_playing", params, "includeRecentlyPlayed") === 1;
  const liveSet = getFriendsPlayingAppIds();
  const friendSet = includeRecent ? getFriendsRecentlyPlayedAppIds() : liveSet;
  if (friendSet.size === 0) return [];
  const ownedMatches = apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      friendSet.has(a.appid) &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => {
      const aLive = liveSet.has(a.appid) ? 1 : 0;
      const bLive = liveSet.has(b.appid) ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return lastPlayedSec(b) - lastPlayedSec(a);
    })
    .map((a) => a.appid);
  // Friends' games the user doesn't own are appended as raw ids after the owned matches.
  // Ownership comes from the full pool, or filtered-out owned games would come back as unowned.
  const libraryAppIds = new Set(apps.map((a) => a.appid));
  const nonOwnedIds: number[] = [];
  for (const id of liveSet) {
    if (!libraryAppIds.has(id)) nonOwnedIds.push(id);
  }
  if (includeRecent) {
    const seenLive = new Set([...liveSet]);
    for (const id of friendSet) {
      if (seenLive.has(id) || libraryAppIds.has(id)) continue;
      nonOwnedIds.push(id);
    }
  }
  return [...ownedMatches, ...nonOwnedIds].slice(0, limit);
}

function resolveAlmostFinished(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minPct = getParam("almost_finished", params, "minAchievementPct");
  const minDeck = getParam("almost_finished", params, "minDeckLevel");
  return apps
    .filter((a) => !a.is_non_steam && (a.app_type === undefined || a.app_type === 1) && playtimeMinutes(a) > 0 && deckCompat(a) >= minDeck)
    .map((a) => ({ a, pct: achievementPercent(a.appid) ?? -1 }))
    .filter((x) => x.pct >= minPct && x.pct < 100)
    .sort((x, y) => y.pct - x.pct)
    .slice(0, limit)
    .map((x) => x.a.appid);
}

const CATEGORY_MODES: Partial<Record<SmartShelfMode, readonly number[]>> = {
  couch_gaming: [STORE_CATEGORY.sharedScreen, STORE_CATEGORY.sharedScreenPvp, STORE_CATEGORY.sharedScreenCoop],
  coop_ready: [STORE_CATEGORY.coop, STORE_CATEGORY.onlineCoop, STORE_CATEGORY.sharedScreenCoop, STORE_CATEGORY.lanCoop],
  party_games: [STORE_CATEGORY.sharedScreen, STORE_CATEGORY.sharedScreenPvp],
};

function resolveByCategory(mode: SmartShelfMode, apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minDeck = getParam(mode, params, "minDeckLevel");
  const ids = CATEGORY_MODES[mode] ?? [];
  return apps
    .filter((a) => !a.is_non_steam && (a.app_type === undefined || a.app_type === 1) && deckCompat(a) >= minDeck && hasStoreCategory(a.appid, ids) === true)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

export async function prepareSmartModes(modes: string[], apps: AppOverview[]): Promise<void> {
  if (modes.includes("almost_finished")) await loadAchievements(apps);
}

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

type VisibilityRange = { start: number; end: number; days?: number[] };
type VisibilityWindowInput = VisibilityRange | ReadonlyArray<VisibilityRange> | undefined;

function normalizeWindow(input: VisibilityWindowInput): VisibilityRange[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.slice() as VisibilityRange[];
  return [input as VisibilityRange];
}

function inSingleRange(r: VisibilityRange, h: number): boolean {
  const { start, end } = r;
  if (start === end) return true;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

function dayAllowed(daysOfWeek: number[] | undefined, day: number): boolean {
  return !Array.isArray(daysOfWeek) || daysOfWeek.includes(day);
}

export function isInVisibilityWindow(
  window: VisibilityWindowInput,
  daysOfWeek: number[] | undefined,
  now: Date = new Date(),
): boolean {
  const ranges = normalizeWindow(window);
  if (ranges.length === 0) {
    return dayAllowed(daysOfWeek, now.getDay());
  }
  const h = now.getHours();
  const today = now.getDay();
  for (const r of ranges) {
    if (Array.isArray(r.days)) {
      if (!r.days.includes(today)) continue;
    } else if (!dayAllowed(daysOfWeek, today)) {
      return false;
    }
    if (inSingleRange(r, h)) return true;
  }
  return false;
}

export function nextVisibilityBoundary(
  window: VisibilityWindowInput,
  daysOfWeek: number[] | undefined,
  now: Date = new Date(),
): number | null {
  const ranges = normalizeWindow(window);
  if (ranges.length === 0 && (!daysOfWeek || daysOfWeek.length === 0)) return null;
  // Steps an hour at a time and returns the first hour where the result flips.
  const cur = isInVisibilityWindow(window, daysOfWeek, now);
  const probe = new Date(now.getTime());
  probe.setMinutes(0, 0, 0);
  for (let i = 1; i <= 24 * 8; i++) {
    probe.setTime(probe.getTime() + 60 * 60 * 1000);
    if (isInVisibilityWindow(window, daysOfWeek, probe) !== cur) {
      return probe.getTime();
    }
  }
  return null;
}

export function getModeVisibilityWindows(mode: SmartShelfMode): ReadonlyArray<{ start: number; end: number }> | undefined {
  if (mode === 'spare_time') return SPARE_TIME_WINDOWS;
  return undefined;
}

// Unknown rule kinds evaluate as true (fail open).
type VisibilityLike = { visibility?: any; visibleHours?: any; visibleDaysOfWeek?: number[] } | undefined;

function evalTimeWindowRule(rule: any, now: Date): boolean {
  if (Array.isArray(rule.days) && !rule.days.includes(now.getDay())) return false;
  const start = Number(rule.start), end = Number(rule.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
  return inSingleRange({ start, end }, now.getHours());
}

function evalContextKind(kind: string, rule: any, now: Date): boolean {
  if (isTimeContextKind(kind)) return evalTimeContextRule(rule, now);
  if (isSessionRuleKind(kind)) return evalSessionRule(rule);
  if (isPerfRuleKind(kind)) return evalPerfRule(rule);
  if (isPeripheralRuleKind(kind)) return evalPeripheralRule(rule);
  return isDeviceRuleKind(kind) ? evalDeviceRule(rule) : true;
}

function evalVisibilityRuleRaw(rule: any, now: Date): boolean {
  const kind = String(rule?.kind || "");
  switch (kind) {
    case "timeWindow": return evalTimeWindowRule(rule, now);
    case "dayOfWeek":  return Array.isArray(rule.days) ? rule.days.includes(now.getDay()) : true;
    default:           return evalContextKind(kind, rule, now);
  }
}

// `not: true` inverts a rule; the editor never lets a kind and its inverse coexist.
function evalVisibilityRule(rule: any, now: Date): boolean {
  const res = evalVisibilityRuleRaw(rule, now);
  return rule?.not === true ? !res : res;
}

export function evalVisibilityRules(
  visibility: { mode?: "any" | "all"; rules?: any[] } | undefined,
  now: Date = new Date(),
): boolean {
  const rules = Array.isArray(visibility?.rules) ? visibility!.rules : [];
  if (rules.length === 0) return true;
  const results = rules.map((r) => evalVisibilityRule(r, now));
  return visibility!.mode === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function evalVisibility(entry: VisibilityLike, now: Date = new Date()): boolean {
  if (!entry) return true;
  const rules = Array.isArray(entry.visibility?.rules) ? entry.visibility.rules : [];
  if (rules.length > 0) return evalVisibilityRules(entry.visibility, now);
  return isInVisibilityWindow(entry.visibleHours, entry.visibleDaysOfWeek, now);
}

// Device rules flip on hardware events, not the clock.
function hasClockRule(entry: VisibilityLike): boolean {
  const rules = Array.isArray(entry?.visibility?.rules) ? entry!.visibility.rules : [];
  if (rules.length > 0) {
    return rules.some((r: { kind?: unknown } | null | undefined) => r?.kind === "timeWindow" || r?.kind === "dayOfWeek" || isTimeContextKind(String(r?.kind || "")));
  }
  return normalizeWindow(entry?.visibleHours).length > 0 || ((entry?.visibleDaysOfWeek?.length ?? 0) > 0);
}

export function nextVisibilityFlip(entry: VisibilityLike, now: Date = new Date()): number | null {
  if (!entry || !hasClockRule(entry)) return null;
  const cur = evalVisibility(entry, now);
  const probe = new Date(now.getTime());
  probe.setMinutes(0, 0, 0);
  for (let i = 1; i <= 24 * 8; i++) {
    probe.setTime(probe.getTime() + 60 * 60 * 1000);
    if (evalVisibility(entry, probe) !== cur) return probe.getTime();
  }
  return null;
}

// Unlike shelf visibility, an empty trigger never fires.
function isKnownRuleKind(kind: string): boolean {
  return kind === "timeWindow" || kind === "dayOfWeek" || isTimeContextKind(kind) || isSessionRuleKind(kind)
    || isPerfRuleKind(kind) || isPeripheralRuleKind(kind) || isDeviceRuleKind(kind);
}

function ruleLacksData(rule: any): boolean {
  const kind = String(rule?.kind ?? "");
  if (!isKnownRuleKind(kind)) return true;
  if (isPerfRuleKind(kind)) return !perfRuleHasData(rule);
  if (isPeripheralRuleKind(kind)) return !peripheralRuleHasData(rule);
  if (isDeviceRuleKind(kind)) return !deviceRuleHasData(rule);
  return false;
}

// A trigger acts only on evidence: a rule without data counts as not matching.
export function evalProfileTrigger(trigger: unknown, now: Date = new Date()): boolean {
  const t = trigger as any;
  if (!t || !Array.isArray(t.rules) || t.rules.length === 0) return false;
  const known = t.rules.filter((r: any) => !ruleLacksData(r));
  if (known.length === 0 || (t.mode === "all" && known.length !== t.rules.length)) return false;
  return evalVisibilityRules({ ...t, rules: known }, now);
}

// First match wins, so list order is the tie-break.
export function resolveTriggeredProfile(
  profiles: ReadonlyArray<{ name: string; trigger?: unknown }> | undefined,
  now: Date = new Date(),
): string | null {
  if (!Array.isArray(profiles)) return null;
  for (const p of profiles) if (evalProfileTrigger(p.trigger, now)) return p.name;
  return null;
}

export function nextProfileTriggerFlip(
  profiles: ReadonlyArray<{ name: string; trigger?: unknown }> | undefined,
  now: Date = new Date(),
): number | null {
  if (!Array.isArray(profiles)) return null;
  let earliest: number | null = null;
  for (const p of profiles) {
    const t = p.trigger as any;
    if (!t || !Array.isArray(t.rules) || t.rules.length === 0) continue;
    const next = nextVisibilityFlip({ visibility: t }, now);
    if (next != null && (earliest == null || next < earliest)) earliest = next;
  }
  return earliest;
}

export const INTERNAL_SMART_MODES = new Set<string>(SmartShelfModeSchema.options.filter((m) => !RETIRED_SMART_MODES.has(m)));

export function invalidateSmartShelfCache(shelfId?: string): void {
  if (!shelfId) { resolverCache.clear(); persistCache(); return; }
  const prefix = `${shelfId}:`;
  for (const k of Array.from(resolverCache.keys())) {
    if (k.startsWith(prefix)) resolverCache.delete(k);
  }
  persistCache();
}
