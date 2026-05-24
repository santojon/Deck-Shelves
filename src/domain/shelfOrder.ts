// Pure helpers for ordering shelves on the home — extracted from
// `HomeInject.tsx` so the algorithms can be unit-tested independently of
// the React tree, MutationObserver, and the Big Picture document.

type ShelfLike = { id: string; source?: { type?: string } } | null | undefined;

/**
 * Walk `shelves` in CONFIG order and return the id of the first shelf that's
 * currently rendering content (`renderedIds.has(sh.id)`).
 *
 * Prefers a STRONG shelf — a local, non-smart shelf — over WEAK ones (smart
 * shelves and online wishlist/store shelves). Weak shelves are only returned
 * as a last-resort fallback when no strong shelf is rendering. Reasons:
 *  - Smart shelves appear/disappear heuristically, so the promoted slot's
 *    identity would flicker if they could claim it.
 *  - Online shelves render fast from their HTTP cache. On a cold Steam restart
 *    they finish before an earlier-config local shelf has resolved its app
 *    data, so a pure "first rendering" scan would hand the promoted slot to
 *    the online shelf — visibly "stealing" the top position until the local
 *    shelf catches up. Deferring them keeps the promoted slot on the user's
 *    intended local shelf.
 *
 * Returns `null` when no shelf in the config is rendering yet.
 */
export function pickFirstVisibleShelfId(
  shelves: readonly ShelfLike[],
  renderedIds: ReadonlySet<string>,
): string | null {
  let firstWeak: string | null = null;
  for (const sh of shelves ?? []) {
    if (!sh) continue;
    if (!renderedIds.has(sh.id)) continue;
    const t = sh.source?.type;
    if (t === "smart" || t === "wishlist" || t === "store") {
      if (firstWeak === null) firstWeak = sh.id;
      continue;
    }
    return sh.id;
  }
  return firstWeak;
}

/**
 * Reorder `shelves` so the promoted shelf comes first, then the remaining
 * smart shelves, then the remaining normal shelves. CSS `order` was tried
 * but doesn't affect gamepad/accessibility focus — DOM order matters for
 * navigation.
 *
 * The promoted shelf can now be either a normal shelf or a smart shelf
 * (when no normal shelf is rendering — see `pickFirstVisibleShelfId`).
 *
 * When `firstVisibleId` is `null` or doesn't match any shelf, returns the
 * original array reference unchanged (callers depend on the identity for
 * memo equality).
 */
export function interleaveSmartShelves<T extends ShelfLike>(
  shelves: readonly T[],
  firstVisibleId: string | null,
): readonly T[] {
  if (!firstVisibleId) return shelves;
  const promotedIdx = shelves.findIndex((s) => s?.id === firstVisibleId);
  if (promotedIdx < 0) return shelves;
  const promoted = shelves[promotedIdx];
  const rest = shelves.filter((_, i) => i !== promotedIdx);
  const restSmarts = rest.filter((s) => s?.source?.type === "smart") as T[];
  const restNormals = rest.filter((s) => s?.source?.type !== "smart") as T[];
  return [promoted, ...restSmarts, ...restNormals];
}
