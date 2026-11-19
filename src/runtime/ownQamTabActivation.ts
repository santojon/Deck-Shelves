import { now, reportError, reportOnce, type Installation } from "./ownQamTabBase";
import { endPause, evaluateGuard, PAUSE_HOURS, writeRecord } from "./ownQamTabGuard";
import { locate, type Located } from "./ownQamTabDiscovery";
import { removeOwnEntries } from "./ownQamTabEntry";
import { applyFound } from "./ownQamTabPatch";

const FIRST_IDLE_TIMEOUT_MS = 2000;
const FIRST_TIMER_MS = 1000;
const RETRY_GAP_MS = 1600;
const START_WINDOW_MS = 30000;
const MAX_ATTEMPTS = 20;

export function clearTimer(inst: Installation): void {
  const t = inst.timer;
  inst.timer = null;
  if (!t) return;
  try {
    if (t.idle) (globalThis as any).cancelIdleCallback?.(t.id);
    else clearTimeout(t.id as ReturnType<typeof setTimeout>);
  } catch {}
}

function giveUp(inst: Installation): void {
  inst.phase = "stopped";
  reportOnce(inst, "gave-up", "warn", "Quick Access tab: Steam's panel was not found; no tab until the next start");
}

function attempt(inst: Installation): void {
  inst.timer = null;
  if (!inst.live || inst.phase !== "starting") return;
  if (now() - inst.startedAt > START_WINDOW_MS) return giveUp(inst);
  inst.attempts += 1;
  let found: Located | null = null;
  try { found = locate(inst); } catch (err) { reportError(inst, "locating the panel", err); }
  if (found) return applyFound(inst, found);
  if (inst.attempts >= MAX_ATTEMPTS || now() + RETRY_GAP_MS - inst.startedAt > START_WINDOW_MS) return giveUp(inst);
  inst.timer = { idle: false, id: setTimeout(() => attempt(inst), RETRY_GAP_MS) };
}

function scheduleStart(inst: Installation): void {
  inst.startedAt = now();
  const idle = (globalThis as any).requestIdleCallback;
  if (typeof idle === "function") {
    try {
      inst.timer = { idle: true, id: idle(() => attempt(inst), { timeout: FIRST_IDLE_TIMEOUT_MS }) };
      return;
    } catch {}
  }
  inst.timer = { idle: false, id: setTimeout(() => attempt(inst), FIRST_TIMER_MS) };
}

function readActivation(inst: Installation): boolean | undefined {
  try {
    return inst.o.isEnabled() === true;
  } catch (err) {
    reportError(inst, "activation reader", err);
    return undefined;
  }
}

function begin(inst: Installation, on: boolean): void {
  const paused = evaluateGuard(inst, on);
  if (!on) {
    inst.phase = "quiet";
    return;
  }
  if (paused) {
    inst.phase = "paused";
    reportOnce(inst, "paused", "warn", `Quick Access tab: paused after repeated failures; turn the tab off and on again, or wait ${PAUSE_HOURS} hours`);
    return;
  }
  inst.phase = "starting";
  scheduleStart(inst);
}

function changed(inst: Installation, on: boolean): void {
  if (!on && inst.phase === "starting") {
    clearTimer(inst);
    inst.phase = "quiet";
    return;
  }
  // Out of the lists now, so that Steam picks the tab it shows from a list without it.
  if (!on && inst.phase === "working") removeOwnEntries(inst);
  if (inst.phase !== "paused") return;
  if (!on) inst.record.o = 1;
  else if (inst.record.o) endPause(inst.record);
  writeRecord(inst);
}

function onActivation(inst: Installation): void {
  if (!inst.live) return;
  const on = readActivation(inst);
  if (on === undefined) return;
  if (!inst.known) {
    inst.known = true;
    inst.active = on;
    begin(inst, on);
    return;
  }
  if (on === inst.active) return;
  inst.active = on;
  changed(inst, on);
}

export function listen(inst: Installation): void {
  try {
    const unsubscribe = inst.o.subscribe(() => {
      try { onActivation(inst); } catch (err) { reportError(inst, "activation", err); }
    });
    if (typeof unsubscribe !== "function") return;
    if (inst.removed) unsubscribe();
    else inst.unsubscribe = unsubscribe;
  } catch (err) {
    reportError(inst, "activation subscription", err);
  }
}
