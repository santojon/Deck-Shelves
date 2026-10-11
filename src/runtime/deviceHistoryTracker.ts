/* Bumps a device-history counter on each FALSE -> TRUE transition (never on
   level, never polling), reusing the event-driven device/peripherals
   modules. Bluetooth has no native change-event, so it's opportunistic —
   piggybacking on whatever already refreshes peripherals, fine for a
   "how often" counter even if one connection is missed between checks. */

import { getDeviceState, subscribeDeviceState } from "./deviceState";
import { getBluetoothConnected, subscribePeripheralsState } from "./peripheralsState";
import { isLowBattery } from "./batteryState";
import { trackDeviceSignal } from "./deviceHistoryTracking";

// Matches the "recurring battery < 20%" threshold already used for reactive
// suggestions (a later surface) — one shared, honest default.
const BATTERY_LOW_THRESHOLD = 0.2;

let prevExternal = false;
let prevCharging = false;
let prevBatteryLow = false;
let prevOffline = false;
let prevBluetooth = false;

function bumpOnRisingEdge(signal: Parameters<typeof trackDeviceSignal>[0], next: boolean, prev: boolean): boolean {
  if (next && !prev) trackDeviceSignal(signal);
  return next;
}

function checkDeviceTransitions(): void {
  const s = getDeviceState();
  prevExternal = bumpOnRisingEdge("externalDisplay", s.external === true, prevExternal);
  prevCharging = bumpOnRisingEdge("charging", s.charging === true, prevCharging);
  prevBatteryLow = bumpOnRisingEdge("batteryLow", isLowBattery(BATTERY_LOW_THRESHOLD), prevBatteryLow);
  prevOffline = bumpOnRisingEdge("offlineMode", s.offline === true, prevOffline);
}

function checkPeripheralTransitions(): void {
  const connected = getBluetoothConnected().length > 0;
  prevBluetooth = bumpOnRisingEdge("bluetoothConnected", connected, prevBluetooth);
}

export function installDeviceHistoryTracker(): () => void {
  checkDeviceTransitions();
  checkPeripheralTransitions();
  const unsubDevice = subscribeDeviceState(checkDeviceTransitions);
  const unsubPeripherals = subscribePeripheralsState(checkPeripheralTransitions);
  return () => {
    try { unsubDevice(); } catch {}
    try { unsubPeripherals(); } catch {}
  };
}
