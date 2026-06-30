
import { logInfo } from "../runtime/logger";

export type AppDetailsSummary = {
  categories: string[];
  achievementProgress: number;
};

const cache = new Map<number, AppDetailsSummary>();
const pending = new Set<number>();
const FETCH_TIMEOUT_MS = 5000;

function getSteamClient(): any {
  return (globalThis as any).SteamClient;
}

export function getAppDetailsSummary(appid: number): AppDetailsSummary | null {
  return cache.get(appid) ?? null;
}

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

export function preloadAppDetailsSummaries(appids: number[]): void {
  for (const id of appids) preloadAppDetailsSummary(id);
}

export function clearAppDetailsCache(): void {
  cache.clear();
  pending.clear();
  logInfo("STEAM", "appDetailsCache cleared");
}

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

export function getAppAchievementPct(appid: number): number {
  const summary = cache.get(appid);
  if (!summary || !Number.isFinite(summary.achievementProgress)) return NaN;
  return summary.achievementProgress * 100;
}
