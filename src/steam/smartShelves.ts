/* eslint-disable complexity */
import type { AppOverview } from "./index";
import type { SmartShelfMode } from "../types";
import { getParam, type SmartParams } from "./smartParams";
import { weightedRank, multiFactorRank, timeDecayScore, applyCooldown, rotateWindow } from "./heuristics";
import { getBatteryState } from "../runtime/batteryState";
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

/** Hour boundaries used by the legacy `time_of_day` mode to switch its
 *  inner sub-mode (quick_play / deck_picks / rediscover). Exposed so the
 *  edit modal can surface the boundaries to the user as informational
 *  context. NOT a visibility restriction — the shelf is always visible. */
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

// Media / non-game template resolvers — each filters the local pool to
// a specific Steam EAppType bit-flag so users can carve a shelf for
// soundtracks, videos, demos etc. that the game-focused templates above
// would otherwise hide. See `shortcutType` filter for the full app_type
// table.

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
  // applies for the "hideOwnedNonSteamCloud" toggle: the appid lives in
  // a `[Unifideck] microsoft`-style collection. Returns an empty shelf
  // when no cloud collection is detected — the template is purposely
  // about cloud-play entries only, so falling back to "any non-Steam"
  // would mis-label the row on devices without Unifideck.
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

/** Default visibility windows for the "spare_time" mode. Pre-populated
 *  into `visibleHours` when a new spare_time shelf is created so the
 *  user can edit them. Also returned by `getModeVisibilityWindows` as
 *  a fallback for shelves created before `visibleHours` was introduced. */
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

/** Backlog rescue — installed games with playtime > 0 but stale, ranked
 *  by a composite of (playtime, time-since-last-played decay, deck
 *  compat). Cooldown skips items surfaced in the last 14 days so the
 *  shelf rotates through the backlog instead of pinning the same set. */
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

/** Forgotten gems — owned but never played + high metacritic / review
 *  score. Multi-factor: review_score primary, metacritic secondary,
 *  recency-of-acquisition tertiary. */
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

/** Weekly rotation — round-robin slice over a fixed candidate pool
 *  (installed games), advancing once per `rotateEveryDays`. Same
 *  shelf shows the same slice all week, then advances. */
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

/** Short battery — installed games small enough + Deck-friendly + short
 *  playtime threshold. Heuristic proxy for "quick session that won't
 *  drain the deck": cap install size + cap playtime + require Deck
 *  Verified/Playable. */
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

/** Long session night — same pool/filter as long_session; differentiation
 *  is the template-level default visibleHours preset (19h–23h), wired in
 *  createDefaultSmartShelf. Resolver-side behaviour mirrors long_session
 *  so users get the same ranking. */
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

/** Travel mode — installed games small enough to fit alongside others on
 *  a microSD or modest internal SSD. Same Deck-compat floor as
 *  short_battery; differentiation is the larger default size cap (5 GB
 *  vs 4 GB) and no playtime cap (any installed small game). */
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

/** Hidden gems — owned games with high review percentage AND zero
 *  playtime. Same shape as forgotten_gems but without the metacritic
 *  axis (review_percentage only) and without the acquisition-time
 *  bias. */
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

/** Never touched classics — games acquired years ago that you've never
 *  launched. rt_purchased_time is the proxy for "in the library for a
 *  long time"; ordering surfaces oldest acquisitions first. */
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

/** Recent hidden installs — installed in the last N days but never
 *  launched. Differs from forgotten/never_touched_classics in that it
 *  surfaces RECENT acquisitions that fell through the cracks rather
 *  than ancient ones. */
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

/** Monthly spotlight — round-robin over installed games, rotating every
 *  30 days by default. Same primitive as weekly_rotation with a longer
 *  default window. */
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

/** Seasonal rotation — round-robin over installed games, rotating every
 *  90 days by default (one season). Same primitive as weekly_rotation
 *  with a 90-day window. */
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

// Runtime-aware templates: consult battery state / appDetails cache. Each
// falls back to a deterministic empty / heuristic result when the runtime
// data isn't available, so the shelf never crashes — it just renders empty
// (consistent with other empty-source semantics across the plugin).

/** Low battery mode — only surfaces a candidate set when the device is
 *  actually on battery + below the configured threshold. When the runtime
 *  battery probe is unavailable OR battery is OK / charging, returns the
 *  same candidates as short_battery so the shelf is non-empty under common
 *  conditions (desktop preview, dock, etc.). */
function resolveLowBatteryMode(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const threshold = getParam("low_battery_mode", params, "batteryThresholdPct") / 100;
  const maxPt = getParam("low_battery_mode", params, "maxPlaytimeMinutes");
  const maxSizeMb = getParam("low_battery_mode", params, "maxSizeMb");
  const minDeck = getParam("low_battery_mode", params, "minDeckLevel");
  const maxBytes = maxSizeMb * 1024 * 1024;
  const battery = getBatteryState();
  const isOnBatteryLow = battery?.hasBattery === true && battery.state === "discharging" && battery.level > 0 && battery.level <= threshold;
  // Same selection rules as short_battery (installed + small + Deck-friendly
  // + short playtime). The differentiation is the visibility-on-low-battery
  // semantic: when battery is OK, the shelf still renders but with the same
  // candidates as short_battery — users get a useful set in any device state.
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

/** Almost finished — installed games with achievement progress ≥ threshold.
 *  Consults the appDetailsCache (lazy-populated via SteamClient.Apps
 *  appDetails). Returns empty when achievement data isn't yet cached for
 *  any app; the next refresh tick (after cache warms) populates the shelf. */
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

// store_categories-aware templates. Substring-match (case-insensitive)
// against Steam's category names — built-in keywords cover the canonical
// English names; localized installs may not match, in which case the shelf
// is empty. Fix is to extend the keyword list per locale (i18n).

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

/** Friends playing — apps any friend is in-game RIGHT NOW (and, when
 *  `includeRecentlyPlayed` = 1, apps any friend was seen playing in the
 *  last ~14 days). Online-gated: returns empty when `onlineFeaturesEnabled`
 *  is off OR when the friend cache is empty (offline / not signed in).
 *  Resolves against the user's library so the shelf only surfaces games
 *  the user actually owns. */
function resolveFriendsPlaying(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  // Online gate: reuse the same master toggle as wishlist / store. When the
  // user has online features off, friends data is treated as off too —
  // consistent with the rest of the online-gated UX. Local friend cache
  // may still have stale entries; gating here prevents the resolver from
  // surfacing them.
  try {
    const s = getCurrentSettings();
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
  // Non-owned games (friends playing something the user doesn't have): emit
  // raw appids appended after the owned matches. Shelf rendering picks
  // these up via the source's `includesNonOwned: true` flag, which routes
  // metadata fetching through the Steam Store API name lookup (same path
  // wishlist + store shelves already use for non-owned items). Click on
  // such a card lands on `/library/app/<appid>`; Steam BP redirects to
  // the store detail page when the user doesn't own the app. Live
  // currently-playing friends rank ahead of recently-played-only ones.
  //
  // Library-owned set MUST be derived from the full `apps` pool (not just
  // the post-filter `ownedMatches`), otherwise apps the user owns but
  // that got filtered out (non-Steam shortcut, Deck level too low, etc.)
  // would leak back as "non-owned" — wrong semantically and visible to
  // the user as duplicate / unowned-looking cards.
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

/**
 * Resolve the appids for a smart shelf.
 *
 * `params` are per-mode tuning knobs (see `smartParams.ts`); missing keys
 * fall back to the resolver's hardcoded defaults.
 *
 * `ttlMs` overrides the default 60-minute cache window. A user can set this
 * via the EditSmartShelfModal `refreshIntervalHours` field — the same mode
 * with a longer TTL stays cached longer; a shorter TTL refreshes sooner.
 * Cache key includes mode + limit + serialized params + ttlMs so different
 * configurations don't collide.
 */
export function resolveSmartShelf(
  mode: SmartShelfMode,
  apps: AppOverview[],
  limit: number,
  params?: SmartParams,
  ttlMs?: number,
  shelfId?: string,
): number[] {
  const ttl = typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : DEFAULT_SMART_TTL_MS;
  const paramsKey = params ? JSON.stringify(params) : "";
  // Per-shelf namespacing: when `shelfId` is given, two shelves with the
  // same `mode + limit + params + ttl` keep independent cache entries — so
  // refreshing one (`invalidateSmartShelfCache(shelfId)`) doesn't disturb
  // the other. Falls back to a global key when omitted (legacy callers).
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

/**
 * Returns `true` when the current local time falls within the smart-shelf
 * visibility window. Pure helper — exposed so `Shelf.tsx` and `HomeInject.tsx`
 * can pre-skip render without instantiating the resolver.
 *
 * - Undefined window AND undefined day filter → always visible.
 * - Empty hour-range array → always visible (no hour restriction).
 * - Multiple ranges → OR-combined (any match = visible).
 * - Within a range: `start === end` → always; `start < end` → `[start, end)`;
 *   `start > end` → wraps midnight, i.e. `[start, 24) ∪ [0, end)`.
 * - `daysOfWeek` semantics: `undefined` → no day restriction (always visible
 *   regardless of weekday); a defined array (including empty) → restrict to
 *   the listed days. Empty array therefore means "never" (zero matching
 *   days). 0 = Sunday … 6 = Saturday — matches `Date.getDay()`.
 *
 * Accepts a single `{ start, end }` for backwards compatibility — wrapped
 * into a one-element array internally.
 */
export function isInVisibilityWindow(
  window: VisibilityWindowInput,
  daysOfWeek: number[] | undefined,
  now: Date = new Date(),
): boolean {
  const ranges = normalizeWindow(window);
  if (ranges.length === 0) {
    // No hour restriction — apply only the global day filter.
    if (Array.isArray(daysOfWeek)) {
      if (!daysOfWeek.includes(now.getDay())) return false;
    }
    return true;
  }
  const h = now.getHours();
  const today = now.getDay();
  for (const r of ranges) {
    // Per-range days override the global daysOfWeek for this range only.
    if (Array.isArray(r.days)) {
      if (!r.days.includes(today)) continue;
    } else if (Array.isArray(daysOfWeek)) {
      if (!daysOfWeek.includes(today)) return false;
    }
    if (inSingleRange(r, h)) return true;
  }
  return false;
}

/**
 * Returns the timestamp (ms since epoch) of the next moment the visibility
 * decision flips. Used by callers that want to schedule a re-render exactly
 * at the boundary instead of polling. Returns `null` when the window is
 * "always" (no boundary) or invalid.
 */
export function nextVisibilityBoundary(
  window: VisibilityWindowInput,
  daysOfWeek: number[] | undefined,
  now: Date = new Date(),
): number | null {
  const ranges = normalizeWindow(window);
  // No window AND no day restriction → never flips.
  if (ranges.length === 0 && (!daysOfWeek || daysOfWeek.length === 0)) return null;
  // The next boundary is the start of the next hour boundary that matches
  // either the start or end of the window, OR the start of the next allowed
  // day if `daysOfWeek` excludes today. Cheapest correct implementation:
  // step the clock forward one hour at a time and return the first hour
  // where `isInVisibilityWindow` flips.
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

/**
 * Returns the hardcoded visibility windows for modes that have built-in
 * time-conditional logic (e.g. spare_time). Used by HomeInject to schedule
 * boundary timers even when the user hasn't set explicit `visibleHours`.
 * Add new modes here as they acquire internal time checks.
 */
export function getModeVisibilityWindows(mode: SmartShelfMode): ReadonlyArray<{ start: number; end: number }> | undefined {
  if (mode === 'spare_time') return SPARE_TIME_WINDOWS;
  return undefined;
}

/**
 * Set of every smart-shelf mode resolved by the built-in switch in
 * `resolveSmartShelf`. Used by `resolveShelfAppIds` to enforce
 * internal precedence: external plugins that happen to register the
 * same id never override our heuristics — they only fill gaps for
 * truly external mode ids.
 */
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
