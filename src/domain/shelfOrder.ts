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

type OrderSettings = { shelves?: { id: string }[]; smartShelves?: { id: string }[]; allShelvesOrder?: string[] | null };

// The unified list's order: the saved ids first, then any shelf the saved order does not name yet.
export function unifiedShelfIds(settings: OrderSettings): string[] {
  const all = [...(settings.shelves ?? []), ...(settings.smartShelves ?? [])].map((s) => s.id);
  const known = new Set(all);
  const saved = (settings.allShelvesOrder ?? []).filter((id) => known.has(id));
  const placed = new Set(saved);
  return [...saved, ...all.filter((id) => !placed.has(id))];
}

// Moves `id` past the next id that `shown` accepts, leaving the others where they are; null when there is none.
export function moveAmongShown(ids: readonly string[], id: string, direction: -1 | 1, shown: (id: string) => boolean): string[] | null {
  const from = ids.indexOf(id);
  if (from < 0) return null;
  let to = from + direction;
  while (to >= 0 && to < ids.length && !shown(ids[to])) to += direction;
  if (to < 0 || to >= ids.length) return null;
  const next = ids.filter((x) => x !== id);
  next.splice(next.indexOf(ids[to]) + (direction > 0 ? 1 : 0), 0, id);
  return next;
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
