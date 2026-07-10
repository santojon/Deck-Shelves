
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

// Normalise one raw category entry (string, `{strDisplayName}` or `{name}`) to
// a lowercased name; null when the shape isn't recognised.
function catName(c: any): string | null {
  if (typeof c === "string") return c.toLowerCase();
  if (c && typeof c.strDisplayName === "string") return c.strDisplayName.toLowerCase();
  if (c && typeof c.name === "string") return c.name.toLowerCase();
  return null;
}

// Category names from an app-details payload. `vecCategories` is most common;
// some builds expose `vecStoreCategories` / `m_setStoreCategories`.
function extractCategories(details: any): string[] {
  const d = details ?? {};
  const rawCats = d.vecCategories ?? d.vecStoreCategories ?? d.m_setStoreCategories ?? [];
  if (!Array.isArray(rawCats)) return [];
  const out: string[] = [];
  for (const c of rawCats) {
    const name = catName(c);
    if (name !== null) out.push(name);
  }
  return out;
}

// Achievement completion (0..1) from an app-details payload; NaN when neither
// the `nAchievement*` nor `unAchievements*` counters are populated.
function extractAchievementProgress(details: any): number {
  try {
    const d = details ?? {};
    const earned = Number(d.nAchievementProgress ?? d.unAchievementsEarned ?? NaN);
    const total = Number(d.nAchievementTotal ?? d.unAchievementsTotal ?? NaN);
    if (Number.isFinite(earned) && Number.isFinite(total) && total > 0) {
      return Math.max(0, Math.min(1, earned / total));
    }
  } catch {}
  return NaN;
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
      finish({ categories: extractCategories(details), achievementProgress: extractAchievementProgress(details) });
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
