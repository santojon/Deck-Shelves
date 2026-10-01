import { describe, it, expect } from "vitest";
import { emptyDeviceHistory, bumpSignal, getSignalEntry } from "../../domain/deviceHistory";

describe("deviceHistory", () => {
  it("starts empty", () => {
    const h = emptyDeviceHistory();
    expect(h.signals).toEqual({});
    expect(getSignalEntry(h, "charging")).toEqual({ count: 0, lastSeenMs: 0 });
  });

  it("bumps are immutable and accumulate count + last-seen", () => {
    const h0 = emptyDeviceHistory();
    const h1 = bumpSignal(h0, "externalDisplay", 1000);
    const h2 = bumpSignal(h1, "externalDisplay", 2000);
    expect(h0.signals).toEqual({}); // original untouched
    expect(h1.signals.externalDisplay).toEqual({ count: 1, lastSeenMs: 1000 });
    expect(h2.signals.externalDisplay).toEqual({ count: 2, lastSeenMs: 2000 });
  });

  it("tracks signals independently", () => {
    let h = emptyDeviceHistory();
    h = bumpSignal(h, "charging", 100);
    h = bumpSignal(h, "batteryLow", 200);
    h = bumpSignal(h, "bluetoothConnected", 300);
    h = bumpSignal(h, "offlineMode", 400);
    expect(getSignalEntry(h, "charging").count).toBe(1);
    expect(getSignalEntry(h, "batteryLow").count).toBe(1);
    expect(getSignalEntry(h, "bluetoothConnected").count).toBe(1);
    expect(getSignalEntry(h, "offlineMode").count).toBe(1);
    expect(getSignalEntry(h, "externalDisplay").count).toBe(0);
  });
});
