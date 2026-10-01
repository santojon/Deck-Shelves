/* Device-history tracking: thin I/O + debounce over the pure
   `domain/deviceHistory` model. Fire-and-forget on each tracked transition,
   no polling. Mirrors `steam/usageTracking.ts`'s persistence shape, kept
   separate since this tracks device/context conditions, not engagement. */

import {
  type DeviceHistory,
  type DeviceHistorySignal,
  type DeviceHistoryEntry,
  emptyDeviceHistory,
  bumpSignal,
  getSignalEntry,
} from "../domain/deviceHistory";

const STORAGE_KEY = "ds_device_history_v1";
const WRITE_DEBOUNCE_MS = 4000;

let cache: DeviceHistory | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function load(): DeviceHistory {
  if (cache) return cache;
  try {
    const raw = (globalThis as any)?.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === 1 && parsed.signals && typeof parsed.signals === "object") {
        cache = parsed as DeviceHistory;
        return cache;
      }
    }
  } catch { /* fall through to empty */ }
  cache = emptyDeviceHistory();
  return cache;
}

function scheduleWrite(): void {
  if (writeTimer) return; // one coalesced write per debounce window
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try { (globalThis as any)?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
  }, WRITE_DEBOUNCE_MS);
}

export function trackDeviceSignal(signal: DeviceHistorySignal): void {
  cache = bumpSignal(load(), signal, Date.now());
  scheduleWrite();
}

export function getDeviceHistory(): DeviceHistory {
  return load();
}

export function getDeviceHistorySignal(signal: DeviceHistorySignal): DeviceHistoryEntry {
  return getSignalEntry(load(), signal);
}

export function clearDeviceHistory(): void {
  cache = emptyDeviceHistory();
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  try { (globalThis as any)?.localStorage?.removeItem(STORAGE_KEY); } catch {}
}

/* Flush the pending debounced write immediately — call before anything reads
   a summary so it reflects the latest tracked transition. */
export function flushDeviceHistory(): void {
  if (!cache) return;
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  try { (globalThis as any)?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
}

if (__DEV__) {
  try {
    const g = globalThis as any;
    g.__ds_dev_device_history = () => { flushDeviceHistory(); return load(); };
    g.__ds_dev_device_history_clear = () => clearDeviceHistory();
  } catch { /* best-effort */ }
}
