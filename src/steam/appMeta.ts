import { type AppOverview, appIdOf, normalizeAppOverview, pcdEntryInstalled } from "./appOverview";
import type { PlatformAppMeta } from "../runtime/platform";
import { type SteamAppOverviewRaw, type SteamClientLike, type SteamHostWindow, type SteamPerClientData, steamAppStore } from "./internals";
import { UPDATE_PENDING_STATUSES } from "./appDisplayStatus";
import { getAppDescriptions as _getAppDescriptions } from "./appDescriptionsCache";
import { getSteamClient, getSteamWindows } from "./steamAccess";
import { mark, measure } from "../core/perf";
import { getAllAppOverviews } from "./library";

function checkUpdatePendingFromPcd(raw: SteamAppOverviewRaw | null | undefined): boolean {
  try {
    const pcd = (raw as any).per_client_data;
    if (!pcd) return false;
    const clientData = Array.isArray(pcd) ? pcd[0] : pcd;
    if (!clientData) return false;
    const c = clientData as any;
    const ds = Number(c.display_status || 0);
    if (UPDATE_PENDING_STATUSES.includes(ds)) return true;
    const bytesDown = Number(c.bytes_to_download || c.m_nBytesToDownload || 0);
    return bytesDown > 0;
  } catch { return false; }
}

const UPDATE_FLAG_KEYS = [
  "m_bUpdateRunning", "update_running",
  "m_bUpdateAvailable", "update_available",
  "m_bNeedsUpdate", "needs_update",
  "m_bUpdatePaused",
];

const UPDATE_BYTE_KEYS = ["m_nBytesToDownload", "m_nBytesToStage"];

function checkUpdatePendingFromFlags(raw: SteamAppOverviewRaw | null | undefined): boolean {
  try {
    for (const key of UPDATE_FLAG_KEYS) if ((raw as any)[key] === true) return true;
    for (const key of UPDATE_BYTE_KEYS) if (Number((raw as any)[key] || 0) > 0) return true;
  } catch {}
  return false;
}

const UPDATE_FLAG_METHODS = ["BIsUpdateRunning", "BIsUpdateAvailable", "BNeedsUpdate", "BHasUpdate"];

function checkUpdatePendingFromMethods(raw: SteamAppOverviewRaw | null | undefined): boolean {
  for (const name of UPDATE_FLAG_METHODS) {
    try {
      const fn = (raw as any)[name];
      if (typeof fn === "function" && fn.call(raw)) return true;
    } catch {}
  }
  return false;
}

function checkUpdatePendingFromProto(raw: SteamAppOverviewRaw | null | undefined): boolean {
  try {
    let proto = Object.getPrototypeOf(raw);
    while (proto && proto !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (/^(m_bUpdate|m_bNeedsUpdate|update_pending)/i.test(key) && (raw as any)[key] === true) {
          return true;
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
  } catch {}
  return false;
}

function checkUpdatePendingRaw(raw: SteamAppOverviewRaw | null | undefined): boolean {
  if (!raw) return false;
  return checkUpdatePendingFromPcd(raw)
    || checkUpdatePendingFromFlags(raw)
    || checkUpdatePendingFromMethods(raw)
    || checkUpdatePendingFromProto(raw);
}

let _pendingUpdateAppIds: Set<number> | null = null;

let _pendingUpdateTs = 0;

function callQueueGetter(getter: any): any[] {
  if (typeof getter !== "function") return [];
  try {
    const v = getter();
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function collectQueueAppIds(queue: any[], out: Set<number>): void {
  for (const item of queue) {
    const id = Number(item?.appid ?? item?.nAppID ?? 0);
    if (id > 0) out.add(id);
  }
}

function harvestPendingFromClient(sc: SteamClientLike, out: Set<number>): void {
  try {
    collectQueueAppIds(callQueueGetter(sc?.Downloads?.GetDownloadItems?.bind(sc.Downloads)), out);
    const updates = sc?.Updates;
    const updateQueue = callQueueGetter(updates?.GetUpdateQueue?.bind(updates))
      .concat(callQueueGetter(updates?.GetQueue?.bind(updates)));
    collectQueueAppIds(updateQueue, out);
  } catch {}
}

async function refreshPendingUpdateAppIds(): Promise<Set<number>> {
  const now = Date.now();
  if (_pendingUpdateAppIds && (now - _pendingUpdateTs < 5000)) return _pendingUpdateAppIds;
  const ids = new Set<number>();
  harvestPendingFromClient(getSteamClient(), ids);
  _pendingUpdateAppIds = ids;
  _pendingUpdateTs = now;
  return ids;
}

const META_ADDED_KEYS = ["rt_purchased_time", "rt_recent_activity_time", "user_added_ts", "rt_store_asset_mtime"];

const META_PLAYTIME_KEYS = ["playtime_forever", "minutes_playtime_forever", "minutes_played_forever"];

function firstFiniteFromOverview(o: SteamAppOverviewRaw | null | undefined, keys: string[]): number | undefined {
  if (!o) return undefined;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
}

function pickPlaytimeMinutes(o: SteamAppOverviewRaw | null | undefined): number | undefined {
  if (!o) return undefined;
  for (const k of META_PLAYTIME_KEYS) {
    const v = Number(o[k]);
    if (v) return v;
  }
  return undefined;
}

function computeAssetUrls(appid: number, overview: any, isSteam: boolean) {
  if (!isSteam) return { heroUrl: undefined, portraitUrl: undefined };
  const capsuleFile = overview?.library_capsule_filename || "library_600x900.jpg";
  const mtime = overview?.rt_store_asset_mtime;
  const cacheBust = mtime ? `?c=${mtime}` : "";
  return {
    portraitUrl: `/assets/${appid}/${capsuleFile}${cacheBust}`,
    heroUrl: `/assets/${appid}/library_hero.jpg${cacheBust}`,
  };
}

function resolveUpdatePending(appid: number, overview: SteamAppOverviewRaw | null | undefined, raw: SteamAppOverviewRaw | null | undefined): boolean {
  if (overview?.update_pending === true) return true;
  if (checkUpdatePendingRaw(raw)) return true;
  return _pendingUpdateAppIds?.has(appid) === true;
}

type EnrichmentExtras = {
  description?: string;
  fullDescription?: string;
};

function readAppDetailsEnrichment(appid: number): EnrichmentExtras {
  // Cache only: Steam's description getters fetch lazily and froze the boot when called per card.
  const cached = _getAppDescriptions(appid);
  if (!cached) return {};
  return {
    description: pickString(cached.snippet),
    fullDescription: pickString(cached.fullHtml),
  };
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function readOverviewExtras(overview?: AppOverview): { releaseTimestamp?: number; metacriticScore?: number } {
  const ov = overview as any;
  const release = ov?.rt_original_release_date ?? ov?.rt_steam_release_date;
  const score = ov?.metacritic_score;
  return {
    releaseTimestamp: typeof release === "number" && Number.isFinite(release) && release > 0 ? release : undefined,
    metacriticScore: typeof score === "number" && Number.isFinite(score) ? score : undefined,
  };
}

function deriveLocalInstalled(raw: SteamAppOverviewRaw | null | undefined): boolean | undefined {
  const pcd: SteamPerClientData[] = Array.isArray(raw?.per_client_data) ? raw.per_client_data : [];
  if (pcd.length === 0) return undefined;
  const local = pcd.find((c: SteamPerClientData) => String(c?.clientid) === "0");
  return local ? pcdEntryInstalled(local) : false;
}

function buildMetaFromOverview(appid: number, overview?: AppOverview, raw?: SteamAppOverviewRaw | null): PlatformAppMeta {
  const isSteam = overview?.is_steam !== false;
  const { heroUrl, portraitUrl } = computeAssetUrls(appid, overview, isSteam);
  const { description, fullDescription } = readAppDetailsEnrichment(appid);
  const { releaseTimestamp, metacriticScore } = readOverviewExtras(overview);
  const localInstalled = deriveLocalInstalled(raw);
  return {
    appid,
    name: String(overview?.display_name ?? `App ${appid}`),
    heroUrl,
    portraitUrl,
    // Steam can set `installed` from another client's Remote Play copy alone.
    installed: localInstalled !== undefined ? localInstalled : overview?.installed,
    isSteam,
    deckCompatCategory: overview?.deck_compatibility_category,
    machineCompatCategory: overview?.machine_compatibility_category,
    frameCompatCategory: overview?.frame_compatibility_category,
    controllerSupport: overview?.controller_support,
    playtimeMinutes: pickPlaytimeMinutes(overview),
    updatePending: resolveUpdatePending(appid, overview, raw),
    addedTimestamp: firstFiniteFromOverview(overview, META_ADDED_KEYS),
    description,
    fullDescription,
    releaseTimestamp,
    metacriticScore,
  };
}

async function fetchAppOverviewFromSteamClient(appid: number): Promise<any> {
  try {
    const sc = getSteamClient();
    return await sc?.Apps?.GetAppOverview?.(appid);
  } catch { return undefined; }
}

const WINDOW_OVERVIEW_ACCESSORS: Array<(w: SteamHostWindow, id: number) => any> = [
  (w, id) => w?.appStore?.GetAppOverviewByAppID?.(id),
  (w, id) => w?.AppStore?.GetAppOverviewByAppID?.(id),
  (w, id) => w?.appStore?.m_mapAppInfo?.get?.(id),
  (w, id) => w?.LibraryStore?.m_mapAppInfo?.get?.(id),
];

function fetchAppOverviewFromWindow(hostWindow: SteamHostWindow, appid: number): any {
  for (const get of WINDOW_OVERVIEW_ACCESSORS) {
    try {
      const ov = get(hostWindow, appid);
      if (ov) return ov;
    } catch {}
  }
  return undefined;
}

function metaFromOverview(appid: number, ov: any): PlatformAppMeta {
  return buildMetaFromOverview(appid, normalizeAppOverview(ov) ?? ov as AppOverview, ov);
}

async function getAppMetaFromAllOverviews(appid: number): Promise<PlatformAppMeta | undefined> {
  try {
    const all = await getAllAppOverviews();
    const found = all.find((a) => Number(a.appid) === appid);
    if (!found) return undefined;
    let raw: SteamAppOverviewRaw | null | undefined;
    try { raw = steamAppStore()?.GetAppOverviewByAppID?.(appid); } catch {}
    return buildMetaFromOverview(appid, found, raw);
  } catch { return undefined; }
}

function fallbackAppMeta(appid: number): PlatformAppMeta {
  return { appid, name: `App ${appid}`, heroUrl: `/assets/${appid}/library_hero.jpg`, portraitUrl: `/assets/${appid}/library_600x900.jpg`, isSteam: true };
}

export async function getAppMeta(appid: number): Promise<PlatformAppMeta> {
  refreshPendingUpdateAppIds().catch(() => {});
  try { mark?.(`getAppMeta:${appid}:start`); } catch {}
  const finish = () => { try { measure?.(`getAppMeta:${appid}`, `getAppMeta:${appid}:start`); } catch {} };

  const direct = await fetchAppOverviewFromSteamClient(appid);
  if (direct) { finish(); return metaFromOverview(appid, direct); }

  for (const hostWindow of getSteamWindows()) {
    const ov = fetchAppOverviewFromWindow(hostWindow, appid);
    if (ov) { finish(); return metaFromOverview(appid, ov); }
  }

  const fromAll = await getAppMetaFromAllOverviews(appid);
  if (fromAll) { finish(); return fromAll; }

  finish();
  return fallbackAppMeta(appid);
}

export async function getAppName(appid: number): Promise<string> {
  const meta = await getAppMeta(appid);
  return meta.name;
}

// Shared across shelves so the catalog is walked once per catalog change.
let _byIdCache: { catalog: AppOverview[]; map: Map<number, AppOverview> } | null = null;

function getByIdMap(catalog: AppOverview[]): Map<number, AppOverview> {
  if (_byIdCache && _byIdCache.catalog === catalog) return _byIdCache.map;
  const map = new Map<number, AppOverview>();
  for (const a of catalog) {
    const id = appIdOf(a);
    if (Number.isFinite(id) && id > 0) map.set(id, a);
  }
  _byIdCache = { catalog, map };
  return map;
}

export async function getAppMetaBatch(appids: number[]): Promise<Map<number, PlatformAppMeta>> {
  const out = new Map<number, PlatformAppMeta>();
  if (!appids.length) return out;
  refreshPendingUpdateAppIds().catch(() => {});
  let catalog: AppOverview[] = [];
  try { catalog = await getAllAppOverviews(); } catch {}
  const byId = getByIdMap(catalog);
  const missing: number[] = [];
  for (const appid of appids) {
    const ov = byId.get(appid);
    if (ov) {
      let raw: SteamAppOverviewRaw | null | undefined;
      try { raw = steamAppStore()?.GetAppOverviewByAppID?.(appid); } catch {}
      out.set(appid, buildMetaFromOverview(appid, ov, raw));
    } else {
      missing.push(appid);
    }
  }
  if (missing.length) {
    const fallbacks = await Promise.all(
      missing.map(async (id) => [id, await getAppMeta(id)] as const),
    );
    for (const [id, meta] of fallbacks) out.set(id, meta);
  }
  return out;
}
