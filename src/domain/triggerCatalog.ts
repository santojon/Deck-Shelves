/* Machine-readable catalogue of the built-in visibility / profile-trigger rule
   kinds, grouped by category. Pure data (no UI/icons) so both the rule editor
   and the public plugin API can read it from one place. The editor maps icons
   onto these ids; the API exposes it via listTriggerCatalog(). Keep in sync with
   the editor's CATALOG (guarded by triggerCatalog.test.ts). */

export type TriggerCategoryId =
  | "time" | "session" | "power" | "connectivity" | "display" | "perf";

export type TriggerKindEntry = {
  kind: string;
  /** Default params seeded when the rule is added. */
  defaults?: Record<string, unknown>;
  /** True when the kind can be inverted (kind ⇄ its negation). */
  invertible?: boolean;
};

export type TriggerCategory = {
  id: TriggerCategoryId;
  /** i18n key for the category label. */
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
];

/** Flat list of every built-in trigger kind id. */
export const TRIGGER_KINDS: readonly string[] =
  TRIGGER_CATALOG.flatMap((c) => c.entries.map((e) => e.kind));
