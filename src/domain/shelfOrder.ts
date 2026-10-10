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

/* Shelves resolve progressively — committing `firstVisibleId` to whichever
   renders FIRST flashes the wrong per-shelf hero as an earlier-config shelf
   catches up (confirmed live, 2026-10-07). Hold the commit until every
   configured shelf has rendered once, or a bounded timeout elapses (a shelf
   that never resolves shouldn't block promotion forever). */
/* `stableForMs` = how long `renderedCount` has held steady. A shelf that
   resolves to nothing never renders at all (no friends playing, an empty
   smart-shelf match), so an exact count match can be UNREACHABLE — waiting for
   it stalled the reveal for the entire timeout on every load. A count that has
   stopped growing, with something on screen, is settled. */
export const SHELF_SET_QUIESCE_MS = 700;

export function isShelfSetSettled(
  renderedCount: number,
  totalCount: number,
  elapsedMs: number,
  timeoutMs: number,
  stableForMs?: number,
): boolean {
  if (renderedCount >= totalCount || elapsedMs >= timeoutMs) return true;
  return renderedCount > 0 && (stableForMs ?? 0) >= SHELF_SET_QUIESCE_MS;
}

/* Progressive reveal in final order: the leading run of shelves that have
   already rendered, skipping shelves that resolved to nothing (they never
   render) and stopping at the first one still loading. Nothing is ever
   inserted above a shelf that is already on screen, so there is no reorder;
   a slow shelf holds back only what follows it. */
export function revealableInOrder(orderedIds: readonly string[], renderedIds: ReadonlySet<string>, resolvedIds: ReadonlySet<string> = renderedIds): string[] {
  const out: string[] = [];
  for (const id of orderedIds) {
    if (renderedIds.has(id)) out.push(id);
    else if (!resolvedIds.has(id)) break;
  }
  return out;
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
