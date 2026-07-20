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
  checkedAt: number;
}

interface CachedPayload { ts: number; latestVersion: string | null; releaseUrl: string | null; }

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

function buildResult(latestVersion: string | null, releaseUrl: string | null, ts: number): UpdateCheckResult {
  const current = (pkg as any).version ?? "0.0.0";
  const hasUpdate = !!(latestVersion && compareSemver(latestVersion, current) > 0);
  return { hasUpdate, currentVersion: current, latestVersion, releaseUrl, checkedAt: ts };
}

/* Pick the highest-precedence non-draft release from the `/releases` array
   (used by the beta channel, which includes pre-releases). */
function pickNewestRelease(json: any): { version: string | null; url: string | null } {
  if (!Array.isArray(json)) return { version: null, url: null };
  let best: { version: string; url: string | null } | null = null;
  for (const r of json) {
    if (r?.draft) continue;
    const tag = typeof r?.tag_name === "string" ? r.tag_name.replace(/^v/, "") : null;
    if (!tag) continue;
    if (!best || compareSemver(tag, best.version) > 0) {
      best = { version: tag, url: typeof r?.html_url === "string" ? r.html_url : null };
    }
  }
  return best ?? { version: null, url: null };
}

async function fetchLatest(beta: boolean): Promise<{ version: string | null; url: string | null }> {
  const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(beta ? RELEASES_ALL_URL : RELEASES_URL, {
      method: "GET",
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: ctrl?.signal,
    });
    if (!res.ok) return { version: null, url: null };
    const json = await res.json();
    // Beta: `/releases` returns an array (incl. pre-releases) — pick the
    // highest-precedence non-draft tag.
    if (beta) return pickNewestRelease(json);
    const tag = typeof json?.tag_name === "string" ? json.tag_name.replace(/^v/, "") : null;
    const url = typeof json?.html_url === "string" ? json.html_url : null;
    return { version: tag, url };
  } catch {
    return { version: null, url: null };
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
      if (forced) return buildResult(forced.latestVersion, forced.releaseUrl, now);
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
        if (cached) return buildResult(cached.latestVersion, cached.releaseUrl, cached.ts);
        return buildResult(null, null, now);
      }
      const { version, url } = await fetchLatest(beta);
      if (version) {
        writeCache(ck, { ts: Date.now(), latestVersion: version, releaseUrl: url });
        return buildResult(version, url, Date.now());
      }
      if (cached) return buildResult(cached.latestVersion, cached.releaseUrl, cached.ts);
      return buildResult(null, null, now);
    } catch (e) {
      logInfo("UPDATE", "checkForUpdate failed", String(e));
      if (cached) return buildResult(cached.latestVersion, cached.releaseUrl, cached.ts);
      return buildResult(null, null, now);
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
