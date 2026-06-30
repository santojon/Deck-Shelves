export const EAppDisplayStatus = {
  Invalid:        0,
  Launching:      1,  // pre-launch transition
  Reconfiguring:  2,  // update-related housekeeping
  Installing:     3,
  Running:        4,
  Validating:     5,  // verifying file integrity after update
  UpdateQueued:   7,
  UpdatePaused:   8,  // waiting on disk space or dependency
  NotInstalled:   9,  // available on remote / cloud-only
  Installed:      11,
  Staging:        12,
  Committing:     13,
  Downloading:    19,
} as const;
export type EAppDisplayStatus = typeof EAppDisplayStatus[keyof typeof EAppDisplayStatus];

export const UPDATE_ACTIVE_STATUSES: ReadonlyArray<number> = [
  EAppDisplayStatus.Downloading,
  EAppDisplayStatus.Staging,
  EAppDisplayStatus.Committing,
  EAppDisplayStatus.Validating,
];

export const UPDATE_QUEUED_STATUSES: ReadonlyArray<number> = [
  EAppDisplayStatus.UpdateQueued,
  EAppDisplayStatus.UpdatePaused,
  EAppDisplayStatus.Reconfiguring,
];

export const UPDATE_PENDING_STATUSES: ReadonlyArray<number> = [
  ...UPDATE_ACTIVE_STATUSES,
  ...UPDATE_QUEUED_STATUSES,
];

export const APP_STATUS_GROUPS = {
  // Coarse groups — back-compat with existing saved filters.
  downloading: UPDATE_ACTIVE_STATUSES,
  queued:      UPDATE_QUEUED_STATUSES,
  installing:  [EAppDisplayStatus.Installing] as ReadonlyArray<number>,
  running:     [EAppDisplayStatus.Running, EAppDisplayStatus.Launching] as ReadonlyArray<number>,
  // Fine-grained groups — single status each.
  launching:        [EAppDisplayStatus.Launching] as ReadonlyArray<number>,
  reconfiguring:    [EAppDisplayStatus.Reconfiguring] as ReadonlyArray<number>,
  validating:       [EAppDisplayStatus.Validating] as ReadonlyArray<number>,
  downloading_only: [EAppDisplayStatus.Downloading] as ReadonlyArray<number>,
  staging:          [EAppDisplayStatus.Staging] as ReadonlyArray<number>,
  committing:       [EAppDisplayStatus.Committing] as ReadonlyArray<number>,
  update_queued:    [EAppDisplayStatus.UpdateQueued] as ReadonlyArray<number>,
  update_paused:    [EAppDisplayStatus.UpdatePaused] as ReadonlyArray<number>,
  not_installed:    [EAppDisplayStatus.NotInstalled] as ReadonlyArray<number>,
  installed_idle:   [EAppDisplayStatus.Installed] as ReadonlyArray<number>,
} as const;

export type AppStatusGroup = keyof typeof APP_STATUS_GROUPS;
export const APP_STATUS_GROUP_KEYS = Object.keys(APP_STATUS_GROUPS) as AppStatusGroup[];

// First-item action Steam's native menu shows for the focused card. The
// View-button quick-launch hint and the click target both mirror it.
//   not_installed  → Install
/*   running        → Resume (raise the running window)
     pause          → Pause (active download / install)
     update         → Update (queued / paused / reconfiguring)
     uninstalling   → Uninstall (allow cancel)
     play           → Play (idle, installed) */
export type QuickLaunchAction =
  | 'not_installed'
  | 'running'
  | 'pause'
  | 'update'
  | 'uninstalling'
  | 'play';

const UNINSTALLING_STATUSES: ReadonlyArray<number> = [6, 14, 16];

export function resolveQuickLaunchAction(input: {
  installed: boolean;
  displayStatus: number;
  /** `per_client_data[0].status_percentage` (0–100). 0 / undefined means the
   * active phase hasn't begun (queued, no bytes flowing) → "Update", not
   * "Pause". Only `> 0` (actively transferring) maps to "Pause"; omit when
   * unknown — treated the same as 0. */
  statusPercentage?: number;
}): QuickLaunchAction {
  if (!input.installed) return 'not_installed';
  const ds = input.displayStatus;
  if (ds === EAppDisplayStatus.Launching || ds === EAppDisplayStatus.Running) return 'running';
  if (UPDATE_QUEUED_STATUSES.includes(ds)) return 'update';
  if (UNINSTALLING_STATUSES.includes(ds)) return 'uninstalling';
  /* "Pause" only when bytes are actually flowing (status_percentage > 0).
     Queued / staged / unknown progress — the steady state for Proton & Steam
     runtime tool updates sitting pending (display_status 19 with no
     status_percentage) — shows "Update", not "Pause". */
  if (UPDATE_ACTIVE_STATUSES.includes(ds)) return progressing(input.statusPercentage) ? 'pause' : 'update';
  // Fresh install in flight: "Pause" unless it hasn't started yet (pct 0).
  if (ds === EAppDisplayStatus.Installing) return input.statusPercentage === 0 ? 'update' : 'pause';
  return 'play';
}

// True only when a transfer is actively moving bytes (status_percentage > 0).
function progressing(statusPercentage?: number): boolean {
  return typeof statusPercentage === 'number' && statusPercentage > 0;
}
