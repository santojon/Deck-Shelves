import { call } from "../runtime/host/decky";
import { isHomeOwner } from "../runtime/host/ownerGuard";
import { SettingsSchema, type Settings } from "../types";
import { defaultSettings } from "../domain/defaults";
import { logError, logInfo, logWarn, setVerboseLogging } from "../runtime/logger";
import { applyQASettingsOverride, qaOverrideActive } from "../qa/harness";
import { SYNC_LISTS, LOCAL_ONLY_FIELDS } from "../domain/settingsMerge";

/* Bumping the cache key invalidates persisted localStorage entries from
   previous plugin versions in one shot. v3 forces a backend refetch on
   first load after upgrade — required because the backend sanitizer
   migrates legacy "Recently Played" shelves whose stale source the cache
   would otherwise keep alive across plugin reloads. */
const CACHE_KEY = 'deck-shelves-settings-cache-v3';
const SHARED_STATE_KEY = '__DECK_SHELVES_SHARED_SETTINGS__';

/* A QA-overridden payload (tagged `__dsQaOverride` by `applyQASettingsOverride`)
   must never be trusted as real data once its QA session ends — see
   `qaOverrideActive`'s doc comment for the incident this prevents: fixture
   data written to the cache can survive in localStorage past its QA build. */
function isUntrustedQaPayload(raw: unknown): boolean {
  return !qaOverrideActive && !!raw && typeof raw === "object" && (raw as any).__dsQaOverride === true;
}

function readCache(): Settings | null {
  try {
    // One-shot cleanup of pre-v3 cache entries so users upgrading from
    // older builds don't carry stale shelf sources forward.
    try { globalThis.localStorage?.removeItem('deck-shelves-settings-cache-v2'); } catch {}
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const rawParsed = JSON.parse(raw);
    if (isUntrustedQaPayload(rawParsed)) return null;
    const parsed = SettingsSchema.safeParse(rawParsed);
    // Apply migrations to cached payload too — same pre-v3 payload could
    // also be sitting at v3 if the user wrote it after the cache bump
    // before the migration shipped.
    return parsed.success ? migrate(parsed.data) : null;
  } catch {
    return null;
  }
}

function writeCache(s: Settings) {
  try { globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(s)); } catch {}
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
    (globalThis as any)[SHARED_STATE_KEY] = s;
  } catch {}
}

const _init = readCache() ?? readSharedState();
let current: Settings | null = _init ? applyQASettingsOverride(_init) : null;
/* Seeded here without going through notify(), so its side effects need
   repeating: sync verbose-logging, and write cache/shared-state so an
   active QA override is reflected immediately — otherwise notify()'s
   same-settings short-circuit (the override is deterministic) would leave
   both permanently stale for the whole session. */
setVerboseLogging((current as any)?.verboseLoggingEnabled === true);
if (current) { writeCache(current); writeSharedState(current); }
const listeners = new Set<(s: Settings) => void>();

/* Tracks whether the most recent saveSettings attempt actually reached the
   backend. When the backend hangs / returns false we flip this to false;
   while it is false, refreshSettings's background fetch stops overriding
   `current` so the user's pending changes survive even across plugin
   reloads. Persisted to localStorage so a remount doesn't drop the flag. */
const SAVE_OK_KEY = "deck-shelves-last-save-ok";
let lastSaveSucceeded = (() => {
  try { return globalThis.localStorage?.getItem(SAVE_OK_KEY) !== "0"; } catch { return true; }
})();
function markSaveResult(ok: boolean): void {
  lastSaveSucceeded = ok;
  try { globalThis.localStorage?.setItem(SAVE_OK_KEY, ok ? "1" : "0"); } catch {}
  try { (globalThis as any).__ds_last_save_ok = ok; } catch {}
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

function notify(raw: Settings) {
  const s = applyQASettingsOverride(raw);
  // Re-sync the logger flag on every notify, BEFORE the same-settings
  // short-circuit, so the boot path's notify(cached) applies it even when the
  // payload matches the seeded `current` (verbose state would otherwise stick).
  setVerboseLogging((s as any).verboseLoggingEnabled === true);
  if (isSameSettings(current, s)) {
    return;
  }
  current = s;
  writeCache(s);
  writeSharedState(s);
  logInfo("STORAGE", "notify settings", { enabled: s.enabled, shelfCount: s.shelves.length });
  listeners.forEach((listener) => listener(s));
  try {
    globalThis.dispatchEvent?.(new CustomEvent("deck-shelves-settings-changed", { detail: s }));
  } catch {}
}

/* One-time migrations applied to every settings load — runs against both
   the cached snapshot and freshly-fetched backend payloads, so users carry
   the fix forward regardless of where the stale data sits. Each migration
   MUST be idempotent. */
/* Current settings-document schema version (§4B). Bump when a migration below is
   added; older versions read a higher number and leave the doc untouched. */
export const SCHEMA_VERSION = 1;

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

/* Drop duplicate shelves / smart shelves by id. A cloud-sync or template path
   can append an entry that already exists (same id), which renders the shelf
   twice on the home — dedupe on every load so it self-heals (the next push
   then writes the cleaned list back to the cloud). Keeps the first occurrence. */
function dedupeShelves(s: Settings): Settings {
  const shelves = dedupeById(s.shelves ?? []);
  const smart = dedupeById((s as any).smartShelves ?? []);
  const changed = shelves.length !== (s.shelves?.length ?? 0)
    || smart.length !== ((s as any).smartShelves?.length ?? 0);
  return changed ? ({ ...s, shelves, smartShelves: smart } as Settings) : s;
}

const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000;
// Backfilled entities get a fixed low clock — any genuine future edit (Date.now)
// always beats it, and two devices' never-edited copies tie by content, not by
// which device happened to load first.
const BACKFILL_EPOCH = 1;

function stripStamp(e: any): string {
  const { updatedAt: _drop, ...rest } = e ?? {};
  return JSON.stringify(rest);
}

// The scalar bag = every field except the per-id sync lists and the sync
// bookkeeping / device-local fields. Serialized with sorted keys so key order
// never registers as a change.
function scalarBag(s: any): string {
  const skip = new Set<string>([...SYNC_LISTS, "syncTombstones", "preferencesUpdatedAt", ...LOCAL_ONLY_FIELDS]);
  const out: any = {};
  for (const k of Object.keys(s).sort()) if (!skip.has(k)) out[k] = s[k];
  return JSON.stringify(out);
}

/* Give any list entity that lacks a sync clock the fixed backfill epoch, and
   ensure the sync bookkeeping fields exist — so a pre-sync document merges
   deterministically without a one-time re-stamp on every device. Returns the
   same reference when nothing needed backfilling (identity-preserving). */
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

// Stamp one list vs its previous version: fresh clock on changed/new entities,
// a tombstone for every removed id, and clear the tombstone of a re-created one.
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

/* Central sync-stamping: bump `updatedAt` on every changed/new list entity,
   tombstone every removed id (and clear the tombstone of a re-created one), and
   bump `preferencesUpdatedAt` when any scalar changed — so settingsMerge can
   converge devices per-entity. Runs on every user save; sync-applied saves pass
   fromSync to skip it (they already carry authoritative stamps). */
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

export function migrate(s: Settings): Settings {
  const stored = s.schemaVersion ?? 0;
  // A NEWER version wrote this document — never migrate or downgrade it (return
  // untouched); its higher-schema fields survive via the preserve-unknown
  // sanitizer, and it already carries its own sync bookkeeping.
  if (stored > SCHEMA_VERSION) return s;
  s = dedupeShelves(s);
  s = backfillSyncStamps(s);
  let mutated = false;
  const shelves = s.shelves.map((sh) => {
    /* "Recently Played" template used to emit { type: "tab", tab: "recent" },
       but listLibraryTabs() never had a "recent" tab id — so the edit modal's
       dropdown couldn't match and the source field looked unset. Filter
       source with sort=recent reproduces the same behavior on the home and
       round-trips cleanly through the modal. */
    const src = sh.source as any;
    if (src && src.type === "tab" && src.tab === "recent") {
      mutated = true;
      return { ...sh, source: { type: "filter", filter: { sort: "recent" } } as any };
    }
    return sh;
  });
  const base = mutated ? { ...s, shelves } : s;
  // Stamp the current version — only ever bumps up (never downgrades).
  return stored === SCHEMA_VERSION ? base : { ...base, schemaVersion: SCHEMA_VERSION };
}

/* A single invalid field must NEVER nuke the whole config to defaults: that
   silently wipes the user's shelves and, once the empty state is saved back,
   destroys them on disk. Preserve the real data by merging the candidate over
   defaults so every field is present, and log the offending issues loudly. */
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

/* Cold boot can mount the home before the backend RPC bridge attaches, so the
   first get_settings throws "backend not ready" and the cold path below falls
   back to empty defaults. Retry with backoff until the backend answers, then
   notify — the home then populates on its own instead of only once the user
   opens the QAM (the sole-host "no shelves until I open the QAM" bug). */
function scheduleColdRetry(): void {
  if (coldRetryTimer != null || coldRetryAttempt >= COLD_RETRY_MAX) return;
  const delay = Math.min(500 * 2 ** coldRetryAttempt, 4000);
  coldRetryTimer = setTimeout(() => {
    coldRetryTimer = null;
    coldRetryAttempt += 1;
    call<[], unknown>("get_settings")
      .then((raw) => { coldRetryAttempt = 0; notify(normalize(raw)); })
      .catch(() => scheduleColdRetry());
  }, delay);
}

export async function refreshSettings(): Promise<Settings> {
  const cached = current ?? readCache() ?? readSharedState();
  if (cached) {
    notify(cached);
    // If the last save attempt failed (across plugin reloads — flag is
    // persisted), retry the cached state once on boot. Without this the
    // user's unsynced toggle would never propagate to disk.
    if (!lastSaveSucceeded) {
      logWarn("STORAGE", "retrying unsynced save on boot");
      saveSettings(cached).catch(() => {});
    }
    /* Snapshot the state we showed before kicking off the background read.
       If the user mutates anything while the call is in flight, `current`
       will diverge from this snapshot and we MUST keep the user's edits —
       the backend response is racing them and is necessarily stale. */
    const refreshAnchor = JSON.stringify(current);
    withTimeout(call<[], unknown>("get_settings"), 5000)
      .then((raw) => {
        const fromServer = normalize(raw);
        // 1) Save still unconfirmed → cache holds the user's pending edits.
        if (!lastSaveSucceeded && JSON.stringify(fromServer) !== JSON.stringify(current)) {
          logWarn("STORAGE", "background refresh suppressed (last save unconfirmed)");
          return;
        }
        /* 2) User mutated state mid-read → adopting the backend response
              would silently revert those edits even though they're being
              actively saved. Skip and let the next refresh pick them up
              once the save has settled. */
        if (JSON.stringify(current) !== refreshAnchor) {
          logWarn("STORAGE", "background refresh suppressed (state changed mid-read)");
          return;
        }
        notify(fromServer);
      })
      .catch((error) => { logWarn("STORAGE", "background refresh failed", String(error)); scheduleColdRetry(); });
    return cached;
  }
  try {
    logInfo("STORAGE", "refreshSettings requesting backend");
    const next = normalize(await withTimeout(call<[], unknown>("get_settings"), 8000));
    notify(next);
    return next;
  } catch (error) {
    logWarn("STORAGE", "refreshSettings failed", String(error));
    scheduleColdRetry();
    const next = current ?? readCache() ?? readSharedState() ?? defaultSettings();
    notify(next);
    return next;
  }
}

/* Coalesce rapid saveSettings calls: when a backend write is already in
   flight, queue the latest payload and let the resolver of every caller
   share the same outcome. Eliminates the queue of N RPC calls that piled
   up behind a slow plugin worker, each hitting its own 8 s timeout. */
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

/* Cloud-sync baseline: the user's settings with no profile override applied.
   A profile (manual or trigger) is a DEVICE-LOCAL presentation — a docked/showcase
   profile on one machine must not overwrite a handheld profile on another via
   cloud sync. So the moment a profile becomes active we snapshot the pre-override
   config here; cloud sync reads/writes THIS baseline (getSyncBasis), not the live
   override, and adopts merges into it (applySyncedBasis) while an override is on.
   In memory only — like the profile-trigger baseline, it does not survive a reload
   (a persisted override then syncs until the next profile transition). */
let syncBaseline: Settings | null = null;

function profileOverrideActive(s: Settings | null): boolean {
  return !!s && (s as any).activeProfileName != null;
}

export function setSyncBaseline(s: Settings | null): void {
  syncBaseline = s ? (JSON.parse(JSON.stringify(s)) as Settings) : null;
}

export function getSyncBaseline(): Settings | null {
  return syncBaseline;
}

/* What cloud sync operates on: the baseline while a profile override is active,
   else the live config. */
export function getSyncBasis(): Settings | null {
  return syncBaseline ?? current;
}

/* Adopt a cloud-merged basis. While a profile override is active, update only the
   baseline (the live override stays, so the device keeps showing its own profile);
   otherwise adopt it as the live config. */
export async function applySyncedBasis(merged: Settings): Promise<void> {
  if (syncBaseline) {
    setSyncBaseline(merged);
    return;
  }
  await saveSettings(merged, { fromSync: true });
}

export function saveSettings(next: Settings, opts?: { fromSync?: boolean }): Promise<boolean> {
  // Stamp per-entity sync clocks + tombstones from the diff vs the current state,
  // unless this is a sync-applied write (which already carries authoritative
  // stamps from the merge — re-stamping would clobber the other device's clocks).
  const stamped = opts?.fromSync ? next : stampChanges(current, next);
  // Track the profile-override baseline centrally so BOTH manual and trigger
  // profile applies (which all set `activeProfileName` through here) keep the
  // pre-override config as the cloud-sync basis. Snapshot it when a profile turns
  // on; clear it when the last one turns off. Sync-applied writes never toggle it.
  if (!opts?.fromSync) {
    const wasOverride = profileOverrideActive(current);
    const nowOverride = profileOverrideActive(stamped);
    if (!wasOverride && nowOverride) setSyncBaseline(current);
    else if (wasOverride && !nowOverride) setSyncBaseline(null);
  }
  // Never let a QA-overridden session reach the real backend — see
  // `qaOverrideActive`'s doc comment for the incident this guards against.
  // Replaces a narrower, two-flag version of this same check.
  if (qaOverrideActive) {
    logInfo("STORAGE", "saveSettings skipped (QA override active)");
    notify(stamped);
    return Promise.resolve(true);
  }
  // Always update local + cache + listeners immediately so the UI stays
  // responsive even while a slow backend write is pending.
  notify(stamped);
  return new Promise<boolean>((resolve) => {
    if (pendingSave) {
      pendingSave.next = stamped;
      pendingSave.resolvers.push(resolve);
    } else {
      pendingSave = { next: stamped, resolvers: [resolve] };
    }
    void flushPendingSave();
  });
}

async function runSave(next: Settings): Promise<boolean> {
  // Single-writer: a stood-down instance (dual-host install) never writes
  // settings — the owning instance is authoritative. The local notify()
  // already ran, so this instance's UI stays responsive.
  if (!isHomeOwner()) {
    logInfo("STORAGE", "saveSettings skipped — not the renderer owner (single-writer)");
    return true;
  }
  logInfo("STORAGE", "saveSettings start", { enabled: next.enabled, shelfCount: next.shelves.length });

  /* Single attempt with a single RPC. Previously this was 3 retries +
     a post-save get_settings verification, which on a slow backend stacked
     up to 6 timeouts per save and kept the UI in error-state for ~45s.
     The cache + `lastSaveSucceeded` flag handle one-off failures gracefully
     — the next user-triggered save will retry the write naturally. */
  try {
    const ok = await withTimeout(call<[unknown], boolean>("set_settings", { settings: next }), 8000);
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

export async function resetSettings(): Promise<Settings> {
  try {
    const next = normalize(await withTimeout(call<[], unknown>("reset_settings"), 8000));
    notify(next);
    return next;
  } catch {
    const next = defaultSettings();
    notify(next);
    return next;
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

export async function importSettingsFromFile(srcPath: string): Promise<Settings> {
  try {
    logInfo("STORAGE", "importSettingsFromFile start", { srcPath });
    const raw = await withTimeout(call<[unknown], unknown>("import_settings", { src_path: srcPath }), 15000);
    const next = normalize(raw);
    notify(next);
    logInfo("STORAGE", "importSettingsFromFile success", { enabled: next.enabled, shelfCount: next.shelves.length });
    return next;
  } catch (error) {
    logError("STORAGE", "importSettingsFromFile failed", String(error));
    const next = current ?? defaultSettings();
    notify(next);
    return next;
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

export async function restoreBackup(name: string): Promise<Settings | null> {
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
  try {
    const raw = await withTimeout(call<[], { backups?: BackupEntry[] }>("create_backup"), 8000);
    return Array.isArray(raw?.backups) ? raw.backups : [];
  } catch (error) {
    logError("STORAGE", "createSnapshot failed", String(error));
    return [];
  }
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
  try {
    const raw = await withTimeout(call<[], { backups?: BackupEntry[] }>("clear_backups"), 8000);
    return Array.isArray(raw?.backups) ? raw.backups : [];
  } catch (error) {
    logError("STORAGE", "clearBackups failed", String(error));
    return [];
  }
}

export async function importBackupFromFile(srcPath: string): Promise<BackupEntry[] | null> {
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

export function getCurrentSettings(): Settings | null {
  return current;
}

export function subscribeSettings(listener: (s: Settings) => void): () => void {
  listeners.add(listener);
  if (current) listener(current);
  return () => listeners.delete(listener);
}
