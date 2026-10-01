/* Pure device/context-history model. No side effects, no I/O — the
   persistence layer (deviceHistoryTracking.ts) reads/writes localStorage and
   calls these. Counters + last-seen only (not day-bucketed like
   usageStats.ts) — tracks how OFTEN a condition occurs, not daily trends. */

export type DeviceHistorySignal =
  | "externalDisplay"
  | "batteryLow"
  | "bluetoothConnected"
  | "charging"
  | "offlineMode";

export interface DeviceHistoryEntry {
  count: number;
  lastSeenMs: number;
}

export interface DeviceHistory {
  v: 1;
  signals: Partial<Record<DeviceHistorySignal, DeviceHistoryEntry>>;
}

export function emptyDeviceHistory(): DeviceHistory {
  return { v: 1, signals: {} };
}

/** Bump one signal's counter + last-seen timestamp. Immutable update. */
export function bumpSignal(h: DeviceHistory, signal: DeviceHistorySignal, nowMs: number): DeviceHistory {
  const prev = h.signals[signal];
  return {
    ...h,
    signals: { ...h.signals, [signal]: { count: (prev?.count ?? 0) + 1, lastSeenMs: nowMs } },
  };
}

export function getSignalEntry(h: DeviceHistory, signal: DeviceHistorySignal): DeviceHistoryEntry {
  return h.signals[signal] ?? { count: 0, lastSeenMs: 0 };
}
