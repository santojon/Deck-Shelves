import { call } from "../runtime/host/decky";
import type { Settings } from "../types";
import { logError, logInfo, logWarn } from "../runtime/logger";
import { qaOverrideActive } from "../qa/harness";
import { withTimeout } from "./rpcTimeout";
import type { SafetySnapshotKind } from "./settingsBackups";

// While false, background refreshes don't override `current`, so unsaved changes survive reloads.
const SAVE_OK_KEY = "deck-shelves-last-save-ok";
export let lastSaveSucceeded = (() => {
  try { return globalThis.localStorage?.getItem(SAVE_OK_KEY) !== "0"; } catch { return true; }
})();
function markSaveResult(ok: boolean): void {
  lastSaveSucceeded = ok;
  try { globalThis.localStorage?.setItem(SAVE_OK_KEY, ok ? "1" : "0"); } catch {}
  try { (globalThis as any).__ds_last_save_ok = ok; } catch {}
}

export function queueSave(next: Settings, resolvers: Array<(ok: boolean) => void>): void {
  if (pendingSave) {
    pendingSave.next = next;
    pendingSave.resolvers.push(...resolvers);
  } else {
    pendingSave = { next, resolvers };
  }
  void flushPendingSave();
}

// Rapid saves coalesce: while a write is in flight only the latest payload is queued.
let pendingSave: { next: Settings; resolvers: Array<(ok: boolean) => void> } | null = null;
let saveInFlight = false;

async function flushPendingSave(): Promise<void> {
  if (saveInFlight) return;
  const job = pendingSave;
  if (!job) return;
  pendingSave = null;
  saveInFlight = true;
  try {
    const ok = await runSave(job.next);
    for (const r of job.resolvers) r(ok);
  } finally {
    saveInFlight = false;
    if (pendingSave) void flushPendingSave();
  }
}

// The backend snapshots the file it replaces in the same step, so nothing lands in between.
let nextSaveSnapshot: SafetySnapshotKind | null = null;

export function snapshotOnNextSave(kind: SafetySnapshotKind): void {
  if (!qaOverrideActive) nextSaveSnapshot = kind;
}

async function runSave(next: Settings): Promise<boolean> {
  const snapshot = nextSaveSnapshot;
  nextSaveSnapshot = null;
  logInfo("STORAGE", "saveSettings start", { enabled: next.enabled, shelfCount: next.shelves.length });

  // One attempt; the cache and `lastSaveSucceeded` cover failures until the next save.
  try {
    const payload = snapshot ? { settings: next, snapshot } : { settings: next };
    const ok = await withTimeout(call<[unknown], boolean>("set_settings", payload), 8000);
    if (!ok) {
      logWarn("STORAGE", "saveSettings backend returned false");
      try { (globalThis as any).__ds_save_last_err = { kind: "backend-false", at: Date.now() }; } catch {}
      markSaveResult(false);
      return false;
    }
    logInfo("STORAGE", "saveSettings success");
    markSaveResult(true);
    return true;
  } catch (error) {
    logError("STORAGE", "saveSettings failed", String(error));
    try { (globalThis as any).__ds_save_last_err = { kind: "call-throw", at: Date.now(), err: String(error) }; } catch {}
    markSaveResult(false);
    return false;
  }
}
