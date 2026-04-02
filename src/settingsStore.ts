import { call } from "@decky/api";
import type { Settings } from "./types";
import { SettingsSchema } from "./types";
import { defaultSettings } from "./domain/defaults";
import { logError, logInfo, logWarn } from "./runtime/logger";

const CACHE_KEY = 'deck-shelves-settings-cache-v2';
const SHARED_STATE_KEY = '__DECK_SHELVES_SHARED_SETTINGS__';

function readCache(): Settings | null {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = SettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
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

let current: Settings | null = readCache() ?? readSharedState();
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

function notify(s: Settings) {
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

function normalize(raw: unknown): Settings {
  const candidate = (raw && typeof raw === "object" && "state" in (raw as any)) ? (raw as any).state : raw;
  const parsed = SettingsSchema.safeParse(candidate);
  return parsed.success ? parsed.data : defaultSettings();
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
  logInfo("STORAGE", "saveSettings start", { enabled: next.enabled, shelfCount: next.shelves.length });
  notify(next);
  try {
    const ok = await withTimeout(call<[unknown], boolean>("set_settings", { settings: next }), 8000);
    if (ok) logInfo("STORAGE", "saveSettings success");
    else logWarn("STORAGE", "saveSettings backend returned false");
    return !!ok;
  } catch (error) {
    logError("STORAGE", "saveSettings failed", String(error));
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

export function getCurrentSettings(): Settings | null {
  return current;
}

export function subscribeSettings(listener: (s: Settings) => void): () => void {
  listeners.add(listener);
  if (current) listener(current);
  return () => listeners.delete(listener);
}
