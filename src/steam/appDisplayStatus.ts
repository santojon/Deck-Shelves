/* Steam's EDisplayStatus: the per-client status of an app (`per_client_data[].display_status`),
   with the values of the client's own enum. */
export const EAppDisplayStatus = {
  Invalid:          0,
  Launching:        1,
  Uninstalling:     2,
  Installing:       3,
  Running:          4,
  Validating:       5,
  Updating:         6,
  Downloading:      7,
  Synchronizing:    8,
  ReadyToInstall:   9,
  ReadyToPreload:   10,
  ReadyToLaunch:    11,
  UpdatePaused:     18,
  UpdateQueued:     19,
  UpdateRequired:   20,
  DownloadPaused:   22,
  DownloadQueued:   23,
  DownloadRequired: 24,
  Terminating:      36,
  DownloadFailed:   38,
  UpdateFailed:     39,
} as const;
export type EAppDisplayStatus = typeof EAppDisplayStatus[keyof typeof EAppDisplayStatus];

// Bytes moving or being checked.
export const UPDATE_ACTIVE_STATUSES: ReadonlyArray<number> = [
  EAppDisplayStatus.Updating,
  EAppDisplayStatus.Downloading,
  EAppDisplayStatus.Validating,
];

// Waiting in the download queue, queued or paused.
export const UPDATE_QUEUED_STATUSES: ReadonlyArray<number> = [
  EAppDisplayStatus.UpdateQueued,
  EAppDisplayStatus.UpdatePaused,
  EAppDisplayStatus.DownloadQueued,
  EAppDisplayStatus.DownloadPaused,
];

// An installed app with an update that has not finished.
export const UPDATE_PENDING_STATUSES: ReadonlyArray<number> = [
  EAppDisplayStatus.Updating,
  EAppDisplayStatus.UpdatePaused,
  EAppDisplayStatus.UpdateQueued,
  EAppDisplayStatus.UpdateRequired,
  EAppDisplayStatus.UpdateFailed,
];

export const APP_STATUS_GROUPS = {
  // Coarse groups — back-compat with existing saved filters.
  downloading: UPDATE_ACTIVE_STATUSES,
  queued:      UPDATE_QUEUED_STATUSES,
  installing:  [EAppDisplayStatus.Installing] as ReadonlyArray<number>,
  running:     [EAppDisplayStatus.Running, EAppDisplayStatus.Launching] as ReadonlyArray<number>,
  // Fine-grained groups. Steam reports an update's reconfigure, stage and commit steps as Updating.
  launching:        [EAppDisplayStatus.Launching] as ReadonlyArray<number>,
  reconfiguring:    [EAppDisplayStatus.Updating] as ReadonlyArray<number>,
  validating:       [EAppDisplayStatus.Validating] as ReadonlyArray<number>,
  downloading_only: [EAppDisplayStatus.Downloading, EAppDisplayStatus.Updating] as ReadonlyArray<number>,
  staging:          [EAppDisplayStatus.Updating] as ReadonlyArray<number>,
  committing:       [EAppDisplayStatus.Updating] as ReadonlyArray<number>,
  update_queued:    [EAppDisplayStatus.UpdateQueued] as ReadonlyArray<number>,
  update_paused:    [EAppDisplayStatus.UpdatePaused] as ReadonlyArray<number>,
  not_installed:    [EAppDisplayStatus.ReadyToInstall] as ReadonlyArray<number>,
  installed_idle:   [EAppDisplayStatus.ReadyToLaunch] as ReadonlyArray<number>,
} as const;

export type AppStatusGroup = keyof typeof APP_STATUS_GROUPS;
export const APP_STATUS_GROUP_KEYS = Object.keys(APP_STATUS_GROUPS) as AppStatusGroup[];

// First-item action Steam's native menu shows for the focused card. The
// View-button quick-launch hint and the click target both mirror it.
//   not_installed  → Install
/*   running        → Resume (raise the running window)
     pause          → Pause (updating / downloading)
     update         → Update or Resume (queued, required, paused or failed update / download)
     uninstalling   → Uninstall (allow cancel)
     play           → Play (idle, installed) */
export type QuickLaunchAction =
  | 'not_installed'
  | 'running'
  | 'pause'
  | 'update'
  | 'uninstalling'
  | 'play';

// Steam's first item is Update, Resume or Download here: all three resume the app's update.
const RESUME_UPDATE_STATUSES: ReadonlyArray<number> = [
  ...UPDATE_QUEUED_STATUSES,
  EAppDisplayStatus.UpdateRequired,
  EAppDisplayStatus.DownloadRequired,
  EAppDisplayStatus.UpdateFailed,
  EAppDisplayStatus.DownloadFailed,
];

// Not Terminating (36): that is a game being stopped, for which Steam offers no first action.
const UNINSTALLING_STATUSES: ReadonlyArray<number> = [EAppDisplayStatus.Uninstalling];

export function resolveQuickLaunchAction(input: {
  installed: boolean;
  displayStatus: number;
  /** `per_client_data[0].status_percentage` (0–100), for the validating and
   * installing steps: only `> 0` (bytes moving) maps to "Pause"; omit when
   * unknown. */
  statusPercentage?: number;
}): QuickLaunchAction {
  if (!input.installed) return 'not_installed';
  const ds = input.displayStatus;
  if (ds === EAppDisplayStatus.Launching || ds === EAppDisplayStatus.Running) return 'running';
  if (RESUME_UPDATE_STATUSES.includes(ds)) return 'update';
  if (UNINSTALLING_STATUSES.includes(ds)) return 'uninstalling';
  return inProgressAction(ds, input.statusPercentage) ?? 'play';
}

// An update, download, check or install under way.
function inProgressAction(ds: number, statusPercentage?: number): QuickLaunchAction | null {
  if (ds === EAppDisplayStatus.Updating || ds === EAppDisplayStatus.Downloading) return 'pause';
  if (ds === EAppDisplayStatus.Validating) return progressing(statusPercentage) ? 'pause' : 'update';
  // Fresh install in flight: "Pause" unless it hasn't started yet (pct 0).
  if (ds === EAppDisplayStatus.Installing) return statusPercentage === 0 ? 'update' : 'pause';
  return null;
}

// True only when a transfer is actively moving bytes (status_percentage > 0).
function progressing(statusPercentage?: number): boolean {
  return typeof statusPercentage === 'number' && statusPercentage > 0;
}

function perClientEntries(overview: any): any[] {
  if (Array.isArray(overview?.per_client_data)) return overview.per_client_data;
  return Array.isArray(overview?.local_per_client_data) ? overview.local_per_client_data : [];
}

// Installed on this device: client "0" is the local one (another client's copy can only be streamed).
function installedHere(overview: any, entries: any[], local: any): boolean {
  return entries.length > 0 ? !!local?.installed : overview?.installed === true;
}

/* The first-item action for this device's copy of an app, and the client id Steam's own
   update actions take, from its overview: for menus the plugin builds itself. */
export function localQuickLaunchAction(overview: any): { action: QuickLaunchAction; clientId: unknown } {
  const entries = perClientEntries(overview);
  const local = entries.find((c: any) => String(c?.clientid) === "0");
  const status = local ?? entries[0];
  const displayStatus = Number(status?.display_status ?? overview?.display_status ?? 0);
  const statusPercentage = typeof status?.status_percentage === 'number' ? status.status_percentage : undefined;
  const action = resolveQuickLaunchAction({ installed: installedHere(overview, entries, local), displayStatus, statusPercentage });
  return { action, clientId: local?.clientid ?? "0" };
}
