import type { AppOverview } from "./index";
import type { SmartShelfMode } from "../types";
import { getParam, type SmartParams } from "./smartParams";
import { weightedRank, multiFactorRank, timeDecayScore, applyCooldown, rotateWindow } from "./heuristics";
import { getBatteryState } from "../runtime/batteryState";
import { evalDeviceRule, isDeviceRuleKind } from "../runtime/deviceState";
import { evalTimeContextRule, isTimeContextKind } from "../domain/timeContext";
import { evalSessionRule, isSessionRuleKind } from "../runtime/sessionState";
import { evalPerfRule, isPerfRuleKind } from "../runtime/perfState";
import { evalPeripheralRule, isPeripheralRuleKind } from "../runtime/peripheralsState";
import { getFriendsPlayingAppIds, getFriendsRecentlyPlayedAppIds } from "../runtime/friendsState";
import { appHasAnyCategory, getAppAchievementPct, preloadAppDetailsSummaries } from "./appDetailsCache";
import { getCurrentSettings } from "../store/settingsStore";

const resolverCache = new Map<string, { ts: number; ids: number[] }>();
const DEFAULT_SMART_TTL_MS = 60 * 60 * 1000;

function cached(key: string, ttlMs: number, fn: () => number[]): number[] {
  const entry = resolverCache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.ids;
  const ids = fn();
  resolverCache.set(key, { ts: Date.now(), ids });
  return ids;
}

function playtimeMinutes(app: AppOverview): number {
  return Number(app.playtime_forever ?? 0);
}

function lastPlayedSec(app: AppOverview): number {
  return Number(app.last_played ?? 0);
}

function deckCompat(app: AppOverview): number {
  return Number(app.deck_compatibility_category ?? 0);
}

function resolveQuickPlay(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const maxPt = getParam("quick_play", params, "maxPlaytimeMinutes");
  const minDeck = getParam("quick_play", params, "minDeckLevel");
  return apps
    .filter(
      (a) =>
        a.installed &&
        // Exclude tools, Proton, runtimes, redistributables. app_type=1 is a
        // game; absent/unknown is allowed through to avoid false negatives.
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
      // Game-only: exclude DLC, tools, redistributables, soundtracks etc.
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
  { start: 18, end: 5,  subMode: "rediscover" }, // wraps midnight
];

function resolveTimeOfDay(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return resolveQuickPlay(apps, limit, params);
  if (hour >= 12 && hour < 18) return resolveDeckPicks(apps, limit, params);
  return resolveRediscover(apps, limit, params);
}

function resolveDailyPick(apps: AppOverview[], limit: number): number[] {
  const dayIndex = Math.floor(Date.now() / 86400000);
  // Game-focused: rotate through games only. Without this filter, a
  // library with many DLCs / soundtracks would surface those as the
  // "daily pick" — not what the user expects from the template's name.
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

/* Media / non-game template resolvers — each filters the local pool to
   a specific Steam EAppType bit-flag so users can carve a shelf for
   soundtracks, videos, demos etc. that the game-focused templates above
   would otherwise hide. See `shortcutType` filter for the full app_type
   table. */

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
  // Non-Steam shortcuts that Unifideck (or any future provider) tagged
  // as cloud-play. Re-uses the same detection the resolver already
  /* applies for the "hideOwnedNonSteamCloud" toggle: the appid lives in
     a `[Unifideck] microsoft`-style collection. Returns an empty shelf
     when no cloud collection is detected — the template is purposely
     about cloud-play entries only, so falling back to "any non-Steam"
     would mis-label the row on devices without Unifideck. */
  try {
    // Lazy require to avoid a circular import — smartShelves.ts is
    // imported by steam/index.ts at module load.
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
  // Game-only random pick: shuffle from games (Steam app_type 1 / undefined)
  // only so tools, DLCs and soundtracks don't dominate the result on
  // libraries with many of them.
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
        // Exclude tools, applications, redistributables, Proton, servers, etc.
        // app_type=1 is a game; absent means unknown (allow through)
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

// v2 heuristic templates. Each composes the primitives in
// `./heuristics.ts` so behaviour stays inspectable + tunable via
// `SMART_PARAM_DEFAULTS`.

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
  // Weighted composite — caller-tunable weights via smartParams.
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

// Second-wave heuristic templates. Each composes existing AppOverview signals
// (size_on_disk, review_percentage, rt_purchased_time) + the rotateWindow
// primitive — no new backend signals required.

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

function resolveLongSessionNight(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minPt = getParam("long_session_night", params, "minPlaytimeMinutes");
  const minDeck = getParam("long_session_night", params, "minDeckLevel");
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

function resolveNeverTouchedClassics(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const years = getParam("never_touched_classics", params, "yearsAgo");
  const minDeck = getParam("never_touched_classics", params, "minDeckLevel");
  const cutoff = Math.floor(Date.now() / 1000) - years * 365 * 24 * 3600;
  return apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      playtimeMinutes(a) === 0 &&
      lastPlayedSec(a) === 0 &&
      rtAcquired(a) > 0 &&
      rtAcquired(a) < cutoff &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => rtAcquired(a) - rtAcquired(b))
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

function resolveMonthlySpotlight(apps: AppOverview[], limit: number, params?: SmartParams, shelfId?: string): number[] {
  const rotateDays = getParam("monthly_spotlight", params, "rotateEveryDays");
  const minDeck = getParam("monthly_spotlight", params, "minDeckLevel");
  const pool = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    a.installed &&
    deckCompat(a) >= minDeck,
  );
  return rotateWindow(pool, `monthly_spotlight:${shelfId ?? "_"}`, rotateDays, limit).map((a) => (a as any).appid);
}

function resolveSeasonalRotation(apps: AppOverview[], limit: number, params?: SmartParams, shelfId?: string): number[] {
  const rotateDays = getParam("seasonal_rotation", params, "rotateEveryDays");
  const minDeck = getParam("seasonal_rotation", params, "minDeckLevel");
  const pool = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    a.installed &&
    deckCompat(a) >= minDeck,
  );
  return rotateWindow(pool, `seasonal_rotation:${shelfId ?? "_"}`, rotateDays, limit).map((a) => (a as any).appid);
}

/* Runtime-aware templates: consult battery state / appDetails cache. Each
   falls back to a deterministic empty / heuristic result when the runtime
   data isn't available, so the shelf never crashes — it just renders empty
   (consistent with other empty-source semantics across the plugin). */

function resolveLowBatteryMode(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const threshold = getParam("low_battery_mode", params, "batteryThresholdPct") / 100;
  const maxPt = getParam("low_battery_mode", params, "maxPlaytimeMinutes");
  const maxSizeMb = getParam("low_battery_mode", params, "maxSizeMb");
  const minDeck = getParam("low_battery_mode", params, "minDeckLevel");
  const maxBytes = maxSizeMb * 1024 * 1024;
  const battery = getBatteryState();
  const isOnBatteryLow = battery?.hasBattery === true && battery.state === "discharging" && battery.level > 0 && battery.level <= threshold;
  /* Same selection rules as short_battery (installed + small + Deck-friendly
     + short playtime). The differentiation is the visibility-on-low-battery
     semantic: when battery is OK, the shelf still renders but with the same
     candidates as short_battery — users get a useful set in any device state. */
  const pool = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    a.installed &&
    playtimeMinutes(a) <= maxPt &&
    Number((a as any).size_on_disk ?? 0) > 0 &&
    Number((a as any).size_on_disk ?? 0) <= maxBytes &&
    deckCompat(a) >= minDeck,
  );
  // When battery IS low: hoist the focused subset to the front (small + low
  // playtime first). Otherwise normal ordering (Deck level + recent).
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

function resolveAlmostFinished(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minPct = getParam("almost_finished", params, "minAchievementPct");
  const minDeck = getParam("almost_finished", params, "minDeckLevel");
  // Pre-filter to a tractable pool (installed Steam games with playtime > 0)
  // then schedule a batch preload so subsequent refreshes have full data.
  const pool = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    a.installed &&
    playtimeMinutes(a) > 0 &&
    deckCompat(a) >= minDeck,
  );
  preloadAppDetailsSummaries(pool.map((a) => a.appid));
  return pool
    .map((a) => ({ app: a, pct: getAppAchievementPct(a.appid) }))
    .filter((x) => Number.isFinite(x.pct) && x.pct >= minPct && x.pct < 100)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit)
    .map((x) => x.app.appid);
}

/* store_categories-aware templates. Substring-match (case-insensitive)
   against Steam's category names — built-in keywords cover the canonical
   English names; localized installs may not match, in which case the shelf
   is empty. Fix is to extend the keyword list per locale (i18n). */

const COUCH_GAMING_KEYWORDS = ["shared/split screen", "shared screen", "split screen", "couch"];
const COOP_KEYWORDS = ["co-op", "coop", "online co-op", "online coop"];
const PARTY_KEYWORDS = ["local multi-player", "local multiplayer", "local pvp", "party"];

function resolveByCategoryKeywords(apps: AppOverview[], limit: number, params: SmartParams | undefined, paramKey: any, keywords: string[]): number[] {
  const minDeck = getParam(paramKey, params, "minDeckLevel");
  const pool = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    deckCompat(a) >= minDeck,
  );
  preloadAppDetailsSummaries(pool.map((a) => a.appid));
  return pool
    .filter((a) => appHasAnyCategory(a.appid, keywords))
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveCouchGaming(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  return resolveByCategoryKeywords(apps, limit, params, "couch_gaming", COUCH_GAMING_KEYWORDS);
}

function resolveCoopReady(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  return resolveByCategoryKeywords(apps, limit, params, "coop_ready", COOP_KEYWORDS);
}

function resolvePartyGames(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  return resolveByCategoryKeywords(apps, limit, params, "party_games", PARTY_KEYWORDS);
}

function resolveFriendsPlaying(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  /* Online gate: reuse the same master toggle as wishlist / store. When the
     user has online features off, friends data is treated as off too —
     consistent with the rest of the online-gated UX. Local friend cache
     may still have stale entries; gating here prevents the resolver from
     surfacing them. */
  try {
    const s = getCurrentSettings();
    if ((s as any)?.offlineModeEnabled === true) return [];
    if (s?.onlineFeaturesEnabled !== true) return [];
  } catch { return []; }
  const minDeck = getParam("friends_playing", params, "minDeckLevel");
  const includeRecent = getParam("friends_playing", params, "includeRecentlyPlayed") === 1;
  const liveSet = getFriendsPlayingAppIds();
  const friendSet = includeRecent ? getFriendsRecentlyPlayedAppIds() : liveSet;
  if (friendSet.size === 0) return [];
  // Owned games (in user's library): full filtering + sort by Deck level /
  // last-played / live-or-recent.
  const ownedMatches = apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      friendSet.has(a.appid) &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => {
      // Currently-playing friends rank first; recent-only fallback to last_played.
      const aLive = liveSet.has(a.appid) ? 1 : 0;
      const bLive = liveSet.has(b.appid) ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return lastPlayedSec(b) - lastPlayedSec(a);
    })
    .map((a) => a.appid);
  /* Non-owned games (friends playing something the user lacks): raw appids
     appended after the owned matches. Shelf rendering picks them up via the
     source's `includesNonOwned: true`, routing metadata through the Store API
     name lookup (same path wishlist/store use). Clicks land on /library/app/<id>
     (BP redirects to the store page); live players rank ahead of recent-only. */
  /* Library-owned set MUST be derived from the full `apps` pool (not just
     the post-filter `ownedMatches`), otherwise apps the user owns but
     that got filtered out (non-Steam shortcut, Deck level too low, etc.)
     would leak back as "non-owned" — wrong semantically and visible to
     the user as duplicate / unowned-looking cards. */
  const libraryAppIds = new Set(apps.map((a) => a.appid));
  const nonOwnedIds: number[] = [];
  // Walk live set first so currently-playing non-owned items lead.
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

export function resolveSmartShelf(
  mode: SmartShelfMode,
  apps: AppOverview[],
  limit: number,
  params?: SmartParams,
  ttlMs?: number,
  shelfId?: string,
): number[] {
  /* Friends-playing reflects live friend state (polled ~every 90s). Never serve
     a stale cached result (e.g. the empty set captured at boot before the first
     poll) — re-resolve each refresh tick so the shelf appears as soon as a
     friend's status is known. The resolve itself is a cheap Set filter. */
  const ttl = mode === "friends_playing"
    ? 0
    : typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : DEFAULT_SMART_TTL_MS;
  const paramsKey = params ? JSON.stringify(params) : "";
  /* Per-shelf namespacing: when `shelfId` is given, two shelves with the
     same `mode + limit + params + ttl` keep independent cache entries — so
     refreshing one (`invalidateSmartShelfCache(shelfId)`) doesn't disturb
     the other. Falls back to a global key when omitted (legacy callers). */
  const cacheKey = shelfId
    ? `${shelfId}:${mode}:${limit}:${paramsKey}:${ttl}`
    : `${mode}:${limit}:${paramsKey}:${ttl}`;
  return cached(cacheKey, ttl, () => {
    try {
      switch (mode) {
        case "quick_play":      return resolveQuickPlay(apps, limit, params);
        case "not_started":     return resolveNotStarted(apps, limit, params);
        case "deck_picks":      return resolveDeckPicks(apps, limit, params);
        case "rediscover":      return resolveRediscover(apps, limit, params);
        case "best_unplayed":   return resolveBestUnplayed(apps, limit, params);
        case "interrupted":     return resolveInterrupted(apps, limit, params);
        case "time_of_day":     return resolveTimeOfDay(apps, limit, params);
        case "daily_pick":      return resolveDailyPick(apps, limit);
        case "on_deck":         return resolveOnDeck(apps, limit, params);
        case "recently_played": return resolveRecentlyPlayed(apps, limit, params);
        case "long_session":    return resolveLongSession(apps, limit, params);
        case "non_steam":       return resolveNonSteam(apps, limit);
        case "random_pick":     return resolveRandomPick(apps, limit);
        case "forgotten":       return resolveForgotten(apps, limit, params);
        case "spare_time":      return resolveSpareTime(apps, limit, params);
        case "soundtracks":     return resolveSoundtracks(apps, limit);
        case "videos":          return resolveVideos(apps, limit);
        case "demos":           return resolveDemos(apps, limit);
        case "cloud_games":     return resolveCloudGames(apps, limit);
        case "backlog_rescue":         return resolveBacklogRescue(apps, limit, params, shelfId);
        case "forgotten_gems":         return resolveForgottenGems(apps, limit, params);
        case "weekly_rotation":        return resolveWeeklyRotation(apps, limit, params, shelfId);
        case "short_battery":          return resolveShortBattery(apps, limit, params);
        case "long_session_night":     return resolveLongSessionNight(apps, limit, params);
        case "travel_mode":            return resolveTravelMode(apps, limit, params);
        case "hidden_gems":            return resolveHiddenGems(apps, limit, params);
        case "never_touched_classics": return resolveNeverTouchedClassics(apps, limit, params);
        case "recent_hidden_installs": return resolveRecentHiddenInstalls(apps, limit, params);
        case "monthly_spotlight":      return resolveMonthlySpotlight(apps, limit, params, shelfId);
        case "seasonal_rotation":      return resolveSeasonalRotation(apps, limit, params, shelfId);
        case "low_battery_mode":       return resolveLowBatteryMode(apps, limit, params);
        case "almost_finished":        return resolveAlmostFinished(apps, limit, params);
        case "couch_gaming":           return resolveCouchGaming(apps, limit, params);
        case "coop_ready":             return resolveCoopReady(apps, limit, params);
        case "party_games":            return resolvePartyGames(apps, limit, params);
        case "friends_playing":        return resolveFriendsPlaying(apps, limit, params);
        // "custom" is dispatched via `resolveShelfAppIds` in `src/steam/index.ts`
        // (it needs filterGroup + sort which aren't exposed here). Reaching
        // this case directly means a buggy caller — return [] to fail soft.
        case "custom":          return [];
        default: return [];
      }
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
    // No hour restriction — apply only the global day filter.
    return dayAllowed(daysOfWeek, now.getDay());
  }
  const h = now.getHours();
  const today = now.getDay();
  for (const r of ranges) {
    // Per-range days override the global daysOfWeek for this range only.
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
  // No window AND no day restriction → never flips.
  if (ranges.length === 0 && (!daysOfWeek || daysOfWeek.length === 0)) return null;
  /* The next boundary is the start of the next hour boundary that matches
     either the start or end of the window, OR the start of the next allowed
     day if `daysOfWeek` excludes today. Cheapest correct implementation:
     step the clock forward one hour at a time and return the first hour
     where `isInVisibilityWindow` flips. */
  const cur = isInVisibilityWindow(window, daysOfWeek, now);
  const probe = new Date(now.getTime());
  probe.setMinutes(0, 0, 0);
  // Walk forward up to 8 days. If we don't find a flip, the window is
  // effectively constant given the current day-of-week filter.
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

// --- Visibility Rules v2 ---
/* `evalVisibility` is the single entry every call site uses: it walks the rule
   tree when `visibility.rules` is present, else delegates to the untouched legacy
   `isInVisibilityWindow` (existing shelves behave EXACTLY as before). Unknown rule
   kinds (e.g. a device rule from a newer build) evaluate as true — fail-open. */
type VisibilityLike = { visibility?: any; visibleHours?: any; visibleDaysOfWeek?: number[] } | undefined;

function evalTimeWindowRule(rule: any, now: Date): boolean {
  if (Array.isArray(rule.days) && !rule.days.includes(now.getDay())) return false;
  const start = Number(rule.start), end = Number(rule.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
  return inSingleRange({ start, end }, now.getHours());
}

/* Time-context kinds are pure date math; session kinds read live session state;
   perf/peripheral kinds read on-demand backend state; device kinds read
   hardware; unknown kinds are neutral (fail-open). */
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

/* A rule may carry `not: true` to invert its match — the basis for "inverse"
   triggers (e.g. "stopped charging" = not charging, "went online" = not
   offline). The editor never lets a kind and its inverse coexist. */
function evalVisibilityRule(rule: any, now: Date): boolean {
  const res = evalVisibilityRuleRaw(rule, now);
  return rule?.not === true ? !res : res;
}

export function evalVisibilityRules(
  visibility: { mode?: "any" | "all"; rules?: any[] } | undefined,
  now: Date = new Date(),
): boolean {
  const rules = Array.isArray(visibility?.rules) ? visibility!.rules : [];
  if (rules.length === 0) return true; // no restriction
  const results = rules.map((r) => evalVisibilityRule(r, now));
  return visibility!.mode === "all" ? results.every(Boolean) : results.some(Boolean);
}

/* Single entry point used by every call site. New `visibility.rules` win;
   otherwise the legacy window fields drive it (zero behaviour change). */
export function evalVisibility(entry: VisibilityLike, now: Date = new Date()): boolean {
  if (!entry) return true;
  const rules = Array.isArray(entry.visibility?.rules) ? entry.visibility.rules : [];
  if (rules.length > 0) return evalVisibilityRules(entry.visibility, now);
  return isInVisibilityWindow(entry.visibleHours, entry.visibleDaysOfWeek, now);
}

/* True when the entry has any time/day rule (or legacy window) that flips on a
   clock boundary; device rules flip on hardware events, not the clock. */
function hasClockRule(entry: VisibilityLike): boolean {
  const rules = Array.isArray(entry?.visibility?.rules) ? entry!.visibility.rules : [];
  if (rules.length > 0) {
    return rules.some((r: any) => r?.kind === "timeWindow" || r?.kind === "dayOfWeek" || isTimeContextKind(String(r?.kind || "")));
  }
  return normalizeWindow(entry?.visibleHours).length > 0 || ((entry?.visibleDaysOfWeek?.length ?? 0) > 0);
}

/* Next epoch-ms at which `evalVisibility` would change, or null when nothing
   clock-based restricts the entry. */
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

/* Convert the legacy window fields into an editable rule list (for the
   Visibility tab when a shelf has no `visibility` yet). Not used for eval —
   legacy shelves eval through `isInVisibilityWindow` unchanged. */
export function legacyToVisibility(
  visibleHours: any,
  visibleDaysOfWeek: number[] | undefined,
): { mode: "any" | "all"; rules: Array<{ kind: string } & Record<string, unknown>> } {
  const rules: Array<{ kind: string } & Record<string, unknown>> = [];
  const ranges = normalizeWindow(visibleHours);
  const globalDays = Array.isArray(visibleDaysOfWeek) && visibleDaysOfWeek.length ? visibleDaysOfWeek : undefined;
  for (const r of ranges) {
    const days = Array.isArray(r.days) ? r.days : globalDays;
    rules.push({ kind: "timeWindow", start: r.start, end: r.end, ...(days ? { days } : {}) });
  }
  if (ranges.length === 0 && globalDays) rules.push({ kind: "dayOfWeek", days: globalDays });
  return { mode: "any", rules };
}

// --- Profile triggers (auto-apply a settings profile when its predicate is true) ---
/* A profile's `trigger` is a Visibility tree (same shape as shelf visibility).
   Unlike shelf visibility, an EMPTY trigger never fires — there is nothing to
   auto-apply, so an unconfigured profile is inert. */
export function evalProfileTrigger(trigger: unknown, now: Date = new Date()): boolean {
  const t = trigger as any;
  if (!t || !Array.isArray(t.rules) || t.rules.length === 0) return false;
  return evalVisibilityRules(t, now);
}

/* Name of the first profile whose trigger is currently active, or null.
   First-match wins so ordering in the profiles list is the tie-break. */
export function resolveTriggeredProfile(
  profiles: ReadonlyArray<{ name: string; trigger?: unknown }> | undefined,
  now: Date = new Date(),
): string | null {
  if (!Array.isArray(profiles)) return null;
  for (const p of profiles) if (evalProfileTrigger(p.trigger, now)) return p.name;
  return null;
}

/* Earliest clock boundary at which any profile trigger would flip, for one-shot
   re-arm scheduling (no polling). null when no trigger is clock-based. */
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

export const INTERNAL_SMART_MODES: ReadonlySet<string> = new Set([
  "quick_play",
  "not_started",
  "deck_picks",
  "rediscover",
  "best_unplayed",
  "interrupted",
  "time_of_day",
  "daily_pick",
  "on_deck",
  "recently_played",
  "long_session",
  "non_steam",
  "random_pick",
  "forgotten",
  "spare_time",
  "soundtracks",
  "videos",
  "demos",
  "cloud_games",
  "backlog_rescue",
  "forgotten_gems",
  "weekly_rotation",
  "short_battery",
  "long_session_night",
  "travel_mode",
  "hidden_gems",
  "never_touched_classics",
  "recent_hidden_installs",
  "monthly_spotlight",
  "seasonal_rotation",
  "low_battery_mode",
  "almost_finished",
  "couch_gaming",
  "coop_ready",
  "party_games",
  "friends_playing",
  "custom",
]);

export function invalidateSmartShelfCache(shelfId?: string): void {
  if (!shelfId) { resolverCache.clear(); return; }
  // Per-shelf scope: the namespaced cache key starts with `${shelfId}:`.
  // Wipe only those entries so refresh on shelf A doesn't disturb shelf B.
  const prefix = `${shelfId}:`;
  for (const k of Array.from(resolverCache.keys())) {
    if (k.startsWith(prefix)) resolverCache.delete(k);
  }
}
