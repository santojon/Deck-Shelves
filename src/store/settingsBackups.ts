import { call } from "../runtime/host/decky";
import { logError, logInfo } from "../runtime/logger";
import { qaOverrideActive } from "../qa/harness";
import { withTimeout } from "./rpcTimeout";

export async function exportSettingsToFile(destPath: string): Promise<boolean> {
  try {
    logInfo("STORAGE", "exportSettingsToFile start", { destPath });
    return !!(await withTimeout(call<[unknown], boolean>("export_settings", { dest_path: destPath }), 15000));
  } catch (error) {
    logError("STORAGE", "exportSettingsToFile failed", String(error));
    return false;
  }
}

export interface BackupEntry {
  name: string;
  mtime: number;
  size: number;
  summary: { shelves: number; smartShelves: number; profiles: number; filters: number };
}

export async function listBackups(): Promise<BackupEntry[]> {
  try {
    const raw = await withTimeout(call<[], { backups?: BackupEntry[] }>("list_backups"), 8000);
    return Array.isArray(raw?.backups) ? raw.backups : [];
  } catch (error) {
    logError("STORAGE", "listBackups failed", String(error));
    return [];
  }
}

// How many unreadable settings copies the backend keeps aside (never their content); 0 when unknown.
export async function countQuarantinedSettings(): Promise<number> {
  try {
    const raw = await withTimeout(call<[], { quarantined?: number }>("list_backups"), 8000);
    return typeof raw?.quarantined === "number" ? raw.quarantined : 0;
  } catch { return 0; }
}

// The backup actions below write the real files on the backend: a QA build only lists them.
export function skippedInQa(action: string): boolean {
  if (qaOverrideActive) logInfo("STORAGE", `${action} skipped (QA override active)`);
  return qaOverrideActive;
}

export async function createSnapshot(): Promise<BackupEntry[]> {
  if (skippedInQa("createSnapshot")) return listBackups();
  try {
    const raw = await withTimeout(call<[], { backups?: BackupEntry[] }>("create_backup"), 8000);
    return Array.isArray(raw?.backups) ? raw.backups : [];
  } catch (error) {
    logError("STORAGE", "createSnapshot failed", String(error));
    return [];
  }
}

// Best-effort snapshot before an import, a profile switch (at most one a minute) or an account change.
export type SafetySnapshotKind = "import" | "profile" | "account";

export async function createSafetySnapshot(kind: SafetySnapshotKind): Promise<void> {
  if (skippedInQa("createSafetySnapshot")) return;
  try {
    await withTimeout(call<[unknown], unknown>("create_pre_import_backup", { kind }), 8000);
  } catch (error) {
    logError("STORAGE", "createSafetySnapshot failed", String(error));
  }
}

export async function createPreImportSnapshot(): Promise<void> {
  await createSafetySnapshot("import");
}

export async function exportBackupToFile(name: string, dest: string): Promise<boolean> {
  try {
    return !!(await withTimeout(call<[unknown], boolean>("export_backup", { name, dest }), 15000));
  } catch (error) {
    logError("STORAGE", "exportBackupToFile failed", String(error));
    return false;
  }
}

export async function deleteBackup(name: string): Promise<BackupEntry[] | null> {
  if (skippedInQa("deleteBackup")) return null;
  try {
    const raw = await withTimeout(call<[unknown], { ok?: boolean; backups?: BackupEntry[] }>("delete_backup", { name }), 8000);
    if (!raw?.ok) return null;
    return Array.isArray(raw?.backups) ? raw.backups : [];
  } catch (error) {
    logError("STORAGE", "deleteBackup failed", String(error));
    return null;
  }
}

export async function clearBackups(): Promise<BackupEntry[]> {
  if (skippedInQa("clearBackups")) return listBackups();
  try {
    const raw = await withTimeout(call<[], { backups?: BackupEntry[] }>("clear_backups"), 8000);
    return Array.isArray(raw?.backups) ? raw.backups : [];
  } catch (error) {
    logError("STORAGE", "clearBackups failed", String(error));
    return [];
  }
}

export async function importBackupFromFile(srcPath: string): Promise<BackupEntry[] | null> {
  if (skippedInQa("importBackupFromFile")) return null;
  try {
    const raw = await withTimeout(call<[unknown], { ok?: boolean; backups?: BackupEntry[] }>("import_backup", { src_path: srcPath }), 15000);
    if (!raw?.ok) return null;
    return Array.isArray(raw?.backups) ? raw.backups : [];
  } catch (error) {
    logError("STORAGE", "importBackupFromFile failed", String(error));
    return null;
  }
}

export async function writeJsonFile(path: string, content: string): Promise<boolean> {
  try {
    return !!(await withTimeout(call<[unknown], boolean>("write_json_file", { path, content }), 15000));
  } catch (error) {
    logError("STORAGE", "writeJsonFile failed", String(error));
    return false;
  }
}

export async function readJsonFile(path: string): Promise<string | null> {
  try {
    const r = await withTimeout(call<[unknown], { ok?: boolean; content?: string | null }>("read_json_file", { path }), 15000);
    return (r?.ok && typeof r.content === "string") ? r.content : null;
  } catch (error) {
    logError("STORAGE", "readJsonFile failed", String(error));
    return null;
  }
}

// True once, after the backend restored settings from a backup; the backend clears its flag on read.
export async function wasSettingsRecovered(): Promise<boolean> {
  try {
    return !!(await withTimeout(call<[], boolean>("was_settings_recovered"), 8000));
  } catch (error) {
    logError("STORAGE", "wasSettingsRecovered failed", String(error));
    return false;
  }
}
