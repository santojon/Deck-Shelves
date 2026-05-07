import type { AppOverview } from "./index";
import type { SmartShelfMode } from "../types";
import { getParam, type SmartParams } from "./smartParams";

// Deck compatibility categories: verified=3, playable=2, unsupported=1, unknown=0
const DECK_VERIFIED = 3;
const DECK_PLAYABLE = 2;

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
    .filter((a) => !a.is_non_steam && playtimeMinutes(a) === 0 && lastPlayedSec(a) === 0 && deckCompat(a) >= minDeck)
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
    .filter((a) => playtimeMinutes(a) >= minPt && playtimeMinutes(a) <= maxPt && deckCompat(a) >= minDeck)
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
  const eligible = apps.filter((a) => a.installed || playtimeMinutes(a) > 0);
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
    .filter((a) => lastPlayedSec(a) > cutoff)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

function resolveLongSession(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minPt = getParam("long_session", params, "minPlaytimeMinutes");
  const minDeck = getParam("long_session", params, "minDeckLevel");
  return apps
    .filter((a) => a.installed && playtimeMinutes(a) > minPt && deckCompat(a) >= minDeck)
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

/** Hardcoded windows for the legacy "spare_time" mode. Exposed so the
 *  EditSmartShelfModal can pre-populate `visibleHours` when a user creates
 *  a shelf in this mode and so `addSmartShelf` defaults match the
 *  resolver's natural behavior. */
export const SPARE_TIME_WINDOWS: ReadonlyArray<{ start: number; end: number }> = [
  { start: 6, end: 9 },
  { start: 12, end: 14 },
  { start: 19, end: 22 },
];

function isSpareTimeWindow(): boolean {
  const h = new Date().getHours();
  return (h >= 6 && h < 9) || (h >= 12 && h < 14) || (h >= 19 && h < 22);
}

function resolveSpareTime(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  if (!isSpareTimeWindow()) return [];
  const maxPt = getParam("spare_time", params, "maxPlaytimeMinutes");
  const minDeck = getParam("spare_time", params, "minDeckLevel");
  return apps
    .filter((a) => a.installed && playtimeMinutes(a) <= maxPt && deckCompat(a) >= minDeck)
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

type VisibilityRange = { start: number; end: number };
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
  if (Array.isArray(daysOfWeek)) {
    // Defined array — even empty — means the user picked specific days.
    // Empty therefore yields "no allowed days" → never visible.
    if (!daysOfWeek.includes(now.getDay())) return false;
  }
  const ranges = normalizeWindow(window);
  if (ranges.length === 0) return true;
  const h = now.getHours();
  for (const r of ranges) if (inSingleRange(r, h)) return true;
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
