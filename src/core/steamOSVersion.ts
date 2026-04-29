/**
 * SteamOS version detection. Used to branch behavior that depends on
 * platform build (e.g. the native context-menu extraction path on
 * SteamOS ≤ 3.7 vs 3.8/3.9).
 *
 * Detection sources, in priority:
 *   1. `SteamClient.System.GetOSVersion()` (3.8+ only — sync).
 *   2. `SteamUIStore.DeckySettings.steamos_version` (Decky-injected).
 *   3. UA `SteamOS/<x.y[.z]>` regex.
 *   4. `SteamClient.System.GetSystemInfo()` `sOSVersionId` (async — 3.7+,
 *      always present, only source available on 3.7.21).
 *
 * The first three are sync; the fourth is async and is prefetched at
 * plugin init via `prefetchSteamOSVersion()` so subsequent sync callers
 * (e.g. `useLegacyMenuFlow()` in `steamGameMenu.ts`) get a resolved value.
 */
let cachedVersion: string | null | undefined;
let prefetchPromise: Promise<string | null> | null = null;

function readRawVersionSync(): string | null {
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

/**
 * Eagerly resolve the OS version and cache it. Call once at plugin init —
 * after this resolves, `getSteamOSVersion()` returns the real value
 * synchronously even on SteamOS 3.7.x where the only source is the async
 * `GetSystemInfo()`.
 */
export async function prefetchSteamOSVersion(): Promise<string | null> {
  if (cachedVersion !== undefined) return cachedVersion ?? null;
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = readRawVersionAsync().then((v) => {
    cachedVersion = v;
    return v;
  });
  return prefetchPromise;
}

/**
 * Returns the detected SteamOS version as a string (e.g. "3.9" or "3.7.21"),
 * or `null` when unknown. Synchronous: returns from cache when populated by
 * `prefetchSteamOSVersion()`, otherwise tries the sync sources, otherwise
 * returns `null` and kicks off the async prefetch in the background.
 */
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

/**
 * Returns `true` when the device is on SteamOS ≥ 3.8 (or equivalent recent
 * SteamOS-fork build like Bazzite tracking SteamOS 3.8/3.9), `false` for
 * ≤ 3.7.x, `null` when the version can't be determined.
 *
 * Used to gate the modern menu-extraction path. Pre-3.8 SteamOS builds (e.g.
 * 3.7.21 stable) need the simpler flow because the cross-window
 * card anchor walk + prewarm + passive showContextMenu hook all assume the
 * 3.8+ runtime shape (multiple top-level documents, modern overlay timing).
 */
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

/**
 * Returns props to spread onto a `<Focusable>` to set its gamepad-nav
 * `flow-children` direction safely across SteamOS versions.
 *
 * On SteamOS ≤ 3.7, Steam's `library.js` throws `Assertion Failed:
 * Unhandled flow-children: <value>` whenever it sees an unknown direction
 * — that assertion bubbles up through React render and Decky's
 * ErrorBoundary catches it, leaving the surrounding panel blank (this is
 * how the QAM ends up empty on 3.7.21 once we add even one
 * `flow-children`-enabled Focusable). Returns `{}` (drops the prop
 * entirely) on `false` (≤ 3.7); on `null` (unknown) and `true` (≥ 3.8)
 * keeps the prop so the modern path is never regressed.
 */
export function flowChildrenProps(direction: "horizontal" | "vertical" | "column"):
  | { "flow-children": "horizontal" | "vertical" | "column" }
  | Record<string, never> {
  if (isSteamOS38OrLater() === false) return {};
  return { "flow-children": direction };
}
