// Pure helpers for ordering shelves on the home — extracted from
// `HomeInject.tsx` so the algorithms can be unit-tested independently of
// the React tree, MutationObserver, and the Big Picture document.

type ShelfLike = { id: string; source?: { type?: string } } | null | undefined;

/**
 * Walk `shelves` in CONFIG order and return the id of the first shelf that's
 * currently rendering content (`renderedIds.has(sh.id)`).
 *
 * Prefers a non-smart shelf when one is rendering — `pickFirstVisibleShelfId`
 * was originally written to skip smart shelves entirely, but that left users
 * who only have smart shelves (or whose normal shelves all resolve to 0 apps)
 * with nothing in the promoted slot. Falling back to the first rendering
 * smart shelf keeps the slot occupied without changing the priority for
 * users who do have normal shelves.
 *
 * Returns `null` when no shelf in the config is rendering yet.
 */
export function pickFirstVisibleShelfId(
  shelves: readonly ShelfLike[],
  renderedIds: ReadonlySet<string>,
): string | null {
  let firstSmart: string | null = null;
  for (const sh of shelves ?? []) {
    if (!sh) continue;
    if (!renderedIds.has(sh.id)) continue;
    if (sh.source?.type === "smart") {
      if (firstSmart === null) firstSmart = sh.id;
      continue;
    }
    return sh.id;
  }
  return firstSmart;
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
