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
