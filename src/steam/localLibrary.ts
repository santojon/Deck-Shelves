import { type SteamAppOverviewRaw, type SteamCollectionLike, type SteamCollectionStore, type SteamHostWindow, steamCollectionStore } from "./internals";
import { appIdOf, isNonSteamOf, pushAppIdsFromCollection, readCollectionList, readOptionalBoolean } from "./appOverview";
import { getSteamWindows } from "./steamAccess";

/* What the local library holds: owned app ids (Steam, non-Steam, cloud-play shortcuts) and whether an app is installed on this device. */

const INSTALLED_DIRECT_KEYS = ["installed", "is_installed", "m_bInstalled", "bInstalled"];

const INSTALLED_PCD_KEYS = ["per_client_data", "local_per_client_data"];

const INSTALLED_SIZE_KEYS = ["size_on_disk", "m_nSizeOnDisk"];

const INSTALLED_LAST_LOCAL_KEYS = ["rt_last_time_locally_played", "m_rtLastTimePlayed"];

function readDirectInstalled(raw: SteamAppOverviewRaw): boolean | null {
  if (!raw) return null;
  for (const k of INSTALLED_DIRECT_KEYS) {
    const v = raw[k];
    if (v === true) return true;
    if (v === false) return false;
  }
  return null;
}

function readPcdInstalled(raw: SteamAppOverviewRaw): boolean | undefined {
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

function firstPositiveNumber(raw: SteamAppOverviewRaw, keys: string[]): number {
  for (const k of keys) {
    const v = Number(raw?.[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

function resolveInstalledFromRaw(raw: SteamAppOverviewRaw): boolean | null {
  if (!raw) return null;
  const direct = readDirectInstalled(raw);
  if (direct !== null) return direct;
  const pcd = readPcdInstalled(raw);
  if (pcd !== undefined) return pcd;
  if (firstPositiveNumber(raw, INSTALLED_SIZE_KEYS) > 0) return true;
  if (firstPositiveNumber(raw, INSTALLED_LAST_LOCAL_KEYS) > 0) return true;
  return false;
}

function pickAppStoreFromWindow(win: SteamHostWindow): any {
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

// Cloud-play set: Unifideck Microsoft (Xbox Cloud Gaming). Other Unifideck
// providers (Epic, GOG, Amazon, Ubisoft) are native-install platforms —
// owning a game there counts as owned even when not installed locally.
let _ufCloudCache: { ids: Set<number>; ts: number } | null = null;

const UF_CLOUD_COLLECTION_LABELS = new Set(["microsoft"]);

function readUnifideckCloudLabel(c: SteamCollectionLike): string | null {
  const name = String(c?.displayName ?? c?.m_strName ?? "");
  if (!/^\[Unifideck\]/i.test(name)) return null;
  const label = name.replace(/^\[Unifideck\]\s*/i, "").trim().toLowerCase();
  return UF_CLOUD_COLLECTION_LABELS.has(label) ? label : null;
}

export function getUnifideckCloudPlaySet(): Set<number> {
  const now = Date.now();
  if (_ufCloudCache && now - _ufCloudCache.ts < 5000) return _ufCloudCache.ids;
  const ids = new Set<number>();
  try {
    const cs = steamCollectionStore();
    for (const c of readCollectionList(cs)) {
      if (readUnifideckCloudLabel(c) === null) continue;
      pushAppIdsFromCollection(c, ids);
    }
  } catch {}
  _ufCloudCache = { ids, ts: now };
  return ids;
}

function isCloudPlayShortcut(a: SteamAppOverviewRaw): boolean {
  if (!isNonSteamOf(a)) return false;
  const id = Number(a?.appid);
  if (!Number.isFinite(id)) return false;
  return getUnifideckCloudPlaySet().has(id);
}

function collectionApps(coll: SteamCollectionLike | null | undefined): any[] {
  if (!coll) return [];
  return coll.allApps ?? coll.visibleApps ?? coll.apps ?? [];
}

function collectSteamApps(coll: SteamCollectionLike | null | undefined, out: Set<number>): void {
  for (const a of collectionApps(coll)) {
    if (isNonSteamOf(a)) continue;
    const id = appIdOf(a);
    if (Number.isFinite(id) && id > 0) out.add(id);
  }
}

function collectNonSteamApps(coll: SteamCollectionLike | null | undefined, out: Set<number>, includeCloudPlay: boolean): void {
  for (const a of collectionApps(coll)) {
    if (!isNonSteamOf(a)) continue;
    if (!includeCloudPlay && isCloudPlayShortcut(a)) continue;
    const id = appIdOf(a);
    if (Number.isFinite(id) && id > 0) out.add(id);
  }
}

function nonSteamCollectionFrom(cs: SteamCollectionStore | null | undefined): any {
  return cs?.myGamesCollection ?? cs?.allAppsCollection ?? cs?.allShortcutsCollection;
}

function gatherLibraryFromStore(cs: SteamCollectionStore | null | undefined, includeNonSteam: boolean, includeCloudPlay: boolean, out: Set<number>): void {
  if (!cs) return;
  collectSteamApps(cs.allGamesCollection, out);
  if (includeNonSteam) collectNonSteamApps(nonSteamCollectionFrom(cs), out, includeCloudPlay);
}

export function getLocalLibraryAppIds(includeNonSteam: boolean, includeCloudPlay: boolean = false): Set<number> {
  const out = new Set<number>();
  try {
    gatherLibraryFromStore(steamCollectionStore(), includeNonSteam, includeCloudPlay, out);
    if (out.size > 0) return out;
    for (const hw of getSteamWindows()) {
      gatherLibraryFromStore((hw as any)?.collectionStore, includeNonSteam, includeCloudPlay, out);
      if (out.size > 0) break;
    }
  } catch {}
  return out;
}
