import type { FilterGroup, FilterItem } from "./types";
import type { PlatformAppMeta, PlatformTab } from "./runtime/platform";
import { logInfo, logWarn } from "./runtime/logger";
import { getPreferredSteamDocument, getPreferredSteamWindow } from "./runtime/steamHost";

export type SteamCollection = { id: string; name: string };

const collectionRawCache = new Map<string, any>();

function getSteamClient(): any {
  const hostWindow = getPreferredSteamWindow() as any;
  return hostWindow?.SteamClient ?? (window as any).SteamClient;
}

function getSteamWindow(): any {
  return getPreferredSteamWindow() as any;
}

function getSteamWindows(): any[] {
  const candidates = [
    getPreferredSteamWindow(),
    window,
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

function uniqTabs(list: PlatformTab[]): PlatformTab[] {
  const map = new Map<string, PlatformTab>();
  for (const item of list) {
    const id = String(item.id || "").trim();
    const name = String(item.name || "").trim();
    if (!id || !name) continue;
    if (!map.has(id)) map.set(id, { id, name });
  }
  return [...map.values()];
}

function cacheCollectionRaw(id: string, name: string, raw: any) {
  const exactId = String(id ?? "").trim();
  const exactName = String(name ?? "").trim();
  if (exactId) collectionRawCache.set(`id:${exactId}`, raw);
  if (exactName) collectionRawCache.set(`name:${exactName}`, raw);

  const normalizedId = normalizeText(exactId);
  const normalizedName = normalizeText(exactName);
  const tokenId = normalizeCollectionToken(exactId);
  if (normalizedId) collectionRawCache.set(`nid:${normalizedId}`, raw);
  if (normalizedName) collectionRawCache.set(`nname:${normalizedName}`, raw);
  if (tokenId) collectionRawCache.set(`tid:${tokenId}`, raw);
}

function getCachedCollectionRawCandidates(idCandidates: string[], nameCandidates: string[]): any[] {
  const out: any[] = [];
  const seen = new Set<any>();
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
    const candidate = collectionRawCache.get(key);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
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

function extractTabArrayFromStore(candidate: any): PlatformTab[] {
  const out: PlatformTab[] = [];
  const seen = new Set<any>();
  const TAB_ARRAY_KEYS = new Set(["tabs", "m_rgTabs", "m_tabs", "m_mapTabs", "m_mapTabData", "allTabs", "visibleTabs",
    "visibleTabsList", "hiddenTabsList", "tabsMap", "collections", "items", "children", "entries", "routes", "sections"]);
  const visit = (node: any) => {
    if (!node || seen.has(node)) return;
    if (typeof node !== "object") return;
    seen.add(node);
    // Handle ES6 Map (e.g. TabMaster's tabsMap: Map<string, TabContainer>)
    if (node instanceof Map) {
      node.forEach((v) => visit(v));
      return;
    }
    const maybeId = String(node?.id ?? node?.key ?? node?.route ?? node?.path ?? node?.url ?? node?.tabid ?? node?.internal_name ?? node?.strInternalName ?? node?.name ?? "").trim();
    const maybeName = String(node?.title ?? node?.label ?? node?.displayName ?? node?.name ?? node?.strName ?? node?.localizedName ?? node?.tab_name ?? "").trim();
    if (maybeId && maybeName) out.push({ id: normalizeTabId(maybeId), name: maybeName });
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (TAB_ARRAY_KEYS.has(key)) {
        visit(value);
      } else if (value && typeof value === "object") {
        const hasTabMarkers = ["tab", "title", "label", "displayName", "strName", "internal_name", "route"].some((k) => Object.prototype.hasOwnProperty.call(value, k));
        if (hasTabMarkers) visit(value);
      }
    }
  };
  visit(candidate);
  return out;
}

async function getTabAppIdsFromStore(tab: string): Promise<number[]> {
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

export async function listLibraryTabs(): Promise<PlatformTab[]> {
  const defaults: PlatformTab[] = [
    { id: "all", name: "All Games" },
    { id: "favorites", name: "Favorites" },
    { id: "installed", name: "Installed" },
    { id: "hidden", name: "Hidden" },
    { id: "nonsteam", name: "Non-Steam" },
  ];

  // 1. Try fiber traversal (TabMaster context in React tree)
  const fiberTabs = getCustomFiltersList();
  if (fiberTabs.length > 0) {
    try {
      logInfo("STEAM", "listLibraryTabs: fiber context found", { count: fiberTabs.length, sample: fiberTabs.slice(0, 6) });
    } catch {}
    return fiberTabs;
  }

  // 2. Settings file — read TabMaster's settings.json via our own backend.
  //    TabMaster exposes no React context and no inter-plugin IPC; the settings
  //    file is the only reliable source of tab data.
  try {
    const { getVisibleTabsFromSettingsFile } = await import('./integrations/tabmaster');
    const { isTabMasterInstalled } = await import('./integrations/registry');
    if (isTabMasterInstalled()) {
      const settingsTabs = await getVisibleTabsFromSettingsFile();
      if (settingsTabs.length > 0) {
        try { logInfo("STEAM", "listLibraryTabs: settings-file tabs found", { count: settingsTabs.length }); } catch {}
        return settingsTabs;
      }
    }
  } catch {}

  // 3. Try DOM-based tab reading (works with any plugin that renders [data-tab-id] attributes)
  try {
    const { getTabsFromDOM } = await import('./integrations/unifideck');
    const domTabs = getTabsFromDOM();
    if (domTabs.length > 0) {
      try { logInfo("STEAM", "listLibraryTabs: DOM tabs found", { count: domTabs.length }); } catch {}
      return domTabs;
    }
  } catch {}

  const clients = getSteamClients();
  const hostWindows = getSteamWindows();

  // Probe CustomTabs/TabMaster-like contexts directly: they may expose visibleTabsList and tabsMap
  const customFiltersDirectCandidates = hostWindows.flatMap((win: any) => [
    win?.TabMasterStore?.visibleTabsList,
    win?.TabMasterStore?.hiddenTabsList,
    win?.TabMasterStore?.tabsMap,
    win?.TabMaster?.visibleTabsList,
    win?.TabMaster?.hiddenTabsList,
    win?.TabMaster?.tabsMap,
    win?.TabMasterContext?.visibleTabsList,
    win?.TabMasterContext?.hiddenTabsList,
    win?.TabMasterContext?.tabsMap,
  ]).filter(Boolean);

  const globalCandidates = [
    ...customFiltersDirectCandidates,
    ...collectDynamicTabStores(),
    ...clients.map((sc: any) => sc?.Apps),
    ...hostWindows.flatMap((hostWindow: any) => [hostWindow?.LibraryStore, hostWindow?.AppStore, hostWindow?.g_LibraryTabs, hostWindow?.g_rgTabs, hostWindow?.appStore]),
  ];

  let found: PlatformTab[] = [];
  for (const candidate of globalCandidates) {
    try {
      found = found.concat(extractTabArrayFromStore(candidate));
    } catch {}
  }

  try {
    const getterNames = ["GetTabs", "GetLibraryTabs", "GetVisibleTabs", "GetAllTabs", "GetSidebarTabs", "GetPrimaryTabs"];
    for (const store of collectDynamicTabStores()) {
      for (const name of getterNames) {
        const result = await store?.[name]?.();
        found = found.concat(extractTabArrayFromStore(result));
      }
    }
  } catch {}

  const unique = uniqTabs(found.length ? found : defaults);
  const builtin = new Set(["all", "favorites", "installed", "hidden", "nonsteam", "recent", "/library/home", "/library/collections"]);
  const filteredCandidates = await Promise.all(unique.slice(0, 32).map(async (tab) => {
    if (builtin.has(normalizeTabId(tab.id))) return tab;
    if (!tab.name || tab.name.length > 40) return null;
    const byId = await getTabAppIdsFromStore(tab.id);
    if (byId.length) return tab;
    const byName = await getTabAppIdsFromStore(tab.name);
    if (byName.length) return tab;
    return null;
  }));
  const finalTabs = uniqTabs((filteredCandidates.filter(Boolean) as PlatformTab[]).length ? filteredCandidates.filter(Boolean) as PlatformTab[] : unique);
  try {
    logInfo("STEAM", "listLibraryTabs", {
      found: found.length,
      unique: finalTabs.length,
      sample: finalTabs.slice(0, 10).map((t) => ({ id: t.id, name: t.name })),
    });
  } catch {}
  return finalTabs;
}

export async function listCollections(): Promise<SteamCollection[]> {
  const clients = getSteamClients();
  const hostWindows = getSteamWindows();
  const docs = Array.from(new Set([getPreferredSteamDocument(), ...hostWindows.map((win: any) => win?.document)].filter(Boolean)));
  const normalize = (items: any[]): SteamCollection[] => items
    .map((c: any) => {
      const id = String(c?.id ?? c?.collectionid ?? c?.gid ?? c?.key ?? c?.name ?? c?.displayName ?? "");
      const name = String(c?.displayName ?? c?.name ?? c?.title ?? c?.label ?? "Collection");
      if (id && name) cacheCollectionRaw(id, name, c);
      return { id, name };
    })
    .filter((c) => c.id && c.name);
  try {
    for (const hostWindow of hostWindows) {
      const globalCollectionStore = hostWindow?.collectionStore ?? (globalThis as any).collectionStore;
      const userCollections = globalCollectionStore?.userCollections;
      if (Array.isArray(userCollections)) {
        const norm = normalize(userCollections as any[]);
        if (norm.length) return norm;
      }
    }
  } catch {}
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
  return !!(a?.is_non_steam) || a?.is_steam === false || a?.m_eAppType === 1073741824 || a?.app_type === "shortcut";
}
function isFavoriteOf(a: any): boolean {
  return !!(a?.is_favorite ?? a?.favorite ?? a?.m_bIsFavorite ?? a?.m_bFavorite ?? a?.bFavorite);
}
function isHiddenOf(a: any): boolean {
  return !!(a?.is_hidden ?? a?.hidden ?? a?.m_bHidden ?? a?.bHidden);
}
function isInstalledOf(a: any): boolean {
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
  library_hero?: string;
  header?: string;
  icon_hash?: string;
  update_pending?: boolean;
};

function normalizeAppOverview(node: any): AppOverview | null {
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
    is_hidden: readOptionalBoolean(node, ["is_hidden", "hidden", "m_bHidden", "bHidden"]),
    installed: readOptionalBoolean(node, ["installed", "is_installed", "m_bInstalled", "bInstalled"]),
    update_pending: (() => {
      const pcd = node?.per_client_data;
      const clientData = Array.isArray(pcd) ? pcd[0] : (pcd ?? null);
      if (clientData) {
        const ds = Number(clientData?.display_status ?? 0);
        if (ds === 19 || ds === 6 || ds === 7 || ds === 8 || ds === 12 || ds === 13 || ds === 3) return true;
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
    deck_compatibility_category: Number(node?.deck_compatibility_category ?? node?.m_eDeckCompatibilityCategory ?? ((Number(node?.steam_hw_compat_category_packed ?? 0) & 0xF) || 0)),
    library_capsule: String(node?.library_capsule ?? node?.libraryCapsule ?? node?.vertical_capsule ?? ""),
    library_capsule_filename: String(node?.library_capsule_filename ?? node?.libraryCapsuleFilename ?? ""),
    rt_store_asset_mtime: Number(node?.rt_store_asset_mtime ?? node?.rtStoreAssetMtime ?? 0) || undefined,
    library_hero: String(node?.library_hero ?? node?.hero ?? node?.libraryHero ?? ""),
    header: String(node?.header ?? node?.header_image ?? node?.capsule ?? ""),
    icon_hash: String(node?.icon_hash ?? node?.iconHash ?? ""),
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

async function enrichAppStateFlags(items: AppOverview[]): Promise<AppOverview[]> {
  const byId = new Map(items.map((item) => [item.appid, { ...item }] as const));
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

async function getAllAppOverviews(): Promise<AppOverview[]> {
  const now = Date.now();
  if (appOverviewCache && now - appOverviewCache.ts < 10000) {
    return appOverviewCache.items;
  }

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
  sort?: "alphabetical" | "recent" | "playtime" | "release_date" | "size_on_disk" | "metacritic" | "review_score";
  minPlaytimeMinutes?: number;
  maxPlaytimeMinutes?: number;
  updatePending?: boolean;
};

function resolveDynamicTab(tab: string, all: AppOverview[]): AppOverview[] {
  const id = slugifyTab(tab.startsWith("/") ? tab.split("/").pop() || tab : tab);
  if (id === "all" || id === "all_games" || id === "allgames") return all;
  if (id === "favorites") return all.filter((a) => isFavoriteOf(a));
  if (id === "hidden") return all.filter((a) => isHiddenOf(a));
  if (id === "nonsteam" || id === "epic" || id === "gog") return all.filter((a) => isNonSteamOf(a));
  if (id === "installed" || id === "great_on_deck") return all.filter((a) => isInstalledOf(a));
  if (id === "recent") return all.slice().sort((a, b) => lastPlayedOf(b) - lastPlayedOf(a));
  const byTab = all.filter((a: any) => {
    const tags = [a?.tab, a?.tab_name, a?.collection_name, a?.category, ...(Array.isArray(a?.tags) ? a.tags : [])]
      .map((v: any) => slugifyTab(String(v ?? "")))
      .filter(Boolean);
    return tags.includes(id);
  });
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
      const appSet = ctx?.collectionAppIds.get(colId);
      // If not pre-fetched, pass-through so we don't incorrectly exclude everything
      result = appSet ? appSet.has(app.appid) : true;
      break;
    }
    case "merge": {
      // Recursively evaluate as a nested group
      const subItems: FilterItem[] = Array.isArray(item.params?.items) ? (item.params.items as FilterItem[]) : [];
      const subMode = ((item.params?.mode ?? "and") as "and" | "or");
      result = evaluateFilterGroup({ mode: subMode, items: subItems }, [app], ctx).length > 0;
      break;
    }
    // storeTag, friends, achievements: require data not in AppOverview — pass-through
    default:
      result = true;
  }
  return item.inverted ? !result : result;
}

function evaluateFilterGroup(group: FilterGroup, apps: AppOverview[], ctx?: FilterEvalContext): AppOverview[] {
  if (!group.items || group.items.length === 0) return apps;
  const mode = group.mode ?? "and";
  if (mode === "or") {
    return apps.filter((app) => group.items.some((item) => evaluateFilterItem(item, app, ctx)));
  }
  return apps.filter((app) => group.items.every((item) => evaluateFilterItem(item, app, ctx)));
}

export async function resolveShelfAppIds(source: { type: string; [k: string]: any }, limit: number): Promise<number[]> {
  const all = await getAllAppOverviews();

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
    return ids.slice(0, limit);
  }

  if (source.type === "tab") {
    const rawTab = String(source.tab ?? "").trim();

    // Try CustomTabs fiber traversal first (works even when external plugin exposes no globals)
      const customFiltersIds = getCustomFiltersAppsForContainer(rawTab);
      if (customFiltersIds.length) {
        try {
          logInfo("STEAM", "resolveShelfAppIds(tab): CustomFilters fiber", { tab: rawTab, count: customFiltersIds.length });
        } catch {}
        return customFiltersIds.slice(0, limit);
      }

    let fromTabStore = await getTabAppIdsFromStore(rawTab);
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
      return fromTabStore.slice(0, limit);
    }
    const filtered = resolveDynamicTab(rawTab, all);
    const sorted = slugifyTab(rawTab) === "recent"
      ? filtered
      : filtered.slice().sort((a, b) => String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))));
    const ids = sorted.map((a) => appIdOf(a)).filter(Number.isFinite).slice(0, limit);

    // Fallback for TabMaster UUID tabs: standard resolution couldn't find apps (no fiber
    // context, UUID not in any Steam store). Read TabMaster's settings file to get the
    // tab's filter definition and resolve via filter source.
    if (!ids.length && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTab)) {
      try {
        const { getTabsFromSettingsFile } = await import('./integrations/tabmaster');
        const { convertFiltersToGroup } = await import('./domain/customfilters');
        const tmTabs = await getTabsFromSettingsFile();
        const tmTab = tmTabs.find((t) => t.id === rawTab);
        if (tmTab && tmTab.filters && tmTab.filters.length > 0) {
          const filterGroup = convertFiltersToGroup(tmTab.filters);
          try { logInfo("STEAM", "resolveShelfAppIds(tab): UUID fallback via TabMaster filters", { tab: rawTab, title: tmTab.title }); } catch {}
          return resolveShelfAppIds({ type: 'filter', filter: { filterGroup } } as any, limit);
        }
      } catch {}
    }

    if (!ids.length) {
      logWarn("STEAM", "resolveShelfAppIds(tab) empty", { tab: rawTab, allCount: all.length });
    }
    return ids;
  }

  if (source.type === "filter") {
    const f: CustomFilter = (source.filter ?? {}) as CustomFilter;

    // New TabMaster-style filter group — takes priority over legacy flat fields
    const filterGroup = (source.filter as any)?.filterGroup as FilterGroup | undefined;
    if (filterGroup && Array.isArray(filterGroup.items) && filterGroup.items.length > 0) {
      // Pre-fetch collection app IDs so the synchronous evaluator can match them
      const ctx: FilterEvalContext = { collectionAppIds: new Map() };
      const colIds = collectCollectionIdsFromGroup(filterGroup);
      await Promise.all(colIds.map(async (colId) => {
        try {
          const ids = await getCollectionApps(colId);
          if (ids.length) ctx.collectionAppIds.set(colId, new Set(ids));
        } catch {}
      }));
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
      } else {
        filtered = filtered.slice().sort((a, b) => String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))));
      }
      const ids = filtered.map((a) => appIdOf(a)).filter(Number.isFinite).slice(0, limit);
      if (!ids.length) {
        logWarn("STEAM", "resolveShelfAppIds(filterGroup) empty", { filter: f, allCount: all.length });
      } else {
        logInfo("STEAM", "resolveShelfAppIds(filterGroup) resolved", { count: ids.length, allCount: all.length });
      }
      return ids;
    }

    // Legacy flat filter fields
    let filtered = all;
    if (f.favorites) filtered = filtered.filter((a) => isFavoriteOf(a));
    if (f.hidden === "only" || f.hidden === true) filtered = filtered.filter((a) => isHiddenOf(a));
    if (f.hidden === false) filtered = filtered.filter((a) => !isHiddenOf(a));
    if (f.nonSteam) filtered = filtered.filter((a) => isNonSteamOf(a));
    if (f.installed) {
      // Try strict first, fall back to lenient (installed !== false) if strict yields nothing
      const strict = filtered.filter((a) => isInstalledOf(a));
      if (strict.length > 0) {
        filtered = strict;
      } else {
        // Many app overviews lack an explicit installed flag — treat undefined as installed
        filtered = filtered.filter((a) => (a as any).installed !== false);
      }
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
    } else {
      filtered = filtered.slice().sort((a, b) => String((a as any).sort_as ?? appNameOf(a)).localeCompare(String((b as any).sort_as ?? appNameOf(b))));
    }

    const ids = filtered.map((a) => appIdOf(a)).filter(Number.isFinite).slice(0, limit);
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
    return ids;
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
      if (ds === 19 || ds === 6 || ds === 7 || ds === 8 || ds === 12 || ds === 13 || ds === 3) return true;
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
  };
}

export async function getAppMeta(appid: number): Promise<PlatformAppMeta> {
  // Refresh download queue cache (non-blocking, 5s TTL)
  refreshPendingUpdateAppIds().catch(() => {});
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
      return buildMetaFromOverview(appid, found, raw);
    }
  } catch {}
  return { appid, name: `App ${appid}`, heroUrl: `/assets/${appid}/library_hero.jpg`, portraitUrl: `/assets/${appid}/library_600x900.jpg`, isSteam: true };
}

export async function getAppName(appid: number): Promise<string> {
  const meta = await getAppMeta(appid);
  return meta.name;
}
