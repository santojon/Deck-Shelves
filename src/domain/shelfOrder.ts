// Pure helpers for ordering shelves on the home — extracted from
// `HomeInject.tsx` so the algorithms can be unit-tested independently of
// the React tree, MutationObserver, and the Big Picture document.

type ShelfLike = { id: string; source?: { type?: string } } | null | undefined;

/**
 * Walk `shelves` in CONFIG order and return the id of the first non-smart
 * shelf that's currently rendering content (`renderedIds.has(sh.id)`).
 *
 * Returns `null` when no normal shelf in the config is rendering yet.
 *
 * Two reasons not to use a DOM-order scan:
 *   1. Skip empty/unresolved shelves so a 0-apps first shelf does not get
 *      promoted while another shelf's content sits below.
 *   2. Keep the candidate stable regardless of which shelf finishes
 *      resolving first — fast resolvers (often non-Steam shelves with light
 *      filtering) would steal the slot from a heavier first shelf otherwise.
 */
export function pickFirstVisibleShelfId(
  shelves: readonly ShelfLike[],
  renderedIds: ReadonlySet<string>,
): string | null {
  for (const sh of shelves ?? []) {
    if (!sh) continue;
    if (sh.source?.type === "smart") continue;
    if (renderedIds.has(sh.id)) return sh.id;
  }
  return null;
}

/**
 * Reorder `shelves` so smart shelves are interleaved between the promoted
 * first non-smart shelf and the rest. CSS `order` was tried but doesn't
 * affect gamepad/accessibility focus — DOM order matters for navigation.
 *
 * When `firstVisibleId` is `null`, or doesn't match any non-smart shelf,
 * returns the original array reference unchanged (callers depend on the
 * identity for memo equality).
 */
export function interleaveSmartShelves<T extends ShelfLike>(
  shelves: readonly T[],
  firstVisibleId: string | null,
): readonly T[] {
  if (!firstVisibleId) return shelves;
  const normals = shelves.filter((s) => s?.source?.type !== "smart") as T[];
  const smarts = shelves.filter((s) => s?.source?.type === "smart") as T[];
  const firstIdx = normals.findIndex((s) => s?.id === firstVisibleId);
  if (firstIdx < 0) return shelves;
  const first = normals[firstIdx];
  const rest = normals.filter((_, i) => i !== firstIdx);
  return [first, ...smarts, ...rest];
}
