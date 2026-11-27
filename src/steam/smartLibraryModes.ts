import type { AppOverview } from "./index";
import type { SmartShelfMode } from "../types";
import { getParam, type SmartParams } from "./smartParams";
import { playtimeMinutes, lastPlayedSec, deckCompat, rtAcquired, isGameCandidate } from "./smartAppFields";
import { localDayIndex } from "./heuristics";

export function resolveQuickPlay(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
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

export function resolveNotStarted(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
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

export function resolveDeckPicks(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minDeck = getParam("deck_picks", params, "minDeckLevel");
  return apps
    .filter((a) => isGameCandidate(a) && deckCompat(a) >= minDeck)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

export function resolveRediscover(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const months = getParam("rediscover", params, "monthsAgo");
  const minPt = getParam("rediscover", params, "minPlaytimeMinutes");
  const minDeck = getParam("rediscover", params, "minDeckLevel");
  const monthsAgoSec = Math.floor(Date.now() / 1000) - months * 30 * 24 * 3600;
  return apps
    .filter(
      (a) =>
        isGameCandidate(a) &&
        lastPlayedSec(a) > 0 &&
        lastPlayedSec(a) < monthsAgoSec &&
        playtimeMinutes(a) > minPt &&
        deckCompat(a) >= minDeck,
    )
    .sort((a, b) => playtimeMinutes(b) - playtimeMinutes(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

export function resolveBestUnplayed(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minDeck = getParam("best_unplayed", params, "minDeckLevel");
  return apps
    .filter((a) => a.installed && (a.app_type === undefined || a.app_type === 1) && playtimeMinutes(a) === 0 && lastPlayedSec(a) === 0 && deckCompat(a) >= minDeck)
    .sort((a, b) => deckCompat(b) - deckCompat(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

export function resolveInterrupted(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
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

export function resolveTimeOfDay(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return resolveQuickPlay(apps, limit, params);
  if (hour >= 12 && hour < 18) return resolveDeckPicks(apps, limit, params);
  return resolveRediscover(apps, limit, params);
}

export function resolveDailyPick(apps: AppOverview[], limit: number): number[] {
  const dayIndex = localDayIndex();
  const eligible = apps.filter((a) =>
    isGameCandidate(a) &&
    (a.installed || playtimeMinutes(a) > 0),
  );
  if (!eligible.length) return [];
  const start = dayIndex % eligible.length;
  const rotated = [...eligible.slice(start), ...eligible.slice(0, start)];
  return rotated.slice(0, limit).map((a) => a.appid);
}

export function resolveOnDeck(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minDeck = getParam("on_deck", params, "minDeckLevel");
  return apps
    .filter(
      (a) =>
        a.installed &&
        isGameCandidate(a) &&
        deckCompat(a) >= minDeck,
    )
    .sort((a, b) => deckCompat(b) - deckCompat(a) || lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

export function resolveRecentlyPlayed(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const days = getParam("recently_played", params, "daysAgo");
  const cutoff = Math.floor(Date.now() / 1000) - days * 24 * 3600;
  return apps
    .filter((a) =>
      isGameCandidate(a) &&
      lastPlayedSec(a) > cutoff,
    )
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

export function resolveLongSession(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minPt = getParam("long_session", params, "minPlaytimeMinutes");
  const minDeck = getParam("long_session", params, "minDeckLevel");
  return apps
    .filter((a) =>
      isGameCandidate(a) &&
      a.installed &&
      playtimeMinutes(a) > minPt &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => playtimeMinutes(b) - playtimeMinutes(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

export function resolveNonSteam(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => a.is_non_steam)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

export function resolveSoundtracks(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => !a.is_non_steam && a.app_type === 8192)
    .sort((a, b) => String((a as any).sort_as ?? a.display_name ?? "").localeCompare(String((b as any).sort_as ?? b.display_name ?? "")))
    .slice(0, limit)
    .map((a) => a.appid);
}

export function resolveVideos(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => !a.is_non_steam && a.app_type === 2048)
    .sort((a, b) => String((a as any).sort_as ?? a.display_name ?? "").localeCompare(String((b as any).sort_as ?? b.display_name ?? "")))
    .slice(0, limit)
    .map((a) => a.appid);
}

export function resolveDemos(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => !a.is_non_steam && a.app_type === 8)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a)
      || String((a as any).sort_as ?? a.display_name ?? "").localeCompare(String((b as any).sort_as ?? b.display_name ?? "")))
    .slice(0, limit)
    .map((a) => a.appid);
}

export function resolveCloudGames(apps: AppOverview[], limit: number): number[] {
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

export function resolveRandomPick(apps: AppOverview[], limit: number): number[] {
  const arr = apps.filter((a) =>
    isGameCandidate(a),
  );
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, limit).map((a) => a.appid);
}

export function resolveForgotten(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
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

export function resolveSpareTime(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
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
