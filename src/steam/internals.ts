/* Typed access to the Steam client internals the plugin reaches through the
   renderer's globals. Each accessor returns null when the global is absent, so
   call sites keep their feature-detection shape; the interfaces list the members
   the plugin uses and keep an index signature for the rest of Steam's surface —
   grow them here instead of casting at a call site. */

// A library entry as Steam's `appStore` holds it (fields read beyond the plugin's own `AppOverview`).
export interface SteamAppOverviewRaw {
  appid: number;
  display_name?: string;
  sort_as?: string;
  app_type?: number;
  display_status?: number;
  size_on_disk?: number | string;
  rt_original_release_date?: number;
  rt_last_time_played?: number;
  last_played?: number;
  playtime_forever?: number;
  review_percentage?: number;
  metacritic_score?: number;
  deck_compatibility_category?: number;
  controller_support?: number;
  steam_hw_compat_category_packed?: number;
  BIsSteamDeckVerified?(): boolean;
  BIsSteamFrameCompatible?(): boolean;
  BIsSteamMachineCompatible?(): boolean;
  BIsVR?(): boolean;
  [key: string]: unknown;
}

export interface SteamAppStore {
  GetAppOverviewByAppID?(appid: number): SteamAppOverviewRaw | null | undefined;
  m_mapApps?: { get?(appid: number): SteamAppOverviewRaw | undefined; values?(): Iterable<SteamAppOverviewRaw> };
  m_mapAppInfo?: { get?(appid: number): unknown };
  m_mapAppData?: { get?(appid: number): unknown };
  [key: string]: any;
}

// One of Steam's collections (user or system): the id/name and the apps it holds.
export interface SteamCollectionLike {
  id?: string;
  displayName?: string;
  allApps?: SteamAppOverviewRaw[];
  apps?: Map<number, unknown> | Set<number>;
  [key: string]: any;
}

export interface SteamCollectionStore {
  userCollections?: SteamCollectionLike[];
  userCollectionStore?: unknown;
  allAppsCollection?: SteamCollectionLike;
  allGamesCollection?: SteamCollectionLike;
  allShortcutsCollection?: SteamCollectionLike;
  allRecentAppsCollection?: SteamCollectionLike;
  recentAppsCollection?: SteamCollectionLike;
  localGamesCollection?: SteamCollectionLike;
  favoriteCollection?: SteamCollectionLike;
  myGamesCollection?: SteamCollectionLike;
  nonSteamCollection?: SteamCollectionLike;
  shortcutsCollection?: SteamCollectionLike;
  collectionsFromStorage?: Map<string, unknown>;
  m_mapCollectionsFromStorage?: Map<string, unknown>;
  GetCollection?(id: string): SteamCollectionLike | null | undefined;
  BIsSystemCollectionId?(id: string): boolean;
  [key: string]: any;
}

export interface SteamUIWindowLike {
  BrowserWindow?: Window;
  [key: string]: any;
}

export interface SteamUIStoreLike {
  GetFocusedWindowInstance?(): SteamUIWindowLike | null | undefined;
  WindowStore?: {
    GamepadUIMainWindowInstance?: SteamUIWindowLike;
    SteamUIWindows?: SteamUIWindowLike[];
    [key: string]: any;
  };
  [key: string]: any;
}

export interface GamepadUIMainWindowStoreLike {
  BrowserView?: { m_browser?: { gamepadui?: { document?: Document } } };
  [key: string]: any;
}

// `SteamClient.*` namespaces are large and version-dependent; the members stay open.
export interface SteamClientLike {
  System?: Record<string, any>;
  Apps?: Record<string, any>;
  Input?: Record<string, any>;
  [key: string]: any;
}

function scope(): any {
  return globalThis as any;
}

function hostWindow(): any {
  const g = scope();
  return g.window ?? g;
}

export function steamAppStore(): SteamAppStore | null {
  return (scope().appStore as SteamAppStore | undefined) ?? null;
}

export function steamCollectionStore(): SteamCollectionStore | null {
  return (scope().collectionStore as SteamCollectionStore | undefined) ?? null;
}

export function steamUIStore(): SteamUIStoreLike | null {
  return (hostWindow().SteamUIStore as SteamUIStoreLike | undefined) ?? null;
}

export function gamepadUIMainWindowStore(): GamepadUIMainWindowStoreLike | null {
  return (scope().GamepadUIMainWindowStore as GamepadUIMainWindowStoreLike | undefined) ?? null;
}

export function steamClient(): SteamClientLike | null {
  return (scope().SteamClient as SteamClientLike | undefined) ?? null;
}

// Steam's own React and JSX runtime (shared with injected UI so elements are compatible).
export function steamReact(): any {
  return scope().SP_REACT;
}

export function steamJsxRuntime(): any {
  return scope().SP_JSX;
}

// A plugin-side overview or a raw node, viewed through Steam's field names.
export function rawOverview(app: unknown): SteamAppOverviewRaw {
  return app as SteamAppOverviewRaw;
}
