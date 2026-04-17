import type { AppOverview } from "./index";
import type { SmartShelfMode } from "../types";

// Deck compatibility categories: verified=3, playable=2, unsupported=1, unknown=0
const DECK_VERIFIED = 3;
const DECK_PLAYABLE = 2;

const resolverCache = new Map<string, { ts: number; ids: number[] }>();
const SMART_TTL = 5 * 60 * 1000;

function cached(key: string, fn: () => number[]): number[] {
  const entry = resolverCache.get(key);
  if (entry && Date.now() - entry.ts < SMART_TTL) return entry.ids;
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

function resolveQuickPlay(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => a.installed && (deckCompat(a) === DECK_VERIFIED || deckCompat(a) === DECK_PLAYABLE) && playtimeMinutes(a) < 120)
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

function resolveRediscover(apps: AppOverview[], limit: number): number[] {
  const sixMonthsAgo = Math.floor(Date.now() / 1000) - 6 * 30 * 24 * 3600;
  return apps
    .filter(
      (a) =>
        lastPlayedSec(a) > 0 &&
        lastPlayedSec(a) < sixMonthsAgo &&
        playtimeMinutes(a) > 60 &&
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

function resolveInterrupted(apps: AppOverview[], limit: number): number[] {
  return apps
    .filter((a) => playtimeMinutes(a) >= 30 && playtimeMinutes(a) <= 180)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveTimeOfDay(apps: AppOverview[], limit: number): number[] {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return resolveQuickPlay(apps, limit);
  if (hour >= 12 && hour < 18) return resolveDeckPicks(apps, limit);
  return resolveRediscover(apps, limit);
}

function resolveDailyPick(apps: AppOverview[], limit: number): number[] {
  const dayIndex = Math.floor(Date.now() / 86400000);
  const eligible = apps.filter((a) => a.installed || playtimeMinutes(a) > 0);
  if (!eligible.length) return [];
  const start = dayIndex % eligible.length;
  const rotated = [...eligible.slice(start), ...eligible.slice(0, start)];
  return rotated.slice(0, limit).map((a) => a.appid);
}

export function resolveSmartShelf(mode: SmartShelfMode, apps: AppOverview[], limit: number): number[] {
  return cached(`${mode}:${limit}`, () => {
    try {
      switch (mode) {
        case "quick_play": return resolveQuickPlay(apps, limit);
        case "not_started": return resolveNotStarted(apps, limit);
        case "deck_picks": return resolveDeckPicks(apps, limit);
        case "rediscover": return resolveRediscover(apps, limit);
        case "best_unplayed": return resolveBestUnplayed(apps, limit);
        case "interrupted": return resolveInterrupted(apps, limit);
        case "time_of_day": return resolveTimeOfDay(apps, limit);
        case "daily_pick": return resolveDailyPick(apps, limit);
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
