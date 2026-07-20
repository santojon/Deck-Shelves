// Pure helpers for ordering shelves on the home — extracted from
// `HomeInject.tsx` so the algorithms can be unit-tested independently of
// the React tree, MutationObserver, and the Big Picture document.

type ShelfLike = { id: string; source?: { type?: string } } | null | undefined;

export function pickFirstVisibleShelfId(
  shelves: readonly ShelfLike[],
  renderedIds: ReadonlySet<string>,
): string | null {
  /* First shelf in CONFIG order that has rendered — regardless of source.
     Online (wishlist/store) and smart shelves are eligible for the promoted
     first slot, so a config-first shelf wins once it resolves. Only the
     native-recents *replacement* (recentsReplace.tsx) excludes online sources,
     since the native row can't host async network appids. */
  for (const sh of shelves ?? []) {
    if (sh && renderedIds.has(sh.id)) return sh.id;
  }
  return null;
}

/* Auto-pin: stable partition that floats every shelf whose `autoPin` predicate
   currently matches to the front, preserving relative order within each group.
   Returns the SAME array reference when nothing is pinned, so a home with no
   auto-pinned shelves is byte-for-byte unchanged (opt-in, zero regression). */
export function applyAutoPin<T>(shelves: readonly T[], isPinned: (s: T) => boolean): readonly T[] {
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const s of shelves) (isPinned(s) ? pinned : rest).push(s);
  return pinned.length ? [...pinned, ...rest] : shelves;
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
