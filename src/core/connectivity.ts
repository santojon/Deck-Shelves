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
      /* `no-cors` is required: the probe host sends no CORS headers, so a
         default-mode cross-origin fetch REJECTS ("Failed to fetch") instead of
         resolving — which made the opaque check below dead code and pinned
         isOnline() to false (breaking update checks + online features). With
         no-cors a reachable host resolves as an opaque response. */
      const res = await fetch(PROBE_URL, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: ctrl?.signal });
      // Opaque responses (CORS-blocked) indicate the server was reachable — count as online.
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
