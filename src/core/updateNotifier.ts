import pkg from "../../package.json";
import { isOnline } from "./connectivity";
import { isOfflineModeOn } from "../components/ui/offlineMode";
import { logInfo } from "../runtime/logger";

const CACHE_KEY = "ds-update-check-v1";
const RELEASES_URL = "https://api.github.com/repos/santojon/Deck-Shelves/releases/latest";
// Beta channel lists ALL releases (incl. pre-releases) and picks the newest;
// `/releases/latest` deliberately skips pre-releases for stable users.
const RELEASES_ALL_URL = "https://api.github.com/repos/santojon/Deck-Shelves/releases?per_page=30";
const FETCH_TIMEOUT_MS = 5000;

/* Read the opt-in beta channel from the settings cache without importing the
   settings store (keeps updateNotifier free of UI coupling). Mirrors how the
   hero code reads forceCssLoaderThemes. */
function readBetaChannel(): boolean {
  try {
    const raw = (globalThis as any)?.localStorage?.getItem("deck-shelves-settings-cache-v3");
    if (!raw) return false;
    return JSON.parse(raw)?.betaChannelEnabled === true;
  } catch { return false; }
}

function cacheKeyFor(beta: boolean): string {
  return beta ? `${CACHE_KEY}-beta` : CACHE_KEY;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  /** Direct download URL for the release .zip asset (manual-install download). */
  assetUrl: string | null;
  /** Bare filename of that asset, used as the download destination name. */
  assetName: string | null;
  checkedAt: number;
}

interface CachedPayload {
  ts: number;
  latestVersion: string | null;
  releaseUrl: string | null;
  assetUrl: string | null;
  assetName: string | null;
}

interface ReleaseInfo {
  version: string | null;
  url: string | null;
  assetUrl: string | null;
  assetName: string | null;
}

let inFlight: Promise<UpdateCheckResult> | null = null;

function readCache(key: string): CachedPayload | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.ts !== "number") return null;
    return {
      ts: parsed.ts,
      latestVersion: typeof parsed.latestVersion === "string" ? parsed.latestVersion : null,
      releaseUrl: typeof parsed.releaseUrl === "string" ? parsed.releaseUrl : null,
      assetUrl: typeof parsed.assetUrl === "string" ? parsed.assetUrl : null,
      assetName: typeof parsed.assetName === "string" ? parsed.assetName : null,
    };
  } catch {
    return null;
  }
}

function writeCache(key: string, payload: CachedPayload): void {
  try { localStorage.setItem(key, JSON.stringify(payload)); } catch {}
}

/* SemVer precedence comparison, pre-release aware so a beta tester on
   3.0.0-beta.2 is correctly offered 3.0.0 (release > pre-release) and
   3.0.0-beta.3 (beta.3 > beta.2). Build metadata (`+sha`) is ignored. */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => {
    const s = v.replace(/^v/, "").split("+", 1)[0]; // strip build metadata
    const dash = s.indexOf("-");
    const core = dash >= 0 ? s.slice(0, dash) : s;
    const pre = dash >= 0 ? s.slice(dash + 1) : null;
    return { nums: core.split(".").map((n) => parseInt(n, 10) || 0), pre };
  };
  const A = parse(a), B = parse(b);
  const len = Math.max(A.nums.length, B.nums.length);
  for (let i = 0; i < len; i++) {
    const xa = A.nums[i] ?? 0, xb = B.nums[i] ?? 0;
    if (xa > xb) return 1;
    if (xa < xb) return -1;
  }
  // Numeric core equal: a release (no pre-release tag) outranks a pre-release.
  if (!A.pre && !B.pre) return 0;
  if (!A.pre) return 1;
  if (!B.pre) return -1;
  return comparePreRelease(A.pre, B.pre);
}

/* Compare two pre-release strings ('beta.2' vs 'rc.1') per SemVer §11: dot
   identifiers compared left-to-right; numeric < alphanumeric; fewer
   identifiers sorts lower when otherwise equal. alpha < beta < rc falls out of
   the ASCII compare. */
// Compare one dot-separated pre-release identifier per SemVer §11: a missing
// identifier has lower precedence; numeric < alphanumeric; else lexical.
function comparePreReleaseId(x: string | undefined, y: string | undefined): number {
  if (x === undefined) return -1;
  if (y === undefined) return 1;
  const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
  if (nx && ny) {
    return Math.sign(parseInt(x, 10) - parseInt(y, 10));
  }
  if (nx !== ny) return nx ? -1 : 1;
  return x === y ? 0 : (x < y ? -1 : 1);
}

function comparePreRelease(a: string, b: string): number {
  const pa = a.split("."), pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const c = comparePreReleaseId(pa[i], pb[i]);
    if (c !== 0) return c;
  }
  return 0;
}

const EMPTY_INFO: ReleaseInfo = { version: null, url: null, assetUrl: null, assetName: null };

function cachedInfo(c: CachedPayload): ReleaseInfo {
  return { version: c.latestVersion, url: c.releaseUrl, assetUrl: c.assetUrl, assetName: c.assetName };
}

function buildResult(info: Pick<ReleaseInfo, "version" | "url" | "assetUrl" | "assetName">, ts: number): UpdateCheckResult {
  const current = (pkg as any).version ?? "0.0.0";
  const hasUpdate = !!(info.version && compareSemver(info.version, current) > 0);
  return {
    hasUpdate,
    currentVersion: current,
    latestVersion: info.version,
    releaseUrl: info.url,
    assetUrl: info.assetUrl,
    assetName: info.assetName,
    checkedAt: ts,
  };
}

/* Pick the first `.zip` asset off a release object's `assets[]` — the plugin
   package the manual-update download saves to ~/Downloads. */
function pickZipAsset(release: any): { assetUrl: string | null; assetName: string | null } {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  for (const a of assets) {
    const name = typeof a?.name === "string" ? a.name : "";
    if (!name.toLowerCase().endsWith(".zip")) continue;
    const url = typeof a?.browser_download_url === "string" ? a.browser_download_url : "";
    if (url) return { assetUrl: url, assetName: name };
  }
  return { assetUrl: null, assetName: null };
}

/* Normalize a single GitHub release object into ReleaseInfo, or null when it
   is a draft / has no tag. Shared by the beta (array) and stable (single) paths. */
function releaseInfoOf(r: any): ReleaseInfo | null {
  if (r?.draft) return null;
  const tag = typeof r?.tag_name === "string" ? r.tag_name.replace(/^v/, "") : null;
  if (!tag) return null;
  return { version: tag, url: typeof r?.html_url === "string" ? r.html_url : null, ...pickZipAsset(r) };
}

/* Pick the highest-precedence non-draft release from the `/releases` array
   (used by the beta channel, which includes pre-releases). */
function pickNewestRelease(json: any): ReleaseInfo {
  if (!Array.isArray(json)) return EMPTY_INFO;
  let best: ReleaseInfo | null = null;
  for (const r of json) {
    const info = releaseInfoOf(r);
    if (info && (!best || compareSemver(info.version as string, best.version as string) > 0)) best = info;
  }
  return best ?? EMPTY_INFO;
}

async function fetchLatest(beta: boolean): Promise<ReleaseInfo> {
  const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(beta ? RELEASES_ALL_URL : RELEASES_URL, {
      method: "GET",
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: ctrl?.signal,
    });
    if (!res.ok) return EMPTY_INFO;
    const json = await res.json();
    // Beta: `/releases` returns an array (incl. pre-releases) — pick the
    // highest-precedence non-draft tag. Stable: a single release object.
    return (beta ? pickNewestRelease(json) : releaseInfoOf(json)) ?? EMPTY_INFO;
  } catch {
    return EMPTY_INFO;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const now = Date.now();
  /* QA harness: when `qa:update-available` is on, skip the cache + network
     entirely and surface a fake "newer release" so the QAM banner renders.
     Lazy-required so prod builds don't ship the harness module (dead-code
     elimination removes this block when __DEV__ compiles to false). */
  if (__DEV__) {
    try {
      const { qaForcedUpdateResult } = require("../qa/harness");
      const forced = typeof qaForcedUpdateResult === "function" ? qaForcedUpdateResult() : null;
      if (forced) return buildResult({ version: forced.latestVersion, url: forced.releaseUrl, assetUrl: forced.assetUrl ?? null, assetName: forced.assetName ?? null }, now);
    } catch {}
  }
  const beta = readBetaChannel();
  const ck = cacheKeyFor(beta);
  const cached = readCache(ck);
  // Cache only serves as offline fallback. Whenever online we ALWAYS probe
  // the network so a release published mid-day shows up immediately — the
  // previous 24h gate left users stale for up to a day after a release.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const online = !isOfflineModeOn() && await isOnline();
      if (!online) {
        if (cached) return buildResult(cachedInfo(cached), cached.ts);
        return buildResult(EMPTY_INFO, now);
      }
      const info = await fetchLatest(beta);
      if (info.version) {
        writeCache(ck, { ts: Date.now(), latestVersion: info.version, releaseUrl: info.url, assetUrl: info.assetUrl, assetName: info.assetName });
        return buildResult(info, Date.now());
      }
      if (cached) return buildResult(cachedInfo(cached), cached.ts);
      return buildResult(EMPTY_INFO, now);
    } catch (e) {
      logInfo("UPDATE", "checkForUpdate failed", String(e));
      if (cached) return buildResult(cachedInfo(cached), cached.ts);
      return buildResult(EMPTY_INFO, now);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function __resetUpdateCheckCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
  try { localStorage.removeItem(`${CACHE_KEY}-beta`); } catch {}
  inFlight = null;
}

/* Centralized "view this release" action. The update banner button, the
   update toast, and the settings/about update icon all route through here so
   the behaviour stays in one place (open the release notes in the system
   browser, falling back to window.open). No-op when the URL is missing. */
export function openReleaseUrl(url: string | null | undefined): void {
  openExternalUrl(url);
}

/* Open any URL in the system browser (falling back to window.open). Best-effort
   and no-op on a missing URL — shared by the release action and the diagnostics
   "report an issue" button. */
export function openExternalUrl(url: string | null | undefined): void {
  if (!url) return;
  try {
    const sc: any = (globalThis as any).SteamClient;
    if (typeof sc?.System?.OpenInSystemBrowser === "function") sc.System.OpenInSystemBrowser(url);
    else (globalThis as any).window?.open?.(url, "_blank");
  } catch { /* swallow — best-effort external open */ }
}

/* Test hooks (stripped from release builds by `__DEV__`). The update UI suite
   drives the real check + connectivity probe on-device so a regression in the
   notifier or the isOnline no-cors fix surfaces as a failing test. */
if (__DEV__) {
  try {
    const g = globalThis as any;
    g.__ds_dev_check_update = () => { __resetUpdateCheckCache(); return checkForUpdate(); };
    g.__ds_dev_is_online = () => isOnline();
  } catch { /* best-effort */ }
}
