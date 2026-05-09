/**
 * Steam's EAppDisplayStatus enum — values observed in `per_client_data[0].display_status`.
 * Not all values are confirmed; unknown gaps (1, 10, 14–18) are omitted.
 */
export const EAppDisplayStatus = {
  Invalid:        0,
  Launching:      2,
  Reconfiguring:  3,  // update-related housekeeping; seen with pending updates
  Installing:     4,
  Running:        5,
  Validating:     6,  // verifying file integrity after update
  UpdateQueued:   7,
  UpdatePaused:   8,  // waiting on disk space or dependency
  NotInstalled:   9,  // available on remote / cloud-only
  Installed:      11,
  Staging:        12,
  Committing:     13,
  Downloading:    19,
} as const;
export type EAppDisplayStatus = typeof EAppDisplayStatus[keyof typeof EAppDisplayStatus];

/** Statuses where an update is actively progressing (progress bar moving). */
export const UPDATE_ACTIVE_STATUSES: ReadonlyArray<number> = [
  EAppDisplayStatus.Downloading,
  EAppDisplayStatus.Staging,
  EAppDisplayStatus.Committing,
  EAppDisplayStatus.Validating,
];

/** Statuses where an update exists but is not actively running. */
export const UPDATE_QUEUED_STATUSES: ReadonlyArray<number> = [
  EAppDisplayStatus.UpdateQueued,
  EAppDisplayStatus.UpdatePaused,
  EAppDisplayStatus.Reconfiguring,
];

/** All statuses that trigger update_pending = true. */
export const UPDATE_PENDING_STATUSES: ReadonlyArray<number> = [
  ...UPDATE_ACTIVE_STATUSES,
  ...UPDATE_QUEUED_STATUSES,
];

/** Named groups exposed by the `appStatus` filter. */
export const APP_STATUS_GROUPS = {
  downloading: UPDATE_ACTIVE_STATUSES,
  queued:      UPDATE_QUEUED_STATUSES,
  installing:  [EAppDisplayStatus.Installing] as ReadonlyArray<number>,
  running:     [EAppDisplayStatus.Running, EAppDisplayStatus.Launching] as ReadonlyArray<number>,
} as const;

export type AppStatusGroup = keyof typeof APP_STATUS_GROUPS;
export const APP_STATUS_GROUP_KEYS = Object.keys(APP_STATUS_GROUPS) as AppStatusGroup[];
