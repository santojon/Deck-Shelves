import type { AppOverview } from "./index";
import { getParam, type SmartParams } from "./smartParams";
import { weightedRank, multiFactorRank, timeDecayScore, applyCooldown, rotateWindow } from "./heuristics";
import { playtimeMinutes, lastPlayedSec, deckCompat, rtAcquired } from "./smartAppFields";

export function resolveBacklogRescue(apps: AppOverview[], limit: number, params?: SmartParams, shelfId?: string): number[] {
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

export function resolveForgottenGems(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
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

export function resolveHiddenGems(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
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

export function resolveWeeklyRotation(apps: AppOverview[], limit: number, params?: SmartParams, shelfId?: string): number[] {
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

export function resolveShortBattery(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
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

export function resolveTravelMode(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
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

export function resolveRecentHiddenInstalls(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
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
