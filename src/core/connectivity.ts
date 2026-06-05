/**
 * Network availability primitive — `isOnline()` returns true when a 3s HEAD
 * to a Steam-owned, always-cached endpoint succeeds with 2xx.
 *
 * Single-flight: concurrent callers share the in-flight request.
 * 30s TTL: cached result reused until expiry; never throws; resolves false
 * on DNS failure, timeout, abort, or non-2xx.
 *
 * Demand-driven only — no polling, no boot probe, no listeners. Callers
 * invoke when they need a gate (update notifier, online-store fetcher).
 */
const PROBE_URL = "https://store.steampowered.com/favicon.ico";
const PROBE_TIMEOUT_MS = 3000;
const TTL_MS = 10 * 1000; // 10s — short enough to recover from startup false-negative

let cachedResult: boolean | null = null;
let cachedAt = 0;
let inFlight: Promise<boolean> | null = null;

export function isOnline(): Promise<boolean> {
  // QA harness: short-circuit to false when `qa:update-offline` is active
  // so the rest of the offline flow runs without unplugging the Deck. Lazy
  // require avoids pulling the harness module into production builds.
  if ((globalThis as any).__DEV__) {
    try {
      const { isQAUpdateOffline } = require("../qa/harness");
      if (typeof isQAUpdateOffline === "function" && isQAUpdateOffline()) return Promise.resolve(false);
    } catch {}
  }
  const now = Date.now();
  if (cachedResult !== null && now - cachedAt < TTL_MS) return Promise.resolve(cachedResult);
  if (inFlight) return inFlight;
  inFlight = probe().then((ok) => {
    cachedResult = ok;
    cachedAt = Date.now();
    inFlight = null;
    return ok;
  });
  return inFlight;
}

async function probe(): Promise<boolean> {
  try {
    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, PROBE_TIMEOUT_MS) : null;
    try {
      const res = await fetch(PROBE_URL, { method: "HEAD", cache: "no-store", signal: ctrl?.signal });
      // Opaque responses (CORS-blocked) indicate the server was reachable — count as online.
      return res.ok || res.type === "opaque";
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/** Test/QA helper — clears the cache so the next isOnline() probes again. */
export function __resetConnectivityCache(): void {
  cachedResult = null;
  cachedAt = 0;
  inFlight = null;
}
