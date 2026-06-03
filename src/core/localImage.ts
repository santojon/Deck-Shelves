// Local-image cache: maps a local filesystem path (e.g. `/home/deck/
// Pictures/foo.jpg`) to a `data:image/...;base64,...` URL the home
// shelf's `<img>` can actually load. CEF blocks bare absolute paths
// and `file://` URLs from the Big Picture context for security, so we
// route the read through the Python backend which returns base64.
//
// Cache is module-scoped + bounded: keeps the last ~24 entries (more
// than any reasonable shelf row can carry). Decoration card images
// rarely change between resolves, so this avoids re-issuing the RPC
// every render.
import { call } from "@decky/api";

interface ReadImageResult { ok: boolean; dataUrl?: string; }

const CACHE = new Map<string, string>();
const PENDING = new Map<string, Promise<string | null>>();
const CAP = 24;

function isAbsolutePosixPath(s: string): boolean {
  return typeof s === "string" && s.length > 0 && s.startsWith("/");
}

/**
 * Returns the displayable URL for a synthetic-card image value.
 *  - http(s):// URLs pass through unchanged (CDN art, etc.).
 *  - data: URLs pass through unchanged (already inline).
 *  - absolute local paths trigger the backend RPC, cached.
 * Returns `null` while the RPC is in flight; the caller re-renders
 * once the cache fills (helper exports a tiny subscribe hook for
 * components that need the latest mapping).
 */
export function resolveLocalImage(value: string | undefined | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  if (!isAbsolutePosixPath(raw)) return raw; // not local, hand back as-is
  const cached = CACHE.get(raw);
  if (cached) return cached;
  // Kick off a fetch if none in flight. Promise resolves the cache
  // entry; the caller polls via the subscribe path or re-renders on
  // its own state cadence.
  if (!PENDING.has(raw)) {
    const p = (call("read_image_b64", raw) as Promise<ReadImageResult>)
      .then((r) => {
        if (r?.ok && typeof r.dataUrl === "string") {
          if (CACHE.size >= CAP) {
            const firstKey = CACHE.keys().next().value as string | undefined;
            if (firstKey) CACHE.delete(firstKey);
          }
          CACHE.set(raw, r.dataUrl);
          notify();
          return r.dataUrl;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => { PENDING.delete(raw); });
    PENDING.set(raw, p);
  }
  return null;
}

const subs = new Set<() => void>();
function notify(): void { for (const fn of subs) try { fn(); } catch {} }

/** Subscribe to cache updates — components call this in a useEffect
 *  and force a re-render via the supplied callback. Unsubscribe on
 *  cleanup. Keeps the helper free of React imports. */
export function subscribeLocalImage(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
