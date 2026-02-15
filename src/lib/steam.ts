/* eslint-disable @typescript-eslint/no-explicit-any */

export type AppId = number;

export interface AppOverview {
  appid: number;
  display_name?: string;
  sort_as?: string;
  icon_hash?: string;
  last_played_time?: number; // unix seconds
  playtime_forever?: number; // minutes
  is_favorite?: boolean;
  is_hidden?: boolean;
  // install state (field names vary by Steam build)
  installed?: boolean;
  is_installed?: boolean;
  local_size?: number;
  size_on_disk?: number;
  installed_size?: number;
  // tags (not always exposed)
  store_tags?: string[];
  tags?: string[];
  // Steam has multiple versions of deck compatibility fields; we try common ones.
  deck_compatibility_category?: number;
  steam_deck_compat_category?: number;
  // Non-steam shortcuts are usually negative appids in some contexts, but the overview can vary.
  // We'll infer nonSteam by appid < 0 if present.
}

function getSteamClient(): any {
  return (globalThis as any).SteamClient;
}

export function hasSteamClient(): boolean {
  return !!getSteamClient();
}

export async function getAppOverview(appid: AppId): Promise<AppOverview | null> {
  const sc = getSteamClient();
  if (!sc?.Apps) return null;

  // Most common on Game Mode.
  try {
    if (sc.Apps.GetAppOverviewByAppID) {
      return (await sc.Apps.GetAppOverviewByAppID(appid)) as AppOverview;
    }
  } catch {
    // ignore
  }

  try {
    if (sc.Apps.GetAppOverviewByGameID) {
      return (await sc.Apps.GetAppOverviewByGameID(appid)) as AppOverview;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function getAllOwnedApps(): Promise<AppOverview[]> {
  const sc = getSteamClient();
  if (!sc?.Apps) return [];

  // Heuristics: method names vary across Steam client builds.
  const candidates = [
    sc.Apps.GetAllAppOverview,
    sc.Apps.GetAllAppOverviews,
    sc.Apps.GetMyGames,
    sc.Apps.GetAllApps,
    sc.Apps.GetAppsOwned,
    sc.Apps.GetOwnedGames,
  ].filter(Boolean);

  for (const fn of candidates) {
    try {
      const res = await fn.call(sc.Apps);
      // Some methods return { rgGames: [...] }
      const arr = Array.isArray(res)
        ? res
        : Array.isArray(res?.rgGames)
          ? res.rgGames
          : Array.isArray(res?.apps)
            ? res.apps
            : null;
      if (arr) return arr as AppOverview[];
    } catch {
      // continue
    }
  }

  return [];
}

export interface SteamCollection {
  id: string;
  name: string;
}

export async function getCollections(): Promise<SteamCollection[]> {
  const sc = getSteamClient();
  if (!sc?.GameCollections) return [];

  const candidates = [
    sc.GameCollections.GetCollections,
    sc.GameCollections.GetUserCollections,
    sc.GameCollections.GetMyCollections,
    sc.GameCollections.GetAllUserCollections,
    sc.GameCollections.GetAllCollections,
    sc.GameCollections.GetCollectionList,
  ].filter(Boolean);

  for (const fn of candidates) {
    try {
      const res = await fn.call(sc.GameCollections);
      // Shapes vary.
      const arr = Array.isArray(res)
        ? res
        : Array.isArray(res?.collections)
          ? res.collections
          : Array.isArray(res?.rgCollections)
            ? res.rgCollections
            : Array.isArray(res?.rgUserCollections)
              ? res.rgUserCollections
              : Array.isArray(res?.result?.collections)
                ? res.result.collections
                : null;

      if (!arr) continue;

      return arr
        .map((c: any) => ({
          id: String(c.id ?? c.collectionid ?? c.strId ?? c.strCollectionId),
          name: String(c.name ?? c.strName ?? c.title ?? "Collection"),
        }))
        .filter((c: SteamCollection) => c.id !== "undefined");
    } catch {
      // continue
    }
  }

  return [];
}

export async function getCollectionAppIds(collectionId: string): Promise<AppId[]> {
  const sc = getSteamClient();
  if (!sc?.GameCollections) return [];

  const candidates = [
    sc.GameCollections.GetCollectionItems,
    sc.GameCollections.GetCollectionContents,
    sc.GameCollections.GetAppsInCollection,
  ].filter(Boolean);

  for (const fn of candidates) {
    try {
      const res = await fn.call(sc.GameCollections, collectionId);
      const arr = Array.isArray(res)
        ? res
        : Array.isArray(res?.appids)
          ? res.appids
          : Array.isArray(res?.rgAppIDs)
            ? res.rgAppIDs
            : Array.isArray(res?.items)
              ? res.items
              : null;

      if (!arr) continue;

      return arr
        .map((x: any) => Number(x.appid ?? x))
        .filter((n: number) => Number.isFinite(n));
    } catch {
      // continue
    }
  }

  return [];
}

export function deckCompatToLabel(category?: number):
  | "verified"
  | "playable"
  | "unsupported"
  | "unknown" {
  // Valve categories commonly: 3 verified, 2 playable, 1 unsupported, 0 unknown.
  if (category === 3) return "verified";
  if (category === 2) return "playable";
  if (category === 1) return "unsupported";
  return "unknown";
}

export function getDeckCompatCategory(ov: AppOverview): number {
  const c =
    (ov.deck_compatibility_category ?? ov.steam_deck_compat_category ?? 0) as number;
  return Number.isFinite(c) ? c : 0;
}

export function isNonSteam(ov: AppOverview): boolean {
  // This is heuristic; some builds use separate flag(s). appid<0 works in many contexts.
  return typeof ov.appid === "number" && ov.appid < 0;
}

export function isInstalled(ov: AppOverview): boolean {
  // Prefer explicit flags if present.
  const flag = (ov.installed ?? ov.is_installed) as boolean | undefined;
  if (typeof flag === "boolean") return flag;

  // Many builds expose local size.
  const size =
    (ov.local_size ?? ov.size_on_disk ?? ov.installed_size ?? 0) as number;
  if (Number.isFinite(size) && size > 0) return true;

  // Fallback heuristic (least reliable): if it was ever played, it's likely installed.
  return (ov.playtime_forever ?? 0) > 0 || (ov.last_played_time ?? 0) > 0;
}

export function hasTagData(ov: AppOverview): boolean {
  const t = (ov as any).store_tags ?? (ov as any).tags;
  return Array.isArray(t) && t.length >= 0;
}
