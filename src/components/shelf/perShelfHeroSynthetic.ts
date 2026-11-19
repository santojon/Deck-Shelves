// Only schemes safe for <img src>; anything else returns null.
const SAFE_HERO_SCHEMES = new Set(["http:", "https:", "blob:", "file:"]);
export function sanitizeHeroUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Rebuilt through URL so HTML meta-characters come out escaped.
  const base = (typeof location !== "undefined" && location.origin) ? location.origin : "https://steamloopback.host";
  let u: URL;
  try { u = new URL(s, base); } catch { return null; }
  const proto = u.protocol.toLowerCase();
  if (SAFE_HERO_SCHEMES.has(proto)) return u.href;
  // `data:` restricted to image MIME types so a `data:text/html,...` payload can't sneak in.
  if (proto === "data:" && u.href.toLowerCase().startsWith("data:image/")) return u.href;
  return null;
}

export function hashStringFastForHero(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  // Keeps the negated value clear of the Steam appid range.
  return ((h % 1_000_000) + 1);
}
