import { EAppDisplayStatus, UPDATE_PENDING_STATUSES } from "./appDisplayStatus";
import { type SteamAppOverviewRaw, type SteamCollectionLike, type SteamCollectionStore, type SteamPerClientData } from "./internals";

/* The plugin's view of a library entry: the `AppOverview` shape, its normalization from Steam's raw overview, and the small field readers every resolver shares. */

export function uniqApps(list: AppOverview[]): AppOverview[] {
  const map = new Map<number, AppOverview>();
  for (const item of list) {
    const appid = Number(item?.appid ?? 0);
    if (!Number.isFinite(appid) || appid <= 0) continue;
    if (!map.has(appid)) map.set(appid, item);
  }
  return [...map.values()];
}

export function appIdOf(a: SteamAppOverviewRaw): number {
  return Number(a?.appid ?? a?.appId ?? a?.m_unAppID ?? a?.nAppID ?? 0);
}

export function readOptionalBoolean(node: Record<string, any> | null | undefined, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const val = (node as any)?.[key];
    if (val !== undefined) return Boolean(val);
  }
  return undefined;
}

export function appNameOf(a: SteamAppOverviewRaw): string {
  return String(a?.display_name ?? a?.name ?? a?.strDisplayName ?? a?.m_strName ?? "");
}

export function isNonSteamOf(a: SteamAppOverviewRaw): boolean {
  return !!(a?.is_non_steam) || a?.is_steam === false || a?.m_eAppType === 1073741824 || a?.app_type === 1073741824 || a?.app_type === "shortcut";
}

// Collection entries can be overview objects or bare ids (number or string).
export function pushAppIdsFromCollection(c: SteamCollectionLike, out: Set<number>): void {
  const apps = c?.allApps ?? c?.m_rgApps ?? [];
  for (const a of apps) {
    const n = Number(a !== null && typeof a === "object" ? a.appid : a);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
}

export function readCollectionList(cs: SteamCollectionStore | null | undefined): any[] {
  const cols = cs?.m_mapCollectionsFromStorage ?? cs?.collectionsFromStorage;
  if (Array.isArray(cols)) return cols;
  return Array.from(cols?.values?.() ?? []);
}

export function isFavoriteOf(a: SteamAppOverviewRaw): boolean {
  return !!(a?.is_favorite ?? a?.favorite ?? a?.m_bIsFavorite ?? a?.m_bFavorite ?? a?.bFavorite);
}

export function isHiddenOf(a: SteamAppOverviewRaw): boolean {
  // SteamOS 3.x marks hidden via `visible_in_game_list === false`; older
  // bool fields aren't populated there.
  if (a?.visible_in_game_list === false) return true;
  return !!(a?.is_hidden ?? a?.hidden ?? a?.m_bHidden ?? a?.bHidden);
}

function hasRawInstallSignals(a: any): boolean {
  return a?.size_on_disk !== undefined || a?.rt_last_time_locally_played !== undefined;
}

function rawInstallSignals(a: any): boolean {
  const sod = Number(a?.size_on_disk ?? 0);
  if (Number.isFinite(sod) && sod > 0) return true;
  const lp = Number(a?.rt_last_time_locally_played ?? 0);
  return Number.isFinite(lp) && lp > 0;
}

// Steam's own flag on the local client entry; tools like Unifideck write the real state there.
function localClientInstalled(a: any): boolean | undefined {
  const pcd = a?.per_client_data;
  const local = Array.isArray(pcd) ? pcd.find((c: any) => String(c?.clientid) === "0") : undefined;
  return typeof local?.installed === "boolean" ? local.installed : undefined;
}

function isNonSteamInstalled(a: any): boolean {
  const local = localClientInstalled(a);
  if (local !== undefined) return local;
  // No explicit flag: the raw overview's signals, or what normalization derived from them.
  if (hasRawInstallSignals(a)) return rawInstallSignals(a);
  return a?.installed === true;
}

export function isInstalledOf(a: any): boolean {
  if (isNonSteamOf(a)) return isNonSteamInstalled(a);
  return !!(a?.installed ?? a?.is_installed ?? a?.m_bInstalled ?? a?.bInstalled);
}

export function lastPlayedOf(a: any): number {
  return Number(a?.last_played ?? a?.rt_last_time_played ?? a?.m_ulLastPlayed ?? 0);
}

export type AppOverview = {
  appid: number;
  display_name?: string;
  sort_as?: string;
  last_played?: number;
  playtime_forever?: number;
  playtime_last_two_weeks?: number;
  is_steam?: boolean;
  is_non_steam?: boolean;
  is_favorite?: boolean;
  is_hidden?: boolean;
  installed?: boolean;
  deck_compatibility_category?: number;
  steamos_compatibility_category?: number;
  machine_compatibility_category?: number;
  frame_compatibility_category?: number;
  library_capsule?: string;
  library_capsule_filename?: string;
  rt_store_asset_mtime?: number;
  user_added_ts?: number;
  rt_purchased_time?: number;
  rt_recent_activity_time?: number;
  library_hero?: string;
  header?: string;
  icon_hash?: string;
  update_pending?: boolean;
  display_status?: number;
  app_type?: number;
  cloud_available?: boolean;
  controller_support?: number;
  // Steam fields the sort comparators read straight off the overview.
  rt_original_release_date?: number;
  size_on_disk?: number | string;
  metacritic_score?: number;
  review_percentage?: number;
  // Whether the app runs on the CURRENT platform (from the local client's
  // per_client_data). undefined when there's no client data (e.g. non-Steam).
  available_on_current_platform?: boolean;
  // Whether THIS client (clientid "0") has the app installed. Absent for
  // non-Steam (no per_client_data) — `installed` is authoritative there.
  installed_local?: boolean;
  // Whether the app is installed on any REMOTE client (Remote Play source).
  // undefined for non-Steam (no per_client_data); false when no remote install.
  installed_remote?: boolean;
};

function getPerClientData(node: SteamAppOverviewRaw): SteamPerClientData | null {
  const pcd = node?.per_client_data ?? node?.local_per_client_data;
  return Array.isArray(pcd) ? (pcd[0] ?? null) : (pcd ?? null);
}

function readPcdInstalledExplicit(node: SteamAppOverviewRaw): boolean | undefined {
  try {
    const clientData = getPerClientData(node);
    return clientData ? readOptionalBoolean(clientData, ["installed", "is_installed"]) : undefined;
  } catch { return undefined; }
}

function hasInstallSizeOnDisk(node: SteamAppOverviewRaw | SteamPerClientData | null | undefined): boolean {
  try {
    const size = Number(node?.size_on_disk ?? node?.installed_size ?? 0);
    return Number.isFinite(size) && size > 0;
  } catch { return false; }
}

function deriveInstalled(node: SteamAppOverviewRaw, appid: number): boolean | undefined {
  if (isNonSteamOf(node)) return isInstalledOf({ ...node, appid });
  const explicit = readOptionalBoolean(node, ["installed", "is_installed", "m_bInstalled", "bInstalled"]);
  if (explicit !== undefined) return explicit;
  const pcd = readPcdInstalledExplicit(node);
  if (pcd !== undefined) return pcd;
  return hasInstallSizeOnDisk(node) ? true : undefined;
}

const UPDATE_PENDING_FLAG_KEYS = [
  "update_running", "m_bUpdateRunning", "bUpdateRunning",
  "update_available", "m_bUpdateAvailable", "m_bNeedsUpdate",
  "needs_update", "m_bUpdatePaused",
];

function pcdHasDownloadBytes(clientData: SteamPerClientData): boolean {
  const bytesDown = Number(clientData?.bytes_to_download ?? clientData?.m_nBytesToDownload ?? 0);
  if (bytesDown > 0) return true;
  const bytesStage = Number(clientData?.bytes_to_stage ?? clientData?.m_nBytesToStage ?? 0);
  return bytesStage > 0;
}

function pcdUpdatePending(clientData: SteamPerClientData | null | undefined): boolean {
  if (!clientData) return false;
  if (UPDATE_PENDING_STATUSES.includes(Number(clientData?.display_status ?? 0))) return true;
  return pcdHasDownloadBytes(clientData);
}

function deriveUpdatePending(node: SteamAppOverviewRaw): boolean | undefined {
  if (pcdUpdatePending(getPerClientData(node))) return true;
  const explicit = readOptionalBoolean(node, UPDATE_PENDING_FLAG_KEYS);
  return explicit === true ? true : explicit;
}

function deriveDisplayStatus(node: SteamAppOverviewRaw): number | undefined {
  try {
    const clientData = getPerClientData(node);
    if (clientData) {
      const ds = Number(clientData?.display_status ?? 0);
      return ds > 0 ? ds : undefined;
    }
  } catch {}
  return undefined;
}

function deriveControllerSupport(node: SteamAppOverviewRaw): number | undefined {
  // `xbox_controller_support` is what current clients expose on desktop (macOS /
  // Windows / desktop Linux); the older fields cover other builds. 0/1/2 = none /
  // partial / full — the same scale the controller-support filter uses.
  const raw = node?.nControllerSupport ?? node?.controller_support
    ?? node?.n_controller_support ?? node?.xbox_controller_support;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Pick the first defined / non-zero value from a list of alias fields.
// Replaces the inline `?? ?? ?? ?? 0 || undefined` chains the field
// accessors below used to carry, keeping each accessor at complexity 1-2.
function firstNumber(...values: unknown[]): number {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 0;
}

function firstString(...values: unknown[]): string {
  for (const v of values) if (typeof v === "string" && v) return v;
  return "";
}

// Builders alias `node` to `n = node ?? {}` so field reads don't count
// as branches each — keeps each builder under the complexity cap.
function buildIdentityFields(node: SteamAppOverviewRaw, appid: number) {
  const n = node ?? {};
  const name = appNameOf(node);
  return {
    appid,
    display_name: name || String(n.displayName ?? n.title ?? `App ${appid}`),
    sort_as: String(n.sort_as ?? n.sortAs ?? name ?? ""),
  };
}

function buildPlaytimeFields(node: SteamAppOverviewRaw) {
  return {
    last_played: firstNumber(node?.last_played, node?.rt_last_time_played, node?.m_ulLastPlayed),
    playtime_forever: firstNumber(node?.playtime_forever, node?.minutes_playtime_forever, node?.minutes_played_forever),
    playtime_last_two_weeks: firstNumber(node?.playtime_last_two_weeks, node?.minutes_playtime_last_two_weeks),
  };
}

function buildFlagFields(node: SteamAppOverviewRaw) {
  const n = node ?? {};
  return {
    is_steam: n.is_steam ?? !isNonSteamOf(node),
    is_non_steam: isNonSteamOf(node),
    is_favorite: readOptionalBoolean(node, ["is_favorite", "favorite", "m_bIsFavorite", "m_bFavorite", "bFavorite"]),
    is_hidden: (n.visible_in_game_list === false) ? true : readOptionalBoolean(node, ["is_hidden", "hidden", "m_bHidden", "bHidden"]),
    cloud_available: readOptionalBoolean(node, ["bCloudAvailable", "cloud_available", "b_cloud_available"]),
  };
}

function buildAssetFields(node: SteamAppOverviewRaw) {
  const n = node ?? {};
  return {
    library_capsule: firstString(n.library_capsule, n.libraryCapsule, n.vertical_capsule),
    library_capsule_filename: firstString(n.library_capsule_filename, n.libraryCapsuleFilename),
    library_hero: firstString(n.library_hero, n.hero, n.libraryHero),
    header: firstString(n.header, n.header_image, n.capsule),
    icon_hash: firstString(n.icon_hash, n.iconHash),
  };
}

function buildTimestampFields(node: SteamAppOverviewRaw) {
  const n = node ?? {};
  return {
    rt_store_asset_mtime: firstNumber(n.rt_store_asset_mtime, n.rtStoreAssetMtime) || undefined,
    user_added_ts: firstNumber(n.time_added, n.m_time_added, n.added, n.rt_time_added_to_account, n.m_rtTimeAdded, n.timeAddedToAccount, n.time_added_to_account, n.m_time_added_to_account) || undefined,
    rt_purchased_time: firstNumber(n.rt_purchased_time, n.rtPurchasedTime) || undefined,
    rt_recent_activity_time: firstNumber(n.rt_recent_activity_time, n.rtRecentActivityTime) || undefined,
  };
}

/* Confirmed live: current clients expose `steam_deck_compat_category` /
   `steam_os_compat_category` directly, already unpacked (plus two more for
   Steam Machine/Frame). `steam_hw_compat_category_packed` packs four 2-bit
   fields — bits 0-1 deck, 2-3 unused, 4-5 os, 6-7 machine, 8-9 frame — the
   fallback below only matters for clients too old for the named getters. */
export function deckCompatCategory(n: SteamAppOverviewRaw): number {
  return Number(n.steam_deck_compat_category ?? n.deck_compatibility_category ?? n.m_eDeckCompatibilityCategory
    ?? ((Number(n.steam_hw_compat_category_packed ?? 0) & 0x3) || 0));
}

function steamosCompatCategory(n: SteamAppOverviewRaw): number {
  return Number(n.steam_os_compat_category ?? n.steamos_compatibility_category ?? n.m_eSteamOSCompatibilityCategory ??
    ((((Number(n.steam_hw_compat_category_packed ?? 0) >> 4) & 0x3)) || 0));
}

// Steam Machine / Steam Frame categories: named getters first, else the
// confirmed packed layout (machine = bits 6–7, frame = bits 8–9).
export function machineCompatCategory(n: SteamAppOverviewRaw): number {
  return Number(n.steam_machine_compat_category ?? n.machine_compatibility_category ??
    ((((Number(n.steam_hw_compat_category_packed ?? 0) >> 6) & 0x3)) || 0));
}

export function frameCompatCategory(n: SteamAppOverviewRaw): number {
  return Number(n.steam_frame_compat_category ?? n.frame_compatibility_category ??
    ((((Number(n.steam_hw_compat_category_packed ?? 0) >> 8) & 0x3)) || 0));
}

function buildTypeFields(node: SteamAppOverviewRaw) {
  const n = node ?? {};
  return {
    deck_compatibility_category: deckCompatCategory(n),
    steamos_compatibility_category: steamosCompatCategory(n),
    machine_compatibility_category: machineCompatCategory(n),
    frame_compatibility_category: frameCompatCategory(n),
    app_type: firstNumber(n.app_type, n.appType, n.m_eAppType, n.eAppType) || undefined,
    controller_support: deriveControllerSupport(node),
  };
}

// Whether a per-client-data entry itself reports the app as installed —
// distinct from the overview's top-level `installed` flag, which Steam can
// set true purely from a Remote Play source on ANOTHER client.
export function pcdEntryInstalled(entry: SteamPerClientData): boolean {
  return !!(entry?.installed ?? (Number(entry?.display_status) === EAppDisplayStatus.Installed));
}

/* Per-client signals for the system-compatibility + Remote Play filters: the
   local client (clientid "0") reports platform availability; any remote client
   with an "Installed" status makes the app a Remote Play source. Absent client
   data (non-Steam) → both undefined so those filters pass/skip rather than
   mis-classify such apps. */
function buildClientFields(node: SteamAppOverviewRaw) {
  const n = node ?? {};
  const pcd: SteamPerClientData[] = Array.isArray(n.per_client_data) ? n.per_client_data : [];
  const remote: SteamPerClientData[] = Array.isArray(n.remote_per_client_data) ? n.remote_per_client_data : [];
  if (pcd.length === 0 && remote.length === 0) return {};
  const local = pcd.find((c) => String(c?.clientid) === "0");
  const available = local && typeof local.is_available_on_current_platform === "boolean"
    ? local.is_available_on_current_platform : undefined;
  const installedLocal = local ? pcdEntryInstalled(local) : false;
  const remoteList = remote.length ? remote : pcd.filter((c) => String(c?.clientid) !== "0");
  const installedRemote = remoteList.some((c) => Number(c?.display_status) === EAppDisplayStatus.Installed);
  return { available_on_current_platform: available, installed_local: installedLocal, installed_remote: installedRemote };
}

export function normalizeAppOverview(node: SteamAppOverviewRaw): AppOverview | null {
  const appid = appIdOf(node);
  if (!Number.isFinite(appid) || appid <= 0) return null;
  return {
    ...buildIdentityFields(node, appid),
    ...buildPlaytimeFields(node),
    ...buildFlagFields(node),
    installed: deriveInstalled(node, appid),
    update_pending: deriveUpdatePending(node),
    display_status: deriveDisplayStatus(node),
    ...buildAssetFields(node),
    ...buildTimestampFields(node),
    ...buildTypeFields(node),
    ...buildClientFields(node),
  };
}

const ADDED_TIME_KEYS = ["rt_purchased_time", "user_added_ts", "rt_store_asset_mtime"];

function addedTimeOf(a: any): number {
  for (const k of ADDED_TIME_KEYS) {
    const v = (a as any)?.[k];
    if (v !== undefined && v !== null) return Number(v);
  }
  return 0;
}

export function compareByAdded(a: AppOverview, b: AppOverview): number {
  const d = addedTimeOf(b) - addedTimeOf(a);
  return d !== 0 ? d : Number(appIdOf(b)) - Number(appIdOf(a));
}
