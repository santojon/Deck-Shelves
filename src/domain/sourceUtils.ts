
import type { ShelfSource } from "../types";

export function isOnlineSource(source: ShelfSource | any): boolean {
  if (!source) return false;
  const t = source.type;
  if (t === "wishlist" || t === "store") return true;
  if (t === "composite" && Array.isArray(source.sources)) {
    return source.sources.some(isOnlineSource);
  }
  return false;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntity(whole: string, body: string): string {
  if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  const hex = body[1] === "x" || body[1] === "X";
  const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
}

// Steam's store search sends names HTML-encoded ("Popcorn &amp; Premieren"); one pass, so
// "&amp;lt;" becomes "&lt;". React escapes on display, so the decoded text is shown as is.
export function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity);
}
