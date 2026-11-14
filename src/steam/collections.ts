import { type SteamCollectionLike, type SteamCollectionStore, steamCollectionStore } from "./internals";
import { getSteamWindows } from "./steamAccess";

/* Steam collections, by id only: the list for the editor, a collection's effective apps, and removing an app from one. */

export type SteamCollection = { id: string; name: string; isDynamic: boolean };

export function normalizeText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_\-/\s]/g, "")
    .trim();
}

function collectionStores(): SteamCollectionStore[] {
  const out = new Set<SteamCollectionStore>();
  const global = steamCollectionStore();
  if (global) out.add(global);
  for (const win of getSteamWindows()) {
    const cs = win?.collectionStore;
    if (cs) out.add(cs);
  }
  return [...out];
}

// Steam builds the system collections after boot; a system getter read before that throws inside the store.
function storeReady(cs: SteamCollectionStore): boolean {
  try { return !!(cs.allAppsCollection ?? cs.allGamesCollection)?.apps; } catch { return false; }
}

function idOf(c: SteamCollectionLike | null | undefined): string {
  return String(c?.id ?? c?.m_strId ?? "").trim();
}

function nameOf(c: SteamCollectionLike | null | undefined): string {
  return String(c?.displayName ?? c?.m_strName ?? "").trim();
}

function isDynamicOf(c: SteamCollectionLike | null | undefined): boolean {
  return c?.bIsDynamic === true || c?.m_bIsDynamic === true;
}

function storageMap(cs: SteamCollectionStore): Map<string, SteamCollectionLike> | null {
  const m = cs.m_mapCollectionsFromStorage ?? cs.collectionsFromStorage;
  return m && typeof m.get === "function" ? m : null;
}

// The id as saved, and decoded when an older save URL-encoded it.
function idCandidates(raw: string): string[] {
  const base = String(raw ?? "").trim();
  if (!base) return [];
  try {
    const decoded = decodeURIComponent(base);
    return decoded === base ? [base] : [base, decoded];
  } catch { return [base]; }
}

function findInStore(cs: SteamCollectionStore, id: string): SteamCollectionLike | null {
  try {
    const got = cs.GetCollection?.(id);
    if (got) return got;
  } catch {}
  return storageMap(cs)?.get(id) ?? null;
}

function findCollection(rawId: string): SteamCollectionLike | null {
  for (const cs of collectionStores()) {
    for (const id of idCandidates(rawId)) {
      const found = findInStore(cs, id);
      if (found) return found;
    }
  }
  return null;
}

// The apps the collection holds now, dynamic ones included; ids the library no longer has are not members.
function appIdsOf(c: SteamCollectionLike): number[] {
  const apps = c.allApps ?? c.visibleApps ?? [];
  const out = new Set<number>();
  for (const a of apps) {
    const n = Number(a !== null && typeof a === "object" ? a.appid : a);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return [...out];
}

function systemExtras(cs: SteamCollectionStore): SteamCollectionLike[] {
  if (!storeReady(cs)) return [];
  try { return [cs.localGamesCollection].filter((c): c is SteamCollectionLike => !!c); } catch { return []; }
}

/** Every collection the client stores, plus the installed-games one, each once. */
export async function listCollections(): Promise<SteamCollection[]> {
  for (const cs of collectionStores()) {
    const out = new Map<string, SteamCollection>();
    const stored = storageMap(cs);
    for (const c of [...(stored ? stored.values() : []), ...systemExtras(cs)]) {
      const id = idOf(c);
      if (id && !out.has(id)) out.set(id, { id, name: nameOf(c) || id, isDynamic: isDynamicOf(c) });
    }
    if (out.size) return [...out.values()];
  }
  return [];
}

/** The apps of every dynamic collection the client stores, together. */
export function dynamicCollectionAppIds(): Set<number> {
  const out = new Set<number>();
  for (const cs of collectionStores()) {
    for (const c of storageMap(cs)?.values() ?? []) {
      if (isDynamicOf(c)) for (const id of appIdsOf(c)) out.add(id);
    }
  }
  return out;
}

/** The collection's current app ids; null when no store knows the id. */
export async function getCollectionApps(collectionId: string): Promise<number[] | null> {
  const found = findCollection(collectionId);
  return found ? appIdsOf(found) : null;
}

export function removeAppFromCollection(collectionId: string, appid: number): void {
  try {
    const coll = findCollection(collectionId);
    if (!coll) return;
    const editable = (typeof coll.AsEditableCollection === "function" ? coll.AsEditableCollection() : null) ?? coll;
    if (typeof editable.RemoveApps === "function") editable.RemoveApps([appid]);
    else if (typeof editable.RemoveApp === "function") editable.RemoveApp(appid);
    else return;
    if (typeof editable.Save === "function") editable.Save();
  } catch {}
}
