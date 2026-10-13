import { type AppOverview, normalizeAppOverview, readOptionalBoolean, uniqApps } from "./appOverview";
import type { SteamAppOverviewRaw, SteamAppStore, SteamCollectionLike, SteamCollectionStore, SteamHostWindow, SteamPerClientData } from "./internals";
import { appIdOfRow, getSteamClients, getSteamWindows, uniqNumbers } from "./steamAccess";
import { logInfo, logWarn } from "../runtime/logger";
import { extractAppIdsDeep, extractCollectionAppIds, isMapLike, isSetLike } from "./steamGraph";

/* The library catalog: every app overview, gathered from Steam's stores and collections, enriched with state flags and cached briefly. */

let lastNoAppsWarnAt = 0;

let appOverviewCache: { ts: number; items: AppOverview[] } | null = null;

// In-flight de-dup: concurrent callers await the first promise.
let appOverviewPending: Promise<AppOverview[]> | null = null;

export function invalidateAppOverviewCache(): void {
  appOverviewCache = null;
}

function extractStatefulAppIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return uniqNumbers(value.map((item: unknown) => appIdOfRow(item, "appid", "appId")));
  }
  if (value instanceof Set) {
    return uniqNumbers(Array.from(value.values()).map((item: unknown) => appIdOfRow(item, "appid", "appId")));
  }
  if (value instanceof Map) {
    return uniqNumbers(Array.from(value.values()).map((item: unknown) => appIdOfRow(item, "appid", "appId")));
  }
  return [];
}

type StateFlagField = "installed" | "is_favorite" | "is_hidden";

const STATE_ASYNC_METHODS: Array<{ names: string[]; field: StateFlagField }> = [
  { names: ["GetInstalledApps", "GetInstalledAppIDs", "GetInstalledGames"], field: "installed" },
  { names: ["GetFavoriteApps", "GetFavoriteAppIDs", "GetFavorites"], field: "is_favorite" },
  { names: ["GetHiddenApps", "GetHiddenAppIDs"], field: "is_hidden" },
];

const STATE_VALUE_CANDIDATES: Array<{ keys: string[]; field: StateFlagField }> = [
  { keys: ["installedApps", "m_rgInstalledApps", "m_setInstalledApps"], field: "installed" },
  { keys: ["favoriteApps", "m_rgFavoriteApps", "m_setFavoriteApps"], field: "is_favorite" },
  { keys: ["hiddenApps", "m_rgHiddenApps", "m_setHiddenApps"], field: "is_hidden" },
];

function makeFlagApplier(byId: Map<number, AppOverview>) {
  return (ids: number[], field: StateFlagField) => {
    for (const appid of ids) {
      const current = byId.get(appid);
      if (!current) continue;
      (current as any)[field] = true;
    }
  };
}

async function callMethodSafe(source: Record<string, any> | null | undefined, name: string): Promise<unknown> {
  const fn = source?.[name];
  if (typeof fn !== "function") return undefined;
  try { return await fn.call(source); } catch { return undefined; }
}

async function harvestFlagsFromSource(source: Record<string, any> | null | undefined, applyFlag: (ids: number[], field: StateFlagField) => void): Promise<void> {
  // Parallel: each (method-name, field) call independently — no cross-deps.
  const tasks: Array<Promise<void>> = [];
  for (const entry of STATE_ASYNC_METHODS) {
    for (const name of entry.names) {
      tasks.push(callMethodSafe(source, name).then((res) => {
        if (res !== undefined) applyFlag(extractStatefulAppIds(res), entry.field);
      }));
    }
  }
  await Promise.all(tasks);
  for (const entry of STATE_VALUE_CANDIDATES) {
    for (const key of entry.keys) {
      try { applyFlag(extractStatefulAppIds((source as any)?.[key]), entry.field); } catch {}
    }
  }
}

function harvestFavoritesFromCollectionStore(applyFlag: (ids: number[], field: StateFlagField) => void): void {
  for (const win of getSteamWindows()) {
    try {
      const cs = (win as any)?.collectionStore;
      const favColl = cs?.favoriteCollection ?? cs?.GetCollection?.("favorite");
      if (favColl) applyFlag(extractCollectionAppIds(favColl), "is_favorite");
    } catch {}
  }
}

const RAW_INSTALLED_DIRECT_KEYS = ["installed", "is_installed", "m_bInstalled", "bInstalled"];

const RAW_PCD_KEYS = ["per_client_data", "local_per_client_data"];

const RAW_SIZE_KEYS = ["size_on_disk", "m_nSizeOnDisk"];

const RAW_LAST_LOCAL_KEYS = ["rt_last_time_locally_played", "m_rtLastTimePlayed"];

function pickFirstBool(raw: SteamAppOverviewRaw | SteamPerClientData | null | undefined, keys: string[]): boolean | null {
  for (const k of keys) {
    const v = raw?.[k];
    if (v === true) return true;
    if (v === false) return false;
  }
  return null;
}

function pickFirstClientData(raw: SteamAppOverviewRaw): SteamPerClientData | null {
  for (const k of RAW_PCD_KEYS) {
    const pcd = raw?.[k];
    if (Array.isArray(pcd)) return pcd[0] ?? null;
    if (pcd) return pcd;
  }
  return null;
}

function pickFirstPositiveNumber(raw: SteamAppOverviewRaw | SteamPerClientData | null | undefined, keys: string[]): number {
  for (const k of keys) {
    const v = Number(raw?.[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

function deriveInstalledFromRawOverview(raw: SteamAppOverviewRaw): boolean | undefined {
  const direct = pickFirstBool(raw, RAW_INSTALLED_DIRECT_KEYS);
  if (direct !== null) return direct;
  const clientData = pickFirstClientData(raw);
  if (clientData) {
    // Only use explicit installed field in pcd — do NOT infer from display_status.
    return readOptionalBoolean(clientData, ["installed", "is_installed"]);
  }
  if (pickFirstPositiveNumber(raw, RAW_SIZE_KEYS) > 0) return true;
  if (pickFirstPositiveNumber(raw, RAW_LAST_LOCAL_KEYS) > 0) return true;
  return false;
}

function pickFirstAppStore(): any {
  for (const win of getSteamWindows()) {
    const appStore = (win as any)?.appStore ?? (win as any)?.AppStore;
    if (appStore?.GetAppOverviewByAppID) return appStore;
  }
  return null;
}

// Backfill `installed` from the raw per-id overview for entries the bulk
// pass left ambiguous. Yields to the main thread every BACKFILL_BATCH
// items so a large library (2k+ apps) does not freeze the UI at boot.
const BACKFILL_BATCH = 200;

async function backfillInstalledFromAppStore(byId: Map<number, AppOverview>): Promise<void> {
  const appStore = pickFirstAppStore();
  if (!appStore) return;
  let processed = 0;
  for (const [appid, item] of byId) {
    if (item.installed === false) continue;
    try {
      const raw = appStore.GetAppOverviewByAppID(appid);
      if (raw) {
        const derived = deriveInstalledFromRawOverview(raw);
        if (derived !== undefined) item.installed = derived;
      }
    } catch {}
    if (++processed % BACKFILL_BATCH === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}

export async function enrichAppStateFlags(items: AppOverview[]): Promise<AppOverview[]> {
  const byId = new Map(items.map((item) => [item.appid, { ...item }]));
  const applyFlag = makeFlagApplier(byId);
  const sources = [
    ...getSteamClients().flatMap((sc) => [sc?.Apps, sc?.LibraryStore, sc?.AppStore]),
    ...getSteamWindows().flatMap((win) => [win?.appStore, win?.AppStore, win?.LibraryStore, win?.appsStore]),
  ].filter(Boolean);
  // Parallelize source harvests — previously each was awaited sequentially,
  // serialising ~70 async calls at cold boot.
  await Promise.all(sources.map((source) => harvestFlagsFromSource(source, applyFlag)));
  harvestFavoritesFromCollectionStore(applyFlag);
  await backfillInstalledFromAppStore(byId);
  return [...byId.values()];
}

const APP_OVERVIEW_CHILD_KEY_RE = /(apps|app|overview|library|map|list|items|entries|collection|recent|favorite|installed)/i;

function visitChildCollection(node: any, depth: number, visit: (n: any, d: number) => void): boolean {
  if (isMapLike(node) || isSetLike(node) || node instanceof Set) {
    for (const value of node.values()) visit(value, depth + 1);
    return true;
  }
  if (typeof node[Symbol.iterator] === 'function' && typeof node !== 'string') {
    try { for (const value of node) visit(value, depth + 1); return true; } catch {}
  }
  return false;
}

function visitChildObjects(node: any, depth: number, visit: (n: any, d: number) => void): void {
  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== "object") continue;
    if (APP_OVERVIEW_CHILD_KEY_RE.test(key) || depth < 2) visit(value, depth + 1);
  }
}

function shouldSkipOverviewNode(node: any, seen: Set<any>, visited: number, depth: number): boolean {
  if (!node || seen.has(node) || visited > 4000 || depth > 6) return true;
  if (typeof Element !== "undefined" && node instanceof Element) return true;
  return typeof node !== "object";
}

function extractAppOverviewsFromCandidate(candidate: any): AppOverview[] {
  const out: AppOverview[] = [];
  const seen = new Set<any>();
  let visited = 0;
  const visit = (node: any, depth = 0): void => {
    if (shouldSkipOverviewNode(node, seen, visited, depth)) return;
    seen.add(node);
    visited += 1;
    const normalized = normalizeAppOverview(node);
    if (normalized) out.push(normalized);
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (visitChildCollection(node, depth, visit)) return;
    visitChildObjects(node, depth, visit);
  };
  visit(candidate);
  return uniqApps(out);
}

const OVERVIEW_METHOD_NAMES = [
  "GetApps", "GetAllApps", "GetAppList", "GetAppOverviews",
  "GetAllAppOverviews", "GetCachedAppOverviews", "GetInstalledApps", "GetGames",
];

function pushNormalizedFromIterable(out: AppOverview[], iter: Iterable<any>): void {
  for (const item of iter) {
    const normalized = normalizeAppOverview(item);
    if (normalized) out.push(normalized);
  }
}

function pushOverviewsFromValue(out: AppOverview[], value: unknown): void {
  if (Array.isArray(value)) { pushNormalizedFromIterable(out, value); return; }
  if (value && typeof value === "object") {
    pushNormalizedFromIterable(out, Object.values(value as Record<string, unknown>));
  }
}

function pushOverviewsFromMethods(out: AppOverview[], store: SteamAppStore): void {
  for (const name of OVERVIEW_METHOD_NAMES) {
    try {
      const fn = store?.[name];
      if (typeof fn !== "function") continue;
      pushOverviewsFromValue(out, fn.call(store));
    } catch {}
  }
}

const OVERVIEW_MAP_FIELD_NAMES = [
  "m_mapAppInfo", "m_mapAppOverviews", "m_mapAppOverviewByAppID",
  "m_mapApps", "m_rgApps", "apps", "allApps", "appList",
];

function pushOverviewsFromMapFields(out: AppOverview[], store: any): void {
  for (const name of OVERVIEW_MAP_FIELD_NAMES) {
    try {
      const candidate = store?.[name];
      pushOverviewsFromValue(out, isMapLike(candidate) ? Array.from(candidate.values()) : candidate);
    } catch {}
  }
}

function extractAppOverviewsFromStoreMethods(store: any): AppOverview[] {
  if (!store) return [];
  const out: AppOverview[] = [];
  pushOverviewsFromMethods(out, store);
  pushOverviewsFromMapFields(out, store);
  return uniqApps(out);
}

export async function getAllAppOverviews(): Promise<AppOverview[]> {
  const now = Date.now();
  if (appOverviewCache && now - appOverviewCache.ts < 10000) {
    return appOverviewCache.items;
  }
  // De-dupe in-flight calls so concurrent resolvers share one promise.
  if (appOverviewPending) return appOverviewPending;
  appOverviewPending = (async () => {
    try {
      return await fetchAllAppOverviews(now);
    } finally {
      appOverviewPending = null;
    }
  })();
  return appOverviewPending;
}

async function tryPushAppsFrom(out: AppOverview[], fn: (() => any) | undefined): Promise<void> {
  if (typeof fn !== "function") return;
  try {
    const res = await fn();
    if (Array.isArray(res)) out.push(...(res as AppOverview[]));
  } catch {}
}

async function fetchFromPrimarySteamClient(out: AppOverview[]): Promise<void> {
  for (const sc of getSteamClients()) {
    await tryPushAppsFrom(out, sc?.Apps?.GetAllAppOverviews?.bind(sc?.Apps));
    await tryPushAppsFrom(out, sc?.Apps?.GetMyApps?.bind(sc?.Apps));
  }
}

function fetchFromFallbackCandidates(out: AppOverview[]): void {
  const fallbackCandidates = [
    ...getSteamWindows().flatMap((hostWindow) => [
      hostWindow?.appStore,
      hostWindow?.AppStore,
      hostWindow?.LibraryStore,
      hostWindow?.appsStore,
      hostWindow?.appDataStore,
    ]),
    ...getSteamClients().flatMap((sc) => [sc?.Apps, sc?.LibraryStore, sc?.AppStore]),
  ].filter(Boolean);
  for (const candidate of fallbackCandidates) {
    try { out.push(...extractAppOverviewsFromCandidate(candidate)); } catch {}
    try { out.push(...extractAppOverviewsFromStoreMethods(candidate)); } catch {}
  }
  if (out.length) logInfo("STEAM", "getAllAppOverviews fallback extracted apps", { count: uniqApps(out).length });
}

function harvestCollection(out: AppOverview[], coll: SteamCollectionLike | null | undefined): void {
  const apps = coll?.allApps ?? coll?.visibleApps ?? coll?.apps;
  if (apps) out.push(...extractAppOverviewsFromCandidate(apps));
}

const TYPE_MAP_COLLECTION_KEYS = ['type-games', 'gamesCollection', 'type-shortcuts', 'shortcutsCollection'];

function harvestFromCollectionStoreEntry(out: AppOverview[], cs: SteamCollectionStore | null | undefined): void {
  if (!cs) return;
  harvestCollection(out, cs.allAppsCollection ?? cs.allGamesCollection ?? cs.localGamesCollection);
  harvestCollection(out, cs.allShortcutsCollection ?? cs.shortcutsCollection ?? cs.nonSteamCollection);
  const typeMap = cs.appTypeCollectionMap;
  if (!isMapLike(typeMap)) return;
  for (const key of TYPE_MAP_COLLECTION_KEYS) harvestCollection(out, typeMap.get(key));
}

function fetchFromCollectionStore(out: AppOverview[]): void {
  for (const hostWindow of getSteamWindows()) {
    try {
      harvestFromCollectionStoreEntry(out, (hostWindow as any)?.collectionStore ?? (globalThis as any)?.collectionStore);
    } catch {}
  }
  if (out.length) logInfo("STEAM", "getAllAppOverviews collectionStore extracted", { count: uniqApps(out).length });
}

function harvestMapValues(map: any, out: AppOverview[]): void {
  if (!isMapLike(map) || (map.size ?? 0) === 0) return;
  for (const value of map.values()) {
    const norm = normalizeAppOverview(value);
    if (norm) out.push(norm);
  }
}

function directMapsFor(hostWindow: SteamHostWindow): any[] {
  return [
    hostWindow?.appStore?.m_mapApps,
    hostWindow?.AppStore?.m_mapApps,
    hostWindow?.appStore?.m_mapAppInfo,
    hostWindow?.AppStore?.m_mapAppInfo,
  ].filter(Boolean);
}

function fetchFromDirectMap(out: AppOverview[]): void {
  for (const hostWindow of getSteamWindows()) {
    try { for (const m of directMapsFor(hostWindow)) harvestMapValues(m, out); } catch {}
  }
  if (out.length) logInfo("STEAM", "getAllAppOverviews directMap extracted", { count: uniqApps(out).length });
}

function pickGamesCollection(cs: SteamCollectionStore | null | undefined): any {
  return cs?.allGamesCollection ?? cs?.localGamesCollection ?? cs?.allAppsCollection;
}

function collectAppIdsFromCollectionStore(): number[] {
  const allIds: number[] = [];
  for (const hostWindow of getSteamWindows()) {
    try {
      const cs = (hostWindow as any)?.collectionStore ?? (globalThis as any)?.collectionStore;
      const gamesColl = pickGamesCollection(cs);
      if (gamesColl) allIds.push(...extractAppIdsDeep(gamesColl, 4));
    } catch {}
  }
  return uniqNumbers(allIds);
}

function tryLookupOverviewInWindow(hostWindow: SteamHostWindow, appid: number): AppOverview | null {
  try {
    const ov = hostWindow?.appStore?.GetAppOverviewByAppID?.(appid)
      ?? hostWindow?.AppStore?.GetAppOverviewByAppID?.(appid);
    return ov ? normalizeAppOverview(ov) : null;
  } catch { return null; }
}

function lookupOverviewByAppId(appid: number): AppOverview | null {
  for (const hostWindow of getSteamWindows()) {
    const norm = tryLookupOverviewInWindow(hostWindow, appid);
    if (norm) return norm;
  }
  return null;
}

function fetchFromIndividualLookups(out: AppOverview[]): void {
  const uniqueIds = collectAppIdsFromCollectionStore();
  if (!uniqueIds.length) return;
  logInfo("STEAM", "getAllAppOverviews: recovering via individual lookups", { idCount: uniqueIds.length });
  for (const appid of uniqueIds.slice(0, 2000)) {
    const norm = lookupOverviewByAppId(appid);
    if (norm) out.push(norm);
  }
  if (out.length) logInfo("STEAM", "getAllAppOverviews individual lookups recovered", { count: uniqApps(out).length });
}

function dropPhantomApps(apps: AppOverview[]): AppOverview[] {
  // Drop internal Steam tools / DLCs that have no meaningful name (fallback
  // "App <id>") or blank names.
  return apps.filter((app) => {
    const name = app.display_name ?? "";
    if (name === `App ${app.appid}`) return false;
    if (!name.trim()) return false;
    return true;
  });
}

function finalizeOverviews(filtered: AppOverview[], now: number): AppOverview[] {
  if (!filtered.length) {
    if (now - lastNoAppsWarnAt > 10000) {
      lastNoAppsWarnAt = now;
      logWarn("STEAM", "getAllAppOverviews returned no apps", { windowCount: getSteamWindows().length, clientCount: getSteamClients().length });
    }
    return appOverviewCache ? appOverviewCache.items : filtered;
  }
  // Cache-regression guard: if the new result is <50% of the cache, prefer
  // the cache (Steam stores may be restructuring during initialization).
  if (appOverviewCache && filtered.length < appOverviewCache.items.length * 0.5) {
    appOverviewCache.ts = now;
    return appOverviewCache.items;
  }
  appOverviewCache = { ts: now, items: filtered };
  return filtered;
}

async function fetchAllAppOverviews(now: number): Promise<AppOverview[]> {
  const out: AppOverview[] = [];
  await fetchFromPrimarySteamClient(out);
  if (!out.length) fetchFromFallbackCandidates(out);
  if (!out.length) fetchFromCollectionStore(out);
  if (!out.length) fetchFromDirectMap(out);
  if (!out.length) fetchFromIndividualLookups(out);
  const enriched = await enrichAppStateFlags(uniqApps(out));
  return finalizeOverviews(dropPhantomApps(enriched), now);
}
