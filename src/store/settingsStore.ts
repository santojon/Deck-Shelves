import { call } from "../runtime/host/decky";
import { SettingsSchema, type Settings } from "../types";
import { defaultSettings } from "../domain/defaults";
import { logError, logInfo, logWarn } from "../runtime/logger";
import { applyQASettingsOverride } from "../qa/harness";

// Bumping the cache key invalidates persisted localStorage entries from
// previous plugin versions in one shot. v3 forces a backend refetch on
// first load after upgrade — required because the backend sanitizer
// migrates legacy "Recently Played" shelves whose stale source the cache
// would otherwise keep alive across plugin reloads.
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
const listeners = new Set<(s: Settings) => void>();

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

// One-time migrations applied to every settings load — runs against both
// the cached snapshot and freshly-fetched backend payloads, so users carry
// the fix forward regardless of where the stale data sits. Each migration
// MUST be idempotent.
function migrate(s: Settings): Settings {
  let mutated = false;
  const shelves = s.shelves.map((sh) => {
    // "Recently Played" template used to emit { type: "tab", tab: "recent" },
    // but listLibraryTabs() never had a "recent" tab id — so the edit modal's
    // dropdown couldn't match and the source field looked unset. Filter
    // source with sort=recent reproduces the same behavior on the home and
    // round-trips cleanly through the modal.
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
    withTimeout(call<[], unknown>("get_settings"), 5000)
      .then((raw) => notify(normalize(raw)))
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

export async function saveSettings(next: Settings): Promise<boolean> {
  if (__DEV__ && ((typeof __QA_ALL_SHELVES_HIDE_RECENTS__ !== "undefined" && __QA_ALL_SHELVES_HIDE_RECENTS__) || (typeof __QA_ALL_SHELVES_SHOW_RECENTS__ !== "undefined" && __QA_ALL_SHELVES_SHOW_RECENTS__))) {
    logInfo("STORAGE", "saveSettings skipped (QA all-shelves override active)");
    notify(next);
    return true;
  }
  logInfo("STORAGE", "saveSettings start", { enabled: next.enabled, shelfCount: next.shelves.length });
  notify(next);
  const payload = JSON.stringify(next);
  const sizeKb = Math.round((new Blob([payload]).size || payload.length) / 1024);
  logInfo("STORAGE", "saveSettings payload_size_kb", { sizeKb });

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const ok = await withTimeout(call<[unknown], boolean>("set_settings", { settings: next }), 8000);
      if (!ok) {
        logWarn("STORAGE", `saveSettings backend returned false (attempt ${attempt})`);
        try { (globalThis as any).__ds_save_last_err = { kind: "backend-false", attempt, at: Date.now() }; } catch {}
        if (attempt < maxRetries) continue;
        return false;
      }

      // Verify server-side state matches what we attempted to save.
      try {
        const serverRaw = await withTimeout(call<[], unknown>("get_settings"), 5000);
        const serverNorm = normalize(serverRaw);
        const sentJson = JSON.stringify(next);
        const backJson = JSON.stringify(serverNorm);
        if (backJson !== sentJson) {
          // Diff which top-level keys mismatch so we can debug round-trip
          // losses (sanitiser stripping a field, order skew, etc.)
          const diffs: string[] = [];
          try {
            const a = next as any; const b = serverNorm as any;
            const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
            for (const k of ks) {
              if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) diffs.push(k);
            }
          } catch {}
          logWarn("STORAGE", `post-save verification mismatch (attempt ${attempt})`, { serverShelves: serverNorm.shelves.length, localShelves: next.shelves.length, diffKeys: diffs.slice(0, 10) });
          try { (globalThis as any).__ds_save_last_err = { kind: "verify-mismatch", attempt, at: Date.now(), diffKeys: diffs.slice(0, 20), serverRaw: typeof serverRaw === "object" ? Object.keys(serverRaw as any) : null }; } catch {}
          if (attempt < maxRetries) continue;
        }
      } catch (verErr) {
        logWarn("STORAGE", `post-save verification failed (attempt ${attempt})`, String(verErr));
        try { (globalThis as any).__ds_save_last_err = { kind: "verify-throw", attempt, at: Date.now(), err: String(verErr) }; } catch {}
        // If verification fails, don't immediately treat as fatal; only retry a few times.
        if (attempt < maxRetries) continue;
      }

      logInfo("STORAGE", "saveSettings success");
      return true;
    } catch (error) {
      logError("STORAGE", `saveSettings failed (attempt ${attempt})`, String(error));
      try { (globalThis as any).__ds_save_last_err = { kind: "call-throw", attempt, at: Date.now(), err: String(error) }; } catch {}
      if (attempt < maxRetries) continue;
      return false;
    }
  }
  return false;
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
