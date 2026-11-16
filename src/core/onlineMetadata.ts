// Fills metacritic, review % and release date online for games whose local overview lacks them.
import { getCurrentSettings } from "../store/settingsStore";
import { STEAM_STORE_BASE } from "../constants";
import { logInfo } from "../runtime/logger";
import { decodeHtmlEntities } from "../domain/sourceUtils";

const META_KEY = "ds-metadata-cache-v1";
const NAME_KEY = "ds-name-appid-v1";
const META_TTL = 14 * 24 * 60 * 60 * 1000;
const NAME_TTL = 30 * 24 * 60 * 60 * 1000;
const MAX_ENRICH_PER_PASS = 40;

export interface GameMetadata {
  metacritic?: number;
  reviewPct?: number;
  releaseTs?: number;
  // Fills `available_on_current_platform` on hosts whose client doesn't expose it (macOS).
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
  // Description fallback where `appStore.GetDescriptions` is missing (macOS).
  shortDescription?: string;
}
type Entry<T> = { ts: number; v: T };

export function currentPlatformKey(): "windows" | "mac" | "linux" {
  try {
    const p = (globalThis as any).navigator?.platform ?? "";
    if (/mac/i.test(p)) return "mac";
    if (/win/i.test(p)) return "windows";
  } catch { /* fall through */ }
  return "linux";
}

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

function parseMetacritic(d: any): number | undefined {
  return typeof d.metacritic?.score === "number" ? d.metacritic.score : undefined;
}
function parseReleaseTs(d: any): number | undefined {
  const t = d.release_date?.date ? Date.parse(d.release_date.date) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}
function parsePlatforms(d: any): GameMetadata["platforms"] {
  if (!d.platforms || typeof d.platforms !== "object") return undefined;
  return { windows: !!d.platforms.windows, mac: !!d.platforms.mac, linux: !!d.platforms.linux };
}
function parseShortDescription(d: any): string | undefined {
  return typeof d.short_description === "string" && d.short_description ? d.short_description : undefined;
}

async function fetchAppDetails(appid: number): Promise<Pick<GameMetadata, "metacritic" | "releaseTs" | "platforms" | "shortDescription">> {
  try {
    const r = await withTimeout(`${STEAM_STORE_BASE}/api/appdetails?appids=${appid}&filters=metacritic,release_date,platforms,basic&l=en&cc=us`);
    const j = await r.json();
    const d = j?.[String(appid)]?.data;
    if (!d) return {};
    return {
      metacritic: parseMetacritic(d),
      releaseTs: parseReleaseTs(d),
      platforms: parsePlatforms(d),
      shortDescription: parseShortDescription(d),
    };
  } catch { return {}; }
}

async function fetchReviewPct(appid: number): Promise<number | undefined> {
  try {
    const r = await withTimeout(`${STEAM_STORE_BASE}/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`);
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
    const r = await withTimeout(`${STEAM_STORE_BASE}/api/storesearch/?term=${encodeURIComponent(name)}&cc=us&l=en`);
    resolved = firstStoreAppId((await r.json())?.items);
  } catch { /* leave 0 */ }
  cacheSet(NAME_KEY, key, resolved);              // misses are cached too
  return resolved || undefined;
}

// Misses are cached as {} so they aren't fetched again.
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

function onlineMetadataOn(): boolean {
  try {
    const s = getCurrentSettings() as any;
    return !!(s && s.advancedModeEnabled && s.onlineFeaturesEnabled && s.onlineMetadataEnabled);
  } catch { return false; }
}

// Writes the fields onto the overviews so sort and filter can read them.
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

// A data-availability fill, so only the master online toggle gates it.
export function onlineStoreFallbackOn(): boolean {
  try {
    const s = getCurrentSettings() as any;
    return !!(s && s.onlineFeaturesEnabled);
  } catch { return false; }
}

// Must match the id used by `getGameMetadata`.
function metaCacheId(a: any): string {
  return a.is_non_steam
    ? `name:${String(a.display_name ?? a.sort_as ?? "").trim().toLowerCase()}`
    : `app:${Number(a.appid)}`;
}

// Never written to Steam's `available_on_current_platform`: the same object gates
// Steam's own store pages, and `false` there blacks them out.
const DS_PLATFORM_AVAIL = "__ds_available_on_platform";

export async function enrichPlatformAvailability(apps: any[]): Promise<number> {
  if (!onlineStoreFallbackOn()) return 0;
  const key = currentPlatformKey();
  const undefinedApps = apps.filter(
    (a) => a && a.available_on_current_platform === undefined && a[DS_PLATFORM_AVAIL] === undefined,
  );
  if (!undefinedApps.length) return 0;
  let n = 0;
  // Read the persistent map once (parsing is costly); a cached miss counts as tried.
  const cache = readMap<GameMetadata>(META_KEY);
  const now = Date.now();
  const uncached: any[] = [];
  for (const a of undefinedApps) {
    const e = cache[metaCacheId(a)];
    const cached = e && now - e.ts < META_TTL ? e.v : undefined;
    if (cached === undefined) { uncached.push(a); continue; }
    if (cached.platforms) { a[DS_PLATFORM_AVAIL] = !!cached.platforms[key]; n++; }
  }
  const targets = uncached.slice(0, MAX_ENRICH_PER_PASS);
  await Promise.all(targets.map(async (a) => {
    const meta = await getGameMetadata(Number(a.appid), String(a.display_name ?? a.sort_as ?? ""), !!a.is_non_steam);
    if (meta?.platforms) { a[DS_PLATFORM_AVAIL] = !!meta.platforms[key]; n++; }
  }));
  if (n) logInfo("STEAM", `platform availability: ${n} apps (${key}); fetched ${targets.length}, ${uncached.length - targets.length} pending`);
  return n;
}

export async function getStoreShortDescription(appid: number, name: string, isNonSteam: boolean): Promise<string | undefined> {
  if (!onlineStoreFallbackOn()) return undefined;
  const meta = await getGameMetadata(appid, name, isNonSteam);
  // The store sends it HTML-encoded ("&amp;", "&quot;"); Steam's own descriptions are plain.
  return meta?.shortDescription ? decodeHtmlEntities(meta.shortDescription) : undefined;
}
