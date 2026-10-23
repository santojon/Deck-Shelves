/* Which cards of a horizontal row to mount: the visible span plus an overscan
   on each side, widened to include an anchor index (a pending focus-restore
   target) so the card the user returns to always exists. With `isWide`,
   featured cards count at `wideSlotW`, so several of them can't push the
   window past the cards actually on screen. */
export type CardWindow = { start: number; end: number };

export function computeCardWindow(p: {
  scrollLeft: number;
  viewportW: number;
  slotW: number;
  count: number;
  overscan: number;
  anchor?: number | null;
  wideSlotW?: number;
  isWide?: (index: number) => boolean;
}): CardWindow {
  const count = Math.max(0, p.count | 0);
  if (count === 0) return { start: 0, end: 0 };
  const slot = Math.max(1, p.slotW);
  const { first, past } = p.isWide && p.wideSlotW ? walkedSpan(p, count, slot) : flatSpan(p, count, slot);
  let start = Math.max(0, first - p.overscan);
  let end = Math.min(count, past + p.overscan);
  const a = p.anchor;
  if (typeof a === "number" && a >= 0 && a < count) {
    start = Math.min(start, Math.max(0, a - p.overscan));
    end = Math.max(end, Math.min(count, a + p.overscan + 1));
  }
  return { start, end };
}

type Span = { first: number; past: number };
type SpanInput = { scrollLeft: number; viewportW: number; wideSlotW?: number; isWide?: (index: number) => boolean };

function flatSpan(p: SpanInput, count: number, slot: number): Span {
  const first = Math.min(count - 1, Math.max(0, Math.floor(Math.max(0, p.scrollLeft) / slot)));
  return { first, past: first + Math.ceil(Math.max(0, p.viewportW) / slot) + 1 };
}

// Card by card, so wide and regular cards each move the offset by their own width.
function walkedSpan(p: SpanInput, count: number, slot: number): Span {
  const left = Math.max(0, p.scrollLeft);
  const right = left + Math.max(0, p.viewportW);
  const wide = Math.max(1, p.wideSlotW ?? slot);
  let first = -1;
  let x = 0;
  for (let i = 0; i < count; i++) {
    const w = p.isWide?.(i) ? wide : slot;
    if (first < 0 && x + w > left) first = i;
    if (x >= right) return { first: first < 0 ? i : first, past: i + 1 };
    x += w;
  }
  return { first: first < 0 ? count - 1 : first, past: count };
}

export function sameWindow(a: CardWindow | null, b: CardWindow): boolean {
  return !!a && a.start === b.start && a.end === b.end;
}
