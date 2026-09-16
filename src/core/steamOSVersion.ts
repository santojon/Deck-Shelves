import { getPlatform } from "../runtime/platformContext";

let cachedVersion: string | null | undefined;
let prefetchPromise: Promise<string | null> | null = null;

function versionFromSteamClient(): string | null {
  try {
    const sc: any = (globalThis as any).SteamClient;
    const os = sc?.System?.GetOSVersion?.();
    if (typeof os === "string" && os.length) return os;
    if (typeof os === "number" && Number.isFinite(os)) return String(os);
  } catch {}
  return null;
}

// Routed through the host contract (getPlatform().getOSVersion) instead of a
// hardcoded Decky global read — a Decky-adapter-internal fallback resolves
// there (see deckyPlatform.ts), and it's a no-op under any other host.
function versionFromHostPlatform(): string | null {
  try {
    const v = getPlatform()?.getOSVersion?.();
    if (typeof v === "string" && v.length) return v;
  } catch {}
  return null;
}

function versionFromUserAgent(): string | null {
  try {
    const ua = (globalThis as any).navigator?.userAgent as string | undefined;
    const m = ua?.match(/SteamOS\/(\d+\.\d+(?:\.\d+)?)/);
    if (m?.[1]) return m[1];
  } catch {}
  return null;
}

// Sync SteamOS-version sources in priority order (first hit wins).
function readRawVersionSync(): string | null {
  return versionFromSteamClient() ?? versionFromHostPlatform() ?? versionFromUserAgent();
}

async function readRawVersionAsync(): Promise<string | null> {
  // Sync sources first — cheaper.
  const sync = readRawVersionSync();
  if (sync) return sync;
  // Last resort: GetSystemInfo. Only source available on SteamOS 3.7.x;
  // also exists on 3.8/3.9 but the sync sources resolve first there.
  try {
    const sc: any = (globalThis as any).SteamClient;
    const info = await sc?.System?.GetSystemInfo?.();
    const v = info?.sOSVersionId;
    if (typeof v === "string" && v.length) return v;
  } catch {}
  return null;
}

export async function prefetchSteamOSVersion(): Promise<string | null> {
  if (cachedVersion !== undefined) return cachedVersion ?? null;
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = readRawVersionAsync().then((v) => {
    cachedVersion = v;
    return v;
  });
  return prefetchPromise;
}

export function getSteamOSVersion(): string | null {
  if (cachedVersion !== undefined) return cachedVersion ?? null;
  const sync = readRawVersionSync();
  if (sync) {
    cachedVersion = sync;
    return cachedVersion;
  }
  // Kick off async prefetch so subsequent calls hit the cache.
  void prefetchSteamOSVersion();
  return null;
}

export function isSteamOS39OrLater(): boolean | null {
  const v = getSteamOSVersion();
  if (!v) return null;
  const m = v.match(/^(\d+)\.(\d+)/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return major > 3 || (major === 3 && minor >= 9);
}

export function isSteamOS38OrLater(): boolean | null {
  const v = getSteamOSVersion();
  if (!v) return null;
  const m = v.match(/^(\d+)\.(\d+)/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return major > 3 || (major === 3 && minor >= 8);
}

export function flowChildrenProps(_direction: "horizontal" | "vertical" | "column"):
  Record<string, never> {
  return {};
}
