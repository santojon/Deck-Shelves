/**
 * Source-shape predicates used by both runtime (recentsReplace, shelf
 * actions) and UI (QAM list label). One canonical implementation per
 * check avoids drift between callers — three files used to carry their
 * own copies with subtly different semantics.
 */

import type { ShelfSource } from "../types";

/** True when the shelf source is wishlist/store, OR a composite source
 *  whose child set contains any wishlist/store entry. Recurses through
 *  nested composites (the resolver enforces a depth cap; this mirror
 *  walks the same shape lazily). */
export function isOnlineSource(source: ShelfSource | any): boolean {
  if (!source) return false;
  const t = source.type;
  if (t === "wishlist" || t === "store") return true;
  if (t === "composite" && Array.isArray(source.sources)) {
    return source.sources.some(isOnlineSource);
  }
  return false;
}
