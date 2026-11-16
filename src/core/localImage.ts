// CEF blocks absolute paths and file:// URLs in Big Picture, so local images are read as base64 through the backend.
import { call } from "../runtime/host/decky";

interface ReadImageResult { ok: boolean; dataUrl?: string; }

const CACHE = new Map<string, string>();
const PENDING = new Map<string, Promise<string | null>>();
const CAP = 24;

function isAbsolutePosixPath(s: string): boolean {
  return typeof s === "string" && s.length > 0 && s.startsWith("/");
}

export function resolveLocalImage(value: string | undefined | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  if (!isAbsolutePosixPath(raw)) return raw;
  const cached = CACHE.get(raw);
  if (cached) return cached;
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

export function subscribeLocalImage(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
