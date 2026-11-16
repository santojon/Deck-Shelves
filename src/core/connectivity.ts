import { STEAM_STORE_BASE } from "../constants";

const PROBE_URL = `${STEAM_STORE_BASE}/favicon.ico`;
const PROBE_TIMEOUT_MS = 3000;
const TTL_MS = 10 * 1000;

let cachedResult: boolean | null = null;
let cachedAt = 0;
let inFlight: Promise<boolean> | null = null;

export function isOnline(): Promise<boolean> {
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
      // no-cors: the probe host sends no CORS headers, so a default fetch rejects even when it's reachable.
      const res = await fetch(PROBE_URL, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: ctrl?.signal });
      return res.ok || res.type === "opaque";
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export function __resetConnectivityCache(): void {
  cachedResult = null;
  cachedAt = 0;
  inFlight = null;
}
