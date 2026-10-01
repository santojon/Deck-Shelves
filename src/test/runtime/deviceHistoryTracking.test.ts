import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  trackDeviceSignal,
  getDeviceHistory,
  getDeviceHistorySignal,
  clearDeviceHistory,
  flushDeviceHistory,
} from "../../runtime/deviceHistoryTracking";

const lsStore = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => { lsStore.set(k, v); },
  removeItem: (k: string) => { lsStore.delete(k); },
  clear: () => lsStore.clear(),
};

describe("deviceHistoryTracking", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", localStorageStub);
    lsStore.clear();
    clearDeviceHistory();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("tracks a signal and reflects it immediately in-memory", () => {
    trackDeviceSignal("charging");
    expect(getDeviceHistorySignal("charging").count).toBe(1);
    trackDeviceSignal("charging");
    expect(getDeviceHistorySignal("charging").count).toBe(2);
  });

  it("debounces the write — nothing in localStorage until the timer fires", () => {
    trackDeviceSignal("externalDisplay");
    expect(localStorage.getItem("ds_device_history_v1")).toBeNull();
    vi.advanceTimersByTime(4000);
    const raw = localStorage.getItem("ds_device_history_v1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).signals.externalDisplay.count).toBe(1);
  });

  it("flushDeviceHistory writes immediately without waiting for the debounce", () => {
    trackDeviceSignal("batteryLow");
    flushDeviceHistory();
    const raw = localStorage.getItem("ds_device_history_v1");
    expect(JSON.parse(raw!).signals.batteryLow.count).toBe(1);
  });

  it("clearDeviceHistory resets the in-memory cache and localStorage", () => {
    trackDeviceSignal("offlineMode");
    flushDeviceHistory();
    clearDeviceHistory();
    expect(getDeviceHistory().signals).toEqual({});
    expect(localStorage.getItem("ds_device_history_v1")).toBeNull();
  });

  it("a corrupt stored value falls back to empty instead of throwing", async () => {
    localStorage.setItem("ds_device_history_v1", "{not json");
    vi.resetModules();
    const fresh = await import("../../runtime/deviceHistoryTracking");
    expect(fresh.getDeviceHistory().signals).toEqual({});
  });
});
