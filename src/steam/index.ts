import type { FilterGroup, FilterItem } from "../types";
import { dedupeAppIdsByName } from "./dedupe";
import { UPDATE_PENDING_STATUSES, APP_STATUS_GROUPS } from "./appDisplayStatus";
import { mark, measure } from "../core/perf";
import {
  hasExternalSortOption, applyExternalSort,
  hasExternalFilterType, evaluateExternalFilter,
  type PublicAppMeta,
} from "../core/pluginApi";
import type { PlatformAppMeta, PlatformTab } from "../runtime/platform";
import { logInfo, logWarn } from "../runtime/logger";
import { getPreferredSteamDocument, getPreferredSteamWindow } from "../runtime/steamHost";

export type SteamCollection = { id: string; name: string };

/**
 * Reads `onlineFeaturesEnabled` directly from the settings localStorage cache
 * without Zod validation. Used as a resilient fallback when `getCurrentSettings()`
 * returns null (e.g., when the schema rejects a stored filter type that was added
 * after the settings were persisted — parse fails, current = null, resolver stalls).
 */
function isOnlineFeaturesEnabledRaw(): boolean {
  try {
    const raw = (globalThis as any).localStorage?.getItem?.("deck-shelves-settings-cache-v3");
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data?.onlineFeaturesEnabled === true;
  } catch { return false; }
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
// In-flight de-duplication: when many shelves resolve concurrently before the
// 10s cache is populated (typical on cold mount / resume), each used to fire
// its own GetAllAppOverviews chain. Now the second-and-later concurrent
// callers await the first call's promise instead of duplicating the work.
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

function appMatchesCollectionMarker(app: AppOverview, markers: Set<string>): boolean {
  if (!markers.size) return false;
  const candidateValues: any[] = [];
  const appAny = app as any;
  candidateValues.push(
    appAny?.collection,
    appAny?.collection_id,
    appAny?.collectionId,
    appAny?.collection_name,
    appAny?.collectionName,
    appAny?.tab,
    appAny?.tab_name,
    appAny?.category,
    appAny?.category_name,
    appAny?.tags,
    appAny?.rgTags,
    appAny?.m_rgTags,
    appAny?.collections,
    appAny?.m_rgCollections,
    appAny?.categories,
    appAny?.m_rgCategories,
  );

  for (const value of candidateValues) {
    for (const marker of collectTextMarkers(value)) {
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

/**
 * Walks the React fiber tree from `startFiber` looking for a Context.Provider
 * whose `memoizedProps.value` matches TabMaster's PublicTabMasterContext shape:
 *   { visibleTabsList: TabContainer[], tabsMap: Map<string, TabContainer>, ... }
 *
 * Uses iterative DFS to avoid stack overflow.
 */
function walkFiberForTabMasterContext(startFiber: any): any | null {
  if (!startFiber) return null;
  const stack: any[] = [startFiber];
  const visited = new WeakSet();

  while (stack.length > 0) {
    const fiber = stack.pop();
    if (!fiber || visited.has(fiber)) continue;
    visited.add(fiber);

    const val = fiber.memoizedProps?.value;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      // TabMaster's PublicTabMasterContext has visibleTabsList at the top level
      const hasList = Array.isArray(val.visibleTabsList);
      const hasMap = val.tabsMap instanceof Map;
      if (hasList || hasMap) return val;
      // Also check val.tabMasterManager for alternative shapes
      const tm = val.tabMasterManager;
      if (tm && typeof tm === 'object') {
        const tmHasList = Array.isArray(tm.visibleTabsList);
        const tmHasMap = tm.tabsMap instanceof Map;
        if (tmHasList || tmHasMap) return tm;
      }
    }

    if (fiber.child) stack.push(fiber.child);
    if (fiber.sibling) stack.push(fiber.sibling);
  }
  return null;
}

/**
 * Finds TabMaster's React Context value by traversing all React roots in all
 * Steam window documents. Caches results for PLUGIN_CONTEXT_CACHE_TTL ms.
 *
 * Decky mounts each plugin in a separate React root (separate ReactDOM.render
 * call). We must search ALL roots, not just the first one found.
 */
export function findTabMasterContextValue(): any | null {
  const now = Date.now();
  if (pluginContextCache && now - pluginContextCache.ts < PLUGIN_CONTEXT_CACHE_TTL) {
    return pluginContextCache.value;
  }

  let value: any | null = null;
  try {
    const hostWindows = getSteamWindows();
    const docs = Array.from(
      new Set([getPreferredSteamDocument(), ...hostWindows.map((w: any) => w?.document)].filter(Boolean))
    ) as Document[];

    outer:
    for (const doc of docs) {
      try {
        const visitedRoots = new WeakSet<object>();
        // No element limit — TabMaster's Decky React root container may be
        // arbitrarily deep in the document, well beyond any fixed slice.
        const allEls = Array.from(doc.querySelectorAll('*'));
        for (const el of allEls) {
          const fiberKey = Object.keys(el).find(
            (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
          );
          if (!fiberKey) continue;
          let fiber = (el as any)[fiberKey];
          if (!fiber) continue;
          // Walk to the root of this React tree
          while (fiber.return) fiber = fiber.return;
          const rootFiber = fiber.stateNode?.current ?? fiber;
          if (visitedRoots.has(rootFiber)) continue;
          visitedRoots.add(rootFiber);
          // Search this entire React tree
          value = walkFiberForTabMasterContext(rootFiber);
          if (value) break outer;
        }
      } catch {}
    }
  } catch {}

  pluginContextCache = { ts: now, value };
  return value;
}

// Keep the old name as an alias for the component that still uses it
export const findCustomFiltersContextValue = findTabMasterContextValue;

/**
 * Extracts the list of visible library tabs from TabMaster's React context.
 * Returns an empty array if TabMaster is not installed or has no tabs.
 */
function getCustomFiltersList(): PlatformTab[] {
  const ctx = findTabMasterContextValue();
  if (!ctx) return [];
  const out: PlatformTab[] = [];
  const seen = new Set<string>();

  if (Array.isArray(ctx.visibleTabsList)) {
    for (const container of ctx.visibleTabsList) {
      const id = String(container?.id ?? "").trim();
      const name = String(container?.title ?? container?.name ?? "").trim();
      if (id && name && !seen.has(id)) {
        seen.add(id);
        out.push({ id, name });
      }
    }
  }

  if (ctx.tabsMap instanceof Map) {
    ctx.tabsMap.forEach((container: any, key: string) => {
      const id = String(container?.id ?? key ?? "").trim();
      const name = String(container?.title ?? container?.name ?? "").trim();
      if (id && name && !seen.has(id)) {
        seen.add(id);
        out.push({ id, name });
      }
    });
  }

  return out;
}

/**
 * Resolves app IDs for a tab using TabMaster's collection.allApps Set.
 * Returns an empty array if the tab is not found in TabMaster's context.
 */
function getCustomFiltersAppsForContainer(tabId: string): number[] {
  const ctx = findTabMasterContextValue();
  if (!ctx?.tabsMap) return [];

  const needle = normalizeText(tabId);
  let tabContainer: any = null;

  const matchScore = (container: any, key: string): number => {
    const id = normalizeText(String(container?.id ?? key ?? ""));
    const name = normalizeText(String(container?.title ?? container?.name ?? ""));
    if (id === needle || name === needle) return 2;
    if (id.includes(needle) || needle.includes(id) || name.includes(needle) || needle.includes(name)) return 1;
    return 0;
  };

  let bestScore = 0;
  if (ctx.tabsMap instanceof Map) {
    ctx.tabsMap.forEach((container: any, key: string) => {
      const score = matchScore(container, key);
      if (score > bestScore) { bestScore = score; tabContainer = container; }
    });
  }

  if (!tabContainer) return [];

  const allApps = tabContainer?.collection?.allApps ?? tabContainer?.allApps;
  if (allApps instanceof Set) {
    return uniqNumbers(Array.from(allApps.values()).map(Number).filter(Number.isFinite));
  }
  return extractAppIdsDeep(allApps ?? tabContainer?.collection, 3);
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


export async function getTabAppIdsFromStore(tab: string): Promise<number[]> {
  const raw = String(tab ?? "").trim();
  const normalized = normalizeTabId(raw);
  const slug = slugifyTab(raw);
  const candidates = [raw, normalized, slug].filter(Boolean);
  const stores = collectDynamicTabStores();
  const methods = ["GetAppsForTab", "GetTabApps", "GetVisibleAppsForTab", "ResolveTabApps", "GetAppsByTab", "GetAppIDsForTab"];

  for (const store of stores) {
    for (const method of methods) {
      const fn = store?.[method];
      if (typeof fn !== "function") continue;
      for (const id of candidates) {
        try {
          const result = await fn.call(store, id);
          const arr = Array.isArray(result)
            ? result
            : (result && typeof result === "object" ? (result.apps ?? result.appids ?? result.items ?? result.list ?? result.entries ?? []) : []);
          const ids = (Array.isArray(arr) ? arr : [])
            .map((item: any) => Number(item?.appid ?? item?.appId ?? item?.id ?? item))
            .filter((n: number) => Number.isFinite(n));
          if (ids.length) return ids;
        } catch {}
      }
    }
  }
  return [];
}

/**
 * Resolve installation state for a single appid by querying Steam's AppStore
 * objects (GetAppOverviewByAppID) and checking per-client data / explicit fields.
 * Returns `true` = installed, `false` = not installed, `null` = unknown.
 */
export async function resolveAppInstalledState(appid: number): Promise<boolean | null> {
  try {
    for (const win of getSteamWindows()) {
      const appStore = (win as any)?.appStore ?? win?.AppStore ?? (globalThis as any).AppStore;
      if (!appStore || typeof appStore.GetAppOverviewByAppID !== 'function') continue;
      try {
        const raw = appStore.GetAppOverviewByAppID(appid);
        if (!raw) continue;
        const directInstalled = raw?.installed ?? raw?.is_installed ?? raw?.m_bInstalled ?? raw?.bInstalled;
        if (directInstalled === true) return true;
        if (directInstalled === false) return false;
        const pcd = raw?.per_client_data ?? raw?.local_per_client_data;
        const clientData = Array.isArray(pcd) ? pcd[0] : (pcd ?? null);
        if (clientData) {
          const pcdInstalled = readOptionalBoolean(clientData, ["installed", "is_installed"]);
          if (pcdInstalled !== undefined) return pcdInstalled;
        }
        const sod = Number(raw?.size_on_disk ?? raw?.m_nSizeOnDisk ?? 0);
        if (Number.isFinite(sod) && sod > 0) return true;
        const lastLocal = Number(raw?.rt_last_time_locally_played ?? raw?.m_rtLastTimePlayed ?? 0);
        if (Number.isFinite(lastLocal) && lastLocal > 0) return true;
        return false;
      } catch {}
    }
  } catch {}
  return null;
}

export async function listLibraryTabs(): Promise<PlatformTab[]> {
  const defaults: PlatformTab[] = [
    { id: "all", name: "All Games" },
    { id: "favorites", name: "Favorites" },
    { id: "installed", name: "Installed" },
    { id: "hidden", name: "Hidden" },
    { id: "nonsteam", name: "Non-Steam" },
  ];

  // Hard guarantee: any thrown error in the discovery chain below must NOT
  // surface as a rejected promise — the settings controller's `.catch`
  // path replaces `tabs` with [], leaving the EditShelfModal's tab dropdown
  // empty (regression seen against SteamOS 3.9 where some host-window
  // accessors started throwing on enumeration). Wrap everything; always
  // fall back to the 5 native defaults.
  try {
    // 1. Settings file — primary source for TabMaster tabs.
    // Guard removed: in SteamOS 3.9 DeckyPluginLoader is no longer accessible
    // via window, so isTabMasterInstalled() always returns false even when
    // TabMaster IS installed. The Python backend returns {"tabs":[]} safely
    // when the file is absent, so unconditional call is safe on both 3.7 and 3.9.
    try {
      const { getVisibleTabsFromSettingsFile } = await import('../integrations/tabmaster');
      const settingsTabs = await getVisibleTabsFromSettingsFile();
      if (settingsTabs.length > 0) return settingsTabs;
    } catch {}

    // 2. React fiber traversal — forward-compat fallback if TabMaster adds context later
    try {
      const fiberTabs = getCustomFiltersList();
      if (fiberTabs.length > 0) return fiberTabs;
    } catch {}

    // 3. DOM-based tab reading — for UnifiDeck and other plugins that render [data-tab-id]
    try {
      const { getTabsFromDOM } = await import('../integrations/domtabs');
      const domTabs = getTabsFromDOM();
      if (domTabs.length > 0) return domTabs;
    } catch {}

    // 4. Native special tabs + user collections from collectionStore.
    // Adds "Recentes" (allRecentAppsCollection) plus user-created collections
    // (including Unifideck-managed ones). Uses the safe raw storage map —
    // never touches the userCollections getter to avoid MobX cache poisoning.
    // Compatible with both SteamOS 3.7 and 3.9: on 3.7 this step is only
    // reached if TabMaster is not installed; on 3.9 it adds user collections
    // that LibraryTabStore used to expose but no longer does.
    try {
      const cs = (globalThis as any).collectionStore;
      const extra: PlatformTab[] = [];
      const seen = new Set(defaults.map((t) => t.id.toLowerCase()));
      // "Recentes" native tab
      const recentCol = cs?.recentAppsCollection ?? cs?.allRecentAppsCollection;
      if (recentCol) {
        const id = String(recentCol.id ?? recentCol.m_strId ?? 'recent');
        const name = String(recentCol.displayName ?? recentCol.m_strName ?? 'Recent');
        if (id && !seen.has(id.toLowerCase())) { seen.add(id.toLowerCase()); extra.push({ id, name }); }
      }
      // User-created collections (uc-*, from-tag-*, etc.)
      const rawMap = cs?.m_mapCollectionsFromStorage ?? cs?.collectionsFromStorage;
      if (rawMap && typeof rawMap.values === 'function') {
        const SYSTEM_IDS = new Set([
          'favorite','hidden','notinstalled','installed','local',
          'deckverified','controller','uncategorized',
          'all-apps-alpha','all-apps-recent','local-install','recent',
        ]);
        for (const col of rawMap.values()) {
          const id = String(col?.id ?? col?.m_strId ?? col?.key ?? '');
          const name = String(col?.displayName ?? col?.m_strName ?? '');
          if (!id || !name) continue;
          if (SYSTEM_IDS.has(id.toLowerCase()) || seen.has(id.toLowerCase())) continue;
          try { if (cs?.BIsSystemCollectionId?.(id)) continue; } catch {}
          seen.add(id.toLowerCase());
          extra.push({ id, name });
        }
      }
      if (extra.length > 0) return [...defaults, ...extra];
    } catch {}
  } catch {}

  return defaults;
}

/**
 * Remove an app from a Steam collection.
 * Tries multiple API shapes across SteamOS versions.
 */
export function removeAppFromCollection(collectionId: string, appid: number): void {
  try {
    for (const win of getSteamWindows()) {
      const store = win?.collectionStore ?? (globalThis as any).collectionStore;
      if (!store) continue;
      // Attempt 1: GetCollection by id
      const coll = store.GetCollection?.(collectionId);
      if (coll) {
        if (typeof coll.RemoveApps === 'function') { coll.RemoveApps([appid]); store.userCollectionStore?.CommitCollection?.(coll); return; }
        if (typeof coll.RemoveApp === 'function') { coll.RemoveApp(appid); return; }
        if (coll.apps instanceof Map && coll.apps.has(appid)) {
          coll.apps.delete(appid);
          store.userCollectionStore?.CommitCollection?.(coll);
          return;
        }
      }
      // Attempt 2: iterate the raw storage map. NEVER read `userCollections`
      // here — that getter is a MobX computed that poisons its own cache when
      // evaluated against a not-yet-initialized store, taking down Steam's
      // library home. The raw map holds every user-defined collection.
      const rawMap: any = store.m_mapCollectionsFromStorage ?? store.collectionsFromStorage;
      const userColls: any[] = rawMap && typeof rawMap.values === 'function'
        ? Array.from(rawMap.values())
        : (Array.isArray(rawMap) ? rawMap : []);
      for (const c of userColls) {
        const id = String(c?.id ?? c?.collectionid ?? '');
        if (id !== collectionId) continue;
        if (typeof c.RemoveApps === 'function') { c.RemoveApps([appid]); store.userCollectionStore?.CommitCollection?.(c); return; }
        if (typeof c.RemoveApp === 'function') { c.RemoveApp(appid); return; }
        if (c.apps instanceof Map && c.apps.has(appid)) {
          c.apps.delete(appid);
          store.userCollectionStore?.CommitCollection?.(c);
          return;
        }
      }
    }
  } catch {}
}

export async function listCollections(): Promise<SteamCollection[]> {
  const clients = getSteamClients();
  const hostWindows = getSteamWindows();
  const docs = Array.from(new Set([getPreferredSteamDocument(), ...hostWindows.map((win: any) => win?.document)].filter(Boolean)));
  const normalize = (items: any[]): SteamCollection[] => items
    .map((c: any) => {
      const id = String(c?.id ?? c?.collectionid ?? c?.gid ?? c?.key ?? c?.name ?? c?.displayName ?? "");
      const name = String(c?.displayName ?? c?.m_strName ?? c?.name ?? c?.title ?? c?.label ?? "Collection");
      if (id && name) cacheCollectionRaw(id, name, c);
      return { id, name };
    })
    .filter((c) => c.id && c.name);
  for (const hostWindow of hostWindows) {
    const globalCollectionStore = hostWindow?.collectionStore ?? (globalThis as any).collectionStore;
    if (!globalCollectionStore) continue;
    // NEVER read `globalCollectionStore.userCollections` here. That getter is
    // a MobX computed: if the first evaluation happens while the store is
    // still initializing it throws, and MobX caches the exception forever —
    // every later read (including Steam's own library home) hits the cached
    // error and crashes. `listCollections` is called during early shelf
    // resolution, which is exactly when the store may not be ready. Skip
    // straight to the raw storage map below — it already holds every user
    // collection (size 23 confirmed live on SteamOS 3.7).
    // m_mapCollectionsFromStorage is a MobX ObservableMap; .keys()/.get() work.
    // Collections have m_strId but no top-level `id`, so inject it explicitly.
    try {
      const m = globalCollectionStore.m_mapCollectionsFromStorage;
      if (m && typeof m.keys === 'function') {
        const items: any[] = [];
        for (const key of m.keys()) {
          try {
            const c = m.get(key);
            if (c) items.push({ id: (c as any).m_strId ?? key, ...(c as any) });
          } catch {}
        }
        const norm = normalize(items);
        if (norm.length) return norm;
      }
    } catch {}
  }
  for (const sc of clients) {
    try {
      const res = await sc?.Collections?.GetCollections?.();
      if (Array.isArray(res)) return normalize(res);
    } catch {}
    try {
      const res = await sc?.CollectionStore?.GetAllCollections?.();
      if (res && typeof res === "object") {
        const arr = Array.isArray(res) ? res : Object.values(res);
        const norm = normalize(arr as any[]);
        if (norm.length) return norm;
      }
    } catch {}
  }
  for (const candidate of [
    ...hostWindows.flatMap((hostWindow) => [hostWindow?.CollectionStore, hostWindow?.LibraryStore, hostWindow?.collections, hostWindow?.g_Collections, hostWindow?.TabMasterStore, hostWindow?.UnifiDeckStore]),
    ...clients.map((sc) => sc?.LibraryStore),
  ]) {
    try {
      const arr = Array.isArray(candidate) ? candidate : Object.values(candidate ?? {});
      const norm = normalize(arr as any[]);
      if (norm.length) return norm;
    } catch {}
  }

  for (const doc of docs) {
    try {
      const nodes = Array.from(doc.querySelectorAll('[data-collection-id], [class*="collection"]'));
      const dom = nodes.map((node) => {
        const el = node as HTMLElement;
        return {
          id: String(el.dataset?.collectionId || el.getAttribute('data-collection-id') || (el.textContent || '').trim()),
          name: String((el.textContent || '').trim()),
        };
      }).filter((c) => c.id && c.name && c.name.length < 80);
      if (dom.length) return normalize(dom as any[]);
    } catch {}
  }

  return [];
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

// Unifideck marks every shortcut it registers as `installed: true` on the app
// overview regardless of real state. Ground truth lives in its "[Unifideck]
// Installed" collection. Cache the membership briefly so filter passes over
// ~2k apps stay O(1) per check.
let _ufInstalledCache: { ids: Set<number>; ts: number } | null = null;
const UF_INSTALLED_LABELS = new Set([
  "installed", "instalados", "instalado", "installés", "installierte",
  "installiert", "installati", "zainstalowane", "geïnstalleerd",
  "installerade", "установленные", "установлено", "インストール済み",
  "已安装", "已安裝", "설치됨", "ติดตั้งแล้ว",
]);
function getUnifideckInstalledSet(): Set<number> {
  const now = Date.now();
  if (_ufInstalledCache && now - _ufInstalledCache.ts < 5000) return _ufInstalledCache.ids;
  const ids = new Set<number>();
  try {
    const cs: any = (globalThis as any).collectionStore;
    // Read the raw storage map, never the `userCollections` getter. That
    // getter is a MobX computed: evaluated while the collection store is
    // still initializing it throws, and MobX then caches the exception
    // permanently — poisoning every later read, including Steam's own
    // library home, which crashes (and the Decky error boundary then blames
    // this plugin). The raw map already holds every user collection.
    const cols = cs?.m_mapCollectionsFromStorage ?? cs?.collectionsFromStorage;
    const list: any[] = Array.isArray(cols) ? cols : Array.from(cols?.values?.() ?? []);
    const match = list.find((c: any) => {
      const name = String(c?.displayName ?? c?.m_strName ?? "");
      if (!/^\[Unifideck\]/i.test(name)) return false;
      const label = name.replace(/^\[Unifideck\]\s*/i, "").trim().toLowerCase();
      return UF_INSTALLED_LABELS.has(label);
    });
    const apps = match?.allApps ?? match?.m_rgApps ?? [];
    for (const a of apps) {
      const n = Number(a?.appid);
      if (Number.isFinite(n)) ids.add(n);
    }
  } catch {}
  _ufInstalledCache = { ids, ts: now };
  return ids;
}

// Cloud-play set: Unifideck Microsoft (Xbox Cloud Gaming). Other Unifideck
// providers (Epic, GOG, Amazon, Ubisoft) are native-install platforms —
// owning a game there counts as owned even when not installed locally.
let _ufCloudCache: { ids: Set<number>; ts: number } | null = null;
const UF_CLOUD_COLLECTION_LABELS = new Set(["microsoft"]);
export function getUnifideckCloudPlaySet(): Set<number> {
  const now = Date.now();
  if (_ufCloudCache && now - _ufCloudCache.ts < 5000) return _ufCloudCache.ids;
  const ids = new Set<number>();
  try {
    const cs: any = (globalThis as any).collectionStore;
    const cols = cs?.m_mapCollectionsFromStorage ?? cs?.collectionsFromStorage;
    const list: any[] = Array.isArray(cols) ? cols : Array.from(cols?.values?.() ?? []);
    for (const c of list) {
      const name = String(c?.displayName ?? c?.m_strName ?? "");
      if (!/^\[Unifideck\]/i.test(name)) continue;
      const label = name.replace(/^\[Unifideck\]\s*/i, "").trim().toLowerCase();
      if (!UF_CLOUD_COLLECTION_LABELS.has(label)) continue;
      const apps = c?.allApps ?? c?.m_rgApps ?? [];
      for (const a of apps) {
        const n = Number(a?.appid);
        if (Number.isFinite(n)) ids.add(n);
      }
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
  // `visible_in_game_list === false` is how SteamOS 3.x / recent Steam clients
  // mark hidden games on the AppOverview protobuf — the older bool fields
  // (is_hidden, m_bHidden) are not populated on these versions (confirmed via
  // CDP on SteamOS 3.7, issue #63). Check all known variants.
  if (a?.visible_in_game_list === false) return true;
  return !!(a?.is_hidden ?? a?.hidden ?? a?.m_bHidden ?? a?.bHidden);
}
/**
 * AppIDs in the user's library. Steam comes from allGamesCollection;
 * non-Steam (when includeNonSteam) comes from myGamesCollection filtered
 * by isNonSteamOf. Cloud-play entries are subtracted unless includeCloudPlay.
 */
export function getLocalLibraryAppIds(includeNonSteam: boolean, includeCloudPlay: boolean = false): Set<number> {
  const out = new Set<number>();
  const collectSteam = (coll: any): void => {
    if (!coll) return;
    const apps = coll.allApps ?? coll.visibleApps ?? coll.apps ?? [];
    for (const a of apps) {
      if (isNonSteamOf(a)) continue;
      const id = Number(a?.appid ?? a?.m_unAppID);
      if (Number.isFinite(id) && id > 0) out.add(id);
    }
  };
  // Non-Steam entries live in myGamesCollection on current Steam builds
  // (allShortcutsCollection is undefined). Cloud-play (Xbox via Unifideck
  // Microsoft) is detected by collection membership; other providers
  // (Epic/GOG/etc.) still count as owned when not installed locally.
  const collectNonSteam = (coll: any): void => {
    if (!coll) return;
    const apps = coll.allApps ?? coll.visibleApps ?? coll.apps ?? [];
    for (const a of apps) {
      if (!isNonSteamOf(a)) continue;
      if (!includeCloudPlay && isCloudPlayShortcut(a)) continue;
      const id = Number(a?.appid ?? a?.m_unAppID);
      if (Number.isFinite(id) && id > 0) out.add(id);
    }
  };
  try {
    const cs: any = (globalThis as any).collectionStore;
    if (cs) {
      collectSteam(cs.allGamesCollection);
      if (includeNonSteam) {
        // Prefer `myGamesCollection` (Steam + shortcuts mixed) since
        // `allShortcutsCollection` doesn't exist on recent Steam builds.
        collectNonSteam(cs.myGamesCollection ?? cs.allAppsCollection ?? cs.allShortcutsCollection);
      }
    }
    if (out.size === 0) {
      for (const hw of getSteamWindows()) {
        const cs2: any = (hw as any)?.collectionStore;
        if (!cs2) continue;
        collectSteam(cs2.allGamesCollection);
        if (includeNonSteam) {
          collectNonSteam(cs2.myGamesCollection ?? cs2.allAppsCollection ?? cs2.allShortcutsCollection);
        }
        if (out.size > 0) break;
      }
    }
  } catch {}
  return out;
}
function isInstalledOf(a: any): boolean {
  if (isNonSteamOf(a)) {
    const uf = getUnifideckInstalledSet();
    if (uf.size > 0) return uf.has(Number(a?.appid));
    const sod = Number(a?.size_on_disk ?? 0);
    if (Number.isFinite(sod) && sod > 0) return true;
    const lp = Number(a?.rt_last_time_locally_played ?? 0);
    return Number.isFinite(lp) && lp > 0;
  }
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

export function normalizeAppOverview(node: any): AppOverview | null {
  const appid = appIdOf(node);
  if (!Number.isFinite(appid) || appid <= 0) return null;
  const name = appNameOf(node);
  return {
    appid,
    display_name: name || String(node?.displayName ?? node?.title ?? `App ${appid}`),
    sort_as: String(node?.sort_as ?? node?.sortAs ?? name ?? ""),
    last_played: Number(node?.last_played ?? node?.rt_last_time_played ?? node?.m_ulLastPlayed ?? 0),
    playtime_forever: Number(node?.playtime_forever ?? node?.minutes_playtime_forever ?? node?.minutes_played_forever ?? 0),
    is_steam: node?.is_steam ?? !isNonSteamOf(node),
    is_non_steam: isNonSteamOf(node),
    is_favorite: readOptionalBoolean(node, ["is_favorite", "favorite", "m_bIsFavorite", "m_bFavorite", "bFavorite"]),
    is_hidden: (node?.visible_in_game_list === false) ? true : readOptionalBoolean(node, ["is_hidden", "hidden", "m_bHidden", "bHidden"]),
    installed: (() => {
      // Non-Steam shortcuts (notably Unifideck) advertise installed:true on
      // the raw overview regardless of real state. Defer to isInstalledOf
      // which consults the Unifideck collection, then size_on_disk and
      // locally-played as fallbacks.
      if (isNonSteamOf(node)) return isInstalledOf({ ...node, appid });
      const explicit = readOptionalBoolean(node, ["installed", "is_installed", "m_bInstalled", "bInstalled"]);
      if (explicit !== undefined) return explicit;
      try {
        const pcd = node?.per_client_data ?? node?.local_per_client_data;
        const clientData = Array.isArray(pcd) ? pcd[0] : (pcd ?? null);
        if (clientData) {
          // Only check explicit installed field in pcd — do NOT infer from display_status.
          // ds=9 means "available on remote client" (not locally installed);
          // ds=11 has an explicit installed:true in pcd so the check above catches it.
          const pcdExplicit = readOptionalBoolean(clientData, ["installed", "is_installed"]);
          if (pcdExplicit !== undefined) return pcdExplicit;
        }
      } catch {}
      try {
        const size = Number(node?.size_on_disk ?? node?.installed_size ?? 0);
        if (Number.isFinite(size) && size > 0) return true;
      } catch {}
      return undefined;
    })(),
    update_pending: (() => {
      const pcd = node?.per_client_data;
      const clientData = Array.isArray(pcd) ? pcd[0] : (pcd ?? null);
      if (clientData) {
        const ds = Number(clientData?.display_status ?? 0);
        if (UPDATE_PENDING_STATUSES.includes(ds)) return true;
        const bytesDown = Number(clientData?.bytes_to_download ?? clientData?.m_nBytesToDownload ?? 0);
        const bytesStage = Number(clientData?.bytes_to_stage ?? clientData?.m_nBytesToStage ?? 0);
        if (bytesDown > 0 || bytesStage > 0) return true;
      }
      const explicit = readOptionalBoolean(node, [
        "update_running", "m_bUpdateRunning", "bUpdateRunning",
        "update_available", "m_bUpdateAvailable", "m_bNeedsUpdate",
        "needs_update", "m_bUpdatePaused",
      ]);
      if (explicit === true) return true;
      return explicit;
    })(),
    display_status: (() => {
      try {
        const pcd = node?.per_client_data;
        const clientData = Array.isArray(pcd) ? pcd[0] : (pcd ?? null);
        if (clientData) {
          const ds = Number(clientData?.display_status ?? 0);
          return ds > 0 ? ds : undefined;
        }
      } catch {}
      return undefined;
    })(),
    deck_compatibility_category: Number(node?.deck_compatibility_category ?? node?.m_eDeckCompatibilityCategory ?? ((Number(node?.steam_hw_compat_category_packed ?? 0) & 0xF) || 0)),
    library_capsule: String(node?.library_capsule ?? node?.libraryCapsule ?? node?.vertical_capsule ?? ""),
    library_capsule_filename: String(node?.library_capsule_filename ?? node?.libraryCapsuleFilename ?? ""),
    rt_store_asset_mtime: Number(node?.rt_store_asset_mtime ?? node?.rtStoreAssetMtime ?? 0) || undefined,
    user_added_ts: Number(node?.time_added ?? node?.m_time_added ?? node?.added ?? node?.rt_time_added_to_account ?? node?.m_rtTimeAdded ?? node?.timeAddedToAccount ?? node?.time_added_to_account ?? node?.m_time_added_to_account ?? 0) || undefined,
    rt_purchased_time: Number(node?.rt_purchased_time ?? node?.rtPurchasedTime ?? 0) || undefined,
    rt_recent_activity_time: Number(node?.rt_recent_activity_time ?? node?.rtRecentActivityTime ?? 0) || undefined,
    library_hero: String(node?.library_hero ?? node?.hero ?? node?.libraryHero ?? ""),
    header: String(node?.header ?? node?.header_image ?? node?.capsule ?? ""),
    icon_hash: String(node?.icon_hash ?? node?.iconHash ?? ""),
    app_type: Number(node?.app_type ?? node?.appType ?? node?.m_eAppType ?? node?.eAppType ?? 0) || undefined,
    cloud_available: readOptionalBoolean(node, ["bCloudAvailable", "cloud_available", "b_cloud_available"]),
    controller_support: (() => {
      const raw = node?.nControllerSupport ?? node?.controller_support ?? node?.n_controller_support;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    })(),
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

export async function enrichAppStateFlags(items: AppOverview[]): Promise<AppOverview[]> {
  const byId = new Map(items.map((item) => [item.appid, { ...item }]));
  const sources = [
    ...getSteamClients().flatMap((sc) => [sc?.Apps, sc?.LibraryStore, sc?.AppStore]),
    ...getSteamWindows().flatMap((win) => [win?.appStore, win?.AppStore, win?.LibraryStore, win?.appsStore]),
  ].filter(Boolean);

  const applyFlag = (ids: number[], field: "installed" | "is_favorite" | "is_hidden") => {
    for (const appid of ids) {
      const current = byId.get(appid);
      if (!current) continue;
      (current as any)[field] = true;
    }
  };

  const asyncMethods: Array<{ names: string[]; field: "installed" | "is_favorite" | "is_hidden" }> = [
    { names: ["GetInstalledApps", "GetInstalledAppIDs", "GetInstalledGames"], field: "installed" },
    { names: ["GetFavoriteApps", "GetFavoriteAppIDs", "GetFavorites"], field: "is_favorite" },
    { names: ["GetHiddenApps", "GetHiddenAppIDs"], field: "is_hidden" },
  ];
  const valueCandidates: Array<{ keys: string[]; field: "installed" | "is_favorite" | "is_hidden" }> = [
    { keys: ["installedApps", "m_rgInstalledApps", "m_setInstalledApps"], field: "installed" },
    { keys: ["favoriteApps", "m_rgFavoriteApps", "m_setFavoriteApps"], field: "is_favorite" },
    { keys: ["hiddenApps", "m_rgHiddenApps", "m_setHiddenApps"], field: "is_hidden" },
  ];

  for (const source of sources) {
    for (const entry of asyncMethods) {
      for (const name of entry.names) {
        try {
          const fn = (source as any)?.[name];
          if (typeof fn !== "function") continue;
          applyFlag(extractStatefulAppIds(await fn.call(source)), entry.field);
        } catch {}
      }
    }
    for (const entry of valueCandidates) {
      for (const key of entry.keys) {
        try {
          applyFlag(extractStatefulAppIds((source as any)?.[key]), entry.field);
        } catch {}
      }
    }
  }

  // Try collectionStore for favorites (covers localized collection names)
  for (const win of getSteamWindows()) {
    try {
      const cs = (win as any)?.collectionStore;
      if (!cs) continue;
      const favColl = cs.favoriteCollection ?? cs.GetCollection?.("favorite");
      if (favColl) {
        applyFlag(extractCollectionAppIds(favColl), "is_favorite");
      }
    } catch {}
  }

  try {
    for (const win of getSteamWindows()) {
      const appStore = (win as any)?.appStore ?? (win as any)?.AppStore;
      if (!appStore?.GetAppOverviewByAppID) continue;
      for (const [appid, item] of byId) {
        if (item.installed === false) continue;  // skip already-confirmed not-installed
        try {
          const raw = appStore.GetAppOverviewByAppID(appid);
          if (!raw) continue;

          const directInstalled = raw?.installed ?? raw?.is_installed ?? raw?.m_bInstalled ?? raw?.bInstalled;
          if (directInstalled === true) { item.installed = true; continue; }
          if (directInstalled === false) { item.installed = false; continue; }

          const pcd = raw?.per_client_data ?? raw?.local_per_client_data;
          const clientData = Array.isArray(pcd) ? pcd[0] : (pcd ?? null);
          if (clientData) {
            // Only use explicit installed field in pcd — do NOT infer from display_status.
            const pcdInstalled = readOptionalBoolean(clientData, ["installed", "is_installed"]);
            if (pcdInstalled !== undefined) { item.installed = pcdInstalled; continue; }
            // No explicit field in pcd — leave item.installed unchanged (don't assume)
            continue;
          }

          const sod = Number(raw?.size_on_disk ?? raw?.m_nSizeOnDisk ?? 0);
          if (Number.isFinite(sod) && sod > 0) { item.installed = true; continue; }

          const lastLocal = Number(raw?.rt_last_time_locally_played ?? raw?.m_rtLastTimePlayed ?? 0);
          if (Number.isFinite(lastLocal) && lastLocal > 0) { item.installed = true; continue; }

          item.installed = false;
        } catch {}
      }
      break; // Only need the first working appStore
    }
  } catch {}

  return [...byId.values()];
}

function isMapLike(obj: any): boolean {
  return obj && typeof obj === 'object' && typeof obj.values === 'function' && typeof obj.get === 'function';
}

function isSetLike(obj: any): boolean {
  return obj && typeof obj === 'object' && typeof obj.values === 'function' && typeof obj.has === 'function' && !isMapLike(obj) && typeof obj.get !== 'function';
}

function extractAppOverviewsFromCandidate(candidate: any): AppOverview[] {
  const out: AppOverview[] = [];
  const seen = new Set<any>();
  let visited = 0;

  const visit = (node: any, depth = 0) => {
    if (!node || seen.has(node)) return;
    if (visited > 4000 || depth > 6) return;
    if (typeof Element !== "undefined" && node instanceof Element) return;
    if (typeof node !== "object") return;
    seen.add(node);
    visited += 1;

    const normalized = normalizeAppOverview(node);
    if (normalized) out.push(normalized);

    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }

    // Handle both native Map and MobX ObservableMap
    if (isMapLike(node)) {
      for (const value of node.values()) visit(value, depth + 1);
      return;
    }

    // Handle both native Set and MobX ObservableSet
    if (isSetLike(node) || node instanceof Set) {
      for (const value of node.values()) visit(value, depth + 1);
      return;
    }

    // Handle generic iterables (MobX collections, custom containers)
    if (typeof node[Symbol.iterator] === 'function' && !Array.isArray(node) && typeof node !== 'string') {
      try {
        for (const value of node) visit(value, depth + 1);
        return;
      } catch {}
    }

    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue;
      if (/(apps|app|overview|library|map|list|items|entries|collection|recent|favorite|installed)/i.test(key) || depth < 2) {
        visit(value, depth + 1);
      }
    }
  };

  visit(candidate);
  return uniqApps(out);
}

function extractAppOverviewsFromStoreMethods(store: any): AppOverview[] {
  if (!store) return [];
  const out: AppOverview[] = [];
  const tryPushFrom = (value: any) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = normalizeAppOverview(item);
        if (normalized) out.push(normalized);
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const candidate of Object.values(value as Record<string, unknown>)) {
        const normalized = normalizeAppOverview(candidate);
        if (normalized) out.push(normalized);
      }
    }
  };

  const methodNames = [
    "GetApps",
    "GetAllApps",
    "GetAppList",
    "GetAppOverviews",
    "GetAllAppOverviews",
    "GetCachedAppOverviews",
    "GetInstalledApps",
    "GetGames",
  ];

  for (const name of methodNames) {
    try {
      const fn = store?.[name];
      if (typeof fn !== "function") continue;
      tryPushFrom(fn.call(store));
    } catch {}
  }

  const mapCandidates = [
    store?.m_mapAppInfo,
    store?.m_mapAppOverviews,
    store?.m_mapAppOverviewByAppID,
    store?.m_mapApps,
    store?.m_rgApps,
    store?.apps,
    store?.allApps,
    store?.appList,
  ];

  for (const candidate of mapCandidates) {
    try {
      if (isMapLike(candidate)) {
        tryPushFrom(Array.from(candidate.values()));
      } else {
        tryPushFrom(candidate);
      }
    } catch {}
  }

  return uniqApps(out);
}

// Comparator used to sort by "added" preference (user-added timestamp, then store asset mtime)
export function compareByAdded(a: AppOverview, b: AppOverview): number {
  const aVal = (a as any)?.rt_purchased_time ?? (a as any)?.user_added_ts ?? (a as any)?.rt_store_asset_mtime ?? 0;
  const bVal = (b as any)?.rt_purchased_time ?? (b as any)?.user_added_ts ?? (b as any)?.rt_store_asset_mtime ?? 0;
  const d = Number(bVal) - Number(aVal);
  if (d !== 0) return d;
  return Number(appIdOf(b)) - Number(appIdOf(a));
}

function extractAppIdsDeep(node: any, maxDepth = 6): number[] {
  const out: number[] = [];
  const seen = new Set<any>();
  const walk = (value: any, depth = 0) => {
    if (value == null || depth > maxDepth || seen.has(value)) return;
    if (typeof value === "number") {
      if (Number.isFinite(value) && value > 0) out.push(value);
      return;
    }
    if (typeof value !== "object") return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }

    // Handle both native Map/Set and MobX ObservableMap/ObservableSet
    if (isMapLike(value)) {
      for (const entry of value.values()) walk(entry, depth + 1);
      return;
    }

    if (isSetLike(value) || value instanceof Set) {
      for (const entry of value.values()) walk(entry, depth + 1);
      return;
    }

    if (typeof value[Symbol.iterator] === 'function' && typeof value !== 'string') {
      try {
        for (const entry of value) walk(entry, depth + 1);
        return;
      } catch {}
    }

    const direct = Number(value?.appid ?? value?.appId ?? value?.nAppID ?? value?.m_unAppID ?? 0);
    if (Number.isFinite(direct) && direct > 0) out.push(direct);

    for (const [key, child] of Object.entries(value)) {
      if (!child) continue;
      if (/(apps|appids|items|list|entries|children|rgAppIDs|m_rgAppIDs|rgItems|m_rgItems)/i.test(key)) {
        walk(child, depth + 1);
      } else if (depth < 2 && typeof child === "object") {
        walk(child, depth + 1);
      }
    }
  };
  walk(node, 0);
  return uniqNumbers(out);
}

function resolveCollectionIdsFromStoreDeep(store: any, idCandidates: string[], nameCandidates: string[]): number[] {
  if (!store) return [];
  const out: number[] = [];
  const visited = new Set<any>();
  const idNeedles = new Set(idCandidates.map((v) => normalizeText(v)).filter(Boolean));
  const idTokenNeedles = new Set(idCandidates.map((v) => normalizeCollectionToken(v)).filter(Boolean));
  const nameNeedles = new Set(nameCandidates.map((v) => normalizeText(v)).filter(Boolean));
  const looksLikeCollectionNode = (node: any): boolean => {
    const rawIdText = normalizeText(String(
      node?.id ?? node?.collectionid ?? node?.collectionId ?? node?.gid ?? node?.key ?? node?.uuid ?? node?.strCollectionID ?? node?.m_strCollectionID ?? ""
    ));
    const rawIdToken = normalizeCollectionToken(String(
      node?.id ?? node?.collectionid ?? node?.collectionId ?? node?.gid ?? node?.key ?? node?.uuid ?? node?.strCollectionID ?? node?.m_strCollectionID ?? ""
    ));
    const rawName = normalizeText(String(
      node?.name ?? node?.displayName ?? node?.title ?? node?.label ?? node?.strName ?? ""
    ));

    if (rawIdText && idNeedles.has(rawIdText)) return true;
    if (rawIdToken && idTokenNeedles.has(rawIdToken)) return true;
    if (rawName && nameNeedles.has(rawName)) return true;

    for (const needle of idNeedles) {
      if (!needle) continue;
      if (rawIdText.includes(needle)) return true;
    }
    for (const needle of idTokenNeedles) {
      if (!needle) continue;
      if (rawIdToken.includes(needle)) return true;
    }
    for (const needle of nameNeedles) {
      if (!needle) continue;
      if (rawName.includes(needle)) return true;
    }
    return false;
  };

  const walk = (node: any, depth = 0) => {
    if (!node || visited.has(node) || depth > 8) return;
    if (typeof node !== "object") return;
    visited.add(node);

    if (looksLikeCollectionNode(node)) {
      out.push(...extractAppIdsDeep(node, 7));
    }

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    if (node instanceof Map) {
      for (const [key, value] of node.entries()) {
        const keyNorm = normalizeText(String(key ?? ""));
        if (idNeedles.has(keyNorm) || nameNeedles.has(keyNorm)) {
          out.push(...extractAppIdsDeep(value, 7));
        }
        walk(value, depth + 1);
      }
      return;
    }

    if (node instanceof Set) {
      for (const value of node.values()) walk(value, depth + 1);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue;
      if (/(collect|collection|tab|items|apps|map|list|entries|groups|folders)/i.test(key) || depth < 2) {
        walk(value, depth + 1);
      }
    }
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
  // De-dupe in-flight calls. Several shelves resolving concurrently before
  // the first call lands would otherwise each trigger their own
  // GetAllAppOverviews chain (multiple Steam IPC round-trips, fallback walks
  // through every window/client). Now they all await a single shared promise.
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

async function fetchAllAppOverviews(now: number): Promise<AppOverview[]> {
  const out: AppOverview[] = [];
  for (const sc of getSteamClients()) {
    try {
      const res = await sc?.Apps?.GetAllAppOverviews?.();
      if (Array.isArray(res)) out.push(...(res as AppOverview[]));
    } catch {}
    try {
      const res = await sc?.Apps?.GetMyApps?.();
      if (Array.isArray(res)) out.push(...(res as AppOverview[]));
    } catch {}
  }
  if (!out.length) {
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
      try {
        out.push(...extractAppOverviewsFromCandidate(candidate));
      } catch {}
      try {
        out.push(...extractAppOverviewsFromStoreMethods(candidate));
      } catch {}
    }
    if (out.length) {
      logInfo("STEAM", "getAllAppOverviews fallback extracted apps", { count: uniqApps(out).length });
    }
  }

  // Try collectionStore paths (used by TabMaster / UnifiDeck)
  if (!out.length) {
    for (const hostWindow of getSteamWindows()) {
      try {
        const cs = (hostWindow as any)?.collectionStore ?? (globalThis as any)?.collectionStore;
        if (!cs) continue;
        // allAppsCollection includes shortcuts; fallback to allGamesCollection
        const appsColl = cs.allAppsCollection ?? cs.allGamesCollection ?? cs.localGamesCollection;
        if (appsColl) {
          const apps = appsColl.allApps ?? appsColl.visibleApps ?? appsColl.apps;
          if (apps) out.push(...extractAppOverviewsFromCandidate(apps));
        }
        // Also collect shortcuts specifically
        const shortcutsColl = cs.allShortcutsCollection ?? cs.shortcutsCollection ?? cs.nonSteamCollection;
        if (shortcutsColl) {
          const apps = shortcutsColl.allApps ?? shortcutsColl.visibleApps ?? shortcutsColl.apps;
          if (apps) out.push(...extractAppOverviewsFromCandidate(apps));
        }
        const typeMap = cs.appTypeCollectionMap;
        if (isMapLike(typeMap)) {
          // Include both games and shortcuts from type map
          for (const key of ['type-games', 'gamesCollection', 'type-shortcuts', 'shortcutsCollection']) {
            const coll = typeMap.get(key);
            if (coll) {
              const apps = coll.allApps ?? coll.visibleApps ?? coll.apps;
              if (apps) out.push(...extractAppOverviewsFromCandidate(apps));
            }
          }
        }
      } catch {}
    }
    if (out.length) {
      logInfo("STEAM", "getAllAppOverviews collectionStore extracted", { count: uniqApps(out).length });
    }
  }

  // Direct Map access on appStore
  if (!out.length) {
    for (const hostWindow of getSteamWindows()) {
      try {
        const maps = [
          (hostWindow as any)?.appStore?.m_mapApps,
          (hostWindow as any)?.AppStore?.m_mapApps,
          (hostWindow as any)?.appStore?.m_mapAppInfo,
          (hostWindow as any)?.AppStore?.m_mapAppInfo,
        ].filter(Boolean);
        for (const map of maps) {
          if (isMapLike(map) && (map.size ?? 0) > 0) {
            for (const value of map.values()) {
              const norm = normalizeAppOverview(value);
              if (norm) out.push(norm);
            }
          }
        }
      } catch {}
    }
    if (out.length) {
      logInfo("STEAM", "getAllAppOverviews directMap extracted", { count: uniqApps(out).length });
    }
  }

  // Last resort: get app IDs from collectionStore, then look up individual overviews
  if (!out.length) {
    const allIds: number[] = [];
    for (const hostWindow of getSteamWindows()) {
      try {
        const cs = (hostWindow as any)?.collectionStore ?? (globalThis as any)?.collectionStore;
        if (!cs) continue;
        const gamesColl = cs.allGamesCollection ?? cs.localGamesCollection ?? cs.allAppsCollection;
        if (gamesColl) {
          allIds.push(...extractAppIdsDeep(gamesColl, 4));
        }
      } catch {}
    }
    if (allIds.length) {
      const uniqueIds = uniqNumbers(allIds);
      logInfo("STEAM", "getAllAppOverviews: recovering via individual lookups", { idCount: uniqueIds.length });
      for (const appid of uniqueIds.slice(0, 2000)) {
        for (const hostWindow of getSteamWindows()) {
          try {
            const ov = (hostWindow as any)?.appStore?.GetAppOverviewByAppID?.(appid)
              ?? (hostWindow as any)?.AppStore?.GetAppOverviewByAppID?.(appid);
            if (ov) {
              const norm = normalizeAppOverview(ov);
              if (norm) { out.push(norm); break; }
            }
          } catch {}
        }
      }
      if (out.length) {
        logInfo("STEAM", "getAllAppOverviews individual lookups recovered", { count: uniqApps(out).length });
      }
    }
  }

  const unique = await enrichAppStateFlags(uniqApps(out));
  // Filter out phantom entries: internal Steam tools, DLCs, etc. that have
  // no meaningful name (fallback becomes "App <id>"), or have very low appids
  // that correspond to Valve internal tools/redistributables.
  const filtered = unique.filter((app) => {
    const name = app.display_name ?? "";
    // Skip items whose name is exactly "App <id>" — no real data
    if (name === `App ${app.appid}`) return false;
    // Skip empty/blank names
    if (!name.trim()) return false;
    return true;
  });
  if (!filtered.length) {
    if (now - lastNoAppsWarnAt > 10000) {
      lastNoAppsWarnAt = now;
      logWarn("STEAM", "getAllAppOverviews returned no apps", { windowCount: getSteamWindows().length, clientCount: getSteamClients().length });
    }
    // Don't cache empty results — retry next call
    return appOverviewCache ? appOverviewCache.items : filtered;
  }
  // Guard against cache regression: if the new result has significantly fewer
  // apps than the cache, prefer the existing cache (Steam stores may be
  // restructuring during initialization).
  if (appOverviewCache && filtered.length < appOverviewCache.items.length * 0.5) {
    appOverviewCache.ts = now;
    return appOverviewCache.items;
  }
  appOverviewCache = { ts: now, items: filtered };
  return filtered;
}

/**
 * Extract app IDs directly from a collection node without deep traversal.
 * Deep traversal (depth 7) can cross-contaminate: MobX stores keep sibling
 * collection references on the same object, so walking deep picks up apps
 * from unrelated collections.  We try direct well-known fields first, then
 * fall back to a bounded depth-3 traversal.
 */
function extractCollectionAppIds(raw: any): number[] {
  if (!raw || typeof raw !== "object") return [];
  const idsFromValue = (val: any): number[] => {
    if (!val) return [];
    if (typeof val === "number") return Number.isFinite(val) && val > 0 ? [val] : [];
    if (Array.isArray(val)) return val.flatMap(idsFromValue);
    if (isSetLike(val) || val instanceof Set) return Array.from(val.values()).flatMap(idsFromValue);
    if (isMapLike(val) || val instanceof Map) return Array.from(val.values()).flatMap(idsFromValue);
    if (typeof val === "object") {
      const n = Number(val?.appid ?? val?.appId ?? val?.nAppID ?? val?.m_unAppID ?? 0);
      return Number.isFinite(n) && n > 0 ? [n] : [];
    }
    return [];
  };
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

async function getCollectionApps(collectionId: string, collectionNameHint = ""): Promise<number[]> {
  const ids: number[] = [];
  const idCandidates = candidateCollectionIds(collectionId);
  const nameCandidates = [collectionNameHint].filter(Boolean);

  for (const raw of getCachedCollectionRawCandidates(idCandidates, nameCandidates)) {
    ids.push(...extractCollectionAppIds(raw));
  }

  if (!ids.length) {
    try {
      await listCollections();
      for (const raw of getCachedCollectionRawCandidates(idCandidates, nameCandidates)) {
        ids.push(...extractCollectionAppIds(raw));
      }
    } catch {}
  }

  for (const sc of getSteamClients()) {
    for (const id of idCandidates) {
      try {
        const res = await sc?.Collections?.GetCollectionItems?.(id);
        if (Array.isArray(res)) ids.push(...res.map((x: any) => Number(x.appid ?? x)));
      } catch {}
      try {
        const res = await sc?.CollectionStore?.GetCollectionApps?.(id);
        if (Array.isArray(res)) ids.push(...res.map((x: any) => Number(x.appid ?? x)));
      } catch {}
    }
  }

  if (!ids.length) {
    const stores = collectDynamicCollectionStores();
    const methods = ["GetCollectionItems", "GetCollectionApps", "GetAppsForCollection", "GetAppsInCollection", "ResolveCollectionApps", "GetCollectionAppIDs"];
    for (const store of stores) {
      for (const method of methods) {
        const fn = store?.[method];
        if (typeof fn !== "function") continue;
        for (const id of idCandidates) {
          try {
            const result = await fn.call(store, id);
            const arr = Array.isArray(result)
              ? result
              : (result && typeof result === "object" ? (result.apps ?? result.appids ?? result.items ?? result.list ?? result.entries ?? []) : []);
            if (Array.isArray(arr)) ids.push(...arr.map((x: any) => Number(x?.appid ?? x?.appId ?? x)));
          } catch {}
        }
      }

      // Map/object fallback keyed by collection id
      try {
        const maps = [store?.m_mapCollections, store?.m_mapCollectionData, store?.collections, store?.m_rgCollections, store?.m_mapTabs];
        for (const candidate of maps) {
          if (!candidate) continue;
          for (const id of idCandidates) {
            const entry = candidate instanceof Map ? candidate.get(id) : candidate?.[id];
            if (entry) {
              ids.push(...extractCollectionAppIds(entry));
            }
          }
        }
      } catch {}

      // Deep fallback for uc-* and custom collection stores.
      try {
        ids.push(...resolveCollectionIdsFromStoreDeep(store, idCandidates, nameCandidates));
      } catch {}
    }
  }
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

/**
 * Resolve app IDs for the Steam "Favorites" collection.
 * Tries collectionStore APIs and well-known localized collection names
 * so the resolution works regardless of the console language.
 */
async function getFavoritesCollectionAppIds(): Promise<number[]> {
  const localizedNames = [
    "Favorites", "Favoris", "Favoriten", "Favoritos", "Preferiti",
    "Избранное", "Ulubione", "Favorieten", "Favoriler", "Обране",
    "お気に入り", "즐겨찾기", "收藏夹",
  ];
  const internalIds = ["favorite", "favorites", "user-collections-favorite"];

  // Try collectionStore.favoriteCollection or GetCollection("favorite")
  for (const win of getSteamWindows()) {
    try {
      const cs = (win as any)?.collectionStore;
      if (!cs) continue;
      const favColl = cs.favoriteCollection ?? cs.GetCollection?.("favorite");
      if (favColl) {
        const ids = extractCollectionAppIds(favColl);
        if (ids.length) return ids;
      }
    } catch {}
  }

  // Try SteamClient.Collections API
  for (const sc of getSteamClients()) {
    for (const method of ["GetFavoriteCollectionApps", "GetFavoriteApps", "GetFavoriteAppIDs"]) {
      try {
        const fn = (sc?.Collections as any)?.[method];
        if (typeof fn !== "function") continue;
        const res = await fn.call(sc.Collections);
        if (Array.isArray(res) && res.length) return res.map((x: any) => Number(x?.appid ?? x)).filter(Number.isFinite);
      } catch {}
    }
  }

  // Fallback: search all collections for known favorites names/IDs
  try {
    const collections = await listCollections();
    const allNames = new Set([...localizedNames.map((n) => normalizeText(n)), ...internalIds]);
    for (const coll of collections) {
      const normId = normalizeText(coll.id);
      const normName = normalizeText(coll.name);
      if (allNames.has(normId) || allNames.has(normName)) {
        const ids = await getCollectionApps(coll.id, coll.name);
        if (ids.length) return ids;
      }
    }
  } catch {}

  return [];
}

async function resolveDynamicTab(tab: string, all: AppOverview[]): Promise<AppOverview[]> {
  const id = slugifyTab(tab.startsWith("/") ? tab.split("/").pop() || tab : tab);
  if (id === "all" || id === "all_games" || id === "allgames") return all;
  if (id === "favorites") {
    const byFlag = all.filter((a) => isFavoriteOf(a));
    if (byFlag.length > 0) return byFlag;
    // Fallback: resolve via localized Favorites collection
    const favIds = await getFavoritesCollectionAppIds();
    if (favIds.length) {
      const favSet = new Set(favIds);
      return all.filter((a) => favSet.has(appIdOf(a)));
    }
    return byFlag;
  }
  if (id === "hidden") return all.filter((a) => isHiddenOf(a));
  if (id === "nonsteam" || id === "epic" || id === "gog") return all.filter((a) => isNonSteamOf(a));
  // "installed" mirrors the native SteamOS library tab, which excludes
  // non-Steam shortcuts AND non-game app types (Proton, Steam Linux Runtime,
  // redistributables, tools — all `app_type === 4` or other non-1 codes).
  // Use the dedicated "nonsteam" tab to surface non-Steam shortcuts.
  if (id === "installed" || id === "great_on_deck") {
    return all.filter((a) =>
      isInstalledOf(a) &&
      !isNonSteamOf(a) &&
      (a.app_type === undefined || a.app_type === 1)
    );
  }
  if (id === "recent") return all.slice().sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a));
  if (id === "all_apps_recent" || id === "allrecentapps") return all.slice().sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a));
  const byTab = all.filter((a: any) => {
    const tags = [a?.tab, a?.tab_name, a?.collection_name, a?.category, ...(Array.isArray(a?.tags) ? a.tags : [])]
      .map((v: any) => slugifyTab(String(v ?? "")))
      .filter(Boolean);
    return tags.includes(id);
  });
  // Fallback: resolve via collectionStore raw map (covers uc-*, from-tag-*, and
  // Unifideck-managed collections which use the original tab id as the collection id).
  // Safe for both SteamOS 3.7 and 3.9 since we only use m_mapCollectionsFromStorage.
  if (!byTab.length) {
    try {
      const cs = (globalThis as any).collectionStore;
      const rawMap = cs?.m_mapCollectionsFromStorage ?? cs?.collectionsFromStorage;
      if (rawMap && typeof rawMap.get === 'function') {
        const col = rawMap.get(tab) ?? rawMap.get(id);
        if (col) {
          const appsSet = col?.allApps ?? col?.m_rgApps;
          if (appsSet instanceof Set) {
            const appIds = new Set(Array.from(appsSet).map(Number).filter(Number.isFinite));
            if (appIds.size > 0) return all.filter((a) => appIds.has(appIdOf(a)));
          } else if (Array.isArray(appsSet) && appsSet.length) {
            const appIds = new Set(appsSet.map((a: any) => Number(a?.appid ?? a)).filter(Number.isFinite));
            if (appIds.size > 0) return all.filter((a) => appIds.has(appIdOf(a)));
          }
        }
      }
    } catch {}
  }
  return byTab;
}

// Pre-fetched data passed into the synchronous filter evaluator so async
// collection lookups can happen before evaluation begins.
type FilterEvalContext = {
  collectionAppIds: Map<string, Set<number>>;
};

function collectCollectionIdsFromGroup(group: FilterGroup): string[] {
  const ids: string[] = [];
  for (const item of group.items ?? []) {
    if (item.type === "collection") {
      const id = String(item.params?.collectionId ?? "").trim();
      if (id) ids.push(id);
    }
    if (item.type === "merge" && Array.isArray(item.params?.items)) {
      ids.push(...collectCollectionIdsFromGroup({ mode: item.params.mode ?? "and", items: item.params.items as FilterItem[] }));
    }
  }
  return ids;
}

// Walk a filter group looking for `developer` / `publisher` items so the
// resolver can warm those caches before evaluation. Without the warmup,
// `getAppDeveloperCached` / `getAppPublisherCached` return "" on the
// home (cache only ever populated by the editor's developer/publisher
// pickers), so a `developer: ["Ubisoft"]` filter matched zero apps and
// looked like the filter source was being ignored.
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

function evaluateFilterItem(item: FilterItem, app: AppOverview, ctx?: FilterEvalContext): boolean {
  let result: boolean;
  switch (item.type) {
    case "installed":
      result = isInstalledOf(app);
      break;
    case "favorites":
      result = isFavoriteOf(app);
      break;
    case "nonSteam":
      result = isNonSteamOf(app);
      break;
    case "hidden": {
      const mode = item.params?.mode ?? "exclude";
      if (mode === "only") result = isHiddenOf(app);
      else if (mode === "exclude") result = !isHiddenOf(app);
      else result = true;
      break;
    }
    case "updatePending":
      result = app.update_pending === true;
      break;
    case "appStatus": {
      const groups: string[] = Array.isArray(item.params?.groups) ? item.params!.groups : [];
      const ds = (app as any).display_status as number | undefined;
      result = groups.some((g) => {
        const statuses = APP_STATUS_GROUPS[g as keyof typeof APP_STATUS_GROUPS];
        return statuses ? statuses.includes(ds as number) : false;
      });
      break;
    }
    case "isNew": {
      const a = app as any;
      const added = Number(a.rt_purchased_time ?? a.rt_recent_activity_time ?? a.user_added_ts ?? a.rt_store_asset_mtime ?? 0);
      if (!added || !Number.isFinite(added)) { result = false; break; }
      const addedMs = added < 1e12 ? added * 1000 : added;
      result = (Date.now() - addedMs) < 14 * 24 * 60 * 60 * 1000;
      break;
    }
    case "deckCompatibility": {
      const levels = item.params?.levels ?? [];
      result = isDeckCompatMatch(app.deck_compatibility_category, levels);
      break;
    }
    case "playedWithinDays": {
      const days = Number(item.params?.days ?? 7);
      const now = Math.floor(Date.now() / 1000);
      const min = now - Math.floor(days * 86400);
      result = lastPlayedOf(app) >= min;
      break;
    }
    case "playtimeRange": {
      const minHours: number | undefined = item.params?.minHours;
      const maxHours: number | undefined = item.params?.maxHours;
      const playtimeMinutes = app.playtime_forever ?? 0;
      result = true;
      if (typeof minHours === "number") result = playtimeMinutes >= minHours * 60;
      if (result && typeof maxHours === "number") result = playtimeMinutes <= maxHours * 60;
      break;
    }
    case "nameIncludes": {
      const text = String(item.params?.text ?? "").toLowerCase();
      result = !text || appNameOf(app).toLowerCase().includes(text);
      break;
    }
    case "nameRegex": {
      const pattern = String(item.params?.pattern ?? "");
      if (!pattern) { result = true; break; }
      try { result = new RegExp(pattern, "i").test(appNameOf(app)); }
      catch { result = true; }
      break;
    }
    case "collection": {
      const colId = String(item.params?.collectionId ?? "").trim();
      if (!colId) {
        // No collection picked yet (UI half-configured) — leave the item
        // as a no-op so the user keeps seeing their library.
        result = true;
      } else {
        // Lookup is always attempted in the prefetch pass; if the entry is
        // missing here, the lookup either failed or returned 0 apps. Issue
        // #55 (filter shelf showed apps the user does not own) was caused
        // by the previous pass-through, which silently leaked the entire
        // library when a Bazzite-shaped collectionStore returned no matches.
        // Excluding makes the misconfig visible (empty shelf) instead.
        const appSet = ctx?.collectionAppIds.get(colId);
        result = appSet ? appSet.has(app.appid) : false;
      }
      break;
    }
    case "merge": {
      // Recursively evaluate as a nested group
      const subItems: FilterItem[] = Array.isArray(item.params?.items) ? (item.params.items as FilterItem[]) : [];
      const subMode = ((item.params?.mode ?? "and") as "and" | "or");
      result = evaluateFilterGroup({ mode: subMode, items: subItems }, [app], ctx).length > 0;
      break;
    }
    case "developer": {
      const selected: string[] = Array.isArray(item.params?.developers) ? item.params.developers : [];
      if (!selected.length) { result = true; break; }
      const dev = getAppDeveloperCached(app.appid);
      result = selected.some((d) => d.toLowerCase() === dev.toLowerCase());
      break;
    }
    case "publisher": {
      const selected: string[] = Array.isArray(item.params?.publishers) ? item.params.publishers : [];
      if (!selected.length) { result = true; break; }
      const pub = getAppPublisherCached(app.appid);
      result = selected.some((p) => p.toLowerCase() === pub.toLowerCase());
      break;
    }
    case "appIdList": {
      const ids: number[] = Array.isArray(item.params?.appIds) ? item.params.appIds.map(Number).filter(Number.isFinite) : [];
      if (!ids.length) { result = true; break; }
      result = ids.includes(app.appid);
      break;
    }
    case "cloudAvailable": {
      result = app.cloud_available === true;
      break;
    }
    case "controllerSupport": {
      // nControllerSupport: 0 = none, 1 = partial, 2 = full
      const n = Number(app.controller_support ?? 0);
      const min = Number(item.params?.min ?? 1);
      result = Number.isFinite(n) && n >= min;
      break;
    }
    case "shortcutType": {
      const kinds: string[] = Array.isArray(item.params?.kinds) ? item.params.kinds : ["game"];
      // Steam's EAppType is a bit-flag enum. Known values (from Steam
      // client source) — we recognise the ones a library shelf realistically
      // wants to filter on:
      //   1     Game           (default — also matches app_type undefined)
      //   2     Application    ("software" alias kept for back-compat)
      //   4     Tool           (legacy "tool" matched anything not 1/2;
      //                         now we accept either app_type 4 or any
      //                         non-1/2 Steam app for back-compat)
      //   8     Demo
      //   32    DLC
      //   64    Guide
      //   128   Driver
      //   256   Config
      //   512   Hardware
      //   2048  Video
      //   8192  Music / Soundtrack
      //   32768 Comic
      //   65536 Beta
      //   1073741824  Shortcut (non-Steam — exposed as "link")
      const nonSteam = isNonSteamOf(app);
      const t = app.app_type;
      let matched = false;
      for (const k of kinds) {
        if (k === "link" && nonSteam) { matched = true; break; }
        if (!nonSteam) {
          if (k === "game"        && (t === undefined || t === 1)) { matched = true; break; }
          if (k === "software"    && t === 2) { matched = true; break; }
          if (k === "application" && t === 2) { matched = true; break; }
          if (k === "tool"        && (t === 4 || (t !== undefined && t !== 1 && t !== 2 && t !== 8 && t !== 32 && t !== 64 && t !== 128 && t !== 256 && t !== 512 && t !== 2048 && t !== 8192 && t !== 32768 && t !== 65536))) { matched = true; break; }
          if (k === "demo"        && t === 8) { matched = true; break; }
          if (k === "dlc"         && t === 32) { matched = true; break; }
          if (k === "guide"       && t === 64) { matched = true; break; }
          if (k === "driver"      && t === 128) { matched = true; break; }
          if (k === "config"      && t === 256) { matched = true; break; }
          if (k === "hardware"    && t === 512) { matched = true; break; }
          if (k === "video"       && t === 2048) { matched = true; break; }
          if (k === "music"       && t === 8192) { matched = true; break; }
          if (k === "soundtrack"  && t === 8192) { matched = true; break; }
          if (k === "comic"       && t === 32768) { matched = true; break; }
          if (k === "beta"        && t === 65536) { matched = true; break; }
        }
      }
      result = matched;
      break;
    }
    case "discount": {
      // Reads discount % from the price cache (populated by onlineStore.ts).
      // Discount only applies to PRICED games. Permanently-free titles
      // (F2P with no `price_overview`, region-blocked, etc.) are cached
      // with `unpriced: true` and always excluded — a "100% off" shelf
      // must surface only games that have a base price and are
      // currently discounted, not F2P entries that are simply $0.
      try {
        const appid = appIdOf(app);
        if (!appid) { result = false; break; }
        const raw = (globalThis as any).localStorage?.getItem?.("ds-price-cache-v1");
        if (!raw) { result = true; break; } // no cache yet → pass through (first-time bootstrap)
        const cache: Record<number, { ts: number; data: { discount?: number; unpriced?: boolean } }> = JSON.parse(raw);
        const entry = cache[appid];
        if (!entry?.data) { result = false; break; } // not in this fetch round → exclude
        if (entry.data.unpriced === true) { result = false; break; } // F2P / no price_overview → never matches a discount filter
        const disc = entry.data.discount ?? 0;
        const min = Number(item.params?.minDiscount ?? 0);
        const max = Number(item.params?.maxDiscount ?? 100);
        result = disc >= min && disc <= max;
      } catch { result = false; }
      break;
    }
    // storeTag, friends, achievements: require data not in AppOverview — pass-through
    default: {
      // Plugin API: delegate to a registered external filter type when the
      // type id is unknown internally. Unknown + unregistered types still
      // pass-through (true) so an unregistered plugin filter doesn't hide
      // the user's entire library.
      try {
        if (hasExternalFilterType(item.type as string)) {
          result = evaluateExternalFilter(item.type as string, app as unknown as PublicAppMeta, item.params ?? {});
          break;
        }
      } catch { /* fall through to pass */ }
      result = true;
    }
  }
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

function buildNonSteamPlatformMap(): Map<number, string> {
  const map = new Map<number, string>();
  try {
    const cs: any = (globalThis as any).collectionStore;
    // Raw storage map, not the `userCollections` computed — see
    // getUnifideckInstalledSet for why touching that getter is unsafe.
    const cols = cs?.m_mapCollectionsFromStorage ?? cs?.collectionsFromStorage;
    const list: any[] = Array.isArray(cols) ? cols : Array.from(cols?.values?.() ?? []);
    for (const c of list) {
      const name = String(c?.displayName ?? c?.m_strName ?? "");
      const m = name.match(/^\[Unifideck\]\s+(.+)/i);
      if (!m) continue;
      const platform = m[1].trim().toLowerCase();
      const apps = c?.allApps ?? c?.m_rgApps ?? [];
      for (const a of apps) {
        const n = Number(a?.appid);
        if (Number.isFinite(n)) map.set(n, platform);
      }
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
  // Per-shelf namespacing: when `shelfId` is given, the storage key is
  // `ds-random-<shelfId>-<idHash>` so two shelves resolving the same id set
  // get independent shuffles AND `invalidateRandomSortCache(shelfId)` only
  // clears this shelf's entries. Falls back to the legacy global key when
  // `shelfId` is omitted (preserves existing cached orderings).
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
  // Split manualOrder into entries already in the source vs entries the
  // source doesn't include. In-source entries lead (drag-order semantics
  // the manual-sort UI was built for); source items not drag-ordered
  // follow in their natural order; entries the source doesn't cover
  // (typically games appended via the library context menu's "Add to
  // shelf" — which writes to `manualOrder` regardless of source) go at
  // the very END so they're always visible without disturbing existing
  // drag-orderings.
  // Hidden entries are dropped from BOTH manualOrder branches so a hidden
  // game never resurfaces via the manual-append tail (the resolver
  // already filters `ids` itself; this just covers the appended-by-menu
  // ids the resolver never saw).
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

// Builds a comparator for a single sort key. Returns null for keys that
// can't participate in a multi-key chain (`manual`, `random`) so the
// multi-key path can drop them from the chain.
//
// Price keys (`price_low`, `discount_high`, `original_price_high`) used
// to fall through to alphabetical because their data is fetched async.
// With a pre-warmed `priceMap` passed in (callers fetch via
// `getPriceMap(ids)` upfront), they now return proper price comparators
// so multi-key chains like `[discount_high, metacritic]` order by
// discount with metacritic as tiebreaker.
function buildKeyComparator(
  key: string,
  isReversed: boolean,
  priceMap?: ReadonlyMap<number, { price: number; originalPrice: number; discount: number }>,
): ((a: AppOverview, b: AppOverview) => number) | null {
  if (key === "manual" || key === "random") return null;
  const sign = isReversed ? -1 : 1;
  if (key === "recent") return (a, b) => sign * (lastPlayedOf(b) - lastPlayedOf(a));
  if (key === "playtime") return (a, b) => sign * ((b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));
  if (key === "release_date") return (a, b) => sign * (((b as any).rt_original_release_date ?? 0) - ((a as any).rt_original_release_date ?? 0));
  if (key === "size_on_disk") return (a, b) => sign * (Number((b as any).size_on_disk ?? 0) - Number((a as any).size_on_disk ?? 0));
  if (key === "metacritic") return (a, b) => sign * (((b as any).metacritic_score ?? 0) - ((a as any).metacritic_score ?? 0));
  if (key === "review_score") return (a, b) => sign * (((b as any).review_percentage ?? 0) - ((a as any).review_percentage ?? 0));
  if (key === "added") return (a, b) => sign * compareByAdded(a, b);
  if (key === "app_status") return (a, b) => sign * (((a as any).display_status ?? 0) - ((b as any).display_status ?? 0));
  if (key === "deck_compat") return (a, b) => sign * (((b as any).deck_compatibility_category ?? 0) - ((a as any).deck_compatibility_category ?? 0));
  if (key === "controller_support") return (a, b) => sign * (((b as any).controller_support ?? 0) - ((a as any).controller_support ?? 0));
  if (key === "price_low" || key === "discount_high" || key === "original_price_high") {
    if (priceMap) {
      if (key === "price_low") return (a, b) => {
        const pa = priceMap.get(appIdOf(a)); const pb = priceMap.get(appIdOf(b));
        const va = pa ? pa.price : 999999; const vb = pb ? pb.price : 999999;
        return sign * (va - vb);
      };
      if (key === "discount_high") return (a, b) => {
        const pa = priceMap.get(appIdOf(a)); const pb = priceMap.get(appIdOf(b));
        const va = pa ? pa.discount : 0; const vb = pb ? pb.discount : 0;
        return sign * (vb - va);
      };
      // original_price_high
      return (a, b) => {
        const pa = priceMap.get(appIdOf(a)); const pb = priceMap.get(appIdOf(b));
        const va = pa ? pa.originalPrice : 0; const vb = pb ? pb.originalPrice : 0;
        return sign * (vb - va);
      };
    }
    // No price data available — degrade to alphabetical as a stable
    // sub-key. The wishlist / store resolver passes a priceMap when
    // multi-key sort includes a price key (see resolver branches).
    return (a, b) => sign * String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b)));
  }
  if (key === "alphabetical") {
    return (a, b) => sign * String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b)));
  }
  // Unknown key (could be an external sort plugin id) — external sorts
  // don't expose a comparator, so they degrade to alphabetical inside a
  // multi-key chain. Single-key dispatch still calls into the registry.
  return (a, b) => sign * String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b)));
}

export function applySortToIds(
  ids: number[],
  sort: string | string[],
  all: AppOverview[],
  shelfId?: string,
  reverse?: boolean | boolean[],
  priceMap?: ReadonlyMap<number, { price: number; originalPrice: number; discount: number }>,
): number[] {
  // Multi-key: walk each key in declaration order via a single composite
  // comparator so JS's stable sort preserves the primary order when the
  // secondary key ties. Earlier we chained right-to-left + reverse() at
  // each pass — but reverse() flips tied items, undoing the previous
  // pass's tiebreaker (see applySortToIds.test.ts for the regression).
  // Per-key reverse picks the aligned index when `reverse` is also an
  // array; a boolean applies to every key.
  if (Array.isArray(sort)) {
    const keys = sort.filter((k) => typeof k === "string" && k.length > 0) as string[];
    if (keys.length === 0) return ids.slice();
    if (keys.length === 1) return applySortToIds(ids, keys[0], all, shelfId, Array.isArray(reverse) ? !!reverse[0] : reverse, priceMap);
    const comparators: ((a: AppOverview, b: AppOverview) => number)[] = [];
    keys.forEach((k, i) => {
      const r = Array.isArray(reverse) ? !!reverse[i] : !!reverse;
      const cmp = buildKeyComparator(k, r, priceMap);
      if (cmp) comparators.push(cmp);
    });
    if (comparators.length === 0) return ids.slice();
    const byId = new Map<number, AppOverview>();
    for (const app of all) { const id = appIdOf(app); if (id && Number.isFinite(id)) byId.set(id, app); }
    const apps = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
    apps.sort((a, b) => {
      for (const cmp of comparators) {
        const r = cmp(a, b);
        if (r !== 0) return r;
      }
      return 0;
    });
    return apps.map((a) => appIdOf(a)).filter(Number.isFinite);
  }
  // Single-key path. Normalise `reverse` to a strict boolean — callers
  // that recently held a multi-key chain may leave `sortReverse` as a
  // 1-element array (`[false]` / `[true]`), which the legacy `if (reverse)`
  // check at the bottom treated as truthy regardless of the inner value
  // (a non-empty array is truthy), silently reversing every "asc" shelf.
  const reverseBool: boolean = Array.isArray(reverse) ? !!reverse[0] : !!reverse;
  const byId = new Map<number, AppOverview>();
  for (const app of all) { const id = appIdOf(app); if (id && Number.isFinite(id)) byId.set(id, app); }
  let apps = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
  if (sort === "recent") apps = apps.slice().sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a));
  else if (sort === "playtime") apps = apps.slice().sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));
  else if (sort === "release_date") apps = apps.slice().sort((a, b) => ((b as any).rt_original_release_date ?? 0) - ((a as any).rt_original_release_date ?? 0));
  else if (sort === "size_on_disk") apps = apps.slice().sort((a, b) => Number((b as any).size_on_disk ?? 0) - Number((a as any).size_on_disk ?? 0));
  else if (sort === "metacritic") apps = apps.slice().sort((a, b) => ((b as any).metacritic_score ?? 0) - ((a as any).metacritic_score ?? 0));
  else if (sort === "review_score") apps = apps.slice().sort((a, b) => ((b as any).review_percentage ?? 0) - ((a as any).review_percentage ?? 0));
  else if (sort === "added") apps = apps.slice().sort(compareByAdded);
  else if (sort === "app_status") apps = apps.slice().sort((a, b) => ((a as any).display_status ?? 0) - ((b as any).display_status ?? 0));
  else if (sort === "deck_compat") apps = apps.slice().sort((a, b) => ((b as any).deck_compatibility_category ?? 0) - ((a as any).deck_compatibility_category ?? 0));
  else if (sort === "controller_support") apps = apps.slice().sort((a, b) => ((b as any).controller_support ?? 0) - ((a as any).controller_support ?? 0));
  else if (sort === "random") { const shuffled = stableShuffleIds(ids, hashIdSet(ids), shelfId); apps = shuffled.map(id => byId.get(id)).filter(Boolean) as AppOverview[]; }
  // price_low / discount_high / original_price_high require async price
  // fetching — resolved by applyPriceSort() at the resolveShelfAppIds call
  // site for wishlist source. For other source types, fall through to
  // alphabetical as a stable fallback.
  else if (sort === "price_low" || sort === "discount_high" || sort === "original_price_high") {
    apps = apps.slice().sort((a, b) => String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))));
  }
  else if (sort === "alphabetical") {
    // Explicit branch: the internal registry registers "alphabetical" as a
    // noop descriptor (so plugin authors can enumerate it), so falling into
    // the external-sort dispatch below would call that noop and effectively
    // skip sorting. Do the localeCompare sort here directly.
    apps = apps.slice().sort((a, b) => String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))));
  }
  else {
    // Plugin API: delegate to a registered external sort option when the
    // id is unknown internally. External sort returning `null` (not
    // registered or threw) falls back to alphabetical so the shelf still
    // renders something stable.
    let externalIds: number[] | null = null;
    try {
      if (hasExternalSortOption(sort)) {
        externalIds = applyExternalSort(sort, ids, apps as unknown as ReadonlyArray<PublicAppMeta>);
      }
    } catch { /* registry unavailable; fall through to alphabetical */ }
    if (externalIds) {
      const order = new Map(externalIds.map((id, idx) => [id, idx] as const));
      apps = apps.slice().sort((a, b) => (order.get(appIdOf(a)) ?? 1e9) - (order.get(appIdOf(b)) ?? 1e9));
    } else {
      apps = apps.slice().sort((a, b) => String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))));
    }
  }
  // Asc/desc inversion. Skipped for `manual` (would invalidate user order)
  // and `random` (already non-deterministic; reversing the per-shelf shuffle
  // adds no signal). All other sorts treat their natural order as desc and
  // reverse to asc when requested.
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

// Composite source recursion bound. A composite-of-composite chain
// deeper than this returns `[]` at the deepest level — keeps a
// pathological user JSON (or an external plugin) from spinning the
// resolver. UI exposes at most 1 level of nesting; the schema permits
// the full depth for power users editing the JSON directly.
const MAX_COMPOSITE_DEPTH = 4;

// Pure merge for composite child results. Extracted so unit tests can
// cover the operator semantics without resolving real Steam sources.
// - union: round-robin interleave across children — take 1 from child 0,
//   then 1 from child 1, ..., wrap, until every child is exhausted.
//   De-dupes while keeping each child equally represented in the head
//   of the merged result. The previous "first child fully first, then
//   the rest" shape meant a long primary source consumed the entire
//   final overShootLimit slice and secondary sources (a filter pinned
//   as the last entry, typically) disappeared from the visible row.
//   Round-robin guarantees the filter's items survive the final cap.
// - intersection: membership in EVERY child; iteration order follows
//   the first child so users get a predictable primary ordering.
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

export async function resolveShelfAppIds(source: { type: string; [k: string]: any }, limit: number, sort?: string | string[], shelfId?: string, sortReverse?: boolean | boolean[], options?: { hiddenAppIds?: number[]; dedupeByName?: boolean }, _depth: number = 0): Promise<number[]> {
  const hiddenSet = options?.hiddenAppIds?.length ? new Set(options.hiddenAppIds) : undefined;
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

  // Returns up to overShootLimit — Shelf.tsx slices to shelf.limit after
  // its render-time owned/name filters, so the overshoot provides headroom.
  function finish(ids: number[]): number[] {
    let result = ids;
    if (hiddenSet) result = result.filter((id) => !hiddenSet.has(id));
    if (options?.dedupeByName && result.length > 1) result = dedupeAppIdsByName(result, all);
    return result.slice(0, overShootLimit);
  }

  if (source.type === "collection") {
    const rawCollectionId = String(source.collectionId ?? "").trim();
    let ids = await getCollectionApps(rawCollectionId);
    if (!ids.length && rawCollectionId) {
      try {
        const collections = await listCollections();
        const needle = normalizeText(rawCollectionId);
        const exactMatches = collections.filter((collection) => {
          const id = normalizeText(collection.id);
          const name = normalizeText(collection.name);
          return id === needle || name === needle;
        });
        const softMatches = exactMatches.length ? [] : collections.filter((collection) => {
          const id = normalizeText(collection.id);
          const name = normalizeText(collection.name);
          return id.includes(needle) || name.includes(needle);
        });
        for (const match of [...exactMatches, ...softMatches]) {
          const probeKeys = Array.from(new Set([match.id, match.name].filter(Boolean)));
          for (const key of probeKeys) {
            const fallbackIds = await getCollectionApps(key, match.name);
            if (fallbackIds.length) {
              ids = fallbackIds;
              break;
            }
          }
          if (ids.length) break;
        }

        if (!ids.length && all.length) {
          const markers = new Set<string>();
          for (const id of candidateCollectionIds(rawCollectionId)) {
            const marker = normalizeText(id);
            if (marker) markers.add(marker);
          }
          for (const match of [...exactMatches, ...softMatches]) {
            const idMarker = normalizeText(match.id);
            const nameMarker = normalizeText(match.name);
            if (idMarker) markers.add(idMarker);
            if (nameMarker) markers.add(nameMarker);
          }
          if (markers.size) {
            ids = all.filter((app) => appMatchesCollectionMarker(app, markers)).map((app) => appIdOf(app));
          }
        }
      } catch {}
    }
    if (!ids.length) {
      logWarn("STEAM", "resolveShelfAppIds(collection) empty", {
        collectionId: rawCollectionId,
        allCount: all.length,
      });
    } else {
      logInfo("STEAM", "resolveShelfAppIds(collection) resolved", {
        collectionId: rawCollectionId,
        count: ids.length,
      });
    }
    const childFilter = source.childFilter as FilterGroup | undefined;
    if (childFilter && Array.isArray(childFilter.items) && childFilter.items.length > 0) {
      const byId = new Map<number, AppOverview>();
      for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
      const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
      ids = evaluateFilterGroup(childFilter, candidates).map((a) => appIdOf(a)).filter(Number.isFinite);
    }
    if (sort) ids = applySortToIds(ids, sort, all, shelfId, sortReverse);
    ids = deduplicateNonSteam(ids, all);
    return finish(ids.slice(0, overShootLimit));
  }

  if (source.type === "tab") {
    const rawTab = String(source.tab ?? "").trim();
    const tabSlug = slugifyTab(rawTab);
    // The native SteamOS "Installed" / "Great on Deck" library tabs exclude
    // non-Steam shortcuts AND non-game app types (Proton, Steam Linux Runtime,
    // redistributables, tools). External tab providers (TabMaster, store-API
    // tab definitions) often return the raw matching set without that filter,
    // so we re-apply it here when the resolved tab id slugifies to one of
    // those canonical names.
    const matchesNativeInstalled = tabSlug === "installed" || tabSlug === "great_on_deck";
    const filterToInstalledNative = (ids: number[]): number[] => {
      if (!matchesNativeInstalled) return ids;
      const byId = new Map<number, AppOverview>();
      for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
      return ids.filter((id) => {
        const a = byId.get(id);
        if (!a) return false;
        if (isNonSteamOf(a)) return false;
        return a.app_type === undefined || a.app_type === 1;
      });
    };

    const childFilterTab = source.childFilter as FilterGroup | undefined;
    function applyChildFilterTab(ids: number[]): number[] {
      if (!childFilterTab || !Array.isArray(childFilterTab.items) || !childFilterTab.items.length) return ids;
      const byId = new Map<number, AppOverview>();
      for (const a of all) { const aid = appIdOf(a); if (Number.isFinite(aid)) byId.set(aid, a); }
      const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
      return evaluateFilterGroup(childFilterTab, candidates).map((a) => appIdOf(a)).filter(Number.isFinite);
    }

    // Forward-compat: fiber traversal in case TabMaster exposes a React context
    const customFiltersIds = getCustomFiltersAppsForContainer(rawTab);
    if (customFiltersIds.length) {
      const filtered = filterToInstalledNative(customFiltersIds);
      const ordered = sort ? applySortToIds(filtered, sort, all, shelfId, sortReverse) : filtered;
      return finish(applyChildFilterTab(ordered).slice(0, overShootLimit));
    }

    let fromTabStore = await getTabAppIdsFromStore(rawTab);
    if (fromTabStore.length && matchesNativeInstalled) {
      fromTabStore = filterToInstalledNative(fromTabStore);
    }
    if (!fromTabStore.length && rawTab) {
      try {
        const tabs = await listLibraryTabs();
        const needle = normalizeText(rawTab);
        const tabCandidates = tabs.filter((tab) => {
          const id = normalizeText(tab.id);
          const name = normalizeText(tab.name);
          return id === needle || name === needle || id.includes(needle) || name.includes(needle);
        });
        for (const tab of tabCandidates) {
          const byId = await getTabAppIdsFromStore(tab.id);
          if (byId.length) {
            fromTabStore = byId;
            break;
          }
          const byName = await getTabAppIdsFromStore(tab.name);
          if (byName.length) {
            fromTabStore = byName;
            break;
          }
        }
      } catch {}
    }
    if (fromTabStore.length) {
      try {
        logInfo("STEAM", "resolveShelfAppIds(tab): using store", { tab: rawTab, count: fromTabStore.length });
      } catch {}
      const tabStoreIds = deduplicateNonSteam(sort ? applySortToIds(fromTabStore, sort, all, shelfId, sortReverse) : fromTabStore, all);
      return finish(applyChildFilterTab(tabStoreIds).slice(0, overShootLimit));
    }
    const filtered = await resolveDynamicTab(rawTab, all);
    let tabApps: AppOverview[];
    if (sort) {
      tabApps = filtered;
    } else {
      tabApps = slugifyTab(rawTab) === "recent"
        ? filtered
        : filtered.slice().sort((a, b) => String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))));
    }
    let tabIds = deduplicateNonSteam(tabApps.map((a) => appIdOf(a)).filter(Number.isFinite), all);
    if (sort) tabIds = applySortToIds(tabIds, sort, all, shelfId, sortReverse);
    const ids = tabIds.slice(0, limit);

    // Migration fallback: existing shelves saved as UUID tab sources resolve via TabMaster's filters
    if (!ids.length && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTab)) {
      try {
        const { getTabsFromSettingsFile } = await import('../integrations/tabmaster');
        const { convertFiltersToGroup } = await import('../domain/customfilters');
        const tmTabs = await getTabsFromSettingsFile();
        const tmTab = tmTabs.find((t) => t.id === rawTab);
        if (tmTab && tmTab.filters && tmTab.filters.length > 0) {
          const filterGroup = convertFiltersToGroup(tmTab.filters);
          try { logInfo("STEAM", "resolveShelfAppIds(tab): UUID fallback via TabMaster filters", { tab: rawTab, title: tmTab.title }); } catch {}
          return resolveShelfAppIds({ type: 'filter', filter: { filterGroup } } as any, limit, undefined, shelfId);
        }
      } catch {}
    }

    if (!ids.length) {
      logWarn("STEAM", "resolveShelfAppIds(tab) empty", { tab: rawTab, allCount: all.length });
    }
    return finish(applyChildFilterTab(ids.slice(0, overShootLimit)));
  }

  if (source.type === "filter") {
    const f: CustomFilter = (source.filter ?? {}) as CustomFilter;

    const filterGroup = (source.filter as any)?.filterGroup as FilterGroup | undefined;
    if (filterGroup && Array.isArray(filterGroup.items) && filterGroup.items.length > 0) {
      const ctx: FilterEvalContext = { collectionAppIds: new Map() };
      const colIds = collectCollectionIdsFromGroup(filterGroup);
      await Promise.all(colIds.map(async (colId) => {
        try {
          const ids = await getCollectionApps(colId);
          // Always set, even on empty result, so the evaluator can tell
          // "lookup completed with 0 apps" from "lookup never attempted".
          ctx.collectionAppIds.set(colId, new Set(ids));
        } catch {}
      }));
      // Warm the developer / publisher cache before evaluation when the
      // filter group uses those item types — otherwise the home shelf
      // sees a cold cache and the filter matches zero apps. The editor
      // already warms these via its filter pickers, but the home runs
      // without that path. Only fires when the relevant items exist;
      // empty filter groups still resolve in O(1) on cached data.
      const needs = filterGroupNeedsDevPubPreload(filterGroup);
      if (needs.needsDev || needs.needsPub) {
        const allAppIds = all.map((a) => appIdOf(a)).filter(Number.isFinite);
        await Promise.all([
          needs.needsDev ? preloadDeveloperData(allAppIds).catch(() => {}) : Promise.resolve(),
          needs.needsPub ? preloadPublisherData(allAppIds).catch(() => {}) : Promise.resolve(),
        ]);
      }
      let filtered = evaluateFilterGroup(filterGroup, all, ctx);
      const fSort = (source.filter as any)?.sort as string | undefined;
      if (fSort === "recent") {
        filtered = filtered.slice().sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a));
      } else if (fSort === "playtime") {
        filtered = filtered.slice().sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));
      } else if (fSort === "release_date") {
        filtered = filtered.slice().sort((a, b) => ((b as any).rt_original_release_date ?? 0) - ((a as any).rt_original_release_date ?? 0));
      } else if (fSort === "size_on_disk") {
        filtered = filtered.slice().sort((a, b) => Number((b as any).size_on_disk ?? 0) - Number((a as any).size_on_disk ?? 0));
      } else if (fSort === "metacritic") {
        filtered = filtered.slice().sort((a, b) => ((b as any).metacritic_score ?? 0) - ((a as any).metacritic_score ?? 0));
      } else if (fSort === "review_score") {
        filtered = filtered.slice().sort((a, b) => ((b as any).review_percentage ?? 0) - ((a as any).review_percentage ?? 0));
      } else if (fSort === "added") {
        filtered = filtered.slice().sort(compareByAdded);
      } else if (fSort === "random") {
        const fIds = filtered.map(a => appIdOf(a)).filter(Number.isFinite);
        const fById = new Map<number, AppOverview>();
        for (const a of filtered) { const id = appIdOf(a); if (id) fById.set(id, a); }
        filtered = stableShuffleIds(fIds, hashIdSet(fIds), shelfId).map(id => fById.get(id)).filter(Boolean) as AppOverview[];
      } else {
        filtered = filtered.slice().sort((a, b) => String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))));
      }
      // Asc/desc inversion. Prefer the filter's own `sortReverse` (set
      // by the editor on filter shelves — shelf-level `sortReverse` is
      // never populated for filter sources). Skipped for `manual` and
      // `random` where reverse has no meaning.
      const effRev = (f as any).sortReverse ?? sortReverse;
      const effRevBool = Array.isArray(effRev) ? !!effRev[0] : !!effRev;
      if (effRevBool && fSort !== "manual" && fSort !== "random") filtered = filtered.slice().reverse();
      const ids = deduplicateNonSteam(filtered.map((a) => appIdOf(a)).filter(Number.isFinite), all);
      if (!ids.length) {
        logWarn("STEAM", "resolveShelfAppIds(filterGroup) empty", { filter: f, allCount: all.length });
      } else {
        logInfo("STEAM", "resolveShelfAppIds(filterGroup) resolved", { count: ids.length, allCount: all.length });
      }
      return finish(ids.slice(0, overShootLimit));
    }

    // Legacy flat filter fields
    let filtered = all;
    if (f.favorites) filtered = filtered.filter((a) => isFavoriteOf(a));
    if (f.hidden === "only" || f.hidden === true) filtered = filtered.filter((a) => isHiddenOf(a));
    if (f.hidden === false) filtered = filtered.filter((a) => !isHiddenOf(a));
    if (f.nonSteam) filtered = filtered.filter((a) => isNonSteamOf(a));
    if (f.installed) {
      filtered = filtered.filter((a) => isInstalledOf(a));
    }
    if (typeof f.playedWithinDays === "number") {
      const now = Math.floor(Date.now() / 1000);
      const min = now - Math.floor(f.playedWithinDays * 86400);
      filtered = filtered.filter((a) => lastPlayedOf(a) >= min);
    }
    if (typeof f.nameIncludes === "string" && f.nameIncludes.trim().length > 0) {
      const needle = f.nameIncludes.toLowerCase();
      filtered = filtered.filter((a) => appNameOf(a).toLowerCase().includes(needle));
    }
    if (typeof f.nameRegex === "string" && f.nameRegex.trim().length > 0) {
      try {
        const re = new RegExp(f.nameRegex, "i");
        filtered = filtered.filter((a) => re.test(appNameOf(a)));
      } catch {}
    }
    if (f.deckCompatibility && f.deckCompatibility.length > 0) {
      filtered = filtered.filter((a) => isDeckCompatMatch(a.deck_compatibility_category, f.deckCompatibility));
    }
    if (typeof f.minPlaytimeMinutes === "number") {
      filtered = filtered.filter((a) => (a.playtime_forever ?? 0) >= f.minPlaytimeMinutes!);
    }
    if (typeof f.maxPlaytimeMinutes === "number") {
      filtered = filtered.filter((a) => (a.playtime_forever ?? 0) <= f.maxPlaytimeMinutes!);
    }
    if (f.updatePending === true) {
      filtered = filtered.filter((a) => a.update_pending === true);
    } else if (f.updatePending === false) {
      filtered = filtered.filter((a) => !a.update_pending);
    }

    // Multi-key sort: when `f.sort` is an array, delegate to applySortToIds
    // for the stable primary/secondary chain. Single-key paths keep the
    // inline branches below for back-compat (no behavior change).
    if (Array.isArray(f.sort)) {
      const sortedIds = applySortToIds(
        filtered.map((a) => appIdOf(a)).filter(Number.isFinite),
        f.sort,
        all,
        shelfId,
        (f as any).sortReverse ?? sortReverse,
      );
      const ids = deduplicateNonSteam(sortedIds, all);
      if (!ids.length) {
        logWarn("STEAM", "resolveShelfAppIds(filter) empty", {
          filter: f, allCount: all.length,
        });
      } else {
        logInfo("STEAM", "resolveShelfAppIds(filter) resolved", { count: ids.length, allCount: all.length });
      }
      return finish(ids.slice(0, overShootLimit));
    }
    if (f.sort === "recent" || typeof f.playedWithinDays === "number") {
      filtered = filtered.slice().sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a));
    } else if (f.sort === "playtime") {
      filtered = filtered.slice().sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));
    } else if (f.sort === "release_date") {
      filtered = filtered.slice().sort((a, b) => ((b as any).rt_original_release_date ?? 0) - ((a as any).rt_original_release_date ?? 0));
    } else if (f.sort === "size_on_disk") {
      filtered = filtered.slice().sort((a, b) => Number((b as any).size_on_disk ?? 0) - Number((a as any).size_on_disk ?? 0));
    } else if (f.sort === "metacritic") {
      filtered = filtered.slice().sort((a, b) => ((b as any).metacritic_score ?? 0) - ((a as any).metacritic_score ?? 0));
    } else if (f.sort === "review_score") {
      filtered = filtered.slice().sort((a, b) => ((b as any).review_percentage ?? 0) - ((a as any).review_percentage ?? 0));
    } else if (f.sort === "added") {
      filtered = filtered.slice().sort(compareByAdded);
    } else {
      filtered = filtered.slice().sort((a, b) => String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))));
    }
    // Legacy `f.sort` enum doesn't include "manual" or "random", so the
    // reverse here is unconditional. Prefer the filter's own `sortReverse`
    // (set by the editor on filter shelves — shelf-level `sortReverse`
    // is never populated for filter sources).
    const legacyEffRev = (f as any).sortReverse ?? sortReverse;
    const legacyEffRevBool = Array.isArray(legacyEffRev) ? !!legacyEffRev[0] : !!legacyEffRev;
    if (legacyEffRevBool) filtered = filtered.slice().reverse();

    const ids = deduplicateNonSteam(filtered.map((a) => appIdOf(a)).filter(Number.isFinite), all);
    if (!ids.length) {
      logWarn("STEAM", "resolveShelfAppIds(filter) empty", {
        filter: f,
        allCount: all.length,
        sampleApp: all[0] ? { appid: all[0].appid, name: all[0].display_name, installed: all[0].installed } : null,
        afterInstalled: f.installed ? all.filter((a) => isInstalledOf(a)).length : "skip",
        afterInstalledLenient: f.installed ? all.filter((a) => (a as any).installed !== false).length : "skip",
      });
    } else {
      logInfo("STEAM", "resolveShelfAppIds(filter) resolved", { count: ids.length, allCount: all.length });
    }
    return finish(ids.slice(0, overShootLimit));
  }

  if (source.type === "external") {
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

  if (source.type === "wishlist") {
    try {
      const { getCurrentSettings } = await import("../store/settingsStore");
      const { getWishlistIds, getPriceMap } = await import("../core/onlineStore");
      const s = getCurrentSettings();
      const onlineEnabled = s?.onlineFeaturesEnabled ?? isOnlineFeaturesEnabledRaw();
      if (!onlineEnabled || s?.onlineWishlistEnabled === false) return [];
      const wishlistIds = await getWishlistIds();
      if (!wishlistIds) return [];
      // Per-shelf toggles extend global — mirrors Shelf.tsx render so the
      // resolver count matches displayed count.
      const globalHideOwned = s?.onlineHideOwnedGames === true;
      const globalHideNonSteam = s?.onlineHideOwnedNonSteam === true;
      const srcExcludeOwned = (source as any).excludeOwned === true;
      const srcExcludeNonSteam = srcExcludeOwned && (source as any).excludeOwnedNonSteam === true;
      const hideOwned = globalHideOwned || srcExcludeOwned;
      const hideOwnedNonSteam = hideOwned && ((globalHideOwned && globalHideNonSteam) || srcExcludeNonSteam);
      const perShelfCloud = (source as any).hideOwnedNonSteamCloud;
      const hideOwnedNonSteamCloud = hideOwnedNonSteam &&
        (perShelfCloud === true || (perShelfCloud === undefined && s?.onlineHideOwnedNonSteamCloud === true));
      const ownedSet = hideOwned
        ? getLocalLibraryAppIds(hideOwnedNonSteam, hideOwnedNonSteamCloud)
        : new Set<number>();
      let ids = hideOwned ? wishlistIds.filter((id) => !ownedSet.has(id)) : [...wishlistIds];
      // Apply childFilter: discount filter uses price cache and works for every
      // wishlist item; AppOverview-dependent filters only apply to games already
      // in the local library (others pass through so they're not hidden).
      const childFilter = (source as any).childFilter;
      const hasDiscountFilter = Array.isArray(childFilter?.items) &&
        childFilter.items.some((item: any) => item.type === "discount");
      if (hasDiscountFilter) {
        const { getPriceMap } = await import("../core/onlineStore");
        await getPriceMap(ids);
      }
      if (childFilter && Array.isArray(childFilter.items) && childFilter.items.length > 0) {
        const byId = new Map(all.map((a) => [appIdOf(a), a] as const));
        ids = ids.filter((id) => {
          const app = byId.get(id);
          return childFilter.items.every((item: any) => {
            if (item.type === "discount") {
              return evaluateFilterItem(item, { appid: id } as any, undefined);
            }
            if (!app) return true;
            return evaluateFilterItem(item, app, undefined);
          });
        });
      }
      // Sort dispatch:
      //   - single-key string price sort  → applyPriceSort (covers both
      //     local + remote wishlist items since priceMap is keyed by id)
      //   - any other sort (string OR array) → sort the local subset via
      //     applySortToIds, leave remote ids in their original wishlist
      //     order at the tail. For a multi-key chain that includes a
      //     price key, the resolver also pre-fetches `getPriceMap(ids)`
      //     and passes it down so the comparator can use discount as a
      //     real ranker for the LOCAL subset (remote ids stay tail-only).
      //
      // This dispatch used to also wrap a "stub AppOverview" pool for
      // multi-key + price so remote rows participated in the chain too —
      // but that path returned 0 ids in production for a 522-entry
      // wishlist (cause unclear; cache stayed at count=0 over multiple
      // refreshes). Falling back to the local-subset path is safer:
      // local rows get the proper chain, remote rows keep their wishlist
      // position, and the shelf actually renders.
      const sortKeysWishlist: string[] = Array.isArray(sort) ? sort : (sort ? [sort] : []);
      const isSingleKeyPriceSort = !Array.isArray(sort) && (sort === "price_low" || sort === "discount_high" || sort === "original_price_high");
      const hasPriceKeyWishlist = sortKeysWishlist.some((k) => k === "price_low" || k === "discount_high" || k === "original_price_high");
      if (isSingleKeyPriceSort) {
        ids = await applyPriceSort(ids, sort as "price_low" | "discount_high" | "original_price_high", Array.isArray(sortReverse) ? !!sortReverse[0] : sortReverse);
      } else if (sort) {
        // Multi-key: build a unified pool that includes BOTH local apps
        // (real overviews — secondary keys like metacritic / playtime
        // resolve) AND remote-wishlist apps (synthesized stubs carrying
        // only the appid — comparators that read undefined fields fall
        // back to 0/empty and stay tied on the secondary, so the primary
        // price key actually orders the whole wishlist).
        // Without this, only the small local subset got sorted and the
        // ~hundreds of remote ids were appended in raw wishlist order —
        // visible to the user as "the multi-key sort didn't apply" on
        // wishlist shelves.
        const localPriceMap = hasPriceKeyWishlist ? await getPriceMap(ids) : undefined;
        const byId = new Map(all.map((a) => [appIdOf(a), a] as const));
        const pool: AppOverview[] = ids.map((id) => {
          const a = byId.get(id);
          return a ?? ({ appid: id } as unknown as AppOverview);
        });
        ids = applySortToIds(ids, sort, pool, shelfId, sortReverse, localPriceMap);
      }
      logInfo("STEAM", "resolveShelfAppIds(wishlist) resolved", { count: ids.length });
      return finish(ids.slice(0, overShootLimit));
    } catch (e) {
      logWarn("STEAM", "resolveShelfAppIds(wishlist) failed", String(e));
      return [];
    }
  }

  if (source.type === "store") {
    try {
      const { getCurrentSettings } = await import("../store/settingsStore");
      const { getStoreGameIds, getPriceMap } = await import("../core/onlineStore");
      const s = getCurrentSettings();
      const onlineEnabled = s?.onlineFeaturesEnabled ?? isOnlineFeaturesEnabledRaw();
      if (!onlineEnabled) return [];
      let ids = await getStoreGameIds();
      if (!ids) return [];

      // If there's a discount childFilter, pre-fetch prices so the filter
      // can evaluate against real data rather than passing through everything.
      const childFilter = (source as any).childFilter;
      const hasDiscountFilter = Array.isArray(childFilter?.items) &&
        childFilter.items.some((item: any) => item.type === "discount");
      if (hasDiscountFilter) await getPriceMap(ids);

      // Same merge logic as wishlist (see comment above).
      const globalHideOwned = s?.onlineHideOwnedGames === true;
      const globalHideNonSteam = s?.onlineHideOwnedNonSteam === true;
      const srcExcludeOwned = (source as any).excludeOwned === true;
      const srcExcludeNonSteam = srcExcludeOwned && (source as any).excludeOwnedNonSteam === true;
      const hideOwnedStore = globalHideOwned || srcExcludeOwned;
      const hideOwnedStoreNonSteam = hideOwnedStore && ((globalHideOwned && globalHideNonSteam) || srcExcludeNonSteam);
      const perShelfCloud = (source as any).hideOwnedNonSteamCloud;
      const hideOwnedStoreNonSteamCloud = hideOwnedStoreNonSteam &&
        (perShelfCloud === true || (perShelfCloud === undefined && s?.onlineHideOwnedNonSteamCloud === true));
      if (hideOwnedStore) {
        const ownedSetStore = getLocalLibraryAppIds(hideOwnedStoreNonSteam, hideOwnedStoreNonSteamCloud);
        ids = ids.filter((id) => !ownedSetStore.has(id));
      }

      if (childFilter && Array.isArray(childFilter.items) && childFilter.items.length > 0) {
        const byId = new Map(all.map((a) => [appIdOf(a), a] as const));
        ids = ids.filter((id) =>
          childFilter.items.every((item: any) => {
            if (item.type === "discount") return evaluateFilterItem(item, { appid: id } as any, undefined);
            const app = byId.get(id);
            if (!app) return true;
            return evaluateFilterItem(item, app, undefined);
          })
        );
      }

      // Same dispatch as the wishlist branch — see the comment there for
      // why the stub-pool path was reverted.
      const sortKeysStore: string[] = Array.isArray(sort) ? sort : (sort ? [sort] : []);
      const isSingleKeyPriceSortStore = !Array.isArray(sort) && (sort === "price_low" || sort === "discount_high" || sort === "original_price_high");
      const hasPriceKeyStore = sortKeysStore.some((k) => k === "price_low" || k === "discount_high" || k === "original_price_high");
      if (isSingleKeyPriceSortStore) {
        ids = await applyPriceSort(ids, sort as "price_low" | "discount_high" | "original_price_high", Array.isArray(sortReverse) ? !!sortReverse[0] : sortReverse);
      } else if (sort) {
        // Same unified pool as wishlist — see comment there. Without it,
        // the multi-key chain only ordered the local subset and the
        // store-on-sale remote ids stayed in raw API order at the tail.
        const localPriceMap = hasPriceKeyStore ? await getPriceMap(ids) : undefined;
        const byId = new Map(all.map((a) => [appIdOf(a), a] as const));
        const pool: AppOverview[] = ids.map((id) => {
          const a = byId.get(id);
          return a ?? ({ appid: id } as unknown as AppOverview);
        });
        ids = applySortToIds(ids, sort, pool, shelfId, sortReverse, localPriceMap);
      }
      logInfo("STEAM", "resolveShelfAppIds(store) resolved", { count: ids.length });
      return finish(ids.slice(0, overShootLimit));
    } catch (e) {
      logWarn("STEAM", "resolveShelfAppIds(store) failed", String(e));
      return [];
    }
  }

  if (source.type === "smart") {
    try {
      const { resolveSmartShelf } = await import("./smartShelves");
      const { hasExternalSmartSource, resolveExternalSmartSource } = await import("../core/pluginApi");
      const apps = await getAllAppOverviews();
      const smartFilterGroup = (source as any).filterGroup;
      const smartParams = (source as any).smartParams as Record<string, number> | undefined;
      const refreshIntervalMinutes = (source as any).refreshIntervalMinutes as number | undefined;
      const ttlMs = typeof refreshIntervalMinutes === "number" && refreshIntervalMinutes > 0
        ? refreshIntervalMinutes * 60 * 1000
        : undefined;
      // If the user added extra filters, resolve smart without a limit first
      // so filtering doesn't prematurely truncate candidates, then apply the
      // filters + sort + final limit below.
      const wantsPostProcess = !!smartFilterGroup || !!sort;
      const smartFetchLimit = wantsPostProcess ? Math.max(limit * 4, 200) : limit;
      // Plugin API precedence: internal modes ALWAYS win. External plugins
      // can register additional `mode` ids, but a registration that collides
      // with one of our 15 built-ins is ignored at resolve time so behavior
      // stays deterministic. Custom mode: no built-in candidate set — the
      // user's filterGroup IS the candidate set; use the full app pool and
      // let the post-process branch (filterGroup + sort + slice) do the work.
      const { INTERNAL_SMART_MODES } = await import("./smartShelves");
      let rawIds: number[];
      // Composite smart source — when populated, evaluate the primary mode
      // PLUS every additional mode in `compositeModes`, then merge via
      // `compositeCombine` (default union). Each child shares the parent's
      // `smartParams` for now; per-child params is a follow-up. Mirrors the
      // regular `composite` source semantics so both shelf kinds expose the
      // same mental model. Cache namespacing is per shelf, not per child,
      // so refreshing the shelf invalidates all branches at once.
      const compositeModes = Array.isArray((source as any).compositeModes) ? ((source as any).compositeModes as string[]) : [];
      if (compositeModes.length > 0) {
        const combine = (source as any).compositeCombine === "intersection" ? "intersection" : "union";
        const allModes: string[] = [source.mode, ...compositeModes];
        const seen = new Set<string>();
        const uniqueModes = allModes.filter((m) => {
          if (seen.has(m)) return false;
          seen.add(m);
          return true;
        });
        const childResults: number[][] = [];
        for (const m of uniqueModes) {
          try {
            if (m === "custom") {
              childResults.push(apps.map((a) => appIdOf(a)).filter(Number.isFinite));
            } else if (INTERNAL_SMART_MODES.has(m)) {
              childResults.push(resolveSmartShelf(m as any, apps, smartFetchLimit, smartParams, ttlMs, shelfId ? `${shelfId}:${m}` : undefined));
            } else if (hasExternalSmartSource(m)) {
              childResults.push(await resolveExternalSmartSource(m, smartFetchLimit, smartParams ?? {}));
            } else {
              childResults.push([]);
            }
          } catch (e) {
            logWarn("STEAM", "composite smart child failed", { mode: m, err: String(e) });
            childResults.push([]);
          }
        }
        rawIds = mergeCompositeResults(childResults, combine);
      } else if (source.mode === "custom") {
        rawIds = apps.map((a) => appIdOf(a)).filter(Number.isFinite);
      } else if (INTERNAL_SMART_MODES.has(source.mode)) {
        rawIds = resolveSmartShelf(source.mode, apps, smartFetchLimit, smartParams, ttlMs, shelfId);
      } else if (hasExternalSmartSource(source.mode)) {
        rawIds = await resolveExternalSmartSource(source.mode, smartFetchLimit, smartParams ?? {});
      } else {
        rawIds = [];
      }
      let ids = rawIds;
      if (smartFilterGroup && Array.isArray(smartFilterGroup.items) && smartFilterGroup.items.length > 0) {
        const byId = new Map(apps.map((a) => [appIdOf(a), a] as const));
        const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as AppOverview[];
        ids = evaluateFilterGroup(smartFilterGroup, candidates).map((a) => appIdOf(a)).filter(Number.isFinite);
      }
      if (sort && sort !== "manual") {
        ids = applySortToIds(ids, sort, apps, shelfId, sortReverse);
      }
      logInfo("STEAM", "resolveShelfAppIds(smart) resolved", { mode: source.mode, count: ids.length, hasFilter: !!smartFilterGroup, sort });
      return finish(ids.slice(0, overShootLimit));
    } catch {
      return [];
    }
  }

  if (source.type === "composite") {
    if (_depth >= MAX_COMPOSITE_DEPTH) {
      logWarn("STEAM", "resolveShelfAppIds(composite) depth cap reached", { depth: _depth, max: MAX_COMPOSITE_DEPTH });
      return finish([]);
    }
    const combine = source.combine === "intersection" ? "intersection" : "union";
    const childSources: Array<{ type: string; [k: string]: any }> = Array.isArray(source.sources) ? source.sources : [];
    if (!childSources.length) return finish([]);
    // Each child source resolves with its OWN sort embedded (filter
    // sources carry `source.filter.sort`; other types use the shelf-
    // level sort passed through). We forward `sort` + `sortReverse` so
    // composite is transparent to those child resolvers — but cap each
    // child at `overShootLimit` so a single greedy child can't blow up
    // the merged set before de-dupe.
    const childResults = await Promise.all(
      childSources.map((child) =>
        resolveShelfAppIds(child, overShootLimit, sort, shelfId, sortReverse, options, _depth + 1)
          .catch((e) => { logWarn("STEAM", "composite child resolve failed", String(e)); return [] as number[]; }),
      ),
    );
    const merged = mergeCompositeResults(childResults, combine);
    logInfo("STEAM", "resolveShelfAppIds(composite) resolved", { combine, children: childSources.length, count: merged.length });
    return finish(merged.slice(0, overShootLimit));
  }

  return [];
}

function checkUpdatePendingRaw(raw: any): boolean {
  if (!raw) return false;
  try {
    const pcd = raw?.per_client_data;
    const clientData = Array.isArray(pcd) ? pcd[0] : (pcd ?? null);
    if (clientData) {
      const ds = Number(clientData?.display_status ?? 0);
      if (UPDATE_PENDING_STATUSES.includes(ds)) return true;
      const bytesDown = Number(clientData?.bytes_to_download ?? clientData?.m_nBytesToDownload ?? 0);
      if (bytesDown > 0) return true;
    }
  } catch {}
  try { if (raw.m_bUpdateRunning === true || raw.update_running === true) return true; } catch {}
  try { if (raw.m_bUpdateAvailable === true || raw.update_available === true) return true; } catch {}
  try { if (raw.m_bNeedsUpdate === true || raw.needs_update === true) return true; } catch {}
  try { if (raw.m_bUpdatePaused === true) return true; } catch {}
  try { if (Number(raw.m_nBytesToDownload ?? 0) > 0) return true; } catch {}
  try { if (Number(raw.m_nBytesToStage ?? 0) > 0) return true; } catch {}
  try { if (typeof raw.BIsUpdateRunning === "function" && raw.BIsUpdateRunning()) return true; } catch {}
  try { if (typeof raw.BIsUpdateAvailable === "function" && raw.BIsUpdateAvailable()) return true; } catch {}
  try { if (typeof raw.BNeedsUpdate === "function" && raw.BNeedsUpdate()) return true; } catch {}
  try { if (typeof raw.BHasUpdate === "function" && raw.BHasUpdate()) return true; } catch {}
  try {
    let proto = Object.getPrototypeOf(raw);
    while (proto && proto !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (/^(m_bUpdate|m_bNeedsUpdate|update_pending)/i.test(key)) {
          const val = raw[key];
          if (val === true) return true;
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
  } catch {}
  return false;
}

/** Cached set of appids with pending downloads/updates */
let _pendingUpdateAppIds: Set<number> | null = null;
let _pendingUpdateTs = 0;

async function refreshPendingUpdateAppIds(): Promise<Set<number>> {
  const now = Date.now();
  if (_pendingUpdateAppIds && (now - _pendingUpdateTs < 5000)) return _pendingUpdateAppIds;
  const ids = new Set<number>();
  try {
    const sc = getSteamClient();
    // Try SteamClient.Downloads
    const dlItems = sc?.Downloads?.GetDownloadItems?.() ?? [];
    for (const dl of Array.isArray(dlItems) ? dlItems : []) {
      const id = Number(dl?.appid ?? dl?.nAppID ?? 0);
      if (id > 0) ids.add(id);
    }
    // Try SteamClient.Updates
    const queue = sc?.Updates?.GetUpdateQueue?.() ?? sc?.Updates?.GetQueue?.() ?? [];
    for (const item of Array.isArray(queue) ? queue : []) {
      const id = Number(item?.appid ?? item?.nAppID ?? 0);
      if (id > 0) ids.add(id);
    }
  } catch {}
  _pendingUpdateAppIds = ids;
  _pendingUpdateTs = now;
  return ids;
}

function buildMetaFromOverview(appid: number, overview?: AppOverview, raw?: any): PlatformAppMeta {
  const isSteam = overview?.is_steam !== false;

  // Use local Steam client paths (served by Steam's built-in web server).
  // library_capsule_filename includes hash subdirs and localized filenames.
  const capsuleFile = overview?.library_capsule_filename || "library_600x900.jpg";
  const mtime = overview?.rt_store_asset_mtime;
  const added = overview?.rt_purchased_time ?? overview?.rt_recent_activity_time ?? overview?.user_added_ts ?? overview?.rt_store_asset_mtime;
  const cacheBust = mtime ? `?c=${mtime}` : "";
  const portraitUrl = isSteam ? `/assets/${appid}/${capsuleFile}${cacheBust}` : undefined;
  const heroUrl = isSteam ? `/assets/${appid}/library_hero.jpg${cacheBust}` : undefined;

  // Check update pending from overview + raw + download queue
  let updatePending = overview?.update_pending === true || checkUpdatePendingRaw(raw);
  if (!updatePending && _pendingUpdateAppIds?.has(appid)) updatePending = true;

  return {
    appid,
    name: String(overview?.display_name ?? `App ${appid}`),
    heroUrl,
    portraitUrl,
    installed: overview?.installed,
    isSteam,
    deckCompatCategory: overview?.deck_compatibility_category,
    playtimeMinutes: Number(overview?.playtime_forever ?? (overview as any)?.minutes_playtime_forever ?? (overview as any)?.minutes_played_forever ?? 0) || undefined,
    updatePending,
    addedTimestamp: typeof added === 'number' && Number.isFinite(added) && added > 0 ? Number(added) : undefined,
  };
}

export async function getAppMeta(appid: number): Promise<PlatformAppMeta> {
  // Refresh download queue cache (non-blocking, 5s TTL)
  try { /* perf markers */ } catch {}
  // Instrumentation
  try { await Promise.resolve(); } catch {}
  {
    /* placeholder for perf import resolution at build time */
  }
  refreshPendingUpdateAppIds().catch(() => {});
  try { /* no-op to keep markers resolvable */ } catch {}
  // Start measuring
  try { mark?.(`getAppMeta:${appid}:start`); } catch {}
  const sc = getSteamClient();
  try {
    const ov = await sc?.Apps?.GetAppOverview?.(appid);
    if (ov) return buildMetaFromOverview(appid, normalizeAppOverview(ov) ?? ov as AppOverview, ov);
  } catch {}
  for (const hostWindow of getSteamWindows()) {
    try {
      const ov = hostWindow?.appStore?.GetAppOverviewByAppID?.(appid)
        ?? hostWindow?.AppStore?.GetAppOverviewByAppID?.(appid)
        ?? hostWindow?.appStore?.m_mapAppInfo?.get?.(appid)
        ?? hostWindow?.LibraryStore?.m_mapAppInfo?.get?.(appid);
      if (ov) return buildMetaFromOverview(appid, normalizeAppOverview(ov) ?? ov as AppOverview, ov);
    } catch {}
  }
  try {
    const all = await getAllAppOverviews();
    const found = all.find((a) => Number(a.appid) === appid);
    if (found) {
      // Also fetch raw for update detection
      let raw: any;
      try { raw = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid); } catch {}
      const res = buildMetaFromOverview(appid, found, raw);
      try { measure?.(`getAppMeta:${appid}`, `getAppMeta:${appid}:start`); } catch {}
      return res;
    }
  } catch {}
  const fallback = { appid, name: `App ${appid}`, heroUrl: `/assets/${appid}/library_hero.jpg`, portraitUrl: `/assets/${appid}/library_600x900.jpg`, isSteam: true };
  try { measure?.(`getAppMeta:${appid}`, `getAppMeta:${appid}:start`); } catch {}
  return fallback;
}

export async function getAppName(appid: number): Promise<string> {
  const meta = await getAppMeta(appid);
  return meta.name;
}

// ---------------------------------------------------------------------------
// Developer / Publisher data (from appDetailsStore)
// ---------------------------------------------------------------------------

/** Module-level cache so we don't re-read from the store on every filter pass */
const developerCache = new Map<number, string>();

// Persistent cache in localStorage to survive plugin reloads. Keys: appid -> developer string
const DEV_CACHE_KEY = 'deck-shelves-dev-cache-v1';
const DEV_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
let devCacheSaveTimer: number | null = null;

function loadDeveloperCacheFromStorage() {
  try {
    const raw = globalThis.localStorage?.getItem(DEV_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    const ts = Number(parsed.ts || 0);
    if (!ts || (Date.now() - ts) > DEV_CACHE_TTL_MS) return; // expired
    const map = parsed.map || {};
    for (const k of Object.keys(map)) {
      const id = Number(k);
      if (!Number.isNaN(id)) developerCache.set(id, String(map[k] ?? ""));
    }
  } catch {}
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

/** Read publisher from appDetailsStore without triggering a network load. */
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

/** Read developer from appDetailsStore without triggering a network load. */
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

/**
 * Preload developer data for a list of appids via SteamClient.Apps.RegisterForAppDetails.
 * Results are stored in the module-level developerCache.
 * Returns a promise that resolves once all registrations have fired or timed out.
 */
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

/**
 * Get all unique developer names from a list of appids.
 * Uses the cache; call preloadDeveloperData first for full coverage.
 */
export function getUniqueDevelopers(appids: number[]): string[] {
  const set = new Set<string>();
  for (const id of appids) {
    const dev = getAppDeveloperCached(id);
    if (dev) set.add(dev);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
