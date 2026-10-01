import { describe, it, expect, beforeEach, vi } from "vitest";

const { deviceState, bluetooth, battery, tracked } = vi.hoisted(() => ({
  deviceState: { current: { external: false, charging: false, offline: false } as any },
  bluetooth: { connected: [] as string[] },
  battery: { low: false },
  tracked: [] as string[],
}));

let deviceListener: (() => void) | null = null;
let peripheralsListener: (() => void) | null = null;

vi.mock("../../runtime/deviceState", () => ({
  getDeviceState: () => deviceState.current,
  subscribeDeviceState: (cb: () => void) => { deviceListener = cb; return () => { deviceListener = null; }; },
}));
vi.mock("../../runtime/peripheralsState", () => ({
  getBluetoothConnected: () => bluetooth.connected,
  subscribePeripheralsState: (cb: () => void) => { peripheralsListener = cb; return () => { peripheralsListener = null; }; },
}));
vi.mock("../../runtime/batteryState", () => ({
  isLowBattery: () => battery.low,
}));
vi.mock("../../runtime/deviceHistoryTracking", () => ({
  trackDeviceSignal: (signal: string) => { tracked.push(signal); },
}));

import { installDeviceHistoryTracker } from "../../runtime/deviceHistoryTracker";

describe("deviceHistoryTracker", () => {
  beforeEach(() => {
    deviceState.current = { external: false, charging: false, offline: false };
    bluetooth.connected = [];
    battery.low = false;
    tracked.length = 0;
    deviceListener = null;
    peripheralsListener = null;
  });

  it("does not bump anything on install when every condition starts false", () => {
    const uninstall = installDeviceHistoryTracker();
    expect(tracked).toEqual([]);
    uninstall();
  });

  it("bumps on a false->true transition, not on repeated true", () => {
    const uninstall = installDeviceHistoryTracker();
    deviceState.current = { ...deviceState.current, external: true };
    deviceListener?.();
    expect(tracked).toEqual(["externalDisplay"]);
    // Still true on a second notify — must not bump again.
    deviceListener?.();
    expect(tracked).toEqual(["externalDisplay"]);
    uninstall();
  });

  it("re-arms after a true->false->true cycle", () => {
    const uninstall = installDeviceHistoryTracker();
    deviceState.current = { ...deviceState.current, charging: true };
    deviceListener?.();
    deviceState.current = { ...deviceState.current, charging: false };
    deviceListener?.();
    deviceState.current = { ...deviceState.current, charging: true };
    deviceListener?.();
    expect(tracked).toEqual(["charging", "charging"]);
    uninstall();
  });

  it("tracks battery-low and offline-mode independently of each other", () => {
    const uninstall = installDeviceHistoryTracker();
    battery.low = true;
    deviceState.current = { ...deviceState.current, offline: true };
    deviceListener?.();
    expect(tracked.sort()).toEqual(["batteryLow", "offlineMode"]);
    uninstall();
  });

  it("tracks bluetooth via the peripherals notifier, not the device one", () => {
    const uninstall = installDeviceHistoryTracker();
    bluetooth.connected = ["AA:BB:CC:DD:EE:FF"];
    peripheralsListener?.();
    expect(tracked).toEqual(["bluetoothConnected"]);
    uninstall();
  });

  it("uninstall detaches both listeners", () => {
    const uninstall = installDeviceHistoryTracker();
    uninstall();
    expect(deviceListener).toBeNull();
    expect(peripheralsListener).toBeNull();
  });
});
