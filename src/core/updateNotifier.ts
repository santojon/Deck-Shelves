import pkg from "../../package.json";
import { isOnline } from "./connectivity";
import { logInfo } from "../runtime/logger";

/**
 * GitHub-release update notifier — compares the bundled `pkg.version`
 * against the latest release of `santojon/Deck-Shelves`. Strictly
 * notification-only: no auto-update, no schema-changing fetch beyond a
 * single `releases/latest` GET per probe.
 *
 * Cache: 24h in localStorage (`ds-update-check-v1`). Cache hits skip the
 * network entirely. Failures (offline, 4xx, schema mismatch) silently
 * resolve to "no update available" so the UI never shows a broken banner.
 */

const CACHE_KEY = "ds-update-check-v1";
const RELEASES_URL = "https://api.github.com/repos/santojon/Deck-Shelves/releases/latest";
const FETCH_TIMEOUT_MS = 5000;

export interface UpdateCheckResult {
  /** True when `latestVersion` is strictly newer than the running build. */
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  /** ms timestamp the cached payload was written. */
  checkedAt: number;
}

interface CachedPayload { ts: number; latestVersion: string | null; releaseUrl: string | null; }

let inFlight: Promise<UpdateCheckResult> | null = null;

function readCache(): CachedPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
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

function writeCache(payload: CachedPayload): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch {}
}

/**
 * Strict-numeric semver compare. Returns 1 if `a > b`, -1 if `a < b`, 0 if
 * equal. Pre-release / build metadata is ignored (sufficient for
 * release-tag matching where pre-releases are unusual).
 */
export function compareSemver(a: string, b: string): number {
  const norm = (v: string) => v.replace(/^v/, "").split(/[+-]/, 1)[0];
  const pa = norm(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = norm(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const xa = pa[i] ?? 0;
    const xb = pb[i] ?? 0;
    if (xa > xb) return 1;
    if (xa < xb) return -1;
  }
  return 0;
}

function buildResult(latestVersion: string | null, releaseUrl: string | null, ts: number): UpdateCheckResult {
  const current = (pkg as any).version ?? "0.0.0";
  const hasUpdate = !!(latestVersion && compareSemver(latestVersion, current) > 0);
  return { hasUpdate, currentVersion: current, latestVersion, releaseUrl, checkedAt: ts };
}

async function fetchLatest(): Promise<{ version: string | null; url: string | null }> {
  const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(RELEASES_URL, {
      method: "GET",
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: ctrl?.signal,
    });
    if (!res.ok) return { version: null, url: null };
    const json = await res.json();
    const tag = typeof json?.tag_name === "string" ? json.tag_name.replace(/^v/, "") : null;
    const url = typeof json?.html_url === "string" ? json.html_url : null;
    return { version: tag, url };
  } catch {
    return { version: null, url: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Returns the current update status. Uses the 24h cache when warm; only
 * probes the network when the cache is expired AND `isOnline()` returns
 * true. Single-flight — concurrent callers share the in-flight result.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const now = Date.now();
  // QA harness: when `qa:update-available` is on, skip the cache + network
  // entirely and surface a fake "newer release" so the QAM banner renders.
  // Lazy-required so prod builds don't ship the harness module (dead-code
  // elimination removes this block when __DEV__ compiles to false).
  if (__DEV__) {
    try {
      const { qaForcedUpdateResult } = require("../qa/harness");
      const forced = typeof qaForcedUpdateResult === "function" ? qaForcedUpdateResult() : null;
      if (forced) return buildResult(forced.latestVersion, forced.releaseUrl, now);
    } catch {}
  }
  const cached = readCache();
  // Cache only serves as offline fallback. Whenever online we ALWAYS probe
  // the network so a release published mid-day shows up immediately — the
  // previous 24h gate left users stale for up to a day after a release.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const online = await isOnline();
      if (!online) {
        if (cached) return buildResult(cached.latestVersion, cached.releaseUrl, cached.ts);
        return buildResult(null, null, now);
      }
      const { version, url } = await fetchLatest();
      if (version) {
        writeCache({ ts: Date.now(), latestVersion: version, releaseUrl: url });
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

/** Test/QA helper — clears localStorage cache so the next probe re-fetches. */
export function __resetUpdateCheckCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
  inFlight = null;
}
