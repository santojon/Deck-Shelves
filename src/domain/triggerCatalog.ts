type TriggerCategoryId =
  | "time" | "session" | "power" | "connectivity" | "display" | "perf" | "peripherals" | "device";

type TriggerKindEntry = {
  kind: string;
  defaults?: Record<string, unknown>;
  invertible?: boolean;
};

export type TriggerCategory = {
  id: TriggerCategoryId;
  titleKey: string;
  entries: TriggerKindEntry[];
};

export const TRIGGER_CATALOG: readonly TriggerCategory[] = [
  { id: "time", titleKey: "visibility_cat_time", entries: [
    { kind: "timeWindow", defaults: { start: 9, end: 17 } },
    { kind: "timeOfDayPeriod", defaults: { period: "evening" } },
    { kind: "dayOfWeek", defaults: { days: [] } },
    { kind: "weekend", defaults: { value: "weekend" } },
    { kind: "season", defaults: { season: "summer" } },
    { kind: "holiday", defaults: { ranges: [{ start: "12-20", end: "12-31" }] } },
  ] },
  { id: "session", titleKey: "visibility_cat_session", entries: [
    { kind: "lastGameSource", invertible: true },
    { kind: "gameRunning", invertible: true },
  ] },
  { id: "power", titleKey: "visibility_cat_power", entries: [
    { kind: "battery", defaults: { below: 20 } },
    { kind: "charging", invertible: true },
  ] },
  { id: "connectivity", titleKey: "visibility_cat_connectivity", entries: [
    { kind: "offline", invertible: true },
    { kind: "libraryAvailable", defaults: { category: "external" }, invertible: true },
  ] },
  { id: "display", titleKey: "visibility_cat_display", entries: [
    { kind: "externalDisplay", invertible: true },
    { kind: "ultrawide", invertible: true },
    { kind: "resolution", defaults: { minWidth: 1920 } },
  ] },
  { id: "perf", titleKey: "visibility_cat_perf", entries: [
    { kind: "highCpu", defaults: { above: 80 }, invertible: true },
    { kind: "lowMemory", defaults: { below: 15 }, invertible: true },
    { kind: "lowFrameBudget", defaults: { belowFps: 45 }, invertible: true },
  ] },
  { id: "peripherals", titleKey: "visibility_cat_peripherals", entries: [
    { kind: "controllerConnected", invertible: true },
    { kind: "headphonesConnected", invertible: true },
    { kind: "bluetoothConnected", invertible: true },
  ] },
  { id: "device", titleKey: "visibility_cat_device", entries: [
    { kind: "device", defaults: { value: "deck" } },
    { kind: "inputMode", defaults: { value: "pointer" } },
  ] },
];

export const TRIGGER_KINDS: readonly string[] =
  TRIGGER_CATALOG.flatMap((c) => c.entries.map((e) => e.kind));
