import { call } from "../runtime/host/decky";
import { isHomeOwner } from "../runtime/host/ownerGuard";
import { SettingsSchema, type FilterGroup, type FilterItem, type Settings, type SmartShelf } from "../types";
import { migrateRetiredIds } from "../domain/retired";
import { createHiddenGamesExcludeItem, defaultSettings } from "../domain/defaults";
import { logError, logInfo, logWarn, setVerboseLogging } from "../runtime/logger";
import { applyQASettingsOverride, qaOverrideActive, qaSeedActive } from "../qa/harness";
import { SYNC_LISTS, LOCAL_ONLY_FIELDS } from "../domain/settingsMerge";

// Bumping the key invalidates every persisted cache entry at once.
const CACHE_KEY = 'deck-shelves-settings-cache-v3';
const SHARED_STATE_KEY = '__DECK_SHELVES_SHARED_SETTINGS__';

// A QA-tagged payload is never trusted once its QA session ends.
function isUntrustedQaPayload(raw: unknown): boolean {
  return !qaOverrideActive && !!raw && typeof raw === "object" && (raw as any).__dsQaOverride === true;
}

function readCache(): Settings | null {
  try {
    try { globalThis.localStorage?.removeItem('deck-shelves-settings-cache-v2'); } catch {}
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const rawParsed = JSON.parse(raw);
    if (isUntrustedQaPayload(rawParsed)) return null;
    const parsed = SettingsSchema.safeParse(rawParsed);
    return parsed.success ? migrate(parsed.data) : null;
  } catch {
    return null;
  }
}

// A QA build's edits never reach the backend, so its cached copies are tagged and a normal boot refuses them.
function qaTagged(s: Settings): Settings {
  return qaOverrideActive && (s as any).__dsQaOverride !== true ? ({ ...s, __dsQaOverride: true } as Settings) : s;
}

function writeCache(s: Settings) {
  try { globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(qaTagged(s))); } catch {}
}

function readSharedState(): Settings | null {
  try {
    const raw = (globalThis as any)[SHARED_STATE_KEY];
    if (isUntrustedQaPayload(raw)) return null;
    const parsed = SettingsSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeSharedState(s: Settings) {
  try {
    (globalThis as any)[SHARED_STATE_KEY] = qaTagged(s);
  } catch {}
}

/* Used by the cache read below, which runs at load (through migrate), so they come first: the
   bundle sets a module's constants in source order, and one set later is still undefined there. */
// Bump when adding a migration; older builds leave a higher-versioned document untouched.
export const SCHEMA_VERSION = 2;
// Documents below this version predate the hidden-games item on smart shelves.
const HIDDEN_FILTER_SCHEMA_VERSION = 2;
// A fixed low clock: any real edit beats it, and never-edited copies tie by content.
const BACKFILL_EPOCH = 1;

const _init = readCache() ?? readSharedState();
let current: Settings | null = _init ? applyQASettingsOverride(_init) : null;
// Seeded without notify(), so its side effects (verbose logging, cache, shared state) run here.
setVerboseLogging((current as any)?.verboseLoggingEnabled === true);
if (current) { writeCache(current); writeSharedState(current); }
const listeners = new Set<(s: Settings) => void>();

// While false, background refreshes don't override `current`, so unsaved changes survive reloads.
const SAVE_OK_KEY = "deck-shelves-last-save-ok";
let lastSaveSucceeded = (() => {
  try { return globalThis.localStorage?.getItem(SAVE_OK_KEY) !== "0"; } catch { return true; }
})();
function markSaveResult(ok: boolean): void {
  lastSaveSucceeded = ok;
  try { globalThis.localStorage?.setItem(SAVE_OK_KEY, ok ? "1" : "0"); } catch {}
  try { (globalThis as any).__ds_last_save_ok = ok; } catch {}
}

// Until the file is read, `current` is the local cache, which can be older than the file.
// Early saves keep only the fields they changed and are laid over the file's document when it arrives;
// after a failed save the cache is the newer copy and is written as is.
let fileRead = !lastSaveSucceeded;
let earlyEdits: { fields: Record<string, unknown>; resolvers: Array<(ok: boolean) => void> } | null = null;
let earlyTimer: ReturnType<typeof setTimeout> | null = null;
let fileReadInFlight = false;
// Counts the file documents adopted, so a read sent before one can tell its answer is late.
let fileEpoch = 0;
// The longest an early save waits for the file before it is written as it is.
const EARLY_SAVE_WAIT_MS = 10000;
const fileReadListeners = new Set<() => void>();

// Whether `current` already reflects the settings file, or the local copy stands (after a failed
// save it is the newer one; or the file did not answer in time).
export function isSettingsFileRead(): boolean {
  return fileRead;
}

// Called once the file's document is in memory, even when it matched what was shown (no change notice).
export function onSettingsFileRead(listener: () => void): () => void {
  fileReadListeners.add(listener);
  return () => { fileReadListeners.delete(listener); };
}

function isSameSettings(a: Settings | null, b: Settings): boolean {
  if (!a) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}

// The QA tag only means something in a QA build; a normal build never keeps or saves it.
function withoutQaTag(s: Settings): Settings {
  if (qaOverrideActive || (s as any)?.__dsQaOverride === undefined) return s;
  const copy = { ...(s as any) };
  delete copy.__dsQaOverride;
  return copy as Settings;
}

function notify(raw: Settings, persist = true) {
  // With the fresh-install QA seed active, an untagged payload is a backend refresh and is dropped.
  if (qaSeedActive() && (raw as any).__dsQaOverride !== true) return;
  const s = applyQASettingsOverride(withoutQaTag(raw));
  // Before the same-settings short-circuit, so the boot path's notify(cached) still applies it.
  setVerboseLogging((s as any).verboseLoggingEnabled === true);
  if (isSameSettings(current, s)) {
    return;
  }
  current = s;
  if (persist) {
    writeCache(s);
    writeSharedState(s);
  }
  logInfo("STORAGE", "notify settings", { enabled: s.enabled, shelfCount: s.shelves.length });
  listeners.forEach((listener) => listener(s));
  try {
    globalThis.dispatchEvent?.(new CustomEvent("deck-shelves-settings-changed", { detail: s }));
  } catch {}
}

// Runs on every load, cached or fetched; each migration must be idempotent.

function dedupeById<T extends { id?: string }>(arr: readonly T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const k = x?.id;
    if (!k) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Duplicate ids render a shelf twice; dedupe on every load, keeping the first.
function dedupeShelves(s: Settings): Settings {
  const shelves = dedupeById(s.shelves ?? []);
  const smart = dedupeById((s as any).smartShelves ?? []);
  const changed = shelves.length !== (s.shelves?.length ?? 0)
    || smart.length !== ((s as any).smartShelves?.length ?? 0);
  return changed ? ({ ...s, shelves, smartShelves: smart } as Settings) : s;
}

const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000;

function stripStamp(e: any): string {
  const { updatedAt: _drop, ...rest } = e ?? {};
  return JSON.stringify(rest);
}

// Sorted keys so key order never registers as a change.
function scalarBag(s: any): string {
  const skip = new Set<string>([...SYNC_LISTS, "syncTombstones", "preferencesUpdatedAt", ...LOCAL_ONLY_FIELDS]);
  const out: any = {};
  for (const k of Object.keys(s).sort()) if (!skip.has(k)) out[k] = s[k];
  return JSON.stringify(out);
}

// Returns the same reference when nothing needed backfilling.
function backfillSyncStamps(s: Settings): Settings {
  const out: any = { ...s };
  let changed = false;
  for (const key of SYNC_LISTS) {
    const list: any[] = (s as any)[key] ?? [];
    let listChanged = false;
    const next = list.map((e) => {
      if (typeof e?.updatedAt === "number") return e;
      listChanged = true;
      return { ...e, updatedAt: BACKFILL_EPOCH };
    });
    if (listChanged) { out[key] = next; changed = true; }
  }
  const st = (s as any).syncTombstones;
  if (typeof st !== "object" || st === null) { out.syncTombstones = {}; changed = true; }
  if (typeof (s as any).preferencesUpdatedAt !== "number") { out.preferencesUpdatedAt = BACKFILL_EPOCH; changed = true; }
  return changed ? (out as Settings) : s;
}

function stampEntity(e: any, before: any, now: number): any {
  if (before && stripStamp(before) === stripStamp(e)) {
    return typeof e.updatedAt === "number" ? e : { ...e, updatedAt: before.updatedAt ?? now };
  }
  return { ...e, updatedAt: now };
}

function stampList(prevList: any[], nextList: any[], tombstones: Record<string, number>, now: number): any[] {
  const prevById = new Map(prevList.map((e) => [e.id, e] as const));
  const nextIds = new Set(nextList.map((e) => e.id));
  const stamped = nextList.map((e) => stampEntity(e, prevById.get(e.id), now));
  for (const e of prevList) if (!nextIds.has(e.id)) tombstones[e.id] = now;
  for (const id of nextIds) if (id in tombstones) delete tombstones[id];
  return stamped;
}

function pruneTombstones(tombstones: Record<string, number>, now: number): void {
  for (const [id, t] of Object.entries(tombstones)) if (now - t > TOMBSTONE_TTL_MS) delete tombstones[id];
}

// Sync-applied saves skip this; they already carry authoritative stamps.
export function stampChanges(prev: Settings | null, next: Settings): Settings {
  const now = Date.now();
  const out: any = { ...next };
  const tombstones: Record<string, number> = { ...((next as any).syncTombstones ?? {}) };
  for (const key of SYNC_LISTS) {
    out[key] = stampList((prev as any)?.[key] ?? [], (next as any)[key] ?? [], tombstones, now);
  }
  const scalarChanged = !prev || scalarBag(prev) !== scalarBag(next);
  out.preferencesUpdatedAt = scalarChanged ? now : ((prev as any).preferencesUpdatedAt ?? (next as any).preferencesUpdatedAt ?? now);
  pruneTombstones(tombstones, now);
  out.syncTombstones = tombstones;
  return out as Settings;
}

function hasHiddenFilterItem(items: FilterItem[]): boolean {
  return items.some((it) => it?.type === "hidden"
    || (it?.type === "merge" && Array.isArray(it.params?.items) && hasHiddenFilterItem(it.params.items as FilterItem[])));
}

// Smart shelves made before the hidden-games default get the same `hidden: exclude` item, unless they have one.
function withHiddenGamesExcluded(group: FilterGroup | undefined): FilterGroup {
  const raw = group?.items;
  const items = Array.isArray(raw) ? raw : [];
  if (group?.mode === "or" && items.length) {
    return { mode: "and", items: [{ type: "merge", inverted: false, params: { mode: "or", items } }, createHiddenGamesExcludeItem()] };
  }
  return { mode: "and", items: [...items, createHiddenGamesExcludeItem()] };
}

// A changed shelf gets a clock one tick above its old one: it beats the un-migrated copy and loses to any real edit.
function migrateSmartShelfHidden(sh: SmartShelf): SmartShelf {
  const items = sh.filterGroup?.items;
  // A malformed group is left alone: a throw here would reset the whole config.
  if (items !== undefined && !Array.isArray(items)) return sh;
  if (items && hasHiddenFilterItem(items)) return sh;
  const clock = typeof sh.updatedAt === "number" ? sh.updatedAt : 0;
  return { ...sh, filterGroup: withHiddenGamesExcluded(sh.filterGroup), updatedAt: clock + 1 };
}

export function migrate(s: Settings): Settings {
  const stored = s.schemaVersion ?? 0;
  // A newer version wrote this document: never migrate or downgrade it.
  if (stored > SCHEMA_VERSION) return s;
  s = dedupeShelves(s);
  s = backfillSyncStamps(s);
  s = migrateRetiredIds(s);
  let mutated = false;
  let smartShelves = s.smartShelves;
  if (stored < HIDDEN_FILTER_SCHEMA_VERSION) {
    smartShelves = (s.smartShelves ?? []).map((sh) => {
      const next = migrateSmartShelfHidden(sh);
      if (next !== sh) mutated = true;
      return next;
    });
  }
  const shelves = s.shelves.map((sh) => {
    // listLibraryTabs() has no "recent" tab, so a filter source sorted by recent stands in.
    const src = sh.source as any;
    if (src && src.type === "tab" && src.tab === "recent") {
      mutated = true;
      return { ...sh, source: { type: "filter", filter: { sort: "recent" } } as any };
    }
    return sh;
  });
  const base = mutated ? { ...s, shelves, smartShelves } : s;
  return stored === SCHEMA_VERSION ? base : { ...base, schemaVersion: SCHEMA_VERSION };
}

// One invalid field must never reset the whole config: merge over defaults and log the issues.
function preserveOnParseFailure(candidate: unknown, error: unknown): Settings {
  try { logError("STORAGE", "settings failed schema validation — preserving data (not resetting)", JSON.stringify((error as any)?.issues?.slice(0, 6))); } catch {}
  if (candidate && typeof candidate === "object") {
    try { return migrate({ ...defaultSettings(), ...(candidate as any) } as Settings); }
    catch (e) { try { logError("STORAGE", "settings merge fallback failed", String(e)); } catch {} }
  }
  return current ?? defaultSettings();
}

function normalize(raw: unknown): Settings {
  const candidate = (raw && typeof raw === "object" && "state" in (raw as any)) ? (raw as any).state : raw;
  const parsed = SettingsSchema.safeParse(candidate);
  return parsed.success ? migrate(parsed.data) : preserveOnParseFailure(candidate, parsed.error);
}

const COLD_RETRY_MAX = 10;
let coldRetryTimer: ReturnType<typeof setTimeout> | null = null;
let coldRetryAttempt = 0;

// Cold boot can mount the Home before the backend bridge attaches, so retry until it answers.
function scheduleColdRetry(): void {
  if (coldRetryTimer != null || coldRetryAttempt >= COLD_RETRY_MAX) return;
  const delay = Math.min(500 * 2 ** coldRetryAttempt, 4000);
  coldRetryTimer = setTimeout(() => {
    coldRetryTimer = null;
    coldRetryAttempt += 1;
    const sent = readTicket();
    call<[], unknown>("get_settings")
      .then((raw) => { coldRetryAttempt = 0; fileDocument(normalize(raw), sent); })
      .catch(() => scheduleColdRetry());
  }, delay);
}

// A QA override applied inside notify() must reach direct callers too.
function effectiveState(fallback: Settings): Settings {
  return current ?? fallback;
}

// Top-level fields whose value differs between two documents (a missing key counts as a change).
function changedFields(before: Settings | null, next: Settings): Record<string, unknown> {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = b[k];
  }
  return out;
}

function queueSave(next: Settings, resolvers: Array<(ok: boolean) => void>): void {
  if (pendingSave) {
    pendingSave.next = next;
    pendingSave.resolvers.push(...resolvers);
  } else {
    pendingSave = { next, resolvers };
  }
  void flushPendingSave();
}

// The file's document arrived (or the wait ran out: `doc` null): lay the early edits over it and save once.
function adoptFileDocument(doc: Settings | null): void {
  fileRead = true;
  if (doc) fileEpoch += 1;
  if (earlyTimer) { clearTimeout(earlyTimer); earlyTimer = null; }
  const job = earlyEdits;
  earlyEdits = null;
  if (doc) notify(job ? ({ ...doc, ...job.fields } as Settings) : doc);
  for (const listener of [...fileReadListeners]) { try { listener(); } catch {} }
  if (!job) return;
  if (current) queueSave(current, job.resolvers);
  else for (const r of job.resolvers) r(false);
}

type ReadTicket = { epoch: number; shown: string };

// Taken when a read of the file is sent: what the session had then.
function readTicket(): ReadTicket {
  return { epoch: fileEpoch, shown: JSON.stringify(current) };
}

/* A document read from the file outside refreshSettings' cached path. Once the file is read, an
   answer sent before another read was adopted, or before the shown settings changed, can predate a
   save made since: what is shown is kept. */
function fileDocument(doc: Settings, sent: ReadTicket): void {
  if (!fileRead) { adoptFileDocument(doc); return; }
  if (sent.epoch !== fileEpoch || JSON.stringify(current) !== sent.shown) {
    logWarn("STORAGE", "file read suppressed (state changed mid-read)");
    return;
  }
  notify(doc);
}

function readFileOnce(): void {
  if (fileRead || fileReadInFlight) return;
  fileReadInFlight = true;
  withTimeout(call<[], unknown>("get_settings"), 5000)
    .then((raw) => { if (!fileRead) adoptFileDocument(normalize(raw)); })
    .catch(() => scheduleColdRetry())
    .finally(() => { fileReadInFlight = false; });
}

function holdUntilFileRead(before: Settings | null, next: Settings): Promise<boolean> {
  const job = earlyEdits ?? (earlyEdits = { fields: {}, resolvers: [] });
  Object.assign(job.fields, changedFields(before, next));
  if (!earlyTimer) earlyTimer = setTimeout(() => { if (!fileRead) adoptFileDocument(null); }, EARLY_SAVE_WAIT_MS);
  readFileOnce();
  return new Promise<boolean>((resolve) => { job.resolvers.push(resolve); });
}

// For a reader that can't rely on another read of the file: reads it now unless this session already has.
export function requestSettingsFileRead(): void {
  readFileOnce();
}

export async function refreshSettings(): Promise<Settings> {
  const cached = current ?? readCache() ?? readSharedState();
  if (cached) {
    notify(cached);
    // The last save failed (the flag survives reloads), so retry the cached state once.
    if (!lastSaveSucceeded) {
      logWarn("STORAGE", "retrying unsynced save on boot");
      saveSettings(cached).catch(() => {});
    }
    // Edits made while the read is in flight win over its necessarily stale answer.
    const refreshAnchor = JSON.stringify(current);
    const sentEpoch = fileEpoch;
    withTimeout(call<[], unknown>("get_settings"), 5000)
      .then((raw) => {
        const fromServer = normalize(raw);
        // The session's first read of the file: early saves are laid over it (see `fileRead`).
        if (!fileRead) { adoptFileDocument(fromServer); return; }
        // Another read was adopted after this one was sent: it carries everything since.
        if (sentEpoch !== fileEpoch) return;
        // 1) Save still unconfirmed → cache holds the user's pending edits.
        if (!lastSaveSucceeded && JSON.stringify(fromServer) !== JSON.stringify(current)) {
          logWarn("STORAGE", "background refresh suppressed (last save unconfirmed)");
          return;
        }
        // 2) State changed mid-read → adopting the answer would revert those edits.
        if (JSON.stringify(current) !== refreshAnchor) {
          logWarn("STORAGE", "background refresh suppressed (state changed mid-read)");
          return;
        }
        notify(fromServer);
      })
      .catch((error) => { logWarn("STORAGE", "background refresh failed", String(error)); scheduleColdRetry(); });
    return effectiveState(cached);
  }
  try {
    logInfo("STORAGE", "refreshSettings requesting backend");
    const sent = readTicket();
    const next = normalize(await withTimeout(call<[], unknown>("get_settings"), 8000));
    fileDocument(next, sent);
    return effectiveState(next);
  } catch (error) {
    logWarn("STORAGE", "refreshSettings failed", String(error));
    scheduleColdRetry();
    const known = current ?? readCache() ?? readSharedState();
    const next = known ?? defaultSettings();
    // Bare defaults stand in until the backend answers; persisting them would
    // make the next start (or another copy) read them back as the user's settings.
    notify(next, known != null);
    return effectiveState(next);
  }
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

export function saveSettings(next: Settings, opts?: { fromSync?: boolean }): Promise<boolean> {
  // Sync-applied writes skip stamping, or the other device's clocks get clobbered.
  const stamped = withoutQaTag(opts?.fromSync ? next : stampChanges(current, next));
  // A QA-overridden session never reaches the real backend.
  if (qaOverrideActive) {
    logInfo("STORAGE", "saveSettings skipped (QA override active)");
    notify(stamped);
    return Promise.resolve(true);
  }
  // Local state, cache and listeners update at once; an early save is recorded first so a listener's own save lays over it.
  const held = fileRead ? null : holdUntilFileRead(current, stamped);
  notify(stamped);
  return held ?? new Promise<boolean>((resolve) => { queueSave(stamped, [resolve]); });
}

// The backend snapshots the file it replaces in the same step, so nothing lands in between.
let nextSaveSnapshot: SafetySnapshotKind | null = null;

export function snapshotOnNextSave(kind: SafetySnapshotKind): void {
  if (!qaOverrideActive) nextSaveSnapshot = kind;
}

async function runSave(next: Settings): Promise<boolean> {
  const snapshot = nextSaveSnapshot;
  nextSaveSnapshot = null;
  // Single writer: a stood-down instance never writes settings.
  if (!isHomeOwner()) {
    logInfo("STORAGE", "saveSettings skipped — not the renderer owner (single-writer)");
    return true;
  }
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
function skippedInQa(action: string): boolean {
  if (qaOverrideActive) logInfo("STORAGE", `${action} skipped (QA override active)`);
  return qaOverrideActive;
}

export async function restoreBackup(name: string): Promise<Settings | null> {
  if (skippedInQa("restoreBackup")) return null;
  try {
    logInfo("STORAGE", "restoreBackup start", { name });
    const raw = await withTimeout(call<[unknown], any>("restore_backup", { name }), 15000);
    if (!raw?.ok || !raw?.state) return null;
    const next = normalize(raw.state);
    notify(next);
    logInfo("STORAGE", "restoreBackup success", { shelfCount: next.shelves.length });
    return next;
  } catch (error) {
    logError("STORAGE", "restoreBackup failed", String(error));
    return null;
  }
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

export function getCurrentSettings(): Settings | null {
  return current;
}

export function subscribeSettings(listener: (s: Settings) => void): () => void {
  listeners.add(listener);
  if (current) listener(current);
  return () => listeners.delete(listener);
}
