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

export interface GameMetadata {
  metacritic?: number;
  reviewPct?: number;
  releaseTs?: number;
  /* Store `platforms` ({ windows, mac, linux }) — used to fill
     `available_on_current_platform` on hosts whose local Steam client doesn't
     expose it (e.g. macOS), so the system-compatibility filter works there. */
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
  /* Store `short_description` — the online fallback for the card/hero description
     on hosts where `appStore.GetDescriptions` is absent (e.g. macOS). */
  shortDescription?: string;
}
type Entry<T> = { ts: number; v: T };

/** The current Steam platform key, to index a store `platforms` object. */
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
    const r = await withTimeout(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=metacritic,release_date,platforms,basic&l=en&cc=us`);
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

/** On only in Advanced mode with both the master online toggle and the metadata
 *  sub-toggle enabled — the whole feature is Advanced-only. */
export function onlineMetadataOn(): boolean {
  try {
    const s = getCurrentSettings() as any;
    return !!(s && s.advancedModeEnabled && s.onlineFeaturesEnabled && s.onlineMetadataEnabled);
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

/** On when the master online toggle is enabled. The store fallback for compat +
 *  descriptions is a data-availability fill (for hosts like macOS whose local
 *  Steam client omits those fields), not an "advanced" metadata feature — so it
 *  gates on the master online toggle only, independent of `onlineMetadataEnabled`. */
export function onlineStoreFallbackOn(): boolean {
  try {
    const s = getCurrentSettings() as any;
    return !!(s && s.onlineFeaturesEnabled);
  } catch { return false; }
}

/** The metadata cache id for an app — must match `getGameMetadata`. */
function metaCacheId(a: any): string {
  return a.is_non_steam
    ? `name:${String(a.display_name ?? a.sort_as ?? "").trim().toLowerCase()}`
    : `app:${Number(a.appid)}`;
}

/* Our own platform-availability field. We must NOT write the store result onto
   Steam's `available_on_current_platform` — that overview is the SAME object
   Steam's store/app pages read to gate "available on this platform", so writing
   `false` there blacks those pages out. The system-compatibility filter reads
   this private field first (see steam/index.ts). */
export const DS_PLATFORM_AVAIL = "__ds_available_on_platform";

/** Fill our private `__ds_available_on_platform` from the store `platforms` for
 *  apps whose local client left `available_on_current_platform` undefined (macOS,
 *  where it's never `false`, so the filter would otherwise pass every game).
 *  Applies the persistent cache to every undefined app (no network), then fetches
 *  only never-fetched ones (bounded). Never touches Steam's own field. */
export async function enrichPlatformAvailability(apps: any[]): Promise<number> {
  if (!onlineStoreFallbackOn()) return 0;
  const key = currentPlatformKey();
  const undefinedApps = apps.filter(
    (a) => a && a.available_on_current_platform === undefined && a[DS_PLATFORM_AVAIL] === undefined,
  );
  if (!undefinedApps.length) return 0;
  let n = 0;
  // Apply already-cached platform data to ALL undefined apps first — no network.
  // Read the persistent map ONCE (localStorage parse is costly) and look up
  // in-memory; a cached miss (`{}`) counts as tried, never re-fetched.
  const cache = readMap<GameMetadata>(META_KEY);
  const now = Date.now();
  const uncached: any[] = [];
  for (const a of undefinedApps) {
    const e = cache[metaCacheId(a)];
    const cached = e && now - e.ts < META_TTL ? e.v : undefined;
    if (cached === undefined) { uncached.push(a); continue; }
    if (cached.platforms) { a[DS_PLATFORM_AVAIL] = !!cached.platforms[key]; n++; }
  }
  // Fetch the never-fetched ones, bounded so a resolve never fans out the library.
  const targets = uncached.slice(0, MAX_ENRICH_PER_PASS);
  await Promise.all(targets.map(async (a) => {
    const meta = await getGameMetadata(Number(a.appid), String(a.display_name ?? a.sort_as ?? ""), !!a.is_non_steam);
    if (meta?.platforms) { a[DS_PLATFORM_AVAIL] = !!meta.platforms[key]; n++; }
  }));
  if (n) logInfo("STEAM", `platform availability: ${n} apps (${key}); fetched ${targets.length}, ${uncached.length - targets.length} pending`);
  return n;
}

/** The store `short_description` for one app (cached), or undefined — the online
 *  fallback for the card/hero description where `appStore.GetDescriptions` is
 *  absent (macOS). Gated by the master online toggle. */
export async function getStoreShortDescription(appid: number, name: string, isNonSteam: boolean): Promise<string | undefined> {
  if (!onlineStoreFallbackOn()) return undefined;
  const meta = await getGameMetadata(appid, name, isNonSteam);
  return meta?.shortDescription;
}
