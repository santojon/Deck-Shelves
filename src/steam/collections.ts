import { type SteamAppOverviewRaw, type SteamClientLike, type SteamCollectionLike, type SteamCollectionStore, type SteamHostWindow, steamCollectionStore } from "./internals";
import { type SteamObject, appIdOfRow, firstStringFromKeys, getSteamClients, getSteamWindows, hasAnyMethod, uniqNumbers } from "./steamAccess";
import { getAdaptiveTimeout, recordDuration } from "../core/adaptiveTimeout";
import { getPreferredSteamDocument } from "../runtime/steamHost";
import { extractAppIdsDeep, extractCollectionAppIds } from "./steamGraph";

/* Steam collections: listing them, the app ids a collection holds, and removing an app from one. */

export type SteamCollection = { id: string; name: string };

const COLLECTION_CACHE_TTL = 60_000;

const collectionRawCache = new Map<string, { data: unknown; ts: number }>();

export function candidateCollectionIds(raw: string): string[] {
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

function cacheCollectionRaw(id: string, name: string, raw: unknown) {
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

function getCachedCollectionRawCandidates(idCandidates: string[], nameCandidates: string[]): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<unknown>();
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

export function normalizeText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_\-/\s]/g, "")
    .trim();
}

function removeAppFromCollectionEntry(store: SteamCollectionStore | null | undefined, coll: SteamCollectionLike | null | undefined, appid: number): boolean {
  if (!coll) return false;
  const commit = () => store?.userCollectionStore?.CommitCollection?.(coll);
  if (typeof coll.RemoveApps === 'function') {
    coll.RemoveApps([appid]);
    commit();
    return true;
  }
  if (typeof coll.RemoveApp === 'function') {
    coll.RemoveApp(appid);
    return true;
  }
  if (coll.apps instanceof Map && coll.apps.has(appid)) {
    coll.apps.delete(appid);
    commit();
    return true;
  }
  return false;
}

function readRawStoredCollections(store: SteamCollectionStore | null | undefined): any[] {
  const rawMap: any = store?.m_mapCollectionsFromStorage ?? store?.collectionsFromStorage;
  if (rawMap && typeof rawMap.values === 'function') return Array.from(rawMap.values());
  if (Array.isArray(rawMap)) return rawMap;
  return [];
}

function removeFromRawStorage(store: SteamCollectionStore | null | undefined, collectionId: string, appid: number): boolean {
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

function tryRemoveFromStore(store: SteamCollectionStore | null | undefined, collectionId: string, appid: number): boolean {
  if (!store) return false;
  if (removeAppFromCollectionEntry(store, store.GetCollection?.(collectionId), appid)) return true;
  return removeFromRawStorage(store, collectionId, appid);
}

export function removeAppFromCollection(collectionId: string, appid: number): void {
  try {
    for (const win of getSteamWindows()) {
      const store = win?.collectionStore ?? steamCollectionStore();
      if (tryRemoveFromStore(store, collectionId, appid)) return;
    }
  } catch {}
}

const COLLECTION_NORMALIZE_ID_KEYS = ["id", "collectionid", "gid", "key", "name", "displayName"];

const COLLECTION_NORMALIZE_NAME_KEYS = ["displayName", "m_strName", "name", "title", "label"];

function normalizeCollectionList(items: Array<Record<string, any>>): SteamCollection[] {
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
function readCollectionsFromStorageMap(globalCollectionStore: SteamCollectionStore | null | undefined): SteamCollection[] {
  try {
    const m = globalCollectionStore?.m_mapCollectionsFromStorage;
    if (!m || typeof m.keys !== 'function') return [];
    const items: Array<Record<string, any>> = [];
    for (const key of m.keys()) {
      try {
        const c = m.get(key);
        if (c) items.push({ id: c.m_strId ?? key, ...c });
      } catch {}
    }
    return normalizeCollectionList(items);
  } catch { return []; }
}

async function callClientCollectionsGetter(fn: unknown): Promise<unknown> {
  if (typeof fn !== "function") return null;
  try { return await fn(); } catch { return null; }
}

function bindClientMethod(parent: Record<string, any> | null | undefined, method: string): Function | null {
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

async function listCollectionsFromClient(sc: SteamClientLike): Promise<SteamCollection[]> {
  const direct = await callClientCollectionsGetter(bindClientMethod(sc?.Collections, "GetCollections"));
  const norm = coerceClientCollectionsResult(direct);
  if (norm.length) return norm;
  const all = await callClientCollectionsGetter(bindClientMethod(sc?.CollectionStore, "GetAllCollections"));
  return coerceClientCollectionsResult(all);
}

function collectStoreCandidates(hostWindows: SteamHostWindow[], clients: SteamClientLike[]): any[] {
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

function listCollectionsFromStorage(hostWindows: SteamHostWindow[]): SteamCollection[] {
  for (const hostWindow of hostWindows) {
    const store = hostWindow?.collectionStore ?? steamCollectionStore();
    if (!store) continue;
    const norm = readCollectionsFromStorageMap(store);
    if (norm.length) return norm;
  }
  return [];
}

async function listCollectionsFromAllClients(clients: SteamClientLike[]): Promise<SteamCollection[]> {
  for (const sc of clients) {
    const norm = await listCollectionsFromClient(sc);
    if (norm.length) return norm;
  }
  return [];
}

function listCollectionsFromCandidates(hostWindows: SteamHostWindow[], clients: SteamClientLike[]): SteamCollection[] {
  for (const candidate of collectStoreCandidates(hostWindows, clients)) {
    const norm = listCollectionsFromCandidate(candidate);
    if (norm.length) return norm;
  }
  return [];
}

function listCollectionsFromDocs(hostWindows: SteamHostWindow[]): SteamCollection[] {
  const docs = Array.from(new Set([getPreferredSteamDocument(), ...hostWindows.map((win: SteamHostWindow) => win?.document)].filter(Boolean)));
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

function readFirstStringField(node: SteamAppOverviewRaw, keys: string[]): string {
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

function collectDynamicCollectionStores(): SteamObject[] {
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

  const dynamic: SteamObject[] = [];
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

function collectFromCachedRaw(ids: number[], idCandidates: string[], nameCandidates: string[]): void {
  for (const raw of getCachedCollectionRawCandidates(idCandidates, nameCandidates)) {
    ids.push(...extractCollectionAppIds(raw));
  }
}

/* A native Steam Collections RPC can hang indefinitely right after boot
   (collection subsystem not built yet) — no built-in timeout of its own.
   Bounded here so a stuck client can't block every shelf that reads it.
   The bound is learned from real observed durations (adaptiveTimeout)
   rather than a fixed guess — floor/ceiling keep the same safety range. */
const COLLECTION_RPC_TIMEOUT_KEY = "collection-rpc";

function withRpcTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}

async function tryClientCollectionFetch(fn: unknown, id: string, out: number[]): Promise<void> {
  if (typeof fn !== "function") return;
  const ms = getAdaptiveTimeout(COLLECTION_RPC_TIMEOUT_KEY, { floor: 500, ceiling: 4000, fallback: 4000 });
  const startedAt = Date.now();
  try {
    const res = await withRpcTimeout(Promise.resolve(fn(id)), ms);
    recordDuration(COLLECTION_RPC_TIMEOUT_KEY, Date.now() - startedAt);
    if (Array.isArray(res)) out.push(...res.map((x: unknown) => Number((x as { appid?: unknown }).appid ?? x)));
  } catch {}
}

async function collectFromSteamClients(ids: number[], idCandidates: string[]): Promise<void> {
  // Each call is independently timeout-bounded and only pushes into the
  // shared `ids` array — safe to fan out in parallel instead of a sequential
  // await chain (confirmed live: that chain alone added seconds per child).
  const tasks: Array<Promise<void>> = [];
  for (const sc of getSteamClients()) {
    const collFn = sc?.Collections?.GetCollectionItems?.bind(sc.Collections);
    const storeFn = sc?.CollectionStore?.GetCollectionApps?.bind(sc.CollectionStore);
    for (const id of idCandidates) {
      tasks.push(tryClientCollectionFetch(collFn, id, ids));
      tasks.push(tryClientCollectionFetch(storeFn, id, ids));
    }
  }
  await Promise.all(tasks);
}

const COLLECTION_STORE_METHODS = [
  "GetCollectionItems", "GetCollectionApps", "GetAppsForCollection",
  "GetAppsInCollection", "ResolveCollectionApps", "GetCollectionAppIDs",
];

const COLLECTION_STORE_MAP_KEYS = [
  "m_mapCollections", "m_mapCollectionData", "collections", "m_rgCollections", "m_mapTabs",
];

const COLLECTION_RESULT_ARRAY_KEYS = ["apps", "appids", "items", "list", "entries"];

function pickResultArray(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== "object") return [];
  for (const k of COLLECTION_RESULT_ARRAY_KEYS) {
    const arr = (result as Record<string, any>)[k];
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
        out.push(...arr.map((x: unknown) => appIdOfRow(x, "appid", "appId")));
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

export async function getCollectionApps(collectionId: string, collectionNameHint = ""): Promise<number[]> {
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
