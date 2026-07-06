import type { FilterGroup, FilterItem } from "../types";
import { dedupeAppIdsByName } from "./dedupe";
import { UPDATE_PENDING_STATUSES, APP_STATUS_GROUPS, EAppDisplayStatus } from "./appDisplayStatus";
import { mark, measure } from "../core/perf";
import {
  hasExternalSortOption, applyExternalSort,
  hasExternalFilterType, evaluateExternalFilter,
  toPublicAppMeta,
} from "../core/pluginApi";
import type { PlatformAppMeta, PlatformTab } from "../runtime/platform";
import { logInfo, logWarn } from "../runtime/logger";
import { getPreferredSteamDocument, getPreferredSteamWindow } from "../runtime/steamHost";
import { getAppDescriptions as _getAppDescriptions } from "./appDescriptionsCache";

export type SteamCollection = { id: string; name: string };

function isOnlineFeaturesEnabledRaw(): boolean {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.("deck-shelves-settings-cache-v3");
    if (!raw) return false;
    const data = JSON.parse(raw);
    // Offline mode overrides every online toggle while active so no
    // resolver in this file fans out a request when it's on.
    if (data?.offlineModeEnabled === true) return false;
    return data?.onlineFeaturesEnabled === true;
  } catch { return false; }
}

// Online resolvers (wishlist / store) gate on this. Offline mode wins
// over every other toggle; otherwise honour the live setting, then the
// localStorage-cached raw value as a fallback.
function isOnlineEnabledForSettings(s: any): boolean {
  if (s?.offlineModeEnabled === true) return false;
  return s?.onlineFeaturesEnabled ?? isOnlineFeaturesEnabledRaw();
}

const COLLECTION_CACHE_TTL = 60_000;
const collectionRawCache = new Map<string, { data: any; ts: number }>();

function getSteamClient(): any {
  const hostWindow = getPreferredSteamWindow() as any;
  return hostWindow?.SteamClient ?? (window as any).SteamClient;
}

function getSteamWindows(): any[] {
  const candidates = [
    getPreferredSteamWindow(),
    window,
    (window as any).opener,
    (window as any).SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow,
    (window as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow,
    ...(((window as any).SteamUIStore?.WindowStore?.SteamUIWindows ?? []).map((entry: any) => entry?.BrowserWindow)),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
}

function getSteamClients(): any[] {
  return Array.from(new Set(getSteamWindows().map((win: any) => win?.SteamClient).filter(Boolean)));
}

function uniqNumbers(list: number[]): number[] {
  return Array.from(new Set(list.filter((value) => Number.isFinite(value))));
}

function uniqApps(list: AppOverview[]): AppOverview[] {
  const map = new Map<number, AppOverview>();
  for (const item of list) {
    const appid = Number(item?.appid ?? 0);
    if (!Number.isFinite(appid) || appid <= 0) continue;
    if (!map.has(appid)) map.set(appid, item);
  }
  return [...map.values()];
}

let lastNoAppsWarnAt = 0;
let appOverviewCache: { ts: number; items: AppOverview[] } | null = null;
// In-flight de-dup: concurrent callers await the first promise.
let appOverviewPending: Promise<AppOverview[]> | null = null;

export function invalidateAppOverviewCache(): void {
  appOverviewCache = null;
}

function candidateCollectionIds(raw: string): string[] {
  const base = String(raw ?? "").trim();
  if (!base) return [];
  const out = new Set<string>([base]);
  try { out.add(decodeURIComponent(base)); } catch {}
  if (base.startsWith("uc-")) {
    const noPrefix = base.slice(3);
    out.add(noPrefix);
    try { out.add(decodeURIComponent(noPrefix)); } catch {}
    out.add(noPrefix.replace(/[^a-zA-Z0-9_-]/g, ""));
  }
  return Array.from(out).filter(Boolean);
}

function normalizeCollectionToken(value: string): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function cacheCollectionRaw(id: string, name: string, raw: any) {
  const exactId = String(id ?? "").trim();
  const exactName = String(name ?? "").trim();
  const entry = { data: raw, ts: Date.now() };
  if (exactId) collectionRawCache.set(`id:${exactId}`, entry);
  if (exactName) collectionRawCache.set(`name:${exactName}`, entry);

  const normalizedId = normalizeText(exactId);
  const normalizedName = normalizeText(exactName);
  const tokenId = normalizeCollectionToken(exactId);
  if (normalizedId) collectionRawCache.set(`nid:${normalizedId}`, entry);
  if (normalizedName) collectionRawCache.set(`nname:${normalizedName}`, entry);
  if (tokenId) collectionRawCache.set(`tid:${tokenId}`, entry);
}

function getCachedCollectionRawCandidates(idCandidates: string[], nameCandidates: string[]): any[] {
  const out: any[] = [];
  const seen = new Set<any>();
  const now = Date.now();
  const keys = [
    ...idCandidates.flatMap((value) => {
      const raw = String(value ?? "").trim();
      const normalized = normalizeText(raw);
      const token = normalizeCollectionToken(raw);
      return [`id:${raw}`, `nid:${normalized}`, `tid:${token}`];
    }),
    ...nameCandidates.flatMap((value) => {
      const raw = String(value ?? "").trim();
      const normalized = normalizeText(raw);
      return [`name:${raw}`, `nname:${normalized}`];
    }),
  ];

  for (const key of keys) {
    const entry = collectionRawCache.get(key);
    if (!entry || seen.has(entry.data)) continue;
    if (now - entry.ts > COLLECTION_CACHE_TTL) { collectionRawCache.delete(key); continue; }
    seen.add(entry.data);
    out.push(entry.data);
  }
  return out;
}

function slugifyTab(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
}

function normalizeText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_\-/\s]/g, "")
    .trim();
}

function normalizeTabId(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return raw;
  if (raw.includes("library/home") || raw.includes("#library/home")) return "/library/home";
  if (raw.includes("library/collections") || raw.includes("#library/collections")) return "/library/collections";
  return slugifyTab(raw);
}

function collectTextMarkers(value: any): string[] {
  const out: string[] = [];
  const push = (entry: any) => {
    const normalized = normalizeText(String(entry ?? ""));
    if (normalized) out.push(normalized);
  };
  if (Array.isArray(value)) {
    value.forEach(push);
  } else {
    push(value);
  }
  return out;
}

const APP_COLLECTION_MARKER_KEYS = [
  "collection", "collection_id", "collectionId",
  "collection_name", "collectionName",
  "tab", "tab_name",
  "category", "category_name",
  "tags", "rgTags", "m_rgTags",
  "collections", "m_rgCollections",
  "categories", "m_rgCategories",
];

function appMatchesCollectionMarker(app: AppOverview, markers: Set<string>): boolean {
  if (!markers.size) return false;
  const appAny = app as any;
  for (const key of APP_COLLECTION_MARKER_KEYS) {
    for (const marker of collectTextMarkers(appAny?.[key])) {
      if (markers.has(marker)) return true;
    }
  }
  return false;
}

function hasAnyMethod(target: any, methodNames: string[]): boolean {
  if (!target || typeof target !== "object") return false;
  return methodNames.some((name) => typeof target?.[name] === "function");
}

// ─── React fiber traversal for plugin context discovery ──────────────────

let pluginContextCache: { ts: number; value: any | null } | null = null;
const PLUGIN_CONTEXT_CACHE_TTL = 8000;

function hasTabMasterShape(o: any): boolean {
  return !!o && typeof o === 'object' && (Array.isArray(o.visibleTabsList) || o.tabsMap instanceof Map);
}

function extractTabMasterFromFiberValue(val: any): any | null {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return null;
  if (hasTabMasterShape(val)) return val;
  if (hasTabMasterShape(val.tabMasterManager)) return val.tabMasterManager;
  return null;
}

function walkFiberForTabMasterContext(startFiber: any): any | null {
  if (!startFiber) return null;
  const stack: any[] = [startFiber];
  const visited = new WeakSet();
  while (stack.length > 0) {
    const fiber = stack.pop();
    if (!fiber || visited.has(fiber)) continue;
    visited.add(fiber);
    const found = extractTabMasterFromFiberValue(fiber.memoizedProps?.value);
    if (found) return found;
    if (fiber.child) stack.push(fiber.child);
    if (fiber.sibling) stack.push(fiber.sibling);
  }
  return null;
}

function findTabMasterValueInDoc(doc: Document): any | null {
  const visitedRoots = new WeakSet<object>();
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    const fiberKey = Object.keys(el).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
    );
    if (!fiberKey) continue;
    let fiber = (el as any)[fiberKey];
    if (!fiber) continue;
    while (fiber.return) fiber = fiber.return;
    const rootFiber = fiber.stateNode?.current ?? fiber;
    if (visitedRoots.has(rootFiber)) continue;
    visitedRoots.add(rootFiber);
    const found = walkFiberForTabMasterContext(rootFiber);
    if (found) return found;
  }
  return null;
}

export function findTabMasterContextValue(): any | null {
  const now = Date.now();
  if (pluginContextCache && now - pluginContextCache.ts < PLUGIN_CONTEXT_CACHE_TTL) {
    return pluginContextCache.value;
  }
  let value: any | null = null;
  try {
    const docs = Array.from(
      new Set([getPreferredSteamDocument(), ...getSteamWindows().map((w: any) => w?.document)].filter(Boolean))
    ) as Document[];
    for (const doc of docs) {
      try { value = findTabMasterValueInDoc(doc); if (value) break; } catch {}
    }
  } catch {}
  pluginContextCache = { ts: now, value };
  return value;
}

// Keep the old name as an alias for the component that still uses it
export const findCustomFiltersContextValue = findTabMasterContextValue;

function pushTabIfNew(out: PlatformTab[], seen: Set<string>, id: string, name: string): void {
  if (!id || !name || seen.has(id)) return;
  seen.add(id);
  out.push({ id, name });
}

function tabIdFrom(container: any, fallbackKey?: string): string {
  return String(container?.id ?? fallbackKey ?? "").trim();
}

function tabNameFrom(container: any): string {
  return String(container?.title ?? container?.name ?? "").trim();
}

function getCustomFiltersList(): PlatformTab[] {
  const ctx = findTabMasterContextValue();
  if (!ctx) return [];
  const out: PlatformTab[] = [];
  const seen = new Set<string>();
  if (Array.isArray(ctx.visibleTabsList)) {
    for (const container of ctx.visibleTabsList) pushTabIfNew(out, seen, tabIdFrom(container), tabNameFrom(container));
  }
  if (ctx.tabsMap instanceof Map) {
    ctx.tabsMap.forEach((container: any, key: string) => pushTabIfNew(out, seen, tabIdFrom(container, key), tabNameFrom(container)));
  }
  return out;
}

function bidirectionalContains(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

function tabContainerMatchScoreFor(id: string, name: string, needle: string): number {
  if (id === needle || name === needle) return 2;
  return (bidirectionalContains(id, needle) || bidirectionalContains(name, needle)) ? 1 : 0;
}

function tabContainerMatchScore(container: any, key: string, needle: string): number {
  return tabContainerMatchScoreFor(
    normalizeText(tabIdFrom(container, key)),
    normalizeText(tabNameFrom(container)),
    needle,
  );
}

function pickBestTabContainer(tabsMap: Map<string, any>, needle: string): any | null {
  let best: any = null;
  let bestScore = 0;
  tabsMap.forEach((container, key) => {
    const score = tabContainerMatchScore(container, key, needle);
    if (score > bestScore) { bestScore = score; best = container; }
  });
  return best;
}

function extractAppIdsFromContainer(tabContainer: any): number[] {
  const allApps = tabContainer?.collection?.allApps ?? tabContainer?.allApps;
  if (allApps instanceof Set) {
    return uniqNumbers(Array.from(allApps.values()).map(Number).filter(Number.isFinite));
  }
  return extractAppIdsDeep(allApps ?? tabContainer?.collection, 3);
}

function getCustomFiltersAppsForContainer(tabId: string): number[] {
  const ctx = findTabMasterContextValue();
  if (!(ctx?.tabsMap instanceof Map)) return [];
  const tabContainer = pickBestTabContainer(ctx.tabsMap, normalizeText(tabId));
  return tabContainer ? extractAppIdsFromContainer(tabContainer) : [];
}

function collectDynamicTabStores(): any[] {
  const clients = getSteamClients();
  const hostWindows = getSteamWindows();
  const methodNames = [
    "GetTabs", "GetLibraryTabs", "GetVisibleTabs", "GetAllTabs", "GetSidebarTabs", "GetPrimaryTabs",
    "GetAppsForTab", "GetTabApps", "GetVisibleAppsForTab", "ResolveTabApps", "GetAppsByTab", "GetAppIDsForTab",
  ];
  const base = [
    ...clients.flatMap((sc) => [sc?.LibraryStore, sc?.Library]),
    ...hostWindows.flatMap((hostWindow) => [
      hostWindow?.LibraryStore,
      hostWindow?.LibraryTabStore,
      hostWindow?.LibraryFiltersStore,
      hostWindow?.TabMasterStore,
      hostWindow?.TabMaster,
      hostWindow?.UnifyDeckStore,
      hostWindow?.UnifyDeck,
      hostWindow?.UnifiDeckStore,
      hostWindow?.UnifiDeck,
    ]),
  ].filter(Boolean);

  const dynamic: any[] = [];
  for (const hostWindow of hostWindows) {
    try {
      for (const [key, value] of Object.entries(hostWindow ?? {})) {
        const lower = key.toLowerCase();
        if (!/(tab|library|unifi|unify|deck)/.test(lower)) continue;
        if (hasAnyMethod(value, methodNames)) dynamic.push(value);
      }
    } catch {}
  }

  return Array.from(new Set([...base, ...dynamic]));
}

function unwrapStoreApps(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== "object") return [];
  return result.apps ?? result.appids ?? result.items ?? result.list ?? result.entries ?? [];
}

function coerceStoreAppIds(arr: any): number[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item: any) => Number(item?.appid ?? item?.appId ?? item?.id ?? item))
    .filter((n: number) => Number.isFinite(n));
}

async function tryFetchTabAppIds(fn: Function, store: any, candidates: string[]): Promise<number[]> {
  for (const id of candidates) {
    try {
      const ids = coerceStoreAppIds(unwrapStoreApps(await fn.call(store, id)));
      if (ids.length) return ids;
    } catch {}
  }
  return [];
}

export async function getTabAppIdsFromStore(tab: string): Promise<number[]> {
  const raw = String(tab ?? "").trim();
  const candidates = [raw, normalizeTabId(raw), slugifyTab(raw)].filter(Boolean);
  const methods = ["GetAppsForTab", "GetTabApps", "GetVisibleAppsForTab", "ResolveTabApps", "GetAppsByTab", "GetAppIDsForTab"];
  for (const store of collectDynamicTabStores()) {
    for (const method of methods) {
      const fn = store?.[method];
      if (typeof fn !== "function") continue;
      const ids = await tryFetchTabAppIds(fn, store, candidates);
      if (ids.length) return ids;
    }
  }
  return [];
}

const INSTALLED_DIRECT_KEYS = ["installed", "is_installed", "m_bInstalled", "bInstalled"];
const INSTALLED_PCD_KEYS = ["per_client_data", "local_per_client_data"];
const INSTALLED_SIZE_KEYS = ["size_on_disk", "m_nSizeOnDisk"];
const INSTALLED_LAST_LOCAL_KEYS = ["rt_last_time_locally_played", "m_rtLastTimePlayed"];

function readDirectInstalled(raw: any): boolean | null {
  if (!raw) return null;
  for (const k of INSTALLED_DIRECT_KEYS) {
    const v = raw[k];
    if (v === true) return true;
    if (v === false) return false;
  }
  return null;
}

function readPcdInstalled(raw: any): boolean | undefined {
  for (const k of INSTALLED_PCD_KEYS) {
    const pcd = raw?.[k];
    const clientData = Array.isArray(pcd) ? pcd[0] : pcd;
    if (clientData) {
      const v = readOptionalBoolean(clientData, ["installed", "is_installed"]);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

function firstPositiveNumber(raw: any, keys: string[]): number {
  for (const k of keys) {
    const v = Number(raw?.[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

function resolveInstalledFromRaw(raw: any): boolean | null {
  if (!raw) return null;
  const direct = readDirectInstalled(raw);
  if (direct !== null) return direct;
  const pcd = readPcdInstalled(raw);
  if (pcd !== undefined) return pcd;
  if (firstPositiveNumber(raw, INSTALLED_SIZE_KEYS) > 0) return true;
  if (firstPositiveNumber(raw, INSTALLED_LAST_LOCAL_KEYS) > 0) return true;
  return false;
}

function pickAppStoreFromWindow(win: any): any {
  return win?.appStore ?? win?.AppStore ?? (globalThis as any).AppStore;
}

export async function resolveAppInstalledState(appid: number): Promise<boolean | null> {
  try {
    for (const win of getSteamWindows()) {
      const appStore = pickAppStoreFromWindow(win);
      if (!appStore || typeof appStore.GetAppOverviewByAppID !== 'function') continue;
      try {
        const raw = appStore.GetAppOverviewByAppID(appid);
        if (!raw) continue;
        return resolveInstalledFromRaw(raw);
      } catch {}
    }
  } catch {}
  return null;
}

const NATIVE_LIBRARY_TAB_DEFAULTS: PlatformTab[] = [
  { id: "all", name: "All Games" },
  { id: "favorites", name: "Favorites" },
  { id: "installed", name: "Installed" },
  { id: "hidden", name: "Hidden" },
  { id: "nonsteam", name: "Non-Steam" },
];

const SYSTEM_COLLECTION_IDS = new Set([
  'favorite','hidden','notinstalled','installed','local',
  'deckverified','controller','uncategorized',
  'all-apps-alpha','all-apps-recent','local-install','recent',
]);

async function fetchTabsFromSettingsFile(): Promise<PlatformTab[]> {
  try {
    const { getVisibleTabsFromSettingsFile } = await import('../integrations/tabmaster');
    return await getVisibleTabsFromSettingsFile();
  } catch { return []; }
}

function fetchTabsFromFiber(): PlatformTab[] {
  try { return getCustomFiltersList() ?? []; } catch { return []; }
}

async function fetchTabsFromDOM(): Promise<PlatformTab[]> {
  try {
    const { getTabsFromDOM } = await import('../integrations/domtabs');
    return getTabsFromDOM() ?? [];
  } catch { return []; }
}

function firstStringFromKeys(node: any, keys: string[], fallback = ""): string {
  if (!node) return fallback;
  for (const k of keys) {
    const v = node[k];
    if (v !== undefined && v !== null) return String(v);
  }
  return fallback;
}

const RECENT_COLLECTION_ID_KEYS = ["id", "m_strId"];
const RECENT_COLLECTION_NAME_KEYS = ["displayName", "m_strName"];
const USER_COLLECTION_ID_KEYS = ["id", "m_strId", "key"];
const USER_COLLECTION_NAME_KEYS = ["displayName", "m_strName"];

function addRecentCollectionTab(cs: any, seen: Set<string>, out: PlatformTab[]): void {
  const recentCol = cs?.recentAppsCollection ?? cs?.allRecentAppsCollection;
  if (!recentCol) return;
  const id = firstStringFromKeys(recentCol, RECENT_COLLECTION_ID_KEYS, 'recent');
  if (!id) return;
  const lower = id.toLowerCase();
  if (seen.has(lower)) return;
  const name = firstStringFromKeys(recentCol, RECENT_COLLECTION_NAME_KEYS, 'Recent');
  seen.add(lower);
  out.push({ id, name });
}

function isSkippableUserCollection(cs: any, id: string, seen: Set<string>): boolean {
  const lower = id.toLowerCase();
  if (SYSTEM_COLLECTION_IDS.has(lower) || seen.has(lower)) return true;
  try { if (cs?.BIsSystemCollectionId?.(id)) return true; } catch {}
  return false;
}

function userCollectionTabFromEntry(col: any): PlatformTab | null {
  const id = firstStringFromKeys(col, USER_COLLECTION_ID_KEYS);
  const name = firstStringFromKeys(col, USER_COLLECTION_NAME_KEYS);
  if (!id || !name) return null;
  return { id, name };
}

function addUserCollectionTabs(cs: any, seen: Set<string>, out: PlatformTab[]): void {
  const rawMap = cs?.m_mapCollectionsFromStorage ?? cs?.collectionsFromStorage;
  if (!rawMap || typeof rawMap.values !== 'function') return;
  for (const col of rawMap.values()) {
    const tab = userCollectionTabFromEntry(col);
    if (!tab) continue;
    if (isSkippableUserCollection(cs, tab.id, seen)) continue;
    seen.add(tab.id.toLowerCase());
    out.push(tab);
  }
}

// Native "Recentes" tab plus user collections; uses the raw storage
// map to avoid the MobX userCollections poisoning path.
function buildCollectionStoreTabs(): PlatformTab[] {
  try {
    const cs = (globalThis as any).collectionStore;
    const extra: PlatformTab[] = [];
    const seen = new Set(NATIVE_LIBRARY_TAB_DEFAULTS.map((t) => t.id.toLowerCase()));
    addRecentCollectionTab(cs, seen, extra);
    addUserCollectionTabs(cs, seen, extra);
    return extra;
  } catch { return []; }
}

export async function listLibraryTabs(): Promise<PlatformTab[]> {
  // Always swallow errors: a rejected promise here empties the editor's
  // tab dropdown. Fall back to native defaults.
  try {
    const settingsTabs = await fetchTabsFromSettingsFile();
    if (settingsTabs.length > 0) return settingsTabs;

    const fiberTabs = fetchTabsFromFiber();
    if (fiberTabs.length > 0) return fiberTabs;

    const domTabs = await fetchTabsFromDOM();
    if (domTabs.length > 0) return domTabs;

    const extra = buildCollectionStoreTabs();
    if (extra.length > 0) return [...NATIVE_LIBRARY_TAB_DEFAULTS, ...extra];
  } catch {}

  return NATIVE_LIBRARY_TAB_DEFAULTS.slice();
}

function removeAppFromCollectionEntry(store: any, coll: any, appid: number): boolean {
  if (!coll) return false;
  if (typeof coll.RemoveApps === 'function') {
    coll.RemoveApps([appid]);
    store.userCollectionStore?.CommitCollection?.(coll);
    return true;
  }
  if (typeof coll.RemoveApp === 'function') {
    coll.RemoveApp(appid);
    return true;
  }
  if (coll.apps instanceof Map && coll.apps.has(appid)) {
    coll.apps.delete(appid);
    store.userCollectionStore?.CommitCollection?.(coll);
    return true;
  }
  return false;
}

function readRawStoredCollections(store: any): any[] {
  const rawMap: any = store.m_mapCollectionsFromStorage ?? store.collectionsFromStorage;
  if (rawMap && typeof rawMap.values === 'function') return Array.from(rawMap.values());
  if (Array.isArray(rawMap)) return rawMap;
  return [];
}

function removeFromRawStorage(store: any, collectionId: string, appid: number): boolean {
  // NEVER read `userCollections` here — that getter is a MobX computed
  // that poisons its own cache when evaluated against a not-yet-initialized
  // store, taking down Steam's library home.
  for (const c of readRawStoredCollections(store)) {
    const id = String(c?.id ?? c?.collectionid ?? '');
    if (id !== collectionId) continue;
    if (removeAppFromCollectionEntry(store, c, appid)) return true;
  }
  return false;
}

function tryRemoveFromStore(store: any, collectionId: string, appid: number): boolean {
  if (!store) return false;
  if (removeAppFromCollectionEntry(store, store.GetCollection?.(collectionId), appid)) return true;
  return removeFromRawStorage(store, collectionId, appid);
}

export function removeAppFromCollection(collectionId: string, appid: number): void {
  try {
    for (const win of getSteamWindows()) {
      const store = win?.collectionStore ?? (globalThis as any).collectionStore;
      if (tryRemoveFromStore(store, collectionId, appid)) return;
    }
  } catch {}
}

const COLLECTION_NORMALIZE_ID_KEYS = ["id", "collectionid", "gid", "key", "name", "displayName"];
const COLLECTION_NORMALIZE_NAME_KEYS = ["displayName", "m_strName", "name", "title", "label"];

function normalizeCollectionList(items: any[]): SteamCollection[] {
  const out: SteamCollection[] = [];
  for (const c of items) {
    const id = firstStringFromKeys(c, COLLECTION_NORMALIZE_ID_KEYS);
    const name = firstStringFromKeys(c, COLLECTION_NORMALIZE_NAME_KEYS, "Collection");
    if (!id || !name) continue;
    cacheCollectionRaw(id, name, c);
    out.push({ id, name });
  }
  return out;
}

// NEVER read `collectionStore.userCollections` — that MobX getter
// poisons its own cache on early eval, crashing the library home. Use
// the raw storage map directly; it holds every user collection.
function readCollectionsFromStorageMap(globalCollectionStore: any): SteamCollection[] {
  try {
    const m = globalCollectionStore.m_mapCollectionsFromStorage;
    if (!m || typeof m.keys !== 'function') return [];
    const items: any[] = [];
    for (const key of m.keys()) {
      try {
        const c = m.get(key);
        if (c) items.push({ id: (c as any).m_strId ?? key, ...(c as any) });
      } catch {}
    }
    return normalizeCollectionList(items);
  } catch { return []; }
}

async function callClientCollectionsGetter(fn: any): Promise<any> {
  if (typeof fn !== "function") return null;
  try { return await fn(); } catch { return null; }
}

function bindClientMethod(parent: any, method: string): any {
  const fn = parent?.[method];
  return typeof fn === "function" ? fn.bind(parent) : null;
}

function coerceClientCollectionsResult(res: any): SteamCollection[] {
  if (Array.isArray(res)) return normalizeCollectionList(res);
  if (res && typeof res === "object") {
    return normalizeCollectionList(Object.values(res) as any[]);
  }
  return [];
}

async function listCollectionsFromClient(sc: any): Promise<SteamCollection[]> {
  const direct = await callClientCollectionsGetter(bindClientMethod(sc?.Collections, "GetCollections"));
  const norm = coerceClientCollectionsResult(direct);
  if (norm.length) return norm;
  const all = await callClientCollectionsGetter(bindClientMethod(sc?.CollectionStore, "GetAllCollections"));
  return coerceClientCollectionsResult(all);
}

function collectStoreCandidates(hostWindows: any[], clients: any[]): any[] {
  return [
    ...hostWindows.flatMap((hostWindow) => [
      hostWindow?.CollectionStore, hostWindow?.LibraryStore, hostWindow?.collections,
      hostWindow?.g_Collections, hostWindow?.TabMasterStore, hostWindow?.UnifiDeckStore,
    ]),
    ...clients.map((sc) => sc?.LibraryStore),
  ];
}

function listCollectionsFromCandidate(candidate: any): SteamCollection[] {
  try {
    const arr = Array.isArray(candidate) ? candidate : Object.values(candidate ?? {});
    return normalizeCollectionList(arr as any[]);
  } catch { return []; }
}

function readCollectionsFromDoc(doc: any): SteamCollection[] {
  try {
    const nodes = Array.from(doc.querySelectorAll('[data-collection-id], [class*="collection"]'));
    const dom = nodes.map((node) => {
      const el = node as HTMLElement;
      const text = (el.textContent || '').trim();
      const id = String(el.dataset?.collectionId || el.getAttribute('data-collection-id') || text);
      return { id, name: text };
    }).filter((c) => c.id && c.name && c.name.length < 80);
    return dom.length ? normalizeCollectionList(dom as any[]) : [];
  } catch { return []; }
}

function listCollectionsFromStorage(hostWindows: any[]): SteamCollection[] {
  for (const hostWindow of hostWindows) {
    const store = hostWindow?.collectionStore ?? (globalThis as any).collectionStore;
    if (!store) continue;
    const norm = readCollectionsFromStorageMap(store);
    if (norm.length) return norm;
  }
  return [];
}

async function listCollectionsFromAllClients(clients: any[]): Promise<SteamCollection[]> {
  for (const sc of clients) {
    const norm = await listCollectionsFromClient(sc);
    if (norm.length) return norm;
  }
  return [];
}

function listCollectionsFromCandidates(hostWindows: any[], clients: any[]): SteamCollection[] {
  for (const candidate of collectStoreCandidates(hostWindows, clients)) {
    const norm = listCollectionsFromCandidate(candidate);
    if (norm.length) return norm;
  }
  return [];
}

function listCollectionsFromDocs(hostWindows: any[]): SteamCollection[] {
  const docs = Array.from(new Set([getPreferredSteamDocument(), ...hostWindows.map((win: any) => win?.document)].filter(Boolean)));
  for (const doc of docs) {
    const norm = readCollectionsFromDoc(doc);
    if (norm.length) return norm;
  }
  return [];
}

export async function listCollections(): Promise<SteamCollection[]> {
  const clients = getSteamClients();
  const hostWindows = getSteamWindows();

  const fromStorage = listCollectionsFromStorage(hostWindows);
  if (fromStorage.length) return fromStorage;

  const fromClients = await listCollectionsFromAllClients(clients);
  if (fromClients.length) return fromClients;

  const fromCandidates = listCollectionsFromCandidates(hostWindows, clients);
  if (fromCandidates.length) return fromCandidates;

  return listCollectionsFromDocs(hostWindows);
}

function appIdOf(a: any): number {
  return Number(a?.appid ?? a?.appId ?? a?.m_unAppID ?? a?.nAppID ?? 0);
}

function readOptionalBoolean(node: any, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const val = (node as any)?.[key];
    if (val !== undefined) return Boolean(val);
  }
  return undefined;
}

function appNameOf(a: any): string {
  return String(a?.display_name ?? a?.name ?? a?.strDisplayName ?? a?.m_strName ?? "");
}
function isNonSteamOf(a: any): boolean {
  return !!(a?.is_non_steam) || a?.is_steam === false || a?.m_eAppType === 1073741824 || a?.app_type === 1073741824 || a?.app_type === "shortcut";
}

// Unifideck shortcuts are always overview-installed; ground truth is
// the "[Unifideck] Installed" collection. Cached for O(1) checks.
let _ufInstalledCache: { ids: Set<number>; ts: number } | null = null;
const UF_INSTALLED_LABELS = new Set([
  "installed", "instalados", "instalado", "installés", "installierte",
  "installiert", "installati", "zainstalowane", "geïnstalleerd",
  "installerade", "установленные", "установлено", "インストール済み",
  "已安装", "已安裝", "설치됨", "ติดตั้งแล้ว",
]);
function isUnifideckInstalledLabel(c: any): boolean {
  const name = String(c?.displayName ?? c?.m_strName ?? "");
  if (!/^\[Unifideck\]/i.test(name)) return false;
  const label = name.replace(/^\[Unifideck\]\s*/i, "").trim().toLowerCase();
  return UF_INSTALLED_LABELS.has(label);
}

function getUnifideckInstalledSet(): Set<number> {
  const now = Date.now();
  if (_ufInstalledCache && now - _ufInstalledCache.ts < 5000) return _ufInstalledCache.ids;
  const ids = new Set<number>();
  try {
    const cs: any = (globalThis as any).collectionStore;
    const match = readCollectionList(cs).find(isUnifideckInstalledLabel);
    if (match) pushAppIdsFromCollection(match, ids);
  } catch {}
  _ufInstalledCache = { ids, ts: now };
  return ids;
}

// Cloud-play set: Unifideck Microsoft (Xbox Cloud Gaming). Other Unifideck
// providers (Epic, GOG, Amazon, Ubisoft) are native-install platforms —
// owning a game there counts as owned even when not installed locally.
let _ufCloudCache: { ids: Set<number>; ts: number } | null = null;
const UF_CLOUD_COLLECTION_LABELS = new Set(["microsoft"]);
function readUnifideckCloudLabel(c: any): string | null {
  const name = String(c?.displayName ?? c?.m_strName ?? "");
  if (!/^\[Unifideck\]/i.test(name)) return null;
  const label = name.replace(/^\[Unifideck\]\s*/i, "").trim().toLowerCase();
  return UF_CLOUD_COLLECTION_LABELS.has(label) ? label : null;
}

function pushAppIdsFromCollection(c: any, out: Set<number>): void {
  const apps = c?.allApps ?? c?.m_rgApps ?? [];
  for (const a of apps) {
    const n = Number(a?.appid);
    if (Number.isFinite(n)) out.add(n);
  }
}

function readCollectionList(cs: any): any[] {
  const cols = cs?.m_mapCollectionsFromStorage ?? cs?.collectionsFromStorage;
  if (Array.isArray(cols)) return cols;
  return Array.from(cols?.values?.() ?? []);
}

export function getUnifideckCloudPlaySet(): Set<number> {
  const now = Date.now();
  if (_ufCloudCache && now - _ufCloudCache.ts < 5000) return _ufCloudCache.ids;
  const ids = new Set<number>();
  try {
    const cs: any = (globalThis as any).collectionStore;
    for (const c of readCollectionList(cs)) {
      if (readUnifideckCloudLabel(c) === null) continue;
      pushAppIdsFromCollection(c, ids);
    }
  } catch {}
  _ufCloudCache = { ids, ts: now };
  return ids;
}

function isCloudPlayShortcut(a: any): boolean {
  if (!isNonSteamOf(a)) return false;
  const id = Number(a?.appid);
  if (!Number.isFinite(id)) return false;
  return getUnifideckCloudPlaySet().has(id);
}

function isFavoriteOf(a: any): boolean {
  return !!(a?.is_favorite ?? a?.favorite ?? a?.m_bIsFavorite ?? a?.m_bFavorite ?? a?.bFavorite);
}
function isHiddenOf(a: any): boolean {
  // SteamOS 3.x marks hidden via `visible_in_game_list === false`; older
  // bool fields aren't populated there (#63).
  if (a?.visible_in_game_list === false) return true;
  return !!(a?.is_hidden ?? a?.hidden ?? a?.m_bHidden ?? a?.bHidden);
}
function collectionApps(coll: any): any[] {
  if (!coll) return [];
  return coll.allApps ?? coll.visibleApps ?? coll.apps ?? [];
}

function collectSteamApps(coll: any, out: Set<number>): void {
  for (const a of collectionApps(coll)) {
    if (isNonSteamOf(a)) continue;
    const id = appIdOf(a);
    if (Number.isFinite(id) && id > 0) out.add(id);
  }
}

function collectNonSteamApps(coll: any, out: Set<number>, includeCloudPlay: boolean): void {
  for (const a of collectionApps(coll)) {
    if (!isNonSteamOf(a)) continue;
    if (!includeCloudPlay && isCloudPlayShortcut(a)) continue;
    const id = appIdOf(a);
    if (Number.isFinite(id) && id > 0) out.add(id);
  }
}

function nonSteamCollectionFrom(cs: any): any {
  return cs.myGamesCollection ?? cs.allAppsCollection ?? cs.allShortcutsCollection;
}

function gatherLibraryFromStore(cs: any, includeNonSteam: boolean, includeCloudPlay: boolean, out: Set<number>): void {
  if (!cs) return;
  collectSteamApps(cs.allGamesCollection, out);
  if (includeNonSteam) collectNonSteamApps(nonSteamCollectionFrom(cs), out, includeCloudPlay);
}

export function getLocalLibraryAppIds(includeNonSteam: boolean, includeCloudPlay: boolean = false): Set<number> {
  const out = new Set<number>();
  try {
    gatherLibraryFromStore((globalThis as any).collectionStore, includeNonSteam, includeCloudPlay, out);
    if (out.size > 0) return out;
    for (const hw of getSteamWindows()) {
      gatherLibraryFromStore((hw as any)?.collectionStore, includeNonSteam, includeCloudPlay, out);
      if (out.size > 0) break;
    }
  } catch {}
  return out;
}
function isNonSteamInstalled(a: any): boolean {
  const uf = getUnifideckInstalledSet();
  if (uf.size > 0) return uf.has(Number(a?.appid));
  const sod = Number(a?.size_on_disk ?? 0);
  if (Number.isFinite(sod) && sod > 0) return true;
  const lp = Number(a?.rt_last_time_locally_played ?? 0);
  return Number.isFinite(lp) && lp > 0;
}

function isInstalledOf(a: any): boolean {
  if (isNonSteamOf(a)) return isNonSteamInstalled(a);
  return !!(a?.installed ?? a?.is_installed ?? a?.m_bInstalled ?? a?.bInstalled);
}
function lastPlayedOf(a: any): number {
  return Number(a?.last_played ?? a?.rt_last_time_played ?? a?.m_ulLastPlayed ?? 0);
}
export type AppOverview = {
  appid: number;
  display_name?: string;
  sort_as?: string;
  last_played?: number;
  playtime_forever?: number;
  is_steam?: boolean;
  is_non_steam?: boolean;
  is_favorite?: boolean;
  is_hidden?: boolean;
  installed?: boolean;
  deck_compatibility_category?: number;
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
};

function getPerClientData(node: any): any | null {
  const pcd = node?.per_client_data ?? node?.local_per_client_data;
  return Array.isArray(pcd) ? (pcd[0] ?? null) : (pcd ?? null);
}

function readPcdInstalledExplicit(node: any): boolean | undefined {
  try {
    const clientData = getPerClientData(node);
    return clientData ? readOptionalBoolean(clientData, ["installed", "is_installed"]) : undefined;
  } catch { return undefined; }
}

function hasInstallSizeOnDisk(node: any): boolean {
  try {
    const size = Number(node?.size_on_disk ?? node?.installed_size ?? 0);
    return Number.isFinite(size) && size > 0;
  } catch { return false; }
}

function deriveInstalled(node: any, appid: number): boolean | undefined {
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

function pcdHasDownloadBytes(clientData: any): boolean {
  const bytesDown = Number(clientData?.bytes_to_download ?? clientData?.m_nBytesToDownload ?? 0);
  if (bytesDown > 0) return true;
  const bytesStage = Number(clientData?.bytes_to_stage ?? clientData?.m_nBytesToStage ?? 0);
  return bytesStage > 0;
}

function pcdUpdatePending(clientData: any): boolean {
  if (!clientData) return false;
  if (UPDATE_PENDING_STATUSES.includes(Number(clientData?.display_status ?? 0))) return true;
  return pcdHasDownloadBytes(clientData);
}

function deriveUpdatePending(node: any): boolean | undefined {
  if (pcdUpdatePending(getPerClientData(node))) return true;
  const explicit = readOptionalBoolean(node, UPDATE_PENDING_FLAG_KEYS);
  return explicit === true ? true : explicit;
}

function deriveDisplayStatus(node: any): number | undefined {
  try {
    const clientData = getPerClientData(node);
    if (clientData) {
      const ds = Number(clientData?.display_status ?? 0);
      return ds > 0 ? ds : undefined;
    }
  } catch {}
  return undefined;
}

function deriveControllerSupport(node: any): number | undefined {
  const raw = node?.nControllerSupport ?? node?.controller_support ?? node?.n_controller_support;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Pick the first defined / non-zero value from a list of alias fields.
// Replaces the inline `?? ?? ?? ?? 0 || undefined` chains the field
// accessors below used to carry, keeping each accessor at complexity 1-2.
function firstNumber(...values: any[]): number {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 0;
}
function firstString(...values: any[]): string {
  for (const v of values) if (typeof v === "string" && v) return v;
  return "";
}

// Builders alias `node` to `n = node ?? {}` so field reads don't count
// as branches each — keeps each builder under the complexity cap.
function buildIdentityFields(node: any, appid: number) {
  const n = node ?? {};
  const name = appNameOf(node);
  return {
    appid,
    display_name: name || String(n.displayName ?? n.title ?? `App ${appid}`),
    sort_as: String(n.sort_as ?? n.sortAs ?? name ?? ""),
  };
}

function buildPlaytimeFields(node: any) {
  return {
    last_played: firstNumber(node?.last_played, node?.rt_last_time_played, node?.m_ulLastPlayed),
    playtime_forever: firstNumber(node?.playtime_forever, node?.minutes_playtime_forever, node?.minutes_played_forever),
  };
}

function buildFlagFields(node: any) {
  const n = node ?? {};
  return {
    is_steam: n.is_steam ?? !isNonSteamOf(node),
    is_non_steam: isNonSteamOf(node),
    is_favorite: readOptionalBoolean(node, ["is_favorite", "favorite", "m_bIsFavorite", "m_bFavorite", "bFavorite"]),
    is_hidden: (n.visible_in_game_list === false) ? true : readOptionalBoolean(node, ["is_hidden", "hidden", "m_bHidden", "bHidden"]),
    cloud_available: readOptionalBoolean(node, ["bCloudAvailable", "cloud_available", "b_cloud_available"]),
  };
}

function buildAssetFields(node: any) {
  const n = node ?? {};
  return {
    library_capsule: firstString(n.library_capsule, n.libraryCapsule, n.vertical_capsule),
    library_capsule_filename: firstString(n.library_capsule_filename, n.libraryCapsuleFilename),
    library_hero: firstString(n.library_hero, n.hero, n.libraryHero),
    header: firstString(n.header, n.header_image, n.capsule),
    icon_hash: firstString(n.icon_hash, n.iconHash),
  };
}

function buildTimestampFields(node: any) {
  const n = node ?? {};
  return {
    rt_store_asset_mtime: firstNumber(n.rt_store_asset_mtime, n.rtStoreAssetMtime) || undefined,
    user_added_ts: firstNumber(n.time_added, n.m_time_added, n.added, n.rt_time_added_to_account, n.m_rtTimeAdded, n.timeAddedToAccount, n.time_added_to_account, n.m_time_added_to_account) || undefined,
    rt_purchased_time: firstNumber(n.rt_purchased_time, n.rtPurchasedTime) || undefined,
    rt_recent_activity_time: firstNumber(n.rt_recent_activity_time, n.rtRecentActivityTime) || undefined,
  };
}

function buildTypeFields(node: any) {
  const n = node ?? {};
  return {
    deck_compatibility_category: Number(n.deck_compatibility_category ?? n.m_eDeckCompatibilityCategory ?? ((Number(n.steam_hw_compat_category_packed ?? 0) & 0xF) || 0)),
    app_type: firstNumber(n.app_type, n.appType, n.m_eAppType, n.eAppType) || undefined,
    controller_support: deriveControllerSupport(node),
  };
}

export function normalizeAppOverview(node: any): AppOverview | null {
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
  };
}

function extractStatefulAppIds(value: any): number[] {
  if (Array.isArray(value)) {
    return uniqNumbers(value.map((item) => Number(item?.appid ?? item?.appId ?? item)));
  }
  if (value instanceof Set) {
    return uniqNumbers(Array.from(value.values()).map((item: any) => Number(item?.appid ?? item?.appId ?? item)));
  }
  if (value instanceof Map) {
    return uniqNumbers(Array.from(value.values()).map((item: any) => Number(item?.appid ?? item?.appId ?? item)));
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

async function callMethodSafe(source: any, name: string): Promise<any> {
  const fn = (source as any)?.[name];
  if (typeof fn !== "function") return undefined;
  try { return await fn.call(source); } catch { return undefined; }
}

async function harvestFlagsFromSource(source: any, applyFlag: (ids: number[], field: StateFlagField) => void): Promise<void> {
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

function pickFirstBool(raw: any, keys: string[]): boolean | null {
  for (const k of keys) {
    const v = raw?.[k];
    if (v === true) return true;
    if (v === false) return false;
  }
  return null;
}

function pickFirstClientData(raw: any): any {
  for (const k of RAW_PCD_KEYS) {
    const pcd = raw?.[k];
    if (Array.isArray(pcd)) return pcd[0] ?? null;
    if (pcd) return pcd;
  }
  return null;
}

function pickFirstPositiveNumber(raw: any, keys: string[]): number {
  for (const k of keys) {
    const v = Number(raw?.[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

function deriveInstalledFromRawOverview(raw: any): boolean | undefined {
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

function isMapLike(obj: any): boolean {
  return obj && typeof obj === 'object' && typeof obj.values === 'function' && typeof obj.get === 'function';
}

function isSetLike(obj: any): boolean {
  return obj && typeof obj === 'object' && typeof obj.values === 'function' && typeof obj.has === 'function' && !isMapLike(obj) && typeof obj.get !== 'function';
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

function pushOverviewsFromValue(out: AppOverview[], value: any): void {
  if (Array.isArray(value)) { pushNormalizedFromIterable(out, value); return; }
  if (value && typeof value === "object") {
    pushNormalizedFromIterable(out, Object.values(value as Record<string, unknown>));
  }
}

function pushOverviewsFromMethods(out: AppOverview[], store: any): void {
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

const DEEP_APPID_NUMBER_KEYS = ["appid", "appId", "nAppID", "m_unAppID"];
const DEEP_APPID_CHILD_KEY_RE = /(apps|appids|items|list|entries|children|rgAppIDs|m_rgAppIDs|rgItems|m_rgItems)/i;

function pushDirectAppId(value: any, out: number[]): void {
  for (const k of DEEP_APPID_NUMBER_KEYS) {
    const v = Number(value?.[k]);
    if (Number.isFinite(v) && v > 0) { out.push(v); return; }
  }
}

function walkIterableChildren(value: any, depth: number, walk: (v: any, d: number) => void): boolean {
  if (isMapLike(value) || isSetLike(value) || value instanceof Set) {
    for (const entry of value.values()) walk(entry, depth + 1);
    return true;
  }
  if (typeof value[Symbol.iterator] === 'function' && typeof value !== 'string') {
    try { for (const entry of value) walk(entry, depth + 1); return true; } catch {}
  }
  return false;
}

function walkObjectChildren(value: any, depth: number, walk: (v: any, d: number) => void): void {
  for (const [key, child] of Object.entries(value)) {
    if (!child) continue;
    if (DEEP_APPID_CHILD_KEY_RE.test(key) || (depth < 2 && typeof child === "object")) {
      walk(child, depth + 1);
    }
  }
}

function pushIfPositiveNumber(value: number, out: number[]): void {
  if (Number.isFinite(value) && value > 0) out.push(value);
}

function extractAppIdsDeep(node: any, maxDepth = 6): number[] {
  const out: number[] = [];
  const seen = new Set<any>();
  const walk = (value: any, depth = 0) => {
    if (value == null || depth > maxDepth || seen.has(value)) return;
    if (typeof value === "number") { pushIfPositiveNumber(value, out); return; }
    if (typeof value !== "object") return;
    seen.add(value);
    if (Array.isArray(value)) { for (const item of value) walk(item, depth + 1); return; }
    if (walkIterableChildren(value, depth, walk)) return;
    pushDirectAppId(value, out);
    walkObjectChildren(value, depth, walk);
  };
  walk(node, 0);
  return uniqNumbers(out);
}

// Shared field accessors for the collection-node fingerprint walker.
// Using a key-list scan rather than `??` chain so the helper stays at
// complexity ~3 (each `??` in a chain counts as a branch).
const COLLECTION_ID_KEYS = [
  "id", "collectionid", "collectionId", "gid",
  "key", "uuid", "strCollectionID", "m_strCollectionID",
];
const COLLECTION_NAME_KEYS = [
  "name", "displayName", "title", "label", "strName",
];
function readFirstStringField(node: any, keys: string[]): string {
  if (!node) return "";
  for (const k of keys) {
    const v = (node as any)[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}
function anyNeedleSubstring(haystack: string, needles: Set<string>): boolean {
  if (!haystack) return false;
  for (const needle of needles) {
    if (needle && haystack.includes(needle)) return true;
  }
  return false;
}

const DEEP_COLLECTION_CHILD_KEY_RE = /(collect|collection|tab|items|apps|map|list|entries|groups|folders)/i;

function resolveCollectionIdsFromStoreDeep(store: any, idCandidates: string[], nameCandidates: string[]): number[] {
  if (!store) return [];
  const out: number[] = [];
  const visited = new Set<any>();
  const idNeedles = new Set(idCandidates.map((v) => normalizeText(v)).filter(Boolean));
  const idTokenNeedles = new Set(idCandidates.map((v) => normalizeCollectionToken(v)).filter(Boolean));
  const nameNeedles = new Set(nameCandidates.map((v) => normalizeText(v)).filter(Boolean));
  const looksLikeCollectionNode = (node: any): boolean => {
    const rawIdSrc = readFirstStringField(node, COLLECTION_ID_KEYS);
    const rawIdText = normalizeText(rawIdSrc);
    const rawIdToken = normalizeCollectionToken(rawIdSrc);
    const rawName = normalizeText(readFirstStringField(node, COLLECTION_NAME_KEYS));

    if (rawIdText && idNeedles.has(rawIdText)) return true;
    if (rawIdToken && idTokenNeedles.has(rawIdToken)) return true;
    if (rawName && nameNeedles.has(rawName)) return true;
    return anyNeedleSubstring(rawIdText, idNeedles)
      || anyNeedleSubstring(rawIdToken, idTokenNeedles)
      || anyNeedleSubstring(rawName, nameNeedles);
  };

  const walkMapEntries = (node: Map<any, any>, depth: number) => {
    for (const [key, value] of node.entries()) {
      const keyNorm = normalizeText(String(key ?? ""));
      if (idNeedles.has(keyNorm) || nameNeedles.has(keyNorm)) {
        out.push(...extractAppIdsDeep(value, 7));
      }
      walk(value, depth + 1);
    }
  };
  const walkChildKeys = (node: any, depth: number) => {
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue;
      if (DEEP_COLLECTION_CHILD_KEY_RE.test(key) || depth < 2) walk(value, depth + 1);
    }
  };
  const shouldSkipCollectionWalk = (node: any, depth: number): boolean => {
    if (!node || visited.has(node) || depth > 8) return true;
    return typeof node !== "object";
  };
  const walk = (node: any, depth = 0): void => {
    if (shouldSkipCollectionWalk(node, depth)) return;
    visited.add(node);
    if (looksLikeCollectionNode(node)) out.push(...extractAppIdsDeep(node, 7));
    if (Array.isArray(node)) { for (const item of node) walk(item, depth + 1); return; }
    if (node instanceof Map) { walkMapEntries(node, depth); return; }
    if (node instanceof Set) { for (const v of node.values()) walk(v, depth + 1); return; }
    walkChildKeys(node, depth);
  };

  walk(store, 0);
  return uniqNumbers(out);
}

function collectDynamicCollectionStores(): any[] {
  const clients = getSteamClients();
  const hostWindows = getSteamWindows();
  const methodNames = [
    "GetCollections",
    "GetCollectionItems",
    "GetCollectionApps",
    "GetAppsForCollection",
    "GetAppsInCollection",
    "ResolveCollectionApps",
    "GetCollectionAppIDs",
    "GetCollectionByID",
    "GetCollectionById",
    "GetCollection",
  ];

  const base = [
    ...clients.flatMap((sc) => [sc?.Collections, sc?.CollectionStore, sc?.LibraryStore]),
    ...hostWindows.flatMap((win) => [win?.CollectionStore, win?.collectionStore, win?.LibraryStore, win?.TabMasterStore, win?.UnifiDeckStore, win?.UnifyDeckStore]),
  ].filter(Boolean);

  const dynamic: any[] = [];
  for (const hostWindow of hostWindows) {
    try {
      for (const [key, value] of Object.entries(hostWindow ?? {})) {
        const lower = key.toLowerCase();
        if (!/(collect|library|tab|unifi|unify|deck)/.test(lower)) continue;
        if (hasAnyMethod(value, methodNames)) dynamic.push(value);
      }
    } catch {}
  }

  return Array.from(new Set([...base, ...dynamic]));
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

function harvestCollection(out: AppOverview[], coll: any): void {
  const apps = coll?.allApps ?? coll?.visibleApps ?? coll?.apps;
  if (apps) out.push(...extractAppOverviewsFromCandidate(apps));
}

const TYPE_MAP_COLLECTION_KEYS = ['type-games', 'gamesCollection', 'type-shortcuts', 'shortcutsCollection'];

function harvestFromCollectionStoreEntry(out: AppOverview[], cs: any): void {
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

function directMapsFor(hostWindow: any): any[] {
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

function pickGamesCollection(cs: any): any {
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

function tryLookupOverviewInWindow(hostWindow: any, appid: number): AppOverview | null {
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

const COLLECTION_VALUE_APPID_KEYS = ["appid", "appId", "nAppID", "m_unAppID"];

function pickDirectAppIdNumber(val: any): number[] {
  for (const k of COLLECTION_VALUE_APPID_KEYS) {
    const n = Number(val?.[k]);
    if (Number.isFinite(n) && n > 0) return [n];
  }
  return [];
}

function isAnySetLike(v: any): boolean { return isSetLike(v) || v instanceof Set; }
function isAnyMapLike(v: any): boolean { return isMapLike(v) || v instanceof Map; }

function collectIdsFromCollectionValue(val: any): number[] {
  if (!val) return [];
  if (typeof val === "number") return Number.isFinite(val) && val > 0 ? [val] : [];
  if (Array.isArray(val)) return val.flatMap(collectIdsFromCollectionValue);
  if (isAnySetLike(val) || isAnyMapLike(val)) return Array.from(val.values()).flatMap(collectIdsFromCollectionValue);
  if (typeof val === "object") return pickDirectAppIdNumber(val);
  return [];
}

function extractCollectionAppIds(raw: any): number[] {
  if (!raw || typeof raw !== "object") return [];
  const idsFromValue = (val: any): number[] => collectIdsFromCollectionValue(val);
  // Try direct well-known fields first (depth-0 only = no cross-contamination)
  for (const key of ["apps", "added", "m_rgApps", "rgApps", "appids", "allApps", "visibleApps"]) {
    const val = (raw as any)[key];
    if (val) {
      const ids = uniqNumbers(idsFromValue(val));
      if (ids.length) return ids;
    }
  }
  // Bounded fallback — depth 3 avoids traversing into sibling collection objects
  return extractAppIdsDeep(raw, 3);
}

function collectFromCachedRaw(ids: number[], idCandidates: string[], nameCandidates: string[]): void {
  for (const raw of getCachedCollectionRawCandidates(idCandidates, nameCandidates)) {
    ids.push(...extractCollectionAppIds(raw));
  }
}

async function tryClientCollectionFetch(fn: any, id: string, out: number[]): Promise<void> {
  if (typeof fn !== "function") return;
  try {
    const res = await fn(id);
    if (Array.isArray(res)) out.push(...res.map((x: any) => Number(x.appid ?? x)));
  } catch {}
}

async function collectFromSteamClients(ids: number[], idCandidates: string[]): Promise<void> {
  for (const sc of getSteamClients()) {
    const collFn = sc?.Collections?.GetCollectionItems?.bind(sc.Collections);
    const storeFn = sc?.CollectionStore?.GetCollectionApps?.bind(sc.CollectionStore);
    for (const id of idCandidates) {
      await tryClientCollectionFetch(collFn, id, ids);
      await tryClientCollectionFetch(storeFn, id, ids);
    }
  }
}

const COLLECTION_STORE_METHODS = [
  "GetCollectionItems", "GetCollectionApps", "GetAppsForCollection",
  "GetAppsInCollection", "ResolveCollectionApps", "GetCollectionAppIDs",
];
const COLLECTION_STORE_MAP_KEYS = [
  "m_mapCollections", "m_mapCollectionData", "collections", "m_rgCollections", "m_mapTabs",
];
const COLLECTION_RESULT_ARRAY_KEYS = ["apps", "appids", "items", "list", "entries"];

function pickResultArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== "object") return [];
  for (const k of COLLECTION_RESULT_ARRAY_KEYS) {
    const arr = result[k];
    if (Array.isArray(arr)) return arr;
  }
  return [];
}

async function harvestStoreMethodResults(store: any, idCandidates: string[], out: number[]): Promise<void> {
  for (const method of COLLECTION_STORE_METHODS) {
    const fn = store?.[method];
    if (typeof fn !== "function") continue;
    for (const id of idCandidates) {
      try {
        const arr = pickResultArray(await fn.call(store, id));
        out.push(...arr.map((x: any) => Number(x?.appid ?? x?.appId ?? x)));
      } catch {}
    }
  }
}

function harvestStoreMapEntries(store: any, idCandidates: string[], out: number[]): void {
  try {
    for (const key of COLLECTION_STORE_MAP_KEYS) {
      const candidate = store?.[key];
      if (!candidate) continue;
      for (const id of idCandidates) {
        const entry = candidate instanceof Map ? candidate.get(id) : candidate?.[id];
        if (entry) out.push(...extractCollectionAppIds(entry));
      }
    }
  } catch {}
}

async function collectFromDynamicStores(ids: number[], idCandidates: string[], nameCandidates: string[]): Promise<void> {
  const stores = collectDynamicCollectionStores();
  for (const store of stores) {
    await harvestStoreMethodResults(store, idCandidates, ids);
    harvestStoreMapEntries(store, idCandidates, ids);
    try { ids.push(...resolveCollectionIdsFromStoreDeep(store, idCandidates, nameCandidates)); } catch {}
  }
}

async function getCollectionApps(collectionId: string, collectionNameHint = ""): Promise<number[]> {
  const ids: number[] = [];
  const idCandidates = candidateCollectionIds(collectionId);
  const nameCandidates = [collectionNameHint].filter(Boolean);

  collectFromCachedRaw(ids, idCandidates, nameCandidates);
  if (!ids.length) {
    try {
      await listCollections();
      collectFromCachedRaw(ids, idCandidates, nameCandidates);
    } catch {}
  }
  await collectFromSteamClients(ids, idCandidates);
  if (!ids.length) await collectFromDynamicStores(ids, idCandidates, nameCandidates);
  return uniqNumbers(ids);
}

function isDeckCompatMatch(cat: number | undefined, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  const map: Record<string, number[]> = {
    verified: [3], playable: [2], unsupported: [1], unknown: [0]
  };
  const cats = allowed.flatMap((k) => map[k] ?? []);
  if (cats.length === 0) return true;
  return cat != null && cats.includes(cat);
}

export type CustomFilter = {
  favorites?: boolean;
  hidden?: boolean | "only";
  nonSteam?: boolean;
  installed?: boolean;
  playedWithinDays?: number;
  nameIncludes?: string;
  nameRegex?: string;
  deckCompatibility?: Array<"verified" | "playable" | "unsupported" | "unknown">;
  sort?: "alphabetical" | "recent" | "playtime" | "release_date" | "size_on_disk" | "metacritic" | "review_score" | "added";
  minPlaytimeMinutes?: number;
  maxPlaytimeMinutes?: number;
  updatePending?: boolean;
};

const FAVORITES_LOCALIZED_NAMES = [
  "Favorites", "Favoris", "Favoriten", "Favoritos", "Preferiti",
  "Избранное", "Ulubione", "Favorieten", "Favoriler", "Обране",
  "お気に入り", "즐겨찾기", "收藏夹",
];
const FAVORITES_INTERNAL_IDS = ["favorite", "favorites", "user-collections-favorite"];
const FAVORITES_CLIENT_METHODS = ["GetFavoriteCollectionApps", "GetFavoriteApps", "GetFavoriteAppIDs"];

function favoritesFromCollectionStore(): number[] {
  for (const win of getSteamWindows()) {
    try {
      const cs = (win as any)?.collectionStore;
      if (!cs) continue;
      const favColl = cs.favoriteCollection ?? cs.GetCollection?.("favorite");
      if (!favColl) continue;
      const ids = extractCollectionAppIds(favColl);
      if (ids.length) return ids;
    } catch {}
  }
  return [];
}

async function favoritesFromClientApi(): Promise<number[]> {
  for (const sc of getSteamClients()) {
    for (const method of FAVORITES_CLIENT_METHODS) {
      try {
        const fn = (sc?.Collections as any)?.[method];
        if (typeof fn !== "function") continue;
        const res = await fn.call(sc.Collections);
        if (Array.isArray(res) && res.length) {
          return res.map((x: any) => Number(x?.appid ?? x)).filter(Number.isFinite);
        }
      } catch {}
    }
  }
  return [];
}

async function favoritesFromAllCollections(): Promise<number[]> {
  try {
    const collections = await listCollections();
    const needles = new Set([...FAVORITES_LOCALIZED_NAMES.map((n) => normalizeText(n)), ...FAVORITES_INTERNAL_IDS]);
    for (const coll of collections) {
      if (!needles.has(normalizeText(coll.id)) && !needles.has(normalizeText(coll.name))) continue;
      const ids = await getCollectionApps(coll.id, coll.name);
      if (ids.length) return ids;
    }
  } catch {}
  return [];
}

async function getFavoritesCollectionAppIds(): Promise<number[]> {
  const fromStore = favoritesFromCollectionStore();
  if (fromStore.length) return fromStore;
  const fromClient = await favoritesFromClientApi();
  if (fromClient.length) return fromClient;
  return favoritesFromAllCollections();
}

async function resolveFavoritesTab(all: AppOverview[]): Promise<AppOverview[]> {
  const byFlag = all.filter((a) => isFavoriteOf(a));
  if (byFlag.length > 0) return byFlag;
  const favIds = await getFavoritesCollectionAppIds();
  if (!favIds.length) return byFlag;
  const favSet = new Set(favIds);
  return all.filter((a) => favSet.has(appIdOf(a)));
}

function resolveInstalledTab(all: AppOverview[]): AppOverview[] {
  // Mirror native "installed" tab: drop non-Steam shortcuts + non-game
  // app types (Proton, runtime, tools).
  return all.filter((a) =>
    isInstalledOf(a) && !isNonSteamOf(a) && (a.app_type === undefined || a.app_type === 1),
  );
}

const TAB_DYNAMIC_TAG_FIELDS = ["tab", "tab_name", "collection_name", "category"];

function resolveByTags(all: AppOverview[], id: string): AppOverview[] {
  return all.filter((a: any) => {
    const tagList: string[] = [];
    for (const k of TAB_DYNAMIC_TAG_FIELDS) tagList.push(String(a?.[k] ?? ""));
    if (Array.isArray(a?.tags)) for (const t of a.tags) tagList.push(String(t ?? ""));
    return tagList.map(slugifyTab).filter(Boolean).includes(id);
  });
}

function extractIdsFromCollectionEntry(col: any): Set<number> | null {
  const appsSet = col?.allApps ?? col?.m_rgApps;
  if (appsSet instanceof Set) {
    return new Set(Array.from(appsSet).map(Number).filter(Number.isFinite));
  }
  if (Array.isArray(appsSet) && appsSet.length) {
    return new Set(appsSet.map((a: any) => Number(a?.appid ?? a)).filter(Number.isFinite));
  }
  return null;
}

function lookupRawCollection(tab: string, id: string): any {
  const cs = (globalThis as any).collectionStore;
  const rawMap = cs?.m_mapCollectionsFromStorage ?? cs?.collectionsFromStorage;
  if (!rawMap || typeof rawMap.get !== 'function') return null;
  return rawMap.get(tab) ?? rawMap.get(id);
}

function resolveFromCollectionStoreRaw(tab: string, id: string, all: AppOverview[]): AppOverview[] | null {
  try {
    const col = lookupRawCollection(tab, id);
    if (!col) return null;
    const ids = extractIdsFromCollectionEntry(col);
    if (!ids || ids.size === 0) return null;
    return all.filter((a) => ids.has(appIdOf(a)));
  } catch { return null; }
}

const RECENT_SORTERS: Record<string, true> = { recent: true, all_apps_recent: true, allrecentapps: true };

const ALL_TAB_IDS = new Set(["all", "all_games", "allgames"]);
const NONSTEAM_TAB_IDS = new Set(["nonsteam", "epic", "gog"]);
const INSTALLED_TAB_IDS = new Set(["installed", "great_on_deck"]);

function tabIdFromPath(tab: string): string {
  return slugifyTab(tab.startsWith("/") ? tab.split("/").pop() || tab : tab);
}

function tryDirectTabResolution(id: string, all: AppOverview[]): AppOverview[] | Promise<AppOverview[]> | null {
  if (ALL_TAB_IDS.has(id)) return all;
  if (id === "favorites") return resolveFavoritesTab(all);
  if (id === "hidden") return all.filter((a) => isHiddenOf(a));
  if (NONSTEAM_TAB_IDS.has(id)) return all.filter((a) => isNonSteamOf(a));
  if (INSTALLED_TAB_IDS.has(id)) return resolveInstalledTab(all);
  if (RECENT_SORTERS[id]) return all.slice().sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a));
  return null;
}

async function resolveDynamicTab(tab: string, all: AppOverview[]): Promise<AppOverview[]> {
  const id = tabIdFromPath(tab);
  const direct = tryDirectTabResolution(id, all);
  if (direct) return await direct;
  const byTab = resolveByTags(all, id);
  if (byTab.length) return byTab;
  return resolveFromCollectionStoreRaw(tab, id, all) ?? byTab;
}

// Pre-fetched data passed into the synchronous filter evaluator so async
// collection lookups can happen before evaluation begins.
type FilterEvalContext = {
  collectionAppIds: Map<string, Set<number>>;
};

function pushCollectionIdFromItem(item: FilterItem, ids: string[]): void {
  if (item.type !== "collection") return;
  const id = String(item.params?.collectionId ?? "").trim();
  if (id) ids.push(id);
}

function pushMergeCollectionIds(item: FilterItem, ids: string[]): void {
  if (item.type !== "merge" || !Array.isArray(item.params?.items)) return;
  ids.push(...collectCollectionIdsFromGroup({ mode: item.params.mode ?? "and", items: item.params.items as FilterItem[] }));
}

function collectCollectionIdsFromGroup(group: FilterGroup): string[] {
  const ids: string[] = [];
  for (const item of group.items ?? []) {
    pushCollectionIdFromItem(item, ids);
    pushMergeCollectionIds(item, ids);
  }
  return ids;
}

// Pre-warm developer/publisher caches before evaluation — without
// this, dev/pub filters return zero matches on the home.
function filterGroupNeedsDevPubPreload(group: FilterGroup): { needsDev: boolean; needsPub: boolean } {
  let needsDev = false;
  let needsPub = false;
  const walk = (g: FilterGroup) => {
    for (const item of g.items ?? []) {
      if (item.type === "developer") needsDev = true;
      else if (item.type === "publisher") needsPub = true;
      else if (item.type === "merge" && Array.isArray(item.params?.items)) {
        walk({ mode: (item.params.mode ?? "and") as "and" | "or", items: item.params.items as FilterItem[] });
      }
    }
  };
  walk(group);
  return { needsDev, needsPub };
}

// Per-type filter evaluators (dispatch table).
type FilterEvaluator = (item: FilterItem, app: AppOverview, ctx?: FilterEvalContext) => boolean;

function evalHidden(item: FilterItem, app: AppOverview): boolean {
  const mode = item.params?.mode ?? "exclude";
  if (mode === "only") return isHiddenOf(app);
  if (mode === "exclude") return !isHiddenOf(app);
  return true;
}

function evalAppStatus(item: FilterItem, app: AppOverview): boolean {
  const groups: string[] = Array.isArray(item.params?.groups) ? item.params!.groups : [];
  let ds = (app as any).display_status as number | undefined;
  /* Non-Steam shortcuts (e.g. Unifideck) usually carry no per-client
     display_status, so a status filter would match nothing. Synthesize
     installed / not-installed from the install heuristic so the installed_idle
     and not_installed groups work for them too. */
  if ((ds === undefined || ds === 0) && isNonSteamOf(app)) {
    ds = isInstalledOf(app) ? EAppDisplayStatus.Installed : EAppDisplayStatus.NotInstalled;
  }
  return groups.some((g) => {
    const statuses = APP_STATUS_GROUPS[g as keyof typeof APP_STATUS_GROUPS];
    return statuses ? statuses.includes(ds as number) : false;
  });
}

function evalIsNew(_item: FilterItem, app: AppOverview): boolean {
  const a = app as any;
  const added = Number(a.rt_purchased_time ?? a.rt_recent_activity_time ?? a.user_added_ts ?? a.rt_store_asset_mtime ?? 0);
  if (!added || !Number.isFinite(added)) return false;
  const addedMs = added < 1e12 ? added * 1000 : added;
  return (Date.now() - addedMs) < 14 * 24 * 60 * 60 * 1000;
}

function evalPlayedWithinDays(item: FilterItem, app: AppOverview): boolean {
  const days = Number(item.params?.days ?? 7);
  const now = Math.floor(Date.now() / 1000);
  const min = now - Math.floor(days * 86400);
  return lastPlayedOf(app) >= min;
}

function evalPlaytimeRange(item: FilterItem, app: AppOverview): boolean {
  const minHours: number | undefined = item.params?.minHours;
  const maxHours: number | undefined = item.params?.maxHours;
  const playtimeMinutes = app.playtime_forever ?? 0;
  if (typeof minHours === "number" && playtimeMinutes < minHours * 60) return false;
  if (typeof maxHours === "number" && playtimeMinutes > maxHours * 60) return false;
  return true;
}

function evalNameIncludes(item: FilterItem, app: AppOverview): boolean {
  const text = String(item.params?.text ?? "").toLowerCase();
  return !text || appNameOf(app).toLowerCase().includes(text);
}

function evalNameRegex(item: FilterItem, app: AppOverview): boolean {
  const pattern = String(item.params?.pattern ?? "");
  if (!pattern) return true;
  try { return new RegExp(pattern, "i").test(appNameOf(app)); }
  catch { return true; }
}

function evalCollection(item: FilterItem, app: AppOverview, ctx?: FilterEvalContext): boolean {
  const colId = String(item.params?.collectionId ?? "").trim();
  if (!colId) return true; // half-configured: don't restrict
  /* Missing entry = lookup failed or returned 0 apps. Exclude (issue #55:
     pass-through here previously leaked the entire library when Bazzite-shaped
     collectionStore returned empty). */
  const appSet = ctx?.collectionAppIds.get(colId);
  return appSet ? appSet.has(app.appid) : false;
}

function evalMerge(item: FilterItem, app: AppOverview, ctx?: FilterEvalContext): boolean {
  const subItems: FilterItem[] = Array.isArray(item.params?.items) ? (item.params.items as FilterItem[]) : [];
  const subMode = ((item.params?.mode ?? "and") as "and" | "or");
  return evaluateFilterGroup({ mode: subMode, items: subItems }, [app], ctx).length > 0;
}

function evalDeveloper(item: FilterItem, app: AppOverview): boolean {
  const selected: string[] = Array.isArray(item.params?.developers) ? item.params.developers : [];
  if (!selected.length) return true;
  const dev = getAppDeveloperCached(app.appid);
  return selected.some((d) => d.toLowerCase() === dev.toLowerCase());
}

function evalPublisher(item: FilterItem, app: AppOverview): boolean {
  const selected: string[] = Array.isArray(item.params?.publishers) ? item.params.publishers : [];
  if (!selected.length) return true;
  const pub = getAppPublisherCached(app.appid);
  return selected.some((p) => p.toLowerCase() === pub.toLowerCase());
}

function evalAppIdList(item: FilterItem, app: AppOverview): boolean {
  const ids: number[] = Array.isArray(item.params?.appIds) ? item.params.appIds.map(Number).filter(Number.isFinite) : [];
  if (!ids.length) return true;
  return ids.includes(app.appid);
}

function evalControllerSupport(item: FilterItem, app: AppOverview): boolean {
  // nControllerSupport: 0 = none, 1 = partial, 2 = full
  const n = Number(app.controller_support ?? 0);
  const min = Number(item.params?.min ?? 1);
  return Number.isFinite(n) && n >= min;
}

// EAppType bit-flag enum (Steam client). Lookup table replaces the
// linear if-chain so adding a new kind drops to "one row".
const APP_TYPE_BY_KIND: Record<string, number> = {
  software: 2, application: 2,
  demo: 8, dlc: 32, guide: 64, driver: 128, config: 256, hardware: 512,
  video: 2048, music: 8192, soundtrack: 8192, comic: 32768, beta: 65536,
};
const NON_TOOL_APP_TYPES = new Set<number>([1, 2, 8, 32, 64, 128, 256, 512, 2048, 8192, 32768, 65536]);

function matchesShortcutKind(kind: string, app: AppOverview): boolean {
  const nonSteam = isNonSteamOf(app);
  if (kind === "link") return nonSteam;
  if (nonSteam) return false;
  const t = app.app_type;
  if (kind === "game") return t === undefined || t === 1;
  if (kind === "tool") {
    // Tool matches explicit type 4 OR any non-1/2/8/32/.../65536 Steam app
    // (legacy "anything not recognised" semantics).
    return t === 4 || (t !== undefined && !NON_TOOL_APP_TYPES.has(t));
  }
  const expected = APP_TYPE_BY_KIND[kind];
  return expected !== undefined && t === expected;
}

function evalShortcutType(item: FilterItem, app: AppOverview): boolean {
  const kinds: string[] = Array.isArray(item.params?.kinds) ? item.params.kinds : ["game"];
  return kinds.some((k) => matchesShortcutKind(k, app));
}

function readPriceCacheEntry(appid: number): { discount?: number; unpriced?: boolean } | null | "bootstrap" {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.("ds-price-cache-v1");
    if (!raw) return "bootstrap";
    const cache: Record<number, { ts: number; data: { discount?: number; unpriced?: boolean } }> = JSON.parse(raw);
    return cache[appid]?.data ?? null;
  } catch { return null; }
}

function discountInBounds(entry: { discount?: number; unpriced?: boolean }, item: FilterItem): boolean {
  if (entry.unpriced === true) return false;
  const disc = entry.discount ?? 0;
  const min = Number(item.params?.minDiscount ?? 0);
  const max = Number(item.params?.maxDiscount ?? 100);
  return disc >= min && disc <= max;
}

function evalDiscount(item: FilterItem, app: AppOverview): boolean {
  const appid = appIdOf(app);
  if (!appid) return false;
  const entry = readPriceCacheEntry(appid);
  if (entry === "bootstrap") return true;
  return !!entry && discountInBounds(entry, item);
}

function evalFriendsPlayingNow(_item: FilterItem, app: AppOverview): boolean {
  try {
    const appid = appIdOf(app);
    if (!appid) return false;
    const { getFriendsPlayingAppIds } = require("../runtime/friendsState") as typeof import("../runtime/friendsState");
    return getFriendsPlayingAppIds().has(appid);
  } catch { return false; }
}

function evalFriendsPlayedRecently(item: FilterItem, app: AppOverview): boolean {
  try {
    const appid = appIdOf(app);
    if (!appid) return false;
    const days = Number(item.params?.days ?? 14);
    if (!Number.isFinite(days) || days <= 0) return false;
    const { getFriendsRecentlyPlayedAppIds } = require("../runtime/friendsState") as typeof import("../runtime/friendsState");
    return getFriendsRecentlyPlayedAppIds().has(appid);
  } catch { return false; }
}

const FILTER_EVALUATORS: Record<string, FilterEvaluator> = {
  installed:              (_i, app) => isInstalledOf(app),
  favorites:              (_i, app) => isFavoriteOf(app),
  nonSteam:               (_i, app) => isNonSteamOf(app),
  hidden:                 evalHidden,
  updatePending:          (_i, app) => app.update_pending === true,
  appStatus:              evalAppStatus,
  isNew:                  evalIsNew,
  deckCompatibility:      (item, app) => isDeckCompatMatch(app.deck_compatibility_category, item.params?.levels ?? []),
  playedWithinDays:       evalPlayedWithinDays,
  playtimeRange:          evalPlaytimeRange,
  nameIncludes:           evalNameIncludes,
  nameRegex:              evalNameRegex,
  collection:             evalCollection,
  merge:                  evalMerge,
  developer:              evalDeveloper,
  publisher:              evalPublisher,
  appIdList:              evalAppIdList,
  cloudAvailable:         (_i, app) => app.cloud_available === true,
  controllerSupport:      evalControllerSupport,
  shortcutType:           evalShortcutType,
  discount:               evalDiscount,
  friendsPlayingNow:      evalFriendsPlayingNow,
  friendsPlayedRecently:  evalFriendsPlayedRecently,
};

function evalDefault(item: FilterItem, app: AppOverview): boolean {
  /* first-party Filter v3 evaluators live in a
     sibling module to keep `evaluateFilterItem` lean. Lookup hits
     before falling through to external plugin filters; v3 ids are
     first-party so their handler must take precedence. */
  try {
    const { FILTER_V3_EVALUATORS } = require("./v3Extensions") as typeof import("./v3Extensions");
    const v3 = FILTER_V3_EVALUATORS[item.type as string];
    if (v3) return v3(item, app);
  } catch { /* fall through */ }
  // External plugin filter or unknown type. Unknown + unregistered →
  // pass-through (true) so an unregistered plugin filter doesn't hide
  // the user's entire library.
  try {
    if (hasExternalFilterType(item.type as string)) {
      return evaluateExternalFilter(item.type as string, toPublicAppMeta(app), item.params ?? {});
    }
  } catch { /* fall through */ }
  return true;
}

function evaluateFilterItem(item: FilterItem, app: AppOverview, ctx?: FilterEvalContext): boolean {
  const evaluator = FILTER_EVALUATORS[item.type] ?? evalDefault;
  const result = evaluator(item, app, ctx);
  return item.inverted ? !result : result;
}

export function evaluateFilterGroup(group: FilterGroup, apps: AppOverview[], ctx?: FilterEvalContext): AppOverview[] {
  if (!group.items || group.items.length === 0) return apps;
  const mode = group.mode ?? "and";
  if (mode === "or") {
    return apps.filter((app) => group.items.some((item) => evaluateFilterItem(item, app, ctx)));
  }
  return apps.filter((app) => group.items.every((item) => evaluateFilterItem(item, app, ctx)));
}

function readUnifideckPlatformLabel(c: any): string | null {
  const name = String(c?.displayName ?? c?.m_strName ?? "");
  const m = name.match(/^\[Unifideck\]\s+(.+)/i);
  if (!m) return null;
  return m[1].trim().toLowerCase();
}

function indexAppsToPlatform(c: any, platform: string, map: Map<number, string>): void {
  const apps = c?.allApps ?? c?.m_rgApps ?? [];
  for (const a of apps) {
    const n = Number(a?.appid);
    if (Number.isFinite(n)) map.set(n, platform);
  }
}

function buildNonSteamPlatformMap(): Map<number, string> {
  const map = new Map<number, string>();
  try {
    const cs: any = (globalThis as any).collectionStore;
    // Raw storage map, not the `userCollections` computed (MobX-unsafe).
    for (const c of readCollectionList(cs)) {
      const platform = readUnifideckPlatformLabel(c);
      if (!platform) continue;
      indexAppsToPlatform(c, platform, map);
    }
  } catch {}
  return map;
}

function deduplicateNonSteam(ids: number[], all: AppOverview[]): number[] {
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const id = appIdOf(a); if (id) byId.set(id, a); }
  const platformMap = buildNonSteamPlatformMap();
  const seen = new Set<string>();
  return ids.filter((id) => {
    const app = byId.get(id);
    if (!app || !isNonSteamOf(app)) return true;
    const name = normalizeText(appNameOf(app));
    if (!name) return false;
    const platform = platformMap.get(id) ?? "";
    const key = `${name}\x00${platform}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Random sort is stable for 24h per unique game set to avoid constant reshuffling.
const RANDOM_SORT_TTL = 24 * 60 * 60 * 1000;

function hashIdSet(ids: number[]): string {
  const sorted = ids.slice().sort((a, b) => a - b);
  let h = 5381;
  for (const id of sorted) { h = ((h << 5) + h + (id & 0xffff)) & 0xffffffff; }
  return (h >>> 0).toString(16);
}

function stableShuffleIds(ids: number[], cacheKey: string, shelfId?: string): number[] {
  // Per-shelf namespacing so two shelves with the same id set get
  // independent shuffles; legacy global key when shelfId is omitted.
  const lsKey = shelfId ? `ds-random-${shelfId}-${cacheKey}` : `ds-random-${cacheKey}`;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const { ts, order } = JSON.parse(raw);
      if (Date.now() - ts < RANDOM_SORT_TTL && Array.isArray(order)) {
        const outSet = new Set<number>(order);
        if (order.length === ids.length && ids.every(id => outSet.has(id))) return order;
      }
    }
  } catch {}
  const shuffled = ids.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  try { localStorage.setItem(lsKey, JSON.stringify({ ts: Date.now(), order: shuffled })); } catch {}
  return shuffled;
}

export function invalidateRandomSortCache(shelfId?: string): void {
  try {
    const prefix = shelfId ? `ds-random-${shelfId}-` : `ds-random-`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {}
}

export function applyManualOrder(ids: number[], manualOrder?: number[], hiddenAppIds?: number[]): number[] {
  if (!manualOrder?.length) return ids;
  // In-source entries lead (drag-order); source items not drag-ordered
  // follow; entries the source doesn't cover (e.g. via "Add to shelf"
  // menu) go at the end. Hidden entries dropped from both branches.
  const hidden = hiddenAppIds?.length ? new Set(hiddenAppIds) : null;
  const idSet = new Set(ids);
  const inSource: number[] = [];
  const notInSource: number[] = [];
  const seen = new Set<number>();
  for (const id of manualOrder) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (hidden && hidden.has(id)) continue;
    if (idSet.has(id)) inSource.push(id);
    else notInSource.push(id);
  }
  const rest = ids.filter((id) => !seen.has(id));
  return [...inSource, ...rest, ...notInSource];
}

// Comparator for a single sort key. Returns null for `manual`/`random`
// so the multi-key path drops them. Price keys use the pre-warmed
// priceMap passed in by the caller.
type PriceMap = ReadonlyMap<number, { price: number; originalPrice: number; discount: number }>;
type Cmp = (a: AppOverview, b: AppOverview) => number;

const KEY_COMPARATOR_BUILDERS: Record<string, () => Cmp> = {
  recent: () => (a, b) => lastPlayedOf(b) - lastPlayedOf(a),
  playtime: () => (a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0),
  release_date: () => (a, b) => ((b as any).rt_original_release_date ?? 0) - ((a as any).rt_original_release_date ?? 0),
  size_on_disk: () => (a, b) => Number((b as any).size_on_disk ?? 0) - Number((a as any).size_on_disk ?? 0),
  metacritic: () => (a, b) => ((b as any).metacritic_score ?? 0) - ((a as any).metacritic_score ?? 0),
  review_score: () => (a, b) => ((b as any).review_percentage ?? 0) - ((a as any).review_percentage ?? 0),
  added: () => compareByAdded,
  app_status: () => (a, b) => ((a as any).display_status ?? 0) - ((b as any).display_status ?? 0),
  deck_compat: () => (a, b) => ((b as any).deck_compatibility_category ?? 0) - ((a as any).deck_compatibility_category ?? 0),
  controller_support: () => (a, b) => ((b as any).controller_support ?? 0) - ((a as any).controller_support ?? 0),
};

function priceComparator(key: string, priceMap: PriceMap): Cmp {
  if (key === "price_low") return (a, b) => {
    const pa = priceMap.get(appIdOf(a)); const pb = priceMap.get(appIdOf(b));
    return (pa ? pa.price : 999999) - (pb ? pb.price : 999999);
  };
  if (key === "discount_high") return (a, b) => {
    const pa = priceMap.get(appIdOf(a)); const pb = priceMap.get(appIdOf(b));
    return (pb ? pb.discount : 0) - (pa ? pa.discount : 0);
  };
  return (a, b) => {
    const pa = priceMap.get(appIdOf(a)); const pb = priceMap.get(appIdOf(b));
    return (pb ? pb.originalPrice : 0) - (pa ? pa.originalPrice : 0);
  };
}

const alphaCmp: Cmp = (a, b) =>
  String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b)));

function buildBaseComparator(key: string, priceMap?: PriceMap): Cmp {
  const builder = KEY_COMPARATOR_BUILDERS[key];
  if (builder) return builder();
  if (key === "price_low" || key === "discount_high" || key === "original_price_high") {
    return priceMap ? priceComparator(key, priceMap) : alphaCmp;
  }
  // alphabetical OR unknown external key — degrade to alphabetical.
  return alphaCmp;
}

function buildKeyComparator(key: string, isReversed: boolean, priceMap?: PriceMap): Cmp | null {
  if (key === "manual" || key === "random") return null;
  const base = buildBaseComparator(key, priceMap);
  if (!isReversed) return base;
  return (a, b) => -base(a, b);
}

function readAppOverviewFromWindow(win: any, id: number): AppOverview | null {
  try {
    const raw = win?.appStore?.GetAppOverviewByAppID?.(id)
      ?? win?.AppStore?.GetAppOverviewByAppID?.(id);
    return raw ?? null;
  } catch { return null; }
}

function sortPoolLookup(id: number): AppOverview | null {
  for (const win of getSteamWindows()) {
    const raw = readAppOverviewFromWindow(win, id);
    if (raw) return raw;
  }
  return null;
}

function buildSortByIdMap(all: AppOverview[]): Map<number, AppOverview> {
  const byId = new Map<number, AppOverview>();
  for (const app of all) {
    const id = appIdOf(app);
    if (id && Number.isFinite(id)) byId.set(id, app);
  }
  return byId;
}

// Per-id raw lookup for ids missing from `all` — without this, owned
// ids that fell out of the lean `all` would silently disappear.
function hydrateAppsForSort(ids: number[], byId: Map<number, AppOverview>): AppOverview[] {
  return ids.map((id) => byId.get(id) ?? sortPoolLookup(id) ?? ({ appid: id } as unknown as AppOverview)) as AppOverview[];
}

function applyMultiKeySort(
  ids: number[],
  keys: string[],
  all: AppOverview[],
  shelfId: string | undefined,
  reverse: boolean | boolean[] | undefined,
  priceMap: ReadonlyMap<number, { price: number; originalPrice: number; discount: number }> | undefined,
): number[] {
  if (keys.length === 1) {
    const r = Array.isArray(reverse) ? !!reverse[0] : reverse;
    return applySortToIds(ids, keys[0], all, shelfId, r, priceMap);
  }
  const comparators: ((a: AppOverview, b: AppOverview) => number)[] = [];
  keys.forEach((k, i) => {
    const r = Array.isArray(reverse) ? !!reverse[i] : !!reverse;
    const cmp = buildKeyComparator(k, r, priceMap);
    if (cmp) comparators.push(cmp);
  });
  if (comparators.length === 0) return ids.slice();
  const apps = hydrateAppsForSort(ids, buildSortByIdMap(all));
  apps.sort((a, b) => {
    for (const cmp of comparators) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });
  return apps.map((a) => appIdOf(a)).filter(Number.isFinite);
}

function alphaCompare(a: AppOverview, b: AppOverview): number {
  return String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b)));
}

type AppComparator = (a: AppOverview, b: AppOverview) => number;

const SINGLE_SORT_COMPARATORS: Record<string, AppComparator> = {
  recent: (a, b) => lastPlayedOf(b) - lastPlayedOf(a),
  playtime: (a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0),
  release_date: (a, b) => ((b as any).rt_original_release_date ?? 0) - ((a as any).rt_original_release_date ?? 0),
  size_on_disk: (a, b) => Number((b as any).size_on_disk ?? 0) - Number((a as any).size_on_disk ?? 0),
  metacritic: (a, b) => ((b as any).metacritic_score ?? 0) - ((a as any).metacritic_score ?? 0),
  review_score: (a, b) => ((b as any).review_percentage ?? 0) - ((a as any).review_percentage ?? 0),
  added: compareByAdded,
  app_status: (a, b) => ((a as any).display_status ?? 0) - ((b as any).display_status ?? 0),
  deck_compat: (a, b) => ((b as any).deck_compatibility_category ?? 0) - ((a as any).deck_compatibility_category ?? 0),
  controller_support: (a, b) => ((b as any).controller_support ?? 0) - ((a as any).controller_support ?? 0),
  alphabetical: alphaCompare,
  price_low: alphaCompare,
  discount_high: alphaCompare,
  original_price_high: alphaCompare,
};

function sortByExternalOrRandom(
  sort: string,
  ids: number[],
  apps: AppOverview[],
  byId: Map<number, AppOverview>,
  shelfId?: string,
): AppOverview[] {
  if (sort === "random") {
    const shuffled = stableShuffleIds(ids, hashIdSet(ids), shelfId);
    return shuffled.map(id => byId.get(id)).filter(Boolean) as AppOverview[];
  }
  let externalIds: number[] | null = null;
  try {
    if (hasExternalSortOption(sort)) {
      externalIds = applyExternalSort(sort, ids, apps.map(toPublicAppMeta));
    }
  } catch {}
  if (externalIds) {
    const order = new Map(externalIds.map((id, idx) => [id, idx] as const));
    return apps.slice().sort((a, b) => (order.get(appIdOf(a)) ?? 1e9) - (order.get(appIdOf(b)) ?? 1e9));
  }
  return apps.slice().sort(alphaCompare);
}

export function applySortToIds(
  ids: number[],
  sort: string | string[],
  all: AppOverview[],
  shelfId?: string,
  reverse?: boolean | boolean[],
  priceMap?: ReadonlyMap<number, { price: number; originalPrice: number; discount: number }>,
): number[] {
  if (Array.isArray(sort)) {
    const keys = sort.filter((k) => typeof k === "string" && k.length > 0) as string[];
    if (keys.length === 0) return ids.slice();
    return applyMultiKeySort(ids, keys, all, shelfId, reverse, priceMap);
  }
  // Normalise to a strict boolean — a `[false]` 1-element array is truthy.
  const reverseBool: boolean = Array.isArray(reverse) ? !!reverse[0] : !!reverse;
  const byId = buildSortByIdMap(all);
  const baseApps = hydrateAppsForSort(ids, byId);
  // first-party Sort v3 comparators live in a
  // sibling module; lookup runs before the external-or-random
  // fallback so v3 ids take precedence over registered externals.
  let v3Cmp: ((a: AppOverview, b: AppOverview) => number) | undefined;
  try {
    const { SORT_V3_COMPARATORS } = require("./v3Extensions") as typeof import("./v3Extensions");
    v3Cmp = SORT_V3_COMPARATORS[sort];
  } catch {}
  const cmp = SINGLE_SORT_COMPARATORS[sort] ?? v3Cmp;
  let apps = cmp ? baseApps.slice().sort(cmp) : sortByExternalOrRandom(sort, ids, baseApps, byId, shelfId);
  // Skip reverse for `manual` and `random`.
  if (reverseBool && sort !== "manual" && sort !== "random") apps = apps.reverse();
  return apps.map((a) => appIdOf(a)).filter(Number.isFinite);
}

async function applyPriceSort(ids: number[], sort: "price_low" | "discount_high" | "original_price_high", reverse?: boolean): Promise<number[]> {
  try {
    const { getPriceMap } = await import("../core/onlineStore");
    const priceMap = await getPriceMap(ids);
    const sorted = ids.slice().sort((a, b) => {
      const pa = priceMap.get(a);
      const pb = priceMap.get(b);
      if (sort === "price_low") {
        const va = pa ? pa.price : 999999;
        const vb = pb ? pb.price : 999999;
        return va - vb;
      } else if (sort === "original_price_high") {
        const va = pa ? pa.originalPrice : 0;
        const vb = pb ? pb.originalPrice : 0;
        return vb - va;
      } else {
        const va = pa ? pa.discount : 0;
        const vb = pb ? pb.discount : 0;
        return vb - va;
      }
    });
    return reverse ? sorted.reverse() : sorted;
  } catch {
    return ids;
  }
}

// Composite recursion bound — beyond this, returns [].
const MAX_COMPOSITE_DEPTH = 4;

// Pure merge for composite child results. Round-robin union ensures
// the final overShootLimit slice keeps items from every child instead
// of being dominated by the longest one.
export function mergeCompositeResults(childResults: ReadonlyArray<ReadonlyArray<number>>, combine: "union" | "intersection"): number[] {
  if (childResults.length === 0) return [];
  if (combine === "intersection") {
    const others = childResults.slice(1).map((arr) => new Set(arr));
    const first = childResults[0] ?? [];
    return first.filter((id) => others.every((s) => s.has(id)));
  }
  const seen = new Set<number>();
  const merged: number[] = [];
  const cursors = childResults.map(() => 0);
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (let i = 0; i < childResults.length; i++) {
      const arr = childResults[i];
      // Skip past already-merged ids (de-dupe) until this child yields a
      // fresh entry or exhausts its list.
      while (cursors[i] < arr.length && seen.has(arr[cursors[i]])) cursors[i]++;
      if (cursors[i] < arr.length) {
        const id = arr[cursors[i]++];
        seen.add(id);
        merged.push(id);
        advanced = true;
      }
    }
  }
  return merged;
}

// Shared context passed to each per-source resolver.
type ResolverContext = {
  source: any;
  limit: number;
  sort?: string | string[];
  shelfId?: string;
  sortReverse?: boolean | boolean[];
  options?: { hiddenAppIds?: number[]; dedupeByName?: boolean; onResolveTotal?: (n: number) => void };
  depth: number;
  all: AppOverview[];
  overShootLimit: number;
  finish: (ids: number[]) => number[];
  // Reports the pre-limit match count so callers can decide whether a
  // "See more" affordance is warranted (only some resolvers report it).
  reportTotal?: (n: number) => void;
};

// Report a resolver's pre-limit match count without spreading an optional-call
// branch across every resolver that opts in.
function emitResolvedTotal(ctx: ResolverContext, total: number): void {
  const cb = ctx.reportTotal;
  if (cb) cb(total);
}

type CollectionMatches = { exactMatches: SteamCollection[]; softMatches: SteamCollection[] };

function partitionCollectionsByNeedle(collections: SteamCollection[], rawCollectionId: string): CollectionMatches {
  const needle = normalizeText(rawCollectionId);
  const exactMatches = collections.filter((c) => {
    const id = normalizeText(c.id);
    const name = normalizeText(c.name);
    return id === needle || name === needle;
  });
  const softMatches = exactMatches.length ? [] : collections.filter((c) => {
    const id = normalizeText(c.id);
    const name = normalizeText(c.name);
    return id.includes(needle) || name.includes(needle);
  });
  return { exactMatches, softMatches };
}

async function probeCollectionMatchesForIds(matches: SteamCollection[]): Promise<number[]> {
  for (const match of matches) {
    const probeKeys = Array.from(new Set([match.id, match.name].filter(Boolean)));
    for (const key of probeKeys) {
      const ids = await getCollectionApps(key, match.name);
      if (ids.length) return ids;
    }
  }
  return [];
}

function resolveCollectionByMarkers(rawCollectionId: string, matches: SteamCollection[], all: AppOverview[]): number[] {
  if (!all.length) return [];
  const markers = new Set<string>();
  for (const id of candidateCollectionIds(rawCollectionId)) {
    const marker = normalizeText(id);
    if (marker) markers.add(marker);
  }
  for (const match of matches) {
    const idMarker = normalizeText(match.id);
    const nameMarker = normalizeText(match.name);
    if (idMarker) markers.add(idMarker);
    if (nameMarker) markers.add(nameMarker);
  }
  if (!markers.size) return [];
  return all.filter((app) => appMatchesCollectionMarker(app, markers)).map((app) => appIdOf(app));
}

async function resolveCollectionFallback(rawCollectionId: string, all: AppOverview[]): Promise<number[]> {
  try {
    const collections = await listCollections();
    const { exactMatches, softMatches } = partitionCollectionsByNeedle(collections, rawCollectionId);
    const ordered = [...exactMatches, ...softMatches];
    const probed = await probeCollectionMatchesForIds(ordered);
    if (probed.length) return probed;
    return resolveCollectionByMarkers(rawCollectionId, ordered, all);
  } catch { return []; }
}

function applyCollectionChildFilter(ids: number[], source: any, all: AppOverview[]): number[] {
  const cf = source.childFilter as FilterGroup | undefined;
  if (!cf || !Array.isArray(cf.items) || cf.items.length === 0) return ids;
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
  const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
  return evaluateFilterGroup(cf, candidates).map((a) => appIdOf(a)).filter(Number.isFinite);
}

/* Sort keys whose data (metacritic / review% / release date) is often absent
   from the local overview — non-Steam and uninstalled titles. When selected we
   optionally fetch it online first (gated + bounded + cached in enrichApps). */
const META_SORT_KEYS: ReadonlySet<string> = new Set(["metacritic", "review_score", "release_date"]);

function sortNeedsMeta(sort: unknown): boolean {
  const keys = Array.isArray(sort) ? sort : [sort];
  return keys.some((k) => typeof k === "string" && META_SORT_KEYS.has(k));
}

// Enrich (in place, best-effort) the given app overviews so a metacritic /
// review / release sort has values to work with. No-op unless the sub-toggle
// is on (checked inside enrichApps) and the sort actually needs the metadata.
async function enrichAppsForMetaSort(sort: unknown, apps: AppOverview[]): Promise<void> {
  if (!sortNeedsMeta(sort) || !apps.length) return;
  try {
    const { enrichApps } = require("../core/onlineMetadata") as typeof import("../core/onlineMetadata");
    await enrichApps(apps);
  } catch { /* sort falls back to whatever's local */ }
}

async function enrichForSort(sort: unknown, ids: number[], all: AppOverview[]): Promise<void> {
  if (!sortNeedsMeta(sort) || !ids.length) return;
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
  await enrichAppsForMetaSort(sort, ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[]);
}

async function _resolveCollection(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit } = ctx;
  const rawCollectionId = String(source.collectionId ?? "").trim();
  let ids = await getCollectionApps(rawCollectionId);
  if (!ids.length && rawCollectionId) ids = await resolveCollectionFallback(rawCollectionId, all);
  if (!ids.length) {
    logWarn("STEAM", "resolveShelfAppIds(collection) empty", { collectionId: rawCollectionId, allCount: all.length });
  } else {
    logInfo("STEAM", "resolveShelfAppIds(collection) resolved", { collectionId: rawCollectionId, count: ids.length });
  }
  ids = applyCollectionChildFilter(ids, source, all);
  if (sort) { await enrichForSort(sort, ids, all); ids = applySortToIds(ids, sort, all, shelfId, sortReverse); }
  ids = deduplicateNonSteam(ids, all);
  emitResolvedTotal(ctx, ids.length);
  return finish(ids.slice(0, overShootLimit));
}

function makeNativeInstalledFilter(tabSlug: string, all: AppOverview[]): (ids: number[]) => number[] {
  const matchesNativeInstalled = tabSlug === "installed" || tabSlug === "great_on_deck";
  if (!matchesNativeInstalled) return (ids) => ids;
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
  return (ids) => ids.filter((id) => {
    const a = byId.get(id);
    if (!a || isNonSteamOf(a)) return false;
    return a.app_type === undefined || a.app_type === 1;
  });
}

function makeChildFilterTab(source: any, all: AppOverview[]): (ids: number[]) => number[] {
  const cf = source.childFilter as FilterGroup | undefined;
  if (!cf || !Array.isArray(cf.items) || !cf.items.length) return (ids) => ids;
  const byId = new Map<number, AppOverview>();
  for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
  return (ids) => {
    const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
    return evaluateFilterGroup(cf, candidates).map((a) => appIdOf(a)).filter(Number.isFinite);
  };
}

async function findTabAppIdsByNameOrId(rawTab: string): Promise<number[]> {
  try {
    const tabs = await listLibraryTabs();
    const needle = normalizeText(rawTab);
    const candidates = tabs.filter((tab) => {
      const id = normalizeText(tab.id);
      const name = normalizeText(tab.name);
      return id === needle || name === needle || id.includes(needle) || name.includes(needle);
    });
    for (const tab of candidates) {
      const byId = await getTabAppIdsFromStore(tab.id);
      if (byId.length) return byId;
      const byName = await getTabAppIdsFromStore(tab.name);
      if (byName.length) return byName;
    }
  } catch {}
  return [];
}

function sortDynamicTabApps(filtered: AppOverview[], rawTab: string, sort: any): AppOverview[] {
  if (sort) return filtered;
  if (slugifyTab(rawTab) === "recent") return filtered;
  return filtered.slice().sort((a, b) =>
    String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))),
  );
}

const TAB_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTabUuidViaTabMaster(rawTab: string, limit: number, shelfId?: string): Promise<number[] | null> {
  if (!TAB_UUID_RE.test(rawTab)) return null;
  try {
    const { getTabsFromSettingsFile } = await import('../integrations/tabmaster');
    const { convertFiltersToGroup } = await import('../domain/customfilters');
    const tmTabs = await getTabsFromSettingsFile();
    const tmTab = tmTabs.find((t) => t.id === rawTab);
    if (!tmTab || !tmTab.filters || tmTab.filters.length === 0) return null;
    const filterGroup = convertFiltersToGroup(tmTab.filters);
    try { logInfo("STEAM", "resolveShelfAppIds(tab): UUID fallback via TabMaster filters", { tab: rawTab, title: tmTab.title }); } catch {}
    return resolveShelfAppIds({ type: 'filter', filter: { filterGroup } } as any, limit, undefined, shelfId);
  } catch { return null; }
}

async function fetchTabStoreIds(rawTab: string, filterToInstalledNative: (ids: number[]) => number[]): Promise<number[]> {
  let ids = await getTabAppIdsFromStore(rawTab);
  if (ids.length) ids = filterToInstalledNative(ids);
  if (!ids.length && rawTab) ids = await findTabAppIdsByNameOrId(rawTab);
  return ids;
}

async function resolveFromDynamicTab(ctx: ResolverContext, rawTab: string): Promise<number[]> {
  const { all, sort, shelfId, sortReverse, limit } = ctx;
  const filtered = await resolveDynamicTab(rawTab, all);
  const tabApps = sortDynamicTabApps(filtered, rawTab, sort);
  let tabIds = deduplicateNonSteam(tabApps.map((a) => appIdOf(a)).filter(Number.isFinite), all);
  if (sort) tabIds = applySortToIds(tabIds, sort, all, shelfId, sortReverse);
  return tabIds.slice(0, limit);
}

async function _resolveTab(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit, limit } = ctx;
  const rawTab = String(source.tab ?? "").trim();
  const filterToInstalledNative = makeNativeInstalledFilter(slugifyTab(rawTab), all);
  const applyChildFilterTab = makeChildFilterTab(source, all);

  const customFiltersIds = getCustomFiltersAppsForContainer(rawTab);
  if (customFiltersIds.length) {
    const filtered = filterToInstalledNative(customFiltersIds);
    const ordered = sort ? applySortToIds(filtered, sort, all, shelfId, sortReverse) : filtered;
    return finish(applyChildFilterTab(ordered).slice(0, overShootLimit));
  }

  const fromTabStore = await fetchTabStoreIds(rawTab, filterToInstalledNative);
  if (fromTabStore.length) {
    try { logInfo("STEAM", "resolveShelfAppIds(tab): using store", { tab: rawTab, count: fromTabStore.length }); } catch {}
    const tabStoreIds = deduplicateNonSteam(sort ? applySortToIds(fromTabStore, sort, all, shelfId, sortReverse) : fromTabStore, all);
    return finish(applyChildFilterTab(tabStoreIds).slice(0, overShootLimit));
  }

  const ids = await resolveFromDynamicTab(ctx, rawTab);
  if (!ids.length) {
    const viaTabMaster = await resolveTabUuidViaTabMaster(rawTab, limit, shelfId);
    if (viaTabMaster) return viaTabMaster;
    const fallback = await tryBuiltInTabFallback(ctx, rawTab);
    if (fallback) return fallback;
    logWarn("STEAM", "resolveShelfAppIds(tab) empty", { tab: rawTab, allCount: all.length });
  }
  return finish(applyChildFilterTab(ids.slice(0, overShootLimit)));
}

// Built-in tabs whose semantics map cleanly to a legacy flat filter. When
// Steam's tab store returns empty (boot-time race, theme weirdness) we route
// through the filter resolver so the template still produces results.
async function tryBuiltInTabFallback(ctx: ResolverContext, rawTab: string): Promise<number[] | null> {
  const slug = slugifyTab(rawTab);
  if (slug !== "installed") return null;
  try {
    const result = await _resolveFilter({
      ...ctx,
      source: { type: "filter", filter: { installed: true } } as any,
    });
    if (result.length) {
      logInfo("STEAM", "resolveShelfAppIds(tab) using installed-filter fallback", { tab: rawTab, count: result.length });
      return result;
    }
  } catch (e) { logWarn("STEAM", "installed-filter fallback failed", String(e)); }
  return null;
}

// Dispatch table for `f.sort`; fallthrough sorts alphabetically.
const FILTER_SORT_DISPATCH: Record<string, (apps: AppOverview[], shelfId?: string) => AppOverview[]> = {
  recent: (apps) => apps.slice().sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a)),
  playtime: (apps) => apps.slice().sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0)),
  release_date: (apps) => apps.slice().sort((a, b) => ((b as any).rt_original_release_date ?? 0) - ((a as any).rt_original_release_date ?? 0)),
  size_on_disk: (apps) => apps.slice().sort((a, b) => Number((b as any).size_on_disk ?? 0) - Number((a as any).size_on_disk ?? 0)),
  metacritic: (apps) => apps.slice().sort((a, b) => ((b as any).metacritic_score ?? 0) - ((a as any).metacritic_score ?? 0)),
  review_score: (apps) => apps.slice().sort((a, b) => ((b as any).review_percentage ?? 0) - ((a as any).review_percentage ?? 0)),
  added: (apps) => apps.slice().sort(compareByAdded),
  random: (apps, shelfId) => {
    const fIds = apps.map((a) => appIdOf(a)).filter(Number.isFinite);
    const fById = new Map<number, AppOverview>();
    for (const a of apps) { const id = appIdOf(a); if (id) fById.set(id, a); }
    return stableShuffleIds(fIds, hashIdSet(fIds), shelfId).map((id) => fById.get(id)).filter(Boolean) as AppOverview[];
  },
};
function sortAppsByFilterKey(filtered: AppOverview[], fSort: string | undefined, shelfId?: string): AppOverview[] {
  const handler = fSort ? FILTER_SORT_DISPATCH[fSort] : undefined;
  if (handler) return handler(filtered, shelfId);
  return filtered.slice().sort((a, b) => String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))));
}

function resolveFilterReverse(f: CustomFilter, fallback: boolean | boolean[] | undefined): boolean {
  const eff = (f as any).sortReverse ?? fallback;
  return Array.isArray(eff) ? !!eff[0] : !!eff;
}

function hasNonEmptyString(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

const LEGACY_BOOL_FLAGS: Array<keyof CustomFilter> = ["favorites", "nonSteam", "installed"];

function hasLegacyHiddenFlag(f: CustomFilter): boolean {
  return f.hidden === "only" || f.hidden === true || f.hidden === false;
}

function hasLegacyNumberRanges(f: CustomFilter): boolean {
  return typeof f.playedWithinDays === "number"
    || typeof f.minPlaytimeMinutes === "number"
    || typeof f.maxPlaytimeMinutes === "number";
}

function hasLegacyFlatFilter(f: CustomFilter): boolean {
  if (LEGACY_BOOL_FLAGS.some((k) => !!f[k])) return true;
  if (hasLegacyHiddenFlag(f)) return true;
  if (hasNonEmptyString(f.nameIncludes) || hasNonEmptyString(f.nameRegex)) return true;
  if (Array.isArray(f.deckCompatibility) && f.deckCompatibility.length > 0) return true;
  if (hasLegacyNumberRanges(f)) return true;
  return f.updatePending === true || f.updatePending === false;
}

function applyLegacyBoolFlags(filtered: AppOverview[], f: CustomFilter): AppOverview[] {
  if (f.favorites) filtered = filtered.filter(isFavoriteOf);
  if (f.hidden === "only" || f.hidden === true) filtered = filtered.filter(isHiddenOf);
  if (f.hidden === false) filtered = filtered.filter((a) => !isHiddenOf(a));
  if (f.nonSteam) filtered = filtered.filter(isNonSteamOf);
  if (f.installed) filtered = filtered.filter(isInstalledOf);
  return filtered;
}

function applyLegacyNameFilters(filtered: AppOverview[], f: CustomFilter): AppOverview[] {
  if (hasNonEmptyString(f.nameIncludes)) {
    const needle = f.nameIncludes!.toLowerCase();
    filtered = filtered.filter((a) => appNameOf(a).toLowerCase().includes(needle));
  }
  if (hasNonEmptyString(f.nameRegex)) {
    try {
      const re = new RegExp(f.nameRegex!, "i");
      filtered = filtered.filter((a) => re.test(appNameOf(a)));
    } catch {}
  }
  return filtered;
}

function applyLegacyRangeFilters(filtered: AppOverview[], f: CustomFilter): AppOverview[] {
  if (typeof f.playedWithinDays === "number") {
    const min = Math.floor(Date.now() / 1000) - Math.floor(f.playedWithinDays * 86400);
    filtered = filtered.filter((a) => lastPlayedOf(a) >= min);
  }
  if (typeof f.minPlaytimeMinutes === "number") {
    filtered = filtered.filter((a) => (a.playtime_forever ?? 0) >= f.minPlaytimeMinutes!);
  }
  if (typeof f.maxPlaytimeMinutes === "number") {
    filtered = filtered.filter((a) => (a.playtime_forever ?? 0) <= f.maxPlaytimeMinutes!);
  }
  return filtered;
}

function applyLegacyMiscFilters(filtered: AppOverview[], f: CustomFilter): AppOverview[] {
  if (f.deckCompatibility && f.deckCompatibility.length > 0) {
    filtered = filtered.filter((a) => isDeckCompatMatch(a.deck_compatibility_category, f.deckCompatibility));
  }
  if (f.updatePending === true) filtered = filtered.filter((a) => a.update_pending === true);
  else if (f.updatePending === false) filtered = filtered.filter((a) => !a.update_pending);
  return filtered;
}

function applyLegacyFlatFilter(all: AppOverview[], f: CustomFilter): AppOverview[] {
  let filtered = applyLegacyBoolFlags(all, f);
  filtered = applyLegacyNameFilters(filtered, f);
  filtered = applyLegacyRangeFilters(filtered, f);
  filtered = applyLegacyMiscFilters(filtered, f);
  return filtered;
}

async function _resolveFilterGroupPath(
  ctx: ResolverContext,
  f: CustomFilter,
  filterGroup: FilterGroup,
): Promise<number[]> {
  const { all, sort, shelfId, sortReverse, finish, overShootLimit } = ctx;
  const evalCtx: FilterEvalContext = { collectionAppIds: new Map() };
  const colIds = collectCollectionIdsFromGroup(filterGroup);
  await Promise.all(colIds.map(async (colId) => {
    try {
      const ids = await getCollectionApps(colId);
      // Always set, even on empty result, so the evaluator can tell
      // "lookup completed with 0 apps" from "lookup never attempted".
      evalCtx.collectionAppIds.set(colId, new Set(ids));
    } catch {}
  }));
  // Warm developer / publisher caches before evaluation — cold caches
  // make those filter items match zero apps on the home (the editor
  // warms via its filter pickers; the home doesn't go through them).
  const needs = filterGroupNeedsDevPubPreload(filterGroup);
  if (needs.needsDev || needs.needsPub) {
    const allAppIds = all.map((a) => appIdOf(a)).filter(Number.isFinite);
    await Promise.all([
      needs.needsDev ? preloadDeveloperData(allAppIds).catch(() => {}) : Promise.resolve(),
      needs.needsPub ? preloadPublisherData(allAppIds).catch(() => {}) : Promise.resolve(),
    ]);
  }
  let filtered = evaluateFilterGroup(filterGroup, all, evalCtx);
  const fSort = (ctx.source.filter as any)?.sort as string | undefined;
  await enrichAppsForMetaSort(fSort, filtered);
  filtered = sortAppsByFilterKey(filtered, fSort, shelfId);
  // Asc/desc inversion. Prefer the filter's own `sortReverse` (the editor
  // writes there on filter shelves; shelf-level `sortReverse` is never
  // populated for filter sources). Skipped for `manual` / `random`.
  if (resolveFilterReverse(f, sortReverse) && fSort !== "manual" && fSort !== "random") {
    filtered = filtered.slice().reverse();
  }
  const ids = deduplicateNonSteam(filtered.map((a) => appIdOf(a)).filter(Number.isFinite), all);
  if (!ids.length) logWarn("STEAM", "resolveShelfAppIds(filterGroup) empty", { filter: f, allCount: all.length });
  else logInfo("STEAM", "resolveShelfAppIds(filterGroup) resolved", { count: ids.length, allCount: all.length });
  emitResolvedTotal(ctx, ids.length);
  return finish(ids.slice(0, overShootLimit));
}

function pickLegacySortKey(f: CustomFilter): string | undefined {
  if (f.sort === "recent" || typeof f.playedWithinDays === "number") return "recent";
  return f.sort as string | undefined;
}

function _resolveFilterLegacyPathMultiKey(
  ctx: ResolverContext, f: CustomFilter, filtered: AppOverview[],
): number[] {
  const { all, shelfId, sortReverse, finish, overShootLimit } = ctx;
  const sortedIds = applySortToIds(
    filtered.map((a) => appIdOf(a)).filter(Number.isFinite),
    f.sort as unknown as string[], all, shelfId, (f as any).sortReverse ?? sortReverse,
  );
  const ids = deduplicateNonSteam(sortedIds, all);
  if (!ids.length) logWarn("STEAM", "resolveShelfAppIds(filter) empty", { filter: f, allCount: all.length });
  else logInfo("STEAM", "resolveShelfAppIds(filter) resolved", { count: ids.length, allCount: all.length });
  emitResolvedTotal(ctx, ids.length);
  return finish(ids.slice(0, overShootLimit));
}

function _resolveFilterLegacyPath(
  ctx: ResolverContext,
  f: CustomFilter,
): number[] {
  const { all, shelfId, sortReverse, finish, overShootLimit } = ctx;
  let filtered = applyLegacyFlatFilter(all, f);
  if (Array.isArray(f.sort)) return _resolveFilterLegacyPathMultiKey(ctx, f, filtered);
  const fSort = pickLegacySortKey(f);
  filtered = sortAppsByFilterKey(filtered, fSort, shelfId);
  // Legacy `f.sort` enum doesn't include "manual" or "random", so the
  // reverse is unconditional.
  if (resolveFilterReverse(f, sortReverse)) filtered = filtered.slice().reverse();
  const ids = deduplicateNonSteam(filtered.map((a) => appIdOf(a)).filter(Number.isFinite), all);
  if (!ids.length) {
    logWarn("STEAM", "resolveShelfAppIds(filter) empty", {
      filter: f,
      allCount: all.length,
      sampleApp: all[0] ? { appid: all[0].appid, name: all[0].display_name, installed: all[0].installed } : null,
      afterInstalled: f.installed ? all.filter(isInstalledOf).length : "skip",
      afterInstalledLenient: f.installed ? all.filter((a) => (a as any).installed !== false).length : "skip",
    });
  } else {
    logInfo("STEAM", "resolveShelfAppIds(filter) resolved", { count: ids.length, allCount: all.length });
  }
  return finish(ids.slice(0, overShootLimit));
}

async function _resolveFilter(ctx: ResolverContext): Promise<number[]> {
  const { source, finish } = ctx;
  const f: CustomFilter = (source.filter ?? {}) as CustomFilter;
  const filterGroup = (source.filter as any)?.filterGroup as FilterGroup | undefined;
  if (filterGroup && Array.isArray(filterGroup.items) && filterGroup.items.length > 0) {
    return _resolveFilterGroupPath(ctx, f, filterGroup);
  }
  const hasSort = Array.isArray(f.sort) ? f.sort.length > 0 : (typeof f.sort === "string" && f.sort.length > 0);
  if (!hasLegacyFlatFilter(f) && !hasSort) {
    logInfo("STEAM", "resolveShelfAppIds(filter) empty — no filters configured", { filter: f });
    return finish([]);
  }
  return _resolveFilterLegacyPath(ctx, f);
}

async function _resolveExternal(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit, limit } = ctx;
    try {
      const { resolveExternalSource } = await import("../core/pluginApi");
      let ids = await resolveExternalSource(String(source.sourceId ?? ""), limit);
      logInfo("STEAM", "resolveShelfAppIds(external) resolved", { sourceId: source.sourceId, count: ids.length });
      if (sort) ids = applySortToIds(ids, sort, all, shelfId, sortReverse);
      ids = deduplicateNonSteam(ids, all);
      return finish(ids.slice(0, overShootLimit));
    } catch {
      return [];
    }
}

type WishlistHideFlags = { hideOwned: boolean; hideOwnedNonSteam: boolean; hideOwnedNonSteamCloud: boolean };

function resolveCloudHideFlag(source: any, s: any, hideOwnedNonSteam: boolean): boolean {
  if (!hideOwnedNonSteam) return false;
  const perShelf = source?.hideOwnedNonSteamCloud;
  if (perShelf === true) return true;
  if (perShelf === undefined) return s?.onlineHideOwnedNonSteamCloud === true;
  return false;
}

function computeWishlistHideFlags(source: any, s: any): WishlistHideFlags {
  const globalHideOwned = s?.onlineHideOwnedGames === true;
  const globalHideNonSteam = s?.onlineHideOwnedNonSteam === true;
  const srcExcludeOwned = source?.excludeOwned === true;
  const srcExcludeNonSteam = srcExcludeOwned && source?.excludeOwnedNonSteam === true;
  const hideOwned = globalHideOwned || srcExcludeOwned;
  const hideOwnedNonSteam = hideOwned && ((globalHideOwned && globalHideNonSteam) || srcExcludeNonSteam);
  const hideOwnedNonSteamCloud = resolveCloudHideFlag(source, s, hideOwnedNonSteam);
  return { hideOwned, hideOwnedNonSteam, hideOwnedNonSteamCloud };
}

const PRICE_SORT_KEYS = new Set(["price_low", "discount_high", "original_price_high"]);

async function applyWishlistChildFilter(ids: number[], childFilter: any, all: AppOverview[]): Promise<number[]> {
  if (!childFilter || !Array.isArray(childFilter.items) || childFilter.items.length === 0) return ids;
  const hasDiscountFilter = childFilter.items.some((item: any) => item.type === "discount");
  if (hasDiscountFilter) {
    const { getPriceMap } = await import("../core/onlineStore");
    await getPriceMap(ids);
  }
  const byId = new Map(all.map((a) => [appIdOf(a), a] as const));
  return ids.filter((id) => {
    const app = byId.get(id);
    return childFilter.items.every((item: any) => evaluateWishlistChildItem(item, id, app));
  });
}

function evaluateWishlistChildItem(item: any, id: number, app: AppOverview | undefined): boolean {
  if (item.type === "discount") return evaluateFilterItem(item, { appid: id } as any, undefined);
  if (!app) return true;
  return evaluateFilterItem(item, app, undefined);
}

async function applyWishlistSort(
  ids: number[],
  sort: string | string[] | undefined,
  sortReverse: boolean | boolean[] | undefined,
  all: AppOverview[],
  shelfId: string | undefined,
  getPriceMap: (ids: number[]) => Promise<ReadonlyMap<number, { price: number; originalPrice: number; discount: number }>>,
): Promise<number[]> {
  if (!sort) return ids;
  if (!Array.isArray(sort) && PRICE_SORT_KEYS.has(sort)) {
    const reverse = Array.isArray(sortReverse) ? !!sortReverse[0] : sortReverse;
    return applyPriceSort(ids, sort as "price_low" | "discount_high" | "original_price_high", reverse);
  }
  // Multi-key / single non-price: sort the local subset, leave remote
  // ids at the tail in wishlist order. Pre-fetch prices only if needed.
  const sortKeys: string[] = Array.isArray(sort) ? sort : [sort];
  const hasPriceKey = sortKeys.some((k) => PRICE_SORT_KEYS.has(k));
  const localPriceMap = hasPriceKey ? await getPriceMap(ids) : undefined;
  const byId = new Map(all.map((a) => [appIdOf(a), a] as const));
  const pool: AppOverview[] = ids.map((id) => byId.get(id) ?? ({ appid: id } as unknown as AppOverview));
  return applySortToIds(ids, sort, pool, shelfId, sortReverse, localPriceMap);
}

async function _resolveWishlist(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit } = ctx;
  try {
    const { getCurrentSettings } = await import("../store/settingsStore");
    const { getWishlistIds, getPriceMap } = await import("../core/onlineStore");
    const s = getCurrentSettings();
    const onlineEnabled = isOnlineEnabledForSettings(s);
    if (!onlineEnabled || s?.onlineWishlistEnabled === false) return [];
    const wishlistIds = await getWishlistIds();
    if (!wishlistIds) return [];

    const flags = computeWishlistHideFlags(source, s);
    const ownedSet = flags.hideOwned
      ? getLocalLibraryAppIds(flags.hideOwnedNonSteam, flags.hideOwnedNonSteamCloud)
      : new Set<number>();
    let ids = flags.hideOwned ? wishlistIds.filter((id) => !ownedSet.has(id)) : [...wishlistIds];
    ids = await applyWishlistChildFilter(ids, (source as any).childFilter, all);
    ids = await applyWishlistSort(ids, sort, sortReverse, all, shelfId, getPriceMap);
    logInfo("STEAM", "resolveShelfAppIds(wishlist) resolved", { count: ids.length });
    return finish(ids.slice(0, overShootLimit));
  } catch (e) {
    logWarn("STEAM", "resolveShelfAppIds(wishlist) failed", String(e));
    return [];
  }
}

async function _resolveStore(ctx: ResolverContext): Promise<number[]> {
  const { source, all, sort, shelfId, sortReverse, finish, overShootLimit } = ctx;
  try {
    const { getCurrentSettings } = await import("../store/settingsStore");
    const { getStoreGameIds, getPriceMap } = await import("../core/onlineStore");
    const s = getCurrentSettings();
    const onlineEnabled = isOnlineEnabledForSettings(s);
    if (!onlineEnabled) return [];
    let ids = await getStoreGameIds();
    if (!ids) return [];

    const flags = computeWishlistHideFlags(source, s);
    if (flags.hideOwned) {
      const ownedSetStore = getLocalLibraryAppIds(flags.hideOwnedNonSteam, flags.hideOwnedNonSteamCloud);
      ids = ids.filter((id) => !ownedSetStore.has(id));
    }
    ids = await applyWishlistChildFilter(ids, (source as any).childFilter, all);
    ids = await applyWishlistSort(ids, sort, sortReverse, all, shelfId, getPriceMap);
    logInfo("STEAM", "resolveShelfAppIds(store) resolved", { count: ids.length });
    return finish(ids.slice(0, overShootLimit));
  } catch (e) {
    logWarn("STEAM", "resolveShelfAppIds(store) failed", String(e));
    return [];
  }
}

type SmartResolverDeps = {
  apps: AppOverview[];
  internalModes: ReadonlySet<string>;
  resolveSmart: (mode: any, apps: AppOverview[], limit: number, params: any, ttlMs: number | undefined, shelfId?: string) => number[];
  hasExternal: (mode: string) => boolean;
  resolveExternal: (mode: string, limit: number, params: Record<string, number>) => Promise<number[]>;
};

async function resolveSmartModeIds(
  mode: string,
  smartFetchLimit: number,
  smartParams: Record<string, number> | undefined,
  ttlMs: number | undefined,
  shelfId: string | undefined,
  deps: SmartResolverDeps,
): Promise<number[]> {
  if (mode === "custom") return deps.apps.map((a) => appIdOf(a)).filter(Number.isFinite);
  if (deps.internalModes.has(mode)) {
    return deps.resolveSmart(mode as any, deps.apps, smartFetchLimit, smartParams, ttlMs, shelfId);
  }
  if (deps.hasExternal(mode)) {
    return deps.resolveExternal(mode, smartFetchLimit, smartParams ?? {});
  }
  return [];
}

function uniqueModes(modes: string[]): string[] {
  const seen = new Set<string>();
  return modes.filter((m) => seen.has(m) ? false : (seen.add(m), true));
}

async function resolveSmartCompositeIds(
  source: any,
  smartFetchLimit: number,
  smartParams: Record<string, number> | undefined,
  ttlMs: number | undefined,
  shelfId: string | undefined,
  deps: SmartResolverDeps,
): Promise<number[]> {
  const combine = source.compositeCombine === "intersection" ? "intersection" : "union";
  const modes = uniqueModes([source.mode, ...(source.compositeModes as string[])]);
  const childResults: number[][] = [];
  for (const m of modes) {
    try {
      const childShelfId = shelfId ? `${shelfId}:${m}` : undefined;
      childResults.push(await resolveSmartModeIds(m, smartFetchLimit, smartParams, ttlMs, childShelfId, deps));
    } catch (e) {
      logWarn("STEAM", "composite smart child failed", { mode: m, err: String(e) });
      childResults.push([]);
    }
  }
  return mergeCompositeResults(childResults, combine);
}

function applySmartFilterGroup(ids: number[], filterGroup: any, apps: AppOverview[]): number[] {
  if (!filterGroup || !Array.isArray(filterGroup.items) || filterGroup.items.length === 0) return ids;
  const byId = new Map(apps.map((a) => [appIdOf(a), a] as const));
  const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
  return evaluateFilterGroup(filterGroup, candidates).map((a) => appIdOf(a)).filter(Number.isFinite);
}

async function _resolveSmart(ctx: ResolverContext): Promise<number[]> {
  const { source, sort, shelfId, sortReverse, finish, overShootLimit, limit } = ctx;
  try {
    const { resolveSmartShelf, INTERNAL_SMART_MODES } = await import("./smartShelves");
    const { hasExternalSmartSource, resolveExternalSmartSource } = await import("../core/pluginApi");
    const apps = await getAllAppOverviews();
    const smartFilterGroup = source.filterGroup;
    const smartParams = source.smartParams as Record<string, number> | undefined;
    const refreshIntervalMinutes = source.refreshIntervalMinutes as number | undefined;
    const ttlMs = typeof refreshIntervalMinutes === "number" && refreshIntervalMinutes > 0
      ? refreshIntervalMinutes * 60 * 1000
      : undefined;
    const wantsPostProcess = !!smartFilterGroup || !!sort;
    const smartFetchLimit = wantsPostProcess ? Math.max(limit * 4, 200) : limit;
    const deps: SmartResolverDeps = {
      apps, internalModes: INTERNAL_SMART_MODES,
      resolveSmart: resolveSmartShelf as any,
      hasExternal: hasExternalSmartSource,
      resolveExternal: resolveExternalSmartSource,
    };
    const compositeModes = Array.isArray(source.compositeModes) ? source.compositeModes as string[] : [];
    const rawIds = compositeModes.length > 0
      ? await resolveSmartCompositeIds(source, smartFetchLimit, smartParams, ttlMs, shelfId, deps)
      : await resolveSmartModeIds(source.mode, smartFetchLimit, smartParams, ttlMs, shelfId, deps);
    let ids = applySmartFilterGroup(rawIds, smartFilterGroup, apps);
    if (sort && sort !== "manual") ids = applySortToIds(ids, sort, apps, shelfId, sortReverse);
    logInfo("STEAM", "resolveShelfAppIds(smart) resolved", { mode: source.mode, count: ids.length, hasFilter: !!smartFilterGroup, sort });
    return finish(ids.slice(0, overShootLimit));
  } catch {
    return [];
  }
}

function compositeChildFilterItems(source: any): any[] {
  const cf = (source as any).childFilter;
  return cf && Array.isArray(cf.items) ? cf.items : [];
}

function mergeCompositeFilterIntoOnlineChild(child: any, compositeItems: any[]): any {
  const existing: any[] = (child.childFilter && Array.isArray(child.childFilter.items)) ? child.childFilter.items : [];
  return {
    ...child,
    childFilter: {
      mode: child.childFilter?.mode === "or" ? "or" : "and",
      items: [...existing, ...compositeItems],
    },
  };
}

function rebuildOfflineChildIfDup(child: any, compositeFilterSig: string): any {
  if (!compositeFilterSig || !child?.childFilter || !Array.isArray(child.childFilter.items)) return child;
  if (JSON.stringify(child.childFilter.items) !== compositeFilterSig) return child;
  const { childFilter: _drop, ...rest } = child;
  return rest;
}

function rebuildCompositeChildSources(rawChildSources: any[], compositeItems: any[]): any[] {
  if (compositeItems.length === 0) return rawChildSources;
  const sig = JSON.stringify(compositeItems);
  return rawChildSources.map((child) => {
    if (child?.type !== "wishlist" && child?.type !== "store") return rebuildOfflineChildIfDup(child, sig);
    return mergeCompositeFilterIntoOnlineChild(child, compositeItems);
  });
}

async function resolveCompositeChildren(childSources: any[], ctx: ResolverContext): Promise<number[][]> {
  const { sort, shelfId, sortReverse, options, depth: _depth, overShootLimit } = ctx;
  /* 15 s hard ceiling per child so a single hung online source (e.g. a
     wishlist RPC that doesn't time out cleanly) can't park the parent
     composite resolve forever. Returning `[]` for a misbehaving child
     still lets the union complete with the rest of the data. */
  return Promise.all(
    childSources.map((child) => {
      const inner = resolveShelfAppIds(child, overShootLimit, sort, shelfId, sortReverse, options, _depth + 1);
      const fallback = new Promise<number[]>((resolve) => {
        setTimeout(() => {
          logWarn("STEAM", "composite child resolve timed out", { type: child?.type, shelfId });
          resolve([]);
        }, 15000);
      });
      return Promise.race([inner, fallback])
        .catch((e) => { logWarn("STEAM", "composite child resolve failed", String(e)); return [] as number[]; });
    }),
  );
}

async function resortCompositeMerged(merged: number[], all: AppOverview[], ctx: ResolverContext): Promise<number[]> {
  const { sort, shelfId, sortReverse } = ctx;
  const sortKeys: string[] = Array.isArray(sort) ? sort : (sort ? [sort] : []);
  const primary = sortKeys[0];
  if (merged.length <= 1 || !primary || primary === "manual" || primary === "random") return merged;
  try {
    const hasPriceKey = sortKeys.some((k) => PRICE_SORT_KEYS.has(k));
    const priceMap = hasPriceKey ? await (await import("../core/onlineStore")).getPriceMap(merged) : undefined;
    const byIdAll = new Map(all.map((a) => [appIdOf(a), a] as const));
    const pool: AppOverview[] = merged.map((id) => (sortPoolLookup(id) ?? byIdAll.get(id) ?? ({ appid: id } as unknown as AppOverview)) as AppOverview);
    return applySortToIds(merged, sort!, pool, shelfId, sortReverse, priceMap);
  } catch (e) { logWarn("STEAM", "composite resort failed", String(e)); return merged; }
}

async function _resolveComposite(ctx: ResolverContext): Promise<number[]> {
  const { source, all, depth: _depth, finish, overShootLimit } = ctx;
  if (_depth >= MAX_COMPOSITE_DEPTH) {
    logWarn("STEAM", "resolveShelfAppIds(composite) depth cap reached", { depth: _depth, max: MAX_COMPOSITE_DEPTH });
    return finish([]);
  }
  const combine = source.combine === "intersection" ? "intersection" : "union";
  const rawChildSources: any[] = Array.isArray(source.sources) ? source.sources : [];
  if (!rawChildSources.length) return finish([]);
  const compositeItems = compositeChildFilterItems(source);
  const childSources = rebuildCompositeChildSources(rawChildSources, compositeItems);
  const childResults = await resolveCompositeChildren(childSources, ctx);
  let merged = mergeCompositeResults(childResults, combine);
  merged = await resortCompositeMerged(merged, all, ctx);
  logInfo("STEAM", "resolveShelfAppIds(composite) resolved", { combine, children: childSources.length, count: merged.length, hasChildFilter: !!(source as any).childFilter });
  return finish(merged.slice(0, overShootLimit));
}

// Dispatcher table keyed by `source.type`. Each entry runs in its own
// function above so the dispatcher itself stays at complexity ~3.
const SOURCE_RESOLVERS: Record<string, (ctx: ResolverContext) => Promise<number[]>> = {
  collection: _resolveCollection,
  tab: _resolveTab,
  filter: _resolveFilter,
  external: _resolveExternal,
  wishlist: _resolveWishlist,
  store: _resolveStore,
  smart: _resolveSmart,
  composite: _resolveComposite,
};

export async function resolveShelfAppIds(
  source: { type: string; [k: string]: any },
  limit: number,
  sort?: string | string[],
  shelfId?: string,
  sortReverse?: boolean | boolean[],
  options?: { hiddenAppIds?: number[]; dedupeByName?: boolean; onResolveTotal?: (n: number) => void },
  _depth: number = 0,
): Promise<number[]> {
  const { hiddenAppIds, dedupeByName, onResolveTotal } = options ?? {};
  const hiddenSet = hiddenAppIds?.length ? new Set(hiddenAppIds) : undefined;
  // Overshoot for render-time filters: hidden*2 for the picker, plus
  // max(10, 50% of limit) for online owned/name matches. Capped at 3x.
  const isOnlineShelf = source.type === "wishlist" || source.type === "store";
  const ownedOvershoot = isOnlineShelf ? Math.max(10, Math.ceil(limit * 0.5)) : 0;
  const hiddenOvershoot = hiddenSet ? hiddenSet.size * 2 : 0;
  const overShootLimit = Math.min(limit + hiddenOvershoot + ownedOvershoot, limit * 3);

  let all = await getAllAppOverviews();
  // Startup readiness: if Steam hasn't loaded app data yet, retry once after a short delay
  if (!all.length) {
    await new Promise((r) => setTimeout(r, 2000));
    all = await getAllAppOverviews();
  }

  const finish = (ids: number[]): number[] => {
    let result = ids;
    if (hiddenSet) result = result.filter((id) => !hiddenSet.has(id));
    if (dedupeByName && result.length > 1) result = dedupeAppIdsByName(result, all);
    return result.slice(0, overShootLimit);
  };

  const ctx: ResolverContext = {
    source, limit, sort, shelfId, sortReverse, options,
    depth: _depth, all, overShootLimit, finish,
    reportTotal: onResolveTotal,
  };
  const handler = SOURCE_RESOLVERS[source.type];
  if (handler) return handler(ctx);
  /* first-party Shelf Source Ecosystem v3 lives
     in a sibling module. Each resolver synchronously projects from
     the already-loaded `all` AppOverview list. The resolver receives
     `all` and returns the filtered AppOverview[], which we then map
     to ids + apply sort + finish overshoot trimming. */
  try {
    const { SOURCE_V3_RESOLVERS } = require("./v3Extensions") as typeof import("./v3Extensions");
    const v3 = SOURCE_V3_RESOLVERS[source.type];
    if (v3) {
      const filtered = v3(all);
      const ids = filtered.map((a) => appIdOf(a)).filter(Number.isFinite);
      if (sort) await enrichForSort(sort, ids, all);
      const sorted = sort ? applySortToIds(ids, sort, all, shelfId, sortReverse) : ids;
      return finish(sorted);
    }
  } catch { /* fall through to empty */ }
  return [];
}

// Per-client display_status + byte counters covering Steam's "update in
// progress" indicators. Returns true when ANY signal is present.
function checkUpdatePendingFromPcd(raw: any): boolean {
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

// Flag + byte fields the various Steam runtimes have used historically.
// Flat list keeps `checkUpdatePendingFromFlags` at one for-loop.
const UPDATE_FLAG_KEYS = [
  "m_bUpdateRunning", "update_running",
  "m_bUpdateAvailable", "update_available",
  "m_bNeedsUpdate", "needs_update",
  "m_bUpdatePaused",
];
const UPDATE_BYTE_KEYS = ["m_nBytesToDownload", "m_nBytesToStage"];

function checkUpdatePendingFromFlags(raw: any): boolean {
  try {
    for (const key of UPDATE_FLAG_KEYS) if ((raw as any)[key] === true) return true;
    for (const key of UPDATE_BYTE_KEYS) if (Number((raw as any)[key] || 0) > 0) return true;
  } catch {}
  return false;
}

// Method-style accessors exposed by some Steam runtimes (BIsUpdate*,
// BNeedsUpdate, BHasUpdate).
const UPDATE_FLAG_METHODS = ["BIsUpdateRunning", "BIsUpdateAvailable", "BNeedsUpdate", "BHasUpdate"];
function checkUpdatePendingFromMethods(raw: any): boolean {
  for (const name of UPDATE_FLAG_METHODS) {
    try {
      const fn = (raw as any)[name];
      if (typeof fn === "function" && fn.call(raw)) return true;
    } catch {}
  }
  return false;
}

// Walks the prototype chain looking for any m_bUpdate*/m_bNeedsUpdate*/
// update_pending* property — catches MobX-derived stores that hang
// flags off the prototype rather than instance fields.
function checkUpdatePendingFromProto(raw: any): boolean {
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

function checkUpdatePendingRaw(raw: any): boolean {
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

function harvestPendingFromClient(sc: any, out: Set<number>): void {
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

function firstFiniteFromOverview(o: any, keys: string[]): number | undefined {
  if (!o) return undefined;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
}

function pickPlaytimeMinutes(o: any): number | undefined {
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

function resolveUpdatePending(appid: number, overview: any, raw: any): boolean {
  if (overview?.update_pending === true) return true;
  if (checkUpdatePendingRaw(raw)) return true;
  return _pendingUpdateAppIds?.has(appid) === true;
}

type EnrichmentExtras = {
  description?: string;
  fullDescription?: string;
};

function readAppDetailsEnrichment(appid: number): EnrichmentExtras {
  // Reads from our in-memory description cache only — never touches
  /* `appDetailsStore.GetDescriptions/GetAppDetails` here. Those getters
     can trigger Steam to internally fetch data lazily, and calling them
     for every appid in every shelf at mount time froze the boot.
     Consumers that need fresh descriptions should call
     `preloadAppDescriptions(appid)` on-demand (focus, tooltip, etc.). */
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

function pickFiniteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
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

function buildMetaFromOverview(appid: number, overview?: AppOverview, raw?: any): PlatformAppMeta {
  const isSteam = overview?.is_steam !== false;
  const { heroUrl, portraitUrl } = computeAssetUrls(appid, overview, isSteam);
  const { description, fullDescription } = readAppDetailsEnrichment(appid);
  const { releaseTimestamp, metacriticScore } = readOverviewExtras(overview);
  return {
    appid,
    name: String(overview?.display_name ?? `App ${appid}`),
    heroUrl,
    portraitUrl,
    installed: overview?.installed,
    isSteam,
    deckCompatCategory: overview?.deck_compatibility_category,
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

const WINDOW_OVERVIEW_ACCESSORS: Array<(w: any, id: number) => any> = [
  (w, id) => w?.appStore?.GetAppOverviewByAppID?.(id),
  (w, id) => w?.AppStore?.GetAppOverviewByAppID?.(id),
  (w, id) => w?.appStore?.m_mapAppInfo?.get?.(id),
  (w, id) => w?.LibraryStore?.m_mapAppInfo?.get?.(id),
];

function fetchAppOverviewFromWindow(hostWindow: any, appid: number): any {
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
    let raw: any;
    try { raw = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid); } catch {}
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

// Shared per-catalog id→overview map. Cached across concurrent shelves
// so a 19-shelf home doesn't pay 19× the catalogue-walk cost on first
// paint. Invalidates on catalog identity change.
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
      let raw: any;
      try { raw = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid); } catch {}
      out.set(appid, buildMetaFromOverview(appid, ov, raw));
    } else {
      missing.push(appid);
    }
  }
  // Per-id fallback only for the residual — typically online-only items
  // (wishlist / store / friends_playing) that aren't in the local catalogue.
  if (missing.length) {
    const fallbacks = await Promise.all(
      missing.map(async (id) => [id, await getAppMeta(id)] as const),
    );
    for (const [id, meta] of fallbacks) out.set(id, meta);
  }
  return out;
}

// Developer / Publisher data (from appDetailsStore)

const developerCache = new Map<number, string>();

// Persistent cache in localStorage to survive plugin reloads. Keys: appid -> developer string
const DEV_CACHE_KEY = 'deck-shelves-dev-cache-v1';
const DEV_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
let devCacheSaveTimer: number | null = null;

function readDeveloperCachePayload(): { map: Record<string, unknown> } | null {
  try {
    const raw = globalThis.localStorage?.getItem(DEV_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const ts = Number(parsed.ts || 0);
    if (!ts || (Date.now() - ts) > DEV_CACHE_TTL_MS) return null;
    return { map: parsed.map || {} };
  } catch { return null; }
}

function loadDeveloperCacheFromStorage() {
  const payload = readDeveloperCachePayload();
  if (!payload) return;
  for (const k of Object.keys(payload.map)) {
    const id = Number(k);
    if (!Number.isNaN(id)) developerCache.set(id, String(payload.map[k] ?? ""));
  }
}

function persistDeveloperCacheToStorage() {
  try {
    const map: Record<string, string> = {};
    for (const [k, v] of developerCache.entries()) map[String(k)] = v;
    const payload = { ts: Date.now(), map };
    globalThis.localStorage?.setItem(DEV_CACHE_KEY, JSON.stringify(payload));
    if (devCacheSaveTimer) { clearTimeout(devCacheSaveTimer); devCacheSaveTimer = null; }
  } catch {}
}

function scheduleDeveloperCachePersist() {
  if (devCacheSaveTimer) return;
  // debounce write to avoid thrashing
  devCacheSaveTimer = setTimeout(() => { try { persistDeveloperCacheToStorage(); } catch {} }, 1000) as unknown as number;
}

// Initialize from storage
try { loadDeveloperCacheFromStorage(); } catch {}

export function clearDeveloperCache(): void {
  try {
    developerCache.clear();
    globalThis.localStorage?.removeItem(DEV_CACHE_KEY);
  } catch {}
}

function getAppDetailsStore(): any {
  for (const win of getSteamWindows() as Window[]) {
    const s = (win as any)?.appDetailsStore ?? (win as any)?.AppDetailsStore;
    if (s?.m_mapAppData) return s;
  }
  return null;
}

const publisherCache = new Map<number, string>();

export function getAppPublisherCached(appid: number): string {
  if (publisherCache.has(appid)) return publisherCache.get(appid)!;
  try {
    const store = getAppDetailsStore();
    const entry = store?.m_mapAppData?.get?.(appid);
    const pub: string = entry?.details?.strPublisherName ?? "";
    if (pub) publisherCache.set(appid, pub);
    return pub;
  } catch {
    return "";
  }
}

export async function preloadPublisherData(appids: number[]): Promise<void> {
  const sc = (globalThis as any).SteamClient ?? getSteamWindows().find((w: any) => w?.SteamClient)?.SteamClient;
  if (!sc?.Apps?.RegisterForAppDetails) return;

  const uncached = appids.filter((id) => !publisherCache.has(id));
  if (!uncached.length) return;

  const BATCH = 30;
  const TIMEOUT_MS = 5000;

  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    await Promise.all(
      batch.map(
        (appid) =>
          new Promise<void>((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            try {
              const handle = sc?.Apps?.RegisterForAppDetails?.(appid, (details: any) => {
                try { handle?.unregister?.(); } catch {}
                const pub: string = details?.strPublisherName ?? "";
                publisherCache.set(appid, pub);
                finish();
              });
              setTimeout(() => { try { handle?.unregister?.(); } catch {} finish(); }, TIMEOUT_MS);
            } catch { finish(); }
          }),
      ),
    );
  }
}

export function getUniquePublishers(appids: number[]): string[] {
  const set = new Set<string>();
  for (const id of appids) {
    const pub = getAppPublisherCached(id);
    if (pub) set.add(pub);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function getAppDeveloperCached(appid: number): string {
  if (developerCache.has(appid)) return developerCache.get(appid)!;
  try {
    const store = getAppDetailsStore();
    const entry = store?.m_mapAppData?.get?.(appid);
    const dev: string = entry?.details?.strDeveloperName ?? "";
    if (dev) developerCache.set(appid, dev);
    return dev;
  } catch {
    return "";
  }
}

export async function preloadDeveloperData(appids: number[]): Promise<void> {
  const sc = (globalThis as any).SteamClient ?? getSteamWindows().find((w: any) => w?.SteamClient)?.SteamClient;
  if (!sc?.Apps?.RegisterForAppDetails) return;

  const uncached = appids.filter((id) => !developerCache.has(id));
  if (!uncached.length) return;

  const BATCH = 30;
  const TIMEOUT_MS = 5000;

  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    await Promise.all(
      batch.map(
        (appid) =>
          new Promise<void>((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            try {
              const handle = sc?.Apps?.RegisterForAppDetails?.(appid, (details: any) => {
                try { handle?.unregister?.(); } catch {}
                const dev: string = details?.strDeveloperName ?? "";
                if (dev) developerCache.set(appid, dev);
                else developerCache.set(appid, "");
                try { scheduleDeveloperCachePersist(); } catch {}
                finish();
              });
              setTimeout(() => { try { handle?.unregister?.(); } catch {} finish(); }, TIMEOUT_MS);
            } catch { finish(); }
          }),
      ),
    );
  }
}

export function getUniqueDevelopers(appids: number[]): string[] {
  const set = new Set<string>();
  for (const id of appids) {
    const dev = getAppDeveloperCached(id);
    if (dev) set.add(dev);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
