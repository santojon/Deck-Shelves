import { call } from "../runtime/host/decky";
import { SettingsSchema, type FilterGroup, type FilterItem, type Settings, type SmartShelf } from "../types";
import { migrateRetiredIds } from "../domain/retired";
import { createHiddenGamesExcludeItem, defaultSettings } from "../domain/defaults";
import { logError, logInfo, logWarn, setVerboseLogging } from "../runtime/logger";
import { applyQASettingsOverride, qaOverrideActive, qaSeedActive } from "../qa/harness";
import { SYNC_LISTS } from "../domain/settingsMerge";
import { withTimeout } from "./rpcTimeout";
import { stampChanges } from "./syncStamps";
import { skippedInQa } from "./settingsBackups";
import { lastSaveSucceeded, queueSave } from "./settingsSaveQueue";
export { stampChanges } from "./syncStamps";
export { exportSettingsToFile, listBackups, countQuarantinedSettings, createSnapshot, createSafetySnapshot, createPreImportSnapshot, exportBackupToFile, deleteBackup, clearBackups, importBackupFromFile, writeJsonFile, readJsonFile, wasSettingsRecovered } from "./settingsBackups";
export type { BackupEntry, SafetySnapshotKind } from "./settingsBackups";
export { snapshotOnNextSave } from "./settingsSaveQueue";

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

export function getCurrentSettings(): Settings | null {
  return current;
}

export function subscribeSettings(listener: (s: Settings) => void): () => void {
  listeners.add(listener);
  if (current) listener(current);
  return () => listeners.delete(listener);
}
