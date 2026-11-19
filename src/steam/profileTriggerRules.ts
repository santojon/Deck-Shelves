import { isDeviceRuleKind, deviceRuleHasData } from "../runtime/deviceState";
import { isTimeContextKind } from "../domain/timeContext";
import { isSessionRuleKind } from "../runtime/sessionState";
import { isPerfRuleKind, perfRuleHasData } from "../runtime/perfState";
import { isPeripheralRuleKind, peripheralRuleHasData } from "../runtime/peripheralsState";
import { evalVisibilityRules, nextVisibilityFlip } from "./visibilityRules";

// Unlike shelf visibility, an empty trigger never fires.
function isKnownRuleKind(kind: string): boolean {
  return kind === "timeWindow" || kind === "dayOfWeek" || isTimeContextKind(kind) || isSessionRuleKind(kind)
    || isPerfRuleKind(kind) || isPeripheralRuleKind(kind) || isDeviceRuleKind(kind);
}

function ruleLacksData(rule: any): boolean {
  const kind = String(rule?.kind ?? "");
  if (!isKnownRuleKind(kind)) return true;
  if (isPerfRuleKind(kind)) return !perfRuleHasData(rule);
  if (isPeripheralRuleKind(kind)) return !peripheralRuleHasData(rule);
  if (isDeviceRuleKind(kind)) return !deviceRuleHasData(rule);
  return false;
}

// A trigger acts only on evidence: a rule without data counts as not matching.
export function evalProfileTrigger(trigger: unknown, now: Date = new Date()): boolean {
  const t = trigger as any;
  if (!t || !Array.isArray(t.rules) || t.rules.length === 0) return false;
  const known = t.rules.filter((r: any) => !ruleLacksData(r));
  if (known.length === 0 || (t.mode === "all" && known.length !== t.rules.length)) return false;
  return evalVisibilityRules({ ...t, rules: known }, now);
}

// First match wins, so list order is the tie-break.
export function resolveTriggeredProfile(
  profiles: ReadonlyArray<{ name: string; trigger?: unknown }> | undefined,
  now: Date = new Date(),
): string | null {
  if (!Array.isArray(profiles)) return null;
  for (const p of profiles) if (evalProfileTrigger(p.trigger, now)) return p.name;
  return null;
}

export function nextProfileTriggerFlip(
  profiles: ReadonlyArray<{ name: string; trigger?: unknown }> | undefined,
  now: Date = new Date(),
): number | null {
  if (!Array.isArray(profiles)) return null;
  let earliest: number | null = null;
  for (const p of profiles) {
    const t = p.trigger as any;
    if (!t || !Array.isArray(t.rules) || t.rules.length === 0) continue;
    const next = nextVisibilityFlip({ visibility: t }, now);
    if (next != null && (earliest == null || next < earliest)) earliest = next;
  }
  return earliest;
}
