
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
