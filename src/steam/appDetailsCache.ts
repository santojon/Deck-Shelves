/**
 * Best-effort per-app metadata cache populated from
 * `SteamClient.Apps.RegisterForAppDetails`.
 *
 * Smart-shelf templates that depend on data NOT in AppOverview (achievement
 * progress, store categories) consult this cache. The cache is populated
 * lazily: the first time a template asks for `vecCategories` or achievement
 * data for an app, the resolver schedules a fetch. Subsequent reads return
 * the cached value.
 *
 * Cold path: when the data isn't yet cached, the template's filter returns
 * `false` for that app (= exclude from shelf). After the fetch completes on
 * the next refresh tick, the app is correctly included. This is acceptable
 * because smart-shelf resolvers run on a TTL'd cache anyway — first paint
 * may be partial, second is complete.
 *
 * Graceful degradation: when `SteamClient.Apps.RegisterForAppDetails` isn't
 * available (older SteamOS, non-Steam-Deck environment), the cache stays
 * empty and the templates that depend on it return empty shelves silently.
 */

import { logInfo } from "../runtime/logger";

export type AppDetailsSummary = {
  /** Lowercase store-category display names (e.g. "co-op", "shared/split screen multi-player"). */
  categories: string[];
  /** Achievement percentage as a fraction in [0, 1]. NaN when not exposed. */
  achievementProgress: number;
};

const cache = new Map<number, AppDetailsSummary>();
const pending = new Set<number>();
const FETCH_TIMEOUT_MS = 5000;

function getSteamClient(): any {
  return (globalThis as any).SteamClient;
}

/** Returns cached summary or null when not yet fetched. */
export function getAppDetailsSummary(appid: number): AppDetailsSummary | null {
  return cache.get(appid) ?? null;
}

/** Schedules a background fetch for the appid if not already cached / pending.
 *  Returns immediately — the cache is populated on the SteamClient callback. */
export function preloadAppDetailsSummary(appid: number): void {
  if (cache.has(appid) || pending.has(appid)) return;
  const sc = getSteamClient();
  if (!sc?.Apps?.RegisterForAppDetails) return;
  pending.add(appid);
  let done = false;
  const finish = (summary: AppDetailsSummary) => {
    if (done) return;
    done = true;
    pending.delete(appid);
    cache.set(appid, summary);
  };
  try {
    const handle = sc?.Apps?.RegisterForAppDetails?.(appid, (details: any) => {
      try { handle?.unregister?.(); } catch {}
      // `vecCategories` shape varies — most commonly `Array<{ strDisplayName: string }>`.
      // Some builds expose `m_setStoreCategories` or `vecStoreCategories`. We
      // accept any of those + the bare strings array as a fallback.
      const rawCats = details?.vecCategories ?? details?.vecStoreCategories ?? details?.m_setStoreCategories ?? [];
      const categories: string[] = [];
      if (Array.isArray(rawCats)) {
        for (const c of rawCats) {
          if (typeof c === "string") {
            categories.push(c.toLowerCase());
          } else if (c && typeof c.strDisplayName === "string") {
            categories.push(c.strDisplayName.toLowerCase());
          } else if (c && typeof c.name === "string") {
            categories.push(c.name.toLowerCase());
          }
        }
      }
      // Achievement progress: `nAchievementProgress` (out of `nAchievementTotal`) is
      // the most commonly observed shape. Some builds expose `unAchievementsEarned`
      // / `unAchievementsTotal`. Returns NaN when neither is populated.
      let achievementProgress = NaN;
      try {
        const earned = Number(details?.nAchievementProgress ?? details?.unAchievementsEarned ?? NaN);
        const total = Number(details?.nAchievementTotal ?? details?.unAchievementsTotal ?? NaN);
        if (Number.isFinite(earned) && Number.isFinite(total) && total > 0) {
          achievementProgress = Math.max(0, Math.min(1, earned / total));
        }
      } catch {}
      finish({ categories, achievementProgress });
    });
    setTimeout(() => {
      if (!done) {
        try { handle?.unregister?.(); } catch {}
        finish({ categories: [], achievementProgress: NaN });
      }
    }, FETCH_TIMEOUT_MS);
  } catch {
    pending.delete(appid);
  }
}

/** Preload a batch of appids. Throttled internally — no batching limits
 *  applied here because `SteamClient.Apps.RegisterForAppDetails` is already
 *  per-app. */
export function preloadAppDetailsSummaries(appids: number[]): void {
  for (const id of appids) preloadAppDetailsSummary(id);
}

/** Clears the cache. Called on Steam OS suspend/resume to refresh stale data. */
export function clearAppDetailsCache(): void {
  cache.clear();
  pending.clear();
  logInfo("STEAM", "appDetailsCache cleared");
}

/** Returns true when the given appid's cached categories include any of the
 *  query strings (substring match, both lowercased). */
export function appHasAnyCategory(appid: number, queries: string[]): boolean {
  const summary = cache.get(appid);
  if (!summary) return false;
  for (const cat of summary.categories) {
    for (const q of queries) {
      if (cat.includes(q)) return true;
    }
  }
  return false;
}

/** Returns the achievement progress as a percentage [0, 100] or NaN if
 *  not yet cached. */
export function getAppAchievementPct(appid: number): number {
  const summary = cache.get(appid);
  if (!summary || !Number.isFinite(summary.achievementProgress)) return NaN;
  return summary.achievementProgress * 100;
}
