// Bluetooth has no change event, so its counter only moves when peripherals refresh.

import { getDeviceState, subscribeDeviceState } from "./deviceState";
import { getBluetoothConnected, subscribePeripheralsState } from "./peripheralsState";
import { isLowBattery } from "./batteryState";
import { trackDeviceSignal } from "./deviceHistoryTracking";

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
