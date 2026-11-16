type ShelfLike = { id: string; source?: { type?: string } } | null | undefined;

export function pickFirstVisibleShelfId(
  shelves: readonly ShelfLike[],
  renderedIds: ReadonlySet<string>,
): string | null {
  for (const sh of shelves ?? []) {
    if (sh && renderedIds.has(sh.id)) return sh.id;
  }
  return null;
}

// Wait for every shelf (or a timeout) before picking the first, or the hero flashes while earlier shelves catch up.
// Empty shelves never render, so a count that stopped growing is treated as settled.
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

export function revealableInOrder(orderedIds: readonly string[], renderedIds: ReadonlySet<string>, resolvedIds: ReadonlySet<string> = renderedIds): string[] {
  const out: string[] = [];
  for (const id of orderedIds) {
    if (renderedIds.has(id)) out.push(id);
    else if (!resolvedIds.has(id)) break;
  }
  return out;
}

// Returns the same array when nothing is pinned.
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
