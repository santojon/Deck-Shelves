/* Which cards of a horizontal row to mount: the visible span plus an overscan
   on each side, widened to include an anchor index (a pending focus-restore
   target) so the card the user returns to always exists. Pure math over the
   row's scroll offset and the regular card slot width; a row with featured
   (wider) cards gets a larger overscan so the estimate stays conservative. */
export type CardWindow = { start: number; end: number };

export function computeCardWindow(p: {
  scrollLeft: number;
  viewportW: number;
  slotW: number;
  count: number;
  overscan: number;
  anchor?: number | null;
}): CardWindow {
  const count = Math.max(0, p.count | 0);
  if (count === 0) return { start: 0, end: 0 };
  const slot = Math.max(1, p.slotW);
  const first = Math.min(count - 1, Math.max(0, Math.floor(Math.max(0, p.scrollLeft) / slot)));
  const visible = Math.ceil(Math.max(0, p.viewportW) / slot) + 1;
  let start = Math.max(0, first - p.overscan);
  let end = Math.min(count, first + visible + p.overscan);
  const a = p.anchor;
  if (typeof a === "number" && a >= 0 && a < count) {
    start = Math.min(start, Math.max(0, a - p.overscan));
    end = Math.max(end, Math.min(count, a + p.overscan + 1));
  }
  return { start, end };
}

export function sameWindow(a: CardWindow | null, b: CardWindow): boolean {
  return !!a && a.start === b.start && a.end === b.end;
}
