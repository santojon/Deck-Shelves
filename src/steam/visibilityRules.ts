import type { SmartShelfMode } from "../types";
import { evalDeviceRule, isDeviceRuleKind } from "../runtime/deviceState";
import { evalTimeContextRule, isTimeContextKind } from "../domain/timeContext";
import { evalSessionRule, isSessionRuleKind } from "../runtime/sessionState";
import { evalPerfRule, isPerfRuleKind } from "../runtime/perfState";
import { evalPeripheralRule, isPeripheralRuleKind } from "../runtime/peripheralsState";

type VisibilityRange = { start: number; end: number; days?: number[] };
type VisibilityWindowInput = VisibilityRange | ReadonlyArray<VisibilityRange> | undefined;

function normalizeWindow(input: VisibilityWindowInput): VisibilityRange[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.slice() as VisibilityRange[];
  return [input as VisibilityRange];
}

function inSingleRange(r: VisibilityRange, h: number): boolean {
  const { start, end } = r;
  if (start === end) return true;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

function dayAllowed(daysOfWeek: number[] | undefined, day: number): boolean {
  return !Array.isArray(daysOfWeek) || daysOfWeek.includes(day);
}

export function isInVisibilityWindow(
  window: VisibilityWindowInput,
  daysOfWeek: number[] | undefined,
  now: Date = new Date(),
): boolean {
  const ranges = normalizeWindow(window);
  if (ranges.length === 0) {
    return dayAllowed(daysOfWeek, now.getDay());
  }
  const h = now.getHours();
  const today = now.getDay();
  for (const r of ranges) {
    if (Array.isArray(r.days)) {
      if (!r.days.includes(today)) continue;
    } else if (!dayAllowed(daysOfWeek, today)) {
      return false;
    }
    if (inSingleRange(r, h)) return true;
  }
  return false;
}

export function nextVisibilityBoundary(
  window: VisibilityWindowInput,
  daysOfWeek: number[] | undefined,
  now: Date = new Date(),
): number | null {
  const ranges = normalizeWindow(window);
  if (ranges.length === 0 && (!daysOfWeek || daysOfWeek.length === 0)) return null;
  // Steps an hour at a time and returns the first hour where the result flips.
  const cur = isInVisibilityWindow(window, daysOfWeek, now);
  const probe = new Date(now.getTime());
  probe.setMinutes(0, 0, 0);
  for (let i = 1; i <= 24 * 8; i++) {
    probe.setTime(probe.getTime() + 60 * 60 * 1000);
    if (isInVisibilityWindow(window, daysOfWeek, probe) !== cur) {
      return probe.getTime();
    }
  }
  return null;
}

export const SPARE_TIME_WINDOWS: ReadonlyArray<{ start: number; end: number }> = [
  { start: 6, end: 9 },
  { start: 12, end: 14 },
  { start: 19, end: 22 },
];

export function getModeVisibilityWindows(mode: SmartShelfMode): ReadonlyArray<{ start: number; end: number }> | undefined {
  if (mode === 'spare_time') return SPARE_TIME_WINDOWS;
  return undefined;
}

// Unknown rule kinds evaluate as true (fail open).
type VisibilityLike = { visibility?: any; visibleHours?: any; visibleDaysOfWeek?: number[] } | undefined;

function evalTimeWindowRule(rule: any, now: Date): boolean {
  if (Array.isArray(rule.days) && !rule.days.includes(now.getDay())) return false;
  const start = Number(rule.start), end = Number(rule.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
  return inSingleRange({ start, end }, now.getHours());
}

function evalContextKind(kind: string, rule: any, now: Date): boolean {
  if (isTimeContextKind(kind)) return evalTimeContextRule(rule, now);
  if (isSessionRuleKind(kind)) return evalSessionRule(rule);
  if (isPerfRuleKind(kind)) return evalPerfRule(rule);
  if (isPeripheralRuleKind(kind)) return evalPeripheralRule(rule);
  return isDeviceRuleKind(kind) ? evalDeviceRule(rule) : true;
}

function evalVisibilityRuleRaw(rule: any, now: Date): boolean {
  const kind = String(rule?.kind || "");
  switch (kind) {
    case "timeWindow": return evalTimeWindowRule(rule, now);
    case "dayOfWeek":  return Array.isArray(rule.days) ? rule.days.includes(now.getDay()) : true;
    default:           return evalContextKind(kind, rule, now);
  }
}

// `not: true` inverts a rule; the editor never lets a kind and its inverse coexist.
function evalVisibilityRule(rule: any, now: Date): boolean {
  const res = evalVisibilityRuleRaw(rule, now);
  return rule?.not === true ? !res : res;
}

export function evalVisibilityRules(
  visibility: { mode?: "any" | "all"; rules?: any[] } | undefined,
  now: Date = new Date(),
): boolean {
  const rules = Array.isArray(visibility?.rules) ? visibility!.rules : [];
  if (rules.length === 0) return true;
  const results = rules.map((r) => evalVisibilityRule(r, now));
  return visibility!.mode === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function evalVisibility(entry: VisibilityLike, now: Date = new Date()): boolean {
  if (!entry) return true;
  const rules = Array.isArray(entry.visibility?.rules) ? entry.visibility.rules : [];
  if (rules.length > 0) return evalVisibilityRules(entry.visibility, now);
  return isInVisibilityWindow(entry.visibleHours, entry.visibleDaysOfWeek, now);
}

// Device rules flip on hardware events, not the clock.
function hasClockRule(entry: VisibilityLike): boolean {
  const rules = Array.isArray(entry?.visibility?.rules) ? entry!.visibility.rules : [];
  if (rules.length > 0) {
    return rules.some((r: { kind?: unknown } | null | undefined) => r?.kind === "timeWindow" || r?.kind === "dayOfWeek" || isTimeContextKind(String(r?.kind || "")));
  }
  return normalizeWindow(entry?.visibleHours).length > 0 || ((entry?.visibleDaysOfWeek?.length ?? 0) > 0);
}

export function nextVisibilityFlip(entry: VisibilityLike, now: Date = new Date()): number | null {
  if (!entry || !hasClockRule(entry)) return null;
  const cur = evalVisibility(entry, now);
  const probe = new Date(now.getTime());
  probe.setMinutes(0, 0, 0);
  for (let i = 1; i <= 24 * 8; i++) {
    probe.setTime(probe.getTime() + 60 * 60 * 1000);
    if (evalVisibility(entry, probe) !== cur) return probe.getTime();
  }
  return null;
}
