import type { PlatformTab } from "../runtime/platform";
import { type SteamCollectionLike, type SteamCollectionStore, type SteamHostWindow, steamCollectionStore } from "./internals";
import { getPreferredSteamDocument } from "../runtime/steamHost";
import { firstStringFromKeys, getSteamClients, getSteamWindows, hasAnyMethod } from "./steamAccess";

/* Library tabs: the native tab list, TabMaster's custom tabs (read through React fibers), and the app ids behind a tab. */

export function slugifyTab(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
}

function normalizeTabId(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return raw;
  if (raw.includes("library/home") || raw.includes("#library/home")) return "/library/home";
  if (raw.includes("library/collections") || raw.includes("#library/collections")) return "/library/collections";
  return slugifyTab(raw);
}

// The TabMaster plugin's context value (its tabs), read through React fibers.
export interface TabMasterTab { id?: string; title?: string; name?: string; [key: string]: any }

interface TabMasterContext { visibleTabsList?: TabMasterTab[]; tabsMap?: Map<string, TabMasterTab>; [key: string]: any }

// ─── React fiber traversal for plugin context discovery ──────────────────

let pluginContextCache: { ts: number; value: TabMasterContext | null } | null = null;

const PLUGIN_CONTEXT_CACHE_TTL = 8000;

function hasTabMasterShape(o: unknown): o is TabMasterContext {
  const c = o as TabMasterContext | null | undefined;
  return !!c && typeof c === 'object' && (Array.isArray(c.visibleTabsList) || c.tabsMap instanceof Map);
}

function extractTabMasterFromFiberValue(val: unknown): TabMasterContext | null {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return null;
  if (hasTabMasterShape(val)) return val;
  const inner = (val as Record<string, unknown>).tabMasterManager;
  if (hasTabMasterShape(inner)) return inner;
  return null;
}

function walkFiberForTabMasterContext(startFiber: any): TabMasterContext | null {
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

export function findTabMasterContextValue(): TabMasterContext | null {
  const now = Date.now();
  if (pluginContextCache && now - pluginContextCache.ts < PLUGIN_CONTEXT_CACHE_TTL) {
    return pluginContextCache.value;
  }
  let value: TabMasterContext | null = null;
  try {
    const docs = Array.from(
      new Set([getPreferredSteamDocument(), ...getSteamWindows().map((w: SteamHostWindow) => w?.document)].filter(Boolean))
    ) as Document[];
    for (const doc of docs) {
      try { value = findTabMasterValueInDoc(doc); if (value) break; } catch {}
    }
  } catch {}
  pluginContextCache = { ts: now, value };
  return value;
}

function pushTabIfNew(out: PlatformTab[], seen: Set<string>, id: string, name: string): void {
  if (!id || !name || seen.has(id)) return;
  seen.add(id);
  out.push({ id, name });
}

export function tabIdFrom(container: TabMasterTab | null | undefined, fallbackKey?: string): string {
  return String(container?.id ?? fallbackKey ?? "").trim();
}

export function tabNameFrom(container: TabMasterTab | null | undefined): string {
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
    ctx.tabsMap.forEach((container: TabMasterTab, key: string) => pushTabIfNew(out, seen, tabIdFrom(container, key), tabNameFrom(container)));
  }
  return out;
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

function unwrapStoreApps(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, any>;
  return r.apps ?? r.appids ?? r.items ?? r.list ?? r.entries ?? [];
}

function coerceStoreAppIds(arr: unknown): number[] {
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

const RECENT_COLLECTION_ID_KEYS = ["id", "m_strId"];

const RECENT_COLLECTION_NAME_KEYS = ["displayName", "m_strName"];

const USER_COLLECTION_ID_KEYS = ["id", "m_strId", "key"];

const USER_COLLECTION_NAME_KEYS = ["displayName", "m_strName"];

/* Steam builds collectionStore's system collections asynchronously after boot.
   Reading a system-collection MobX getter (recentAppsCollection, …) before that
   throws inside Steam's own SystemCollectionIdToName (undefined `.get`, issue
   #113), so gate every such read on the store having its core collection built. */
function collectionStoreReady(cs: SteamCollectionStore | null | undefined): boolean {
  try { return !!(cs?.allAppsCollection ?? cs?.allGamesCollection)?.apps; } catch { return false; }
}

function addRecentCollectionTab(cs: SteamCollectionStore | null | undefined, seen: Set<string>, out: PlatformTab[]): void {
  if (!collectionStoreReady(cs)) return;
  let recentCol: any;
  try { recentCol = cs?.recentAppsCollection ?? cs?.allRecentAppsCollection; } catch { return; }
  if (!recentCol) return;
  const id = firstStringFromKeys(recentCol, RECENT_COLLECTION_ID_KEYS, 'recent');
  if (!id) return;
  const lower = id.toLowerCase();
  if (seen.has(lower)) return;
  const name = firstStringFromKeys(recentCol, RECENT_COLLECTION_NAME_KEYS, 'Recent');
  seen.add(lower);
  out.push({ id, name });
}

function isSkippableUserCollection(cs: SteamCollectionStore | null | undefined, id: string, seen: Set<string>): boolean {
  const lower = id.toLowerCase();
  if (SYSTEM_COLLECTION_IDS.has(lower) || seen.has(lower)) return true;
  try { if (cs?.BIsSystemCollectionId?.(id)) return true; } catch {}
  return false;
}

function userCollectionTabFromEntry(col: SteamCollectionLike | null | undefined): PlatformTab | null {
  const id = firstStringFromKeys(col, USER_COLLECTION_ID_KEYS);
  const name = firstStringFromKeys(col, USER_COLLECTION_NAME_KEYS);
  if (!id || !name) return null;
  return { id, name };
}

function addUserCollectionTabs(cs: SteamCollectionStore | null | undefined, seen: Set<string>, out: PlatformTab[]): void {
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
    const cs = steamCollectionStore();
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
