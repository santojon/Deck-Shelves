import { type SteamAppDetails, type SteamHostWindow, steamClient } from "./internals";
import { getSteamWindows } from "./steamAccess";

/* Publisher and developer names per app, read from Steam's app details and cached (the developer cache persists across restarts). */

// Developer / Publisher data (from appDetailsStore)

const developerCache = new Map<number, string>();

// Persistent cache in localStorage to survive plugin reloads. Keys: appid -> developer string
const DEV_CACHE_KEY = 'deck-shelves-dev-cache-v1';

const DEV_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let devCacheSaveTimer: number | null = null;

function readDeveloperCachePayload(): { map: Record<string, unknown> } | null {
  try {
    const raw = globalThis.localStorage?.getItem(DEV_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const ts = Number(parsed.ts || 0);
    if (!ts || (Date.now() - ts) > DEV_CACHE_TTL_MS) return null;
    return { map: parsed.map || {} };
  } catch { return null; }
}

function loadDeveloperCacheFromStorage() {
  const payload = readDeveloperCachePayload();
  if (!payload) return;
  for (const k of Object.keys(payload.map)) {
    const id = Number(k);
    if (!Number.isNaN(id)) developerCache.set(id, String(payload.map[k] ?? ""));
  }
}

function persistDeveloperCacheToStorage() {
  try {
    const map: Record<string, string> = {};
    for (const [k, v] of developerCache.entries()) map[String(k)] = v;
    const payload = { ts: Date.now(), map };
    globalThis.localStorage?.setItem(DEV_CACHE_KEY, JSON.stringify(payload));
    if (devCacheSaveTimer) { clearTimeout(devCacheSaveTimer); devCacheSaveTimer = null; }
  } catch {}
}

function scheduleDeveloperCachePersist() {
  if (devCacheSaveTimer) return;
  // debounce write to avoid thrashing
  devCacheSaveTimer = setTimeout(() => { try { persistDeveloperCacheToStorage(); } catch {} }, 1000) as unknown as number;
}

// Initialize from storage
try { loadDeveloperCacheFromStorage(); } catch {}

export function clearDeveloperCache(): void {
  try {
    developerCache.clear();
    globalThis.localStorage?.removeItem(DEV_CACHE_KEY);
  } catch {}
}

function getAppDetailsStore(): any {
  for (const win of getSteamWindows() as Window[]) {
    const s = (win as any)?.appDetailsStore ?? (win as any)?.AppDetailsStore;
    if (s?.m_mapAppData) return s;
  }
  return null;
}

const publisherCache = new Map<number, string>();

export function getAppPublisherCached(appid: number): string {
  if (publisherCache.has(appid)) return publisherCache.get(appid)!;
  try {
    const store = getAppDetailsStore();
    const entry = store?.m_mapAppData?.get?.(appid);
    const pub: string = entry?.details?.strPublisherName ?? "";
    if (pub) publisherCache.set(appid, pub);
    return pub;
  } catch {
    return "";
  }
}

export async function preloadPublisherData(appids: number[]): Promise<void> {
  const sc = steamClient() ?? getSteamWindows().find((w: SteamHostWindow) => w?.SteamClient)?.SteamClient;
  if (!sc?.Apps?.RegisterForAppDetails) return;

  const uncached = appids.filter((id) => !publisherCache.has(id));
  if (!uncached.length) return;

  const BATCH = 30;
  const TIMEOUT_MS = 5000;

  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    await Promise.all(
      batch.map(
        (appid) =>
          new Promise<void>((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            try {
              const handle = sc?.Apps?.RegisterForAppDetails?.(appid, (details: SteamAppDetails) => {
                try { handle?.unregister?.(); } catch {}
                const pub: string = details?.strPublisherName ?? "";
                publisherCache.set(appid, pub);
                finish();
              });
              setTimeout(() => { try { handle?.unregister?.(); } catch {} finish(); }, TIMEOUT_MS);
            } catch { finish(); }
          }),
      ),
    );
  }
}

export function getUniquePublishers(appids: number[]): string[] {
  const set = new Set<string>();
  for (const id of appids) {
    const pub = getAppPublisherCached(id);
    if (pub) set.add(pub);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function getAppDeveloperCached(appid: number): string {
  if (developerCache.has(appid)) return developerCache.get(appid)!;
  try {
    const store = getAppDetailsStore();
    const entry = store?.m_mapAppData?.get?.(appid);
    const dev: string = entry?.details?.strDeveloperName ?? "";
    if (dev) developerCache.set(appid, dev);
    return dev;
  } catch {
    return "";
  }
}

export async function preloadDeveloperData(appids: number[]): Promise<void> {
  const sc = steamClient() ?? getSteamWindows().find((w: SteamHostWindow) => w?.SteamClient)?.SteamClient;
  if (!sc?.Apps?.RegisterForAppDetails) return;

  const uncached = appids.filter((id) => !developerCache.has(id));
  if (!uncached.length) return;

  const BATCH = 30;
  const TIMEOUT_MS = 5000;

  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH);
    await Promise.all(
      batch.map(
        (appid) =>
          new Promise<void>((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            try {
              const handle = sc?.Apps?.RegisterForAppDetails?.(appid, (details: SteamAppDetails) => {
                try { handle?.unregister?.(); } catch {}
                const dev: string = details?.strDeveloperName ?? "";
                if (dev) developerCache.set(appid, dev);
                else developerCache.set(appid, "");
                try { scheduleDeveloperCachePersist(); } catch {}
                finish();
              });
              setTimeout(() => { try { handle?.unregister?.(); } catch {} finish(); }, TIMEOUT_MS);
            } catch { finish(); }
          }),
      ),
    );
  }
}

export function getUniqueDevelopers(appids: number[]): string[] {
  const set = new Set<string>();
  for (const id of appids) {
    const dev = getAppDeveloperCached(id);
    if (dev) set.add(dev);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
