// Cloud sync waits while a choice is pending so one account's settings never reach another's cloud copy.
import { getCurrentSettings, isSettingsFileRead, onSettingsFileRead, requestSettingsFileRead, saveSettings, snapshotOnNextSave } from "../store/settingsStore";
import { assignOwner, chooseForAccount, decideAccount, isPerAccount, restoreAccount, type AccountChoice } from "../domain/accountBuckets";
import { holdCloudSyncForAccount, resumeCloudSyncForAccount, type KnownAccount } from "./steamAccount";
import type { Settings } from "../types";

export type AccountQuestion = "ask-legacy" | "ask-new";

export interface AccountSettingsUi {
  ask: (question: AccountQuestion) => void;
  restored: () => void;
}

const FILE_WAIT_MS = 15000;
let pending: { key: string; question: AccountQuestion } | null = null;
const pendingListeners = new Set<() => void>();

export function pendingAccountQuestion(): AccountQuestion | null {
  return pending?.question ?? null;
}

export function onPendingAccountChange(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => { pendingListeners.delete(listener); };
}

function setPending(next: typeof pending): void {
  pending = next;
  for (const listener of [...pendingListeners]) { try { listener(); } catch {} }
}

function settingsFileRead(): Promise<void> {
  if (isSettingsFileRead()) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { off(); resolve(); }, FILE_WAIT_MS);
    const off = onSettingsFileRead(() => { clearTimeout(timer); off(); resolve(); });
    requestSettingsFileRead();
  });
}

async function saveSwitched(next: Settings): Promise<void> {
  snapshotOnNextSave("account");
  await saveSettings(next);
}

export function createAccountSettingsHandler(ui: AccountSettingsUi): (account: KnownAccount) => Promise<void> {
  return async ({ key, previous }) => {
    await settingsFileRead();
    const s = getCurrentSettings();
    const decision = decideAccount(s, key, previous);
    if (!s || decision === "none") {
      if (s && isPerAccount(s)) resumeCloudSyncForAccount();
      return;
    }
    if (decision === "assign") { await saveSettings(assignOwner(s, key)); resumeCloudSyncForAccount(); return; }
    if (decision === "restore") { await saveSwitched(restoreAccount(s, key)); resumeCloudSyncForAccount(); ui.restored(); return; }
    holdCloudSyncForAccount();
    setPending({ key, question: decision });
    ui.ask(decision);
  };
}

export async function applyAccountChoice(choice: AccountChoice): Promise<boolean> {
  const s = getCurrentSettings();
  if (!pending || !s) return false;
  const { key } = pending;
  await saveSwitched(chooseForAccount(s, key, choice));
  setPending(null);
  resumeCloudSyncForAccount();
  return true;
}
