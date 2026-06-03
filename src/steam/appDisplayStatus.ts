/**
 * Steam's EAppDisplayStatus enum — values observed in `per_client_data[0].display_status`.
 * Confirmed: Running=4, Installing=3 (user-verified: games showed under the "installing"
 * group filter while actually running, proving the previous Running=5/Installing=4 mapping
 * was shifted by 1 for values in the 2–6 range).
 */
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

/**
 * Named groups exposed by the `appStatus` filter.
 *
 * The original four ("downloading", "queued", "installing", "running")
 * are kept as compound groups for back-compat — picking one matches
 * the union of statuses it represents. The remainder break those
 * groups down into individual EAppDisplayStatus values so users can
 * scope shelves more precisely (e.g. "currently downloading bytes"
 * vs "queued waiting for disk space" vs "validating after update").
 *
 * Coarse groups (compound):
 *   - downloading: actively transferring / staging / committing / validating
 *   - queued:      update pending but not progressing (Reconfiguring + the two paused states)
 *   - installing:  in the middle of a fresh install
 *   - running:     game launched (incl. the launch transition)
 *
 * Fine-grained groups (single status each):
 *   - launching, reconfiguring, validating, downloading_only,
 *     staging, committing, update_queued, update_paused,
 *     not_installed, installed_idle
 */
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
