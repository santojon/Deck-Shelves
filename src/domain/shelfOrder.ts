// Pure helpers for ordering shelves on the home — extracted from
// `HomeInject.tsx` so the algorithms can be unit-tested independently of
// the React tree, MutationObserver, and the Big Picture document.

type ShelfLike = { id: string; source?: { type?: string } } | null | undefined;

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
