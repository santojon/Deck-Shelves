/**
 * SteamOS version detection. Used to branch behavior that depends on
 * platform build (e.g. the native context-menu extraction path is only
 * viable on SteamOS ≤ 3.8 — on 3.9+ the native menu is built from
 * Menu/MenuItem primitives without a single `{overview, client}` template).
 */
let cachedVersion: string | null | undefined;

function readRawVersion(): string | null {
  try {
    const sc: any = (globalThis as any).SteamClient;
    const os = sc?.System?.GetOSVersion?.();
    if (typeof os === "string" && os.length) return os;
    if (typeof os === "number" && Number.isFinite(os)) return String(os);
  } catch {}
  try {
    const ds: any = (globalThis as any).SteamUIStore?.DeckySettings;
    const v = ds?.steamos_version ?? ds?.osVersion;
    if (typeof v === "string" && v.length) return v;
  } catch {}
  try {
    const ua = (globalThis as any).navigator?.userAgent as string | undefined;
    const m = ua?.match(/SteamOS\/(\d+\.\d+(?:\.\d+)?)/);
    if (m?.[1]) return m[1];
  } catch {}
  return null;
}

/** Returns the detected SteamOS version as a string (e.g. "3.9" or "3.7.21"), or null when unknown. */
export function getSteamOSVersion(): string | null {
  if (cachedVersion !== undefined) return cachedVersion ?? null;
  cachedVersion = readRawVersion();
  return cachedVersion;
}

/** Returns `true` when the device is on SteamOS ≥ 3.9, `false` for ≤ 3.8, `null` when unknown. */
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
