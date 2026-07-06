/* Online metadata enrichment — metacritic, review %, and release date for games
   whose local Steam overview lacks them (uninstalled Steam + non-Steam Unifideck
   shortcuts). Gated by `onlineMetadataEnabled`; fetched only when missing
   locally; persist-cached. Non-Steam is matched to a Steam appid by name search,
   bounded per pass so a shelf never fans out network calls across the library. */
import { getCurrentSettings } from "../store/settingsStore";
import { logInfo } from "../runtime/logger";

const META_KEY = "ds-metadata-cache-v1";
const NAME_KEY = "ds-name-appid-v1";
const META_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days
const NAME_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ENRICH_PER_PASS = 40;            // never fan out the whole library

export interface GameMetadata { metacritic?: number; reviewPct?: number; releaseTs?: number }
type Entry<T> = { ts: number; v: T };

function readMap<T>(key: string): Record<string, Entry<T>> {
  try { return JSON.parse(localStorage.getItem(key) || "{}") as Record<string, Entry<T>>; }
  catch { return {}; }
}
function cacheGet<T>(key: string, id: string, ttl: number): T | undefined {
  const e = readMap<T>(key)[id];
  return e && Date.now() - e.ts < ttl ? e.v : undefined;
}
function cacheSet<T>(key: string, id: string, v: T): void {
  try {
    const m = readMap<T>(key);
    m[id] = { ts: Date.now(), v };
    localStorage.setItem(key, JSON.stringify(m));
  } catch { /* quota / private mode — best effort */ }
}

function withTimeout(url: string, ms = 6000): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { credentials: "include", signal: ac.signal }).finally(() => clearTimeout(t));
}

async function fetchAppDetails(appid: number): Promise<{ metacritic?: number; releaseTs?: number }> {
  try {
    const r = await withTimeout(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=metacritic,release_date&l=en&cc=us`);
    const j = await r.json();
    const d = j?.[String(appid)]?.data;
    if (!d) return {};
    const metacritic = typeof d.metacritic?.score === "number" ? d.metacritic.score : undefined;
    let releaseTs: number | undefined;
    const t = d.release_date?.date ? Date.parse(d.release_date.date) : NaN;
    if (Number.isFinite(t)) releaseTs = Math.floor(t / 1000);
    return { metacritic, releaseTs };
  } catch { return {}; }
}

async function fetchReviewPct(appid: number): Promise<number | undefined> {
  try {
    const r = await withTimeout(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`);
    const s = (await r.json())?.query_summary;
    const total = Number(s?.total_reviews ?? 0);
    const pos = Number(s?.total_positive ?? 0);
    return total > 0 ? Math.round((pos / total) * 100) : undefined;
  } catch { return undefined; }
}

function firstStoreAppId(items: unknown): number {
  const id = Number(Array.isArray(items) ? (items[0] as any)?.id : 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

async function resolveNameToAppId(name: string): Promise<number | undefined> {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  const cached = cacheGet<number>(NAME_KEY, key, NAME_TTL);
  if (cached !== undefined) return cached || undefined;
  let resolved = 0;
  try {
    const r = await withTimeout(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=us&l=en`);
    resolved = firstStoreAppId((await r.json())?.items);
  } catch { /* leave 0 */ }
  cacheSet(NAME_KEY, key, resolved);              // cache misses too (0) to avoid re-hammering
  return resolved || undefined;
}

/** Cached metacritic / review% / release for one title. Non-Steam is matched to
 *  a Steam appid by name; misses are cached (as {}) so they aren't re-fetched. */
export async function getGameMetadata(appid: number, name: string, isNonSteam: boolean): Promise<GameMetadata> {
  const cacheId = isNonSteam ? `name:${name.trim().toLowerCase()}` : `app:${appid}`;
  const cached = cacheGet<GameMetadata>(META_KEY, cacheId, META_TTL);
  if (cached) return cached;
  const storeId = isNonSteam ? await resolveNameToAppId(name) : appid;
  if (!storeId) { cacheSet(META_KEY, cacheId, {}); return {}; }
  const [details, reviewPct] = await Promise.all([fetchAppDetails(storeId), fetchReviewPct(storeId)]);
  const entry: GameMetadata = { ...details, reviewPct };
  cacheSet(META_KEY, cacheId, entry);
  return entry;
}

function needsMeta(a: any): boolean {
  return a.metacritic_score == null || a.review_percentage == null || a.rt_original_release_date == null;
}

/** On only when both the master online toggle and the metadata sub-toggle are on. */
export function onlineMetadataOn(): boolean {
  try {
    const s = getCurrentSettings() as any;
    return !!(s && s.onlineFeaturesEnabled && s.onlineMetadataEnabled);
  } catch { return false; }
}

/** Enrich (in place) apps that lack score/review/release, bounded per pass and
 *  gated by the sub-toggle. Writes the fields onto the overviews so the shelf's
 *  sort/filter reads them. No-op (fast) when nothing is missing or the toggle
 *  is off. Returns the number of apps enriched. */
export async function enrichApps(apps: any[]): Promise<number> {
  if (!onlineMetadataOn()) return 0;
  const targets = apps.filter(needsMeta).slice(0, MAX_ENRICH_PER_PASS);
  if (!targets.length) return 0;
  let n = 0;
  await Promise.all(targets.map(async (a) => {
    const meta = await getGameMetadata(Number(a.appid), String(a.display_name ?? a.sort_as ?? ""), !!a.is_non_steam);
    if (!meta) return;
    if (a.metacritic_score == null && meta.metacritic != null) { a.metacritic_score = meta.metacritic; n++; }
    if (a.review_percentage == null && meta.reviewPct != null) a.review_percentage = meta.reviewPct;
    if (a.rt_original_release_date == null && meta.releaseTs != null) a.rt_original_release_date = meta.releaseTs;
  }));
  if (n) logInfo("STEAM", `onlineMetadata enriched ${n}/${targets.length} apps`);
  return n;
}
