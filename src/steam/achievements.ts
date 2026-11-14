import { type AppOverview, lastPlayedOf } from "./appOverview";
import { steamClient } from "./internals";

/* Achievement counts per app, from the client's own achievement list. Loaded before a
   query that reads them, kept in local storage, and read again only for a game played
   since its counts were taken. */

export type AchievementCounts = { achieved: number; total: number };
type Entry = AchievementCounts & { at: number };

const STORAGE_KEY = "ds-achievements-v1";
const PARALLEL = 8;

function stored(): [number, Entry][] {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "null");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

const cache = new Map<number, Entry>(stored());

function store(): void {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...cache])); } catch {}
}

function countsOf(result: unknown): AchievementCounts {
  const list = (result as { data?: { rgAchievements?: Array<{ bAchieved?: boolean }> } } | null)?.data?.rgAchievements;
  if (!Array.isArray(list)) return { achieved: 0, total: 0 };
  return { achieved: list.filter((a) => a?.bAchieved === true).length, total: list.length };
}

async function fetchOne(appid: number): Promise<void> {
  let counts: AchievementCounts = { achieved: 0, total: 0 };
  try { counts = countsOf(await steamClient()?.Apps?.GetMyAchievementsForApp?.(String(appid))); } catch {}
  cache.set(appid, { ...counts, at: Date.now() });
}

// Only a played Steam game can have progress; one played since its counts were taken is read again.
function needsLoad(app: AppOverview): boolean {
  const steamGame = !app.is_non_steam && (app.app_type === undefined || app.app_type === 1);
  if (!steamGame || Number(app.playtime_forever ?? 0) <= 0) return false;
  const entry = cache.get(app.appid);
  return !entry || lastPlayedOf(app) * 1000 > entry.at;
}

/** Loads the counts the given apps lack, a few at a time, and keeps them. */
export async function loadAchievements(apps: AppOverview[]): Promise<void> {
  const todo = [...new Set(apps.filter(needsLoad).map((a) => a.appid))];
  for (let i = 0; i < todo.length; i += PARALLEL) await Promise.all(todo.slice(i, i + PARALLEL).map(fetchOne));
  if (todo.length) store();
}

export function achievementsOf(appid: number): AchievementCounts | undefined {
  const entry = cache.get(appid);
  return entry ? { achieved: entry.achieved, total: entry.total } : undefined;
}

/** 0..100 for an app with achievements; undefined without any, or before the load. */
export function achievementPercent(appid: number): number | undefined {
  const entry = cache.get(appid);
  return entry && entry.total > 0 ? (entry.achieved / entry.total) * 100 : undefined;
}
