import pkg from "../../package.json";
import { isOnline } from "./connectivity";
import { isOfflineModeOn } from "../components/ui/offlineMode";
import { logInfo } from "../runtime/logger";

const CACHE_KEY = "ds-update-check-v1";
const RELEASES_URL = "https://api.github.com/repos/santojon/Deck-Shelves/releases/latest";
// `/releases/latest` skips pre-releases, so the beta channel lists all releases.
const RELEASES_ALL_URL = "https://api.github.com/repos/santojon/Deck-Shelves/releases?per_page=30";
const FETCH_TIMEOUT_MS = 5000;

// Read from the settings cache to avoid importing the settings store.
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
  assetUrl: string | null;
  assetName: string | null;
  // The asset's `digest` from the release ("sha256:<hex>"); the download is refused without it.
  assetDigest: string | null;
  checkedAt: number;
}

interface CachedPayload {
  ts: number;
  latestVersion: string | null;
  releaseUrl: string | null;
  assetUrl: string | null;
  assetName: string | null;
  assetDigest: string | null;
}

interface ReleaseInfo {
  version: string | null;
  url: string | null;
  assetUrl: string | null;
  assetName: string | null;
  assetDigest: string | null;
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
      assetDigest: typeof parsed.assetDigest === "string" ? parsed.assetDigest : null,
    };
  } catch {
    return null;
  }
}

function writeCache(key: string, payload: CachedPayload): void {
  try { localStorage.setItem(key, JSON.stringify(payload)); } catch {}
}

// SemVer precedence, pre-release aware; build metadata is ignored.
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => {
    const s = v.replace(/^v/, "").split("+", 1)[0];
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
  if (!A.pre && !B.pre) return 0;
  if (!A.pre) return 1;
  if (!B.pre) return -1;
  return comparePreRelease(A.pre, B.pre);
}

// SemVer §11 pre-release ordering.
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

const EMPTY_INFO: ReleaseInfo = { version: null, url: null, assetUrl: null, assetName: null, assetDigest: null };

function cachedInfo(c: CachedPayload): ReleaseInfo {
  return { version: c.latestVersion, url: c.releaseUrl, assetUrl: c.assetUrl, assetName: c.assetName, assetDigest: c.assetDigest };
}

function buildResult(info: ReleaseInfo, ts: number): UpdateCheckResult {
  const current = (pkg as any).version ?? "0.0.0";
  const hasUpdate = !!(info.version && compareSemver(info.version, current) > 0);
  return {
    hasUpdate,
    currentVersion: current,
    latestVersion: info.version,
    releaseUrl: info.url,
    assetUrl: info.assetUrl,
    assetName: info.assetName,
    assetDigest: info.assetDigest,
    checkedAt: ts,
  };
}

function digestOf(asset: any): string | null {
  return typeof asset?.digest === "string" && asset.digest ? asset.digest : null;
}

function pickZipAsset(release: any): Pick<ReleaseInfo, "assetUrl" | "assetName" | "assetDigest"> {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  for (const a of assets) {
    const name = typeof a?.name === "string" ? a.name : "";
    if (!name.toLowerCase().endsWith(".zip")) continue;
    const url = typeof a?.browser_download_url === "string" ? a.browser_download_url : "";
    if (url) return { assetUrl: url, assetName: name, assetDigest: digestOf(a) };
  }
  return { assetUrl: null, assetName: null, assetDigest: null };
}

function releaseInfoOf(r: any): ReleaseInfo | null {
  if (r?.draft) return null;
  const tag = typeof r?.tag_name === "string" ? r.tag_name.replace(/^v/, "") : null;
  if (!tag) return null;
  return { version: tag, url: typeof r?.html_url === "string" ? r.html_url : null, ...pickZipAsset(r) };
}

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
    return (beta ? pickNewestRelease(json) : releaseInfoOf(json)) ?? EMPTY_INFO;
  } catch {
    return EMPTY_INFO;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const now = Date.now();
  // Lazy require so production builds don't ship the QA harness.
  if (__DEV__) {
    try {
      const { qaForcedUpdateResult } = require("../qa/harness");
      const forced = typeof qaForcedUpdateResult === "function" ? qaForcedUpdateResult() : null;
      if (forced) return buildResult({ version: forced.latestVersion, url: forced.releaseUrl, assetUrl: forced.assetUrl ?? null, assetName: forced.assetName ?? null, assetDigest: forced.assetDigest ?? null }, now);
    } catch {}
  }
  const beta = readBetaChannel();
  const ck = cacheKeyFor(beta);
  const cached = readCache(ck);
  // The cache is only an offline fallback; online checks always hit the network.
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
        writeCache(ck, { ts: Date.now(), latestVersion: info.version, releaseUrl: info.url, assetUrl: info.assetUrl, assetName: info.assetName, assetDigest: info.assetDigest });
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

export function openReleaseUrl(url: string | null | undefined): void {
  openExternalUrl(url);
}

export function openExternalUrl(url: string | null | undefined): void {
  if (!url) return;
  try {
    const sc: any = (globalThis as any).SteamClient;
    if (typeof sc?.System?.OpenInSystemBrowser === "function") sc.System.OpenInSystemBrowser(url);
    else (globalThis as any).window?.open?.(url, "_blank");
  } catch { /* swallow — best-effort external open */ }
}

