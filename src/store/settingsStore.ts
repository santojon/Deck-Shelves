import { call } from "../runtime/host/decky";
import { SettingsSchema, type Settings } from "../types";
import { defaultSettings } from "../domain/defaults";
import { logError, logInfo, logWarn, setVerboseLogging } from "../runtime/logger";
import { applyQASettingsOverride } from "../qa/harness";

/* Bumping the cache key invalidates persisted localStorage entries from
   previous plugin versions in one shot. v3 forces a backend refetch on
   first load after upgrade — required because the backend sanitizer
   migrates legacy "Recently Played" shelves whose stale source the cache
   would otherwise keep alive across plugin reloads. */
const CACHE_KEY = 'deck-shelves-settings-cache-v3';
const SHARED_STATE_KEY = '__DECK_SHELVES_SHARED_SETTINGS__';

function readCache(): Settings | null {
  try {
    // One-shot cleanup of pre-v3 cache entries so users upgrading from
    // older builds don't carry stale shelf sources forward.
    try { globalThis.localStorage?.removeItem('deck-shelves-settings-cache-v2'); } catch {}
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = SettingsSchema.safeParse(JSON.parse(raw));
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
// Sync verbose-logging from the cached settings at module load — `current` is
// seeded here without going through `notify()`, so without this the logger
// flag stays false after a Steam restart until a setting actually changes.
setVerboseLogging((current as any)?.verboseLoggingEnabled === true);
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
function migrate(s: Settings): Settings {
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
  return mutated ? { ...s, shelves } : s;
}

function normalize(raw: unknown): Settings {
  const candidate = (raw && typeof raw === "object" && "state" in (raw as any)) ? (raw as any).state : raw;
  const parsed = SettingsSchema.safeParse(candidate);
  return migrate(parsed.success ? parsed.data : defaultSettings());
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
      .catch((error) => logWarn("STORAGE", "background refresh failed", String(error)));
    return cached;
  }
  try {
    logInfo("STORAGE", "refreshSettings requesting backend");
    const next = normalize(await withTimeout(call<[], unknown>("get_settings"), 8000));
    notify(next);
    return next;
  } catch (error) {
    logWarn("STORAGE", "refreshSettings failed", String(error));
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
    if (pendingSave) flushPendingSave();
  }
}

export function saveSettings(next: Settings): Promise<boolean> {
  if (__DEV__ && ((typeof __QA_ALL_SHELVES_HIDE_RECENTS__ !== "undefined" && __QA_ALL_SHELVES_HIDE_RECENTS__) || (typeof __QA_ALL_SHELVES_SHOW_RECENTS__ !== "undefined" && __QA_ALL_SHELVES_SHOW_RECENTS__))) {
    logInfo("STORAGE", "saveSettings skipped (QA all-shelves override active)");
    notify(next);
    return Promise.resolve(true);
  }
  // Always update local + cache + listeners immediately so the UI stays
  // responsive even while a slow backend write is pending.
  notify(next);
  return new Promise<boolean>((resolve) => {
    if (pendingSave) {
      pendingSave.next = next;
      pendingSave.resolvers.push(resolve);
    } else {
      pendingSave = { next, resolvers: [resolve] };
    }
    flushPendingSave();
  });
}

async function runSave(next: Settings): Promise<boolean> {
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
