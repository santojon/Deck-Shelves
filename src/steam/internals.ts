export interface SteamAppOverviewRaw {
  appid: number;
  display_name?: string;
  sort_as?: string;
  app_type?: number | string;
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
  per_client_data?: SteamPerClientData[] | SteamPerClientData;
  local_per_client_data?: SteamPerClientData[] | SteamPerClientData;
  remote_per_client_data?: SteamPerClientData[];
  // Steam adds and renames fields across versions.
  [key: string]: any;
}

// The local client is `clientid` "0".
export interface SteamPerClientData {
  clientid?: string | number;
  installed?: boolean;
  is_installed?: boolean;
  display_status?: number;
  is_available_on_current_platform?: boolean;
  bytes_to_download?: number;
  m_nBytesToDownload?: number;
  bytes_to_stage?: number;
  m_nBytesToStage?: number;
  [key: string]: any;
}

export interface SteamAppDetails {
  strPublisherName?: string;
  strDeveloperName?: string;
  [key: string]: any;
}

export interface SteamAppStore {
  GetAppOverviewByAppID?(appid: number): SteamAppOverviewRaw | null | undefined;
  m_mapApps?: { get?(appid: number): SteamAppOverviewRaw | undefined; values?(): Iterable<SteamAppOverviewRaw> };
  m_mapAppInfo?: { get?(appid: number): unknown };
  m_mapAppData?: { get?(appid: number): unknown };
  [key: string]: any;
}

export interface SteamCollectionLike {
  id?: string;
  displayName?: string;
  allApps?: SteamAppOverviewRaw[];
  apps?: Map<number, unknown> | Set<number>;
  [key: string]: any;
}

export interface SteamCollectionStore {
  BIsHidden?(appid: number): boolean;
  userCollections?: SteamCollectionLike[];
  userCollectionStore?: { CommitCollection?(...args: any[]): unknown; [key: string]: any };
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
  collectionsFromStorage?: Map<string, SteamCollectionLike>;
  m_mapCollectionsFromStorage?: Map<string, SteamCollectionLike>;
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

export interface SteamClientLike {
  System?: Record<string, any>;
  Apps?: Record<string, any>;
  Input?: Record<string, any>;
  [key: string]: any;
}

export interface SteamHostWindow {
  SteamClient?: SteamClientLike;
  appStore?: SteamAppStore;
  collectionStore?: SteamCollectionStore;
  SteamUIStore?: SteamUIStoreLike;
  document?: Document;
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

export interface SteamLocalizationLike {
  LocalizeString?(token: string): string | null;
  LocalizeStringFromFallback?(token: string): string | null;
  [key: string]: any;
}

export function steamLocalization(): SteamLocalizationLike | null {
  return (scope().LocalizationManager as SteamLocalizationLike | undefined) ?? null;
}

export function steamClient(): SteamClientLike | null {
  return (scope().SteamClient as SteamClientLike | undefined) ?? null;
}

// Shared with injected UI so elements are compatible.
export function steamReact(): any {
  return scope().SP_REACT;
}

export function steamJsxRuntime(): any {
  return scope().SP_JSX;
}
