import type { AppOverview } from "./index";
import type { SmartShelfMode } from "../types";
import { getParam, type SmartParams } from "./smartParams";

// Deck compatibility categories: verified=3, playable=2, unsupported=1, unknown=0
const DECK_VERIFIED = 3;
const DECK_PLAYABLE = 2;

const resolverCache = new Map<string, { ts: number; ids: number[] }>();
const DEFAULT_SMART_TTL_MS = 5 * 60 * 1000;

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
  return apps
    .filter((a) => a.installed && (deckCompat(a) === DECK_VERIFIED || deckCompat(a) === DECK_PLAYABLE) && playtimeMinutes(a) < maxPt)
    .sort((a, b) => deckCompat(b) - deckCompat(a) || lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveNotStarted(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => !a.is_non_steam && playtimeMinutes(a) === 0 && lastPlayedSec(a) === 0)
    .sort((a, b) => deckCompat(b) - deckCompat(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveDeckPicks(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => deckCompat(a) === DECK_VERIFIED)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveRediscover(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const months = getParam("rediscover", params, "monthsAgo");
  const minPt = getParam("rediscover", params, "minPlaytimeMinutes");
  const monthsAgoSec = Math.floor(Date.now() / 1000) - months * 30 * 24 * 3600;
  return apps
    .filter(
      (a) =>
        lastPlayedSec(a) > 0 &&
        lastPlayedSec(a) < monthsAgoSec &&
        playtimeMinutes(a) > minPt &&
        (deckCompat(a) === DECK_VERIFIED || deckCompat(a) === DECK_PLAYABLE),
    )
    .sort((a, b) => playtimeMinutes(b) - playtimeMinutes(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveBestUnplayed(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => a.installed && playtimeMinutes(a) === 0 && lastPlayedSec(a) === 0)
    .sort((a, b) => deckCompat(b) - deckCompat(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveInterrupted(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minPt = getParam("interrupted", params, "minPlaytimeMinutes");
  const maxPt = getParam("interrupted", params, "maxPlaytimeMinutes");
  return apps
    .filter((a) => playtimeMinutes(a) >= minPt && playtimeMinutes(a) <= maxPt)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveTimeOfDay(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return resolveQuickPlay(apps, limit, params);
  if (hour >= 12 && hour < 18) return resolveDeckPicks(apps, limit);
  return resolveRediscover(apps, limit, params);
}

function resolveDailyPick(apps: AppOverview[], limit: number): number[] {
  const dayIndex = Math.floor(Date.now() / 86400000);
  const eligible = apps.filter((a) => a.installed || playtimeMinutes(a) > 0);
  if (!eligible.length) return [];
  const start = dayIndex % eligible.length;
  const rotated = [...eligible.slice(start), ...eligible.slice(0, start)];
  return rotated.slice(0, limit).map((a) => a.appid);
}

function resolveOnDeck(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => a.installed && (deckCompat(a) === DECK_VERIFIED || deckCompat(a) === DECK_PLAYABLE))
    .sort((a, b) => deckCompat(b) - deckCompat(a) || lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveRecentlyPlayed(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const days = getParam("recently_played", params, "daysAgo");
  const cutoff = Math.floor(Date.now() / 1000) - days * 24 * 3600;
  return apps
    .filter((a) => lastPlayedSec(a) > cutoff)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveLongSession(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minPt = getParam("long_session", params, "minPlaytimeMinutes");
  return apps
    .filter((a) => a.installed && playtimeMinutes(a) > minPt)
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

function resolveRandomPick(apps: AppOverview[], limit: number): number[] {
  const arr = [...apps];
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

function isSpareTimeWindow(): boolean {
  const h = new Date().getHours();
  return (h >= 6 && h < 9) || (h >= 12 && h < 14) || (h >= 19 && h < 22);
}

function resolveSpareTime(apps: AppOverview[], limit: number): number[] {
  if (!isSpareTimeWindow()) return [];
  return apps
    .filter((a) => a.installed && playtimeMinutes(a) <= 120)
    .sort((a, b) => deckCompat(b) - deckCompat(a) || lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

/**
 * Resolve the appids for a smart shelf.
 *
 * `params` are per-mode tuning knobs (see `smartParams.ts`); missing keys
 * fall back to the resolver's hardcoded defaults.
 *
 * `ttlMs` overrides the default 5-minute cache window. A user can set this
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
): number[] {
  const ttl = typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : DEFAULT_SMART_TTL_MS;
  const paramsKey = params ? JSON.stringify(params) : "";
  const cacheKey = `${mode}:${limit}:${paramsKey}:${ttl}`;
  return cached(cacheKey, ttl, () => {
    try {
      switch (mode) {
        case "quick_play":      return resolveQuickPlay(apps, limit, params);
        case "not_started":     return resolveNotStarted(apps, limit);
        case "deck_picks":      return resolveDeckPicks(apps, limit);
        case "rediscover":      return resolveRediscover(apps, limit, params);
        case "best_unplayed":   return resolveBestUnplayed(apps, limit);
        case "interrupted":     return resolveInterrupted(apps, limit, params);
        case "time_of_day":     return resolveTimeOfDay(apps, limit, params);
        case "daily_pick":      return resolveDailyPick(apps, limit);
        case "on_deck":         return resolveOnDeck(apps, limit);
        case "recently_played": return resolveRecentlyPlayed(apps, limit, params);
        case "long_session":    return resolveLongSession(apps, limit, params);
        case "non_steam":       return resolveNonSteam(apps, limit);
        case "random_pick":     return resolveRandomPick(apps, limit);
        case "forgotten":       return resolveForgotten(apps, limit, params);
        case "spare_time":      return resolveSpareTime(apps, limit);
        default: return [];
      }
    } catch {
      return [];
    }
  });
}

export function invalidateSmartShelfCache(): void {
  resolverCache.clear();
}
