// Preserve React state identity when the card's label has not changed. Comparing
// the DOM also catches asynchronous title/status changes within the same game.
export function reuseHeroLabel(previous: HTMLElement | null, source: HTMLElement | null): HTMLElement | null {
  if (!source) return null;
  if (previous?.isEqualNode(source)) return previous;
  return source.cloneNode(true) as HTMLElement;
}

// The overlay is output, not an input to the shelf observer. Its own cloned
// children must not schedule another label update. Avoid instanceof: Steam's
// visual document can belong to a different window from SharedJSContext.
export function isHeroLabelOutputMutation(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
  return !!target?.closest('.ds-promoted-hero-label');
}

type Box = { left: number; width: number };

// The alignment the card's label was rendered with (name first, else playtime).
export function heroLabelAlign(card: Element): "left" | "center" | "right" {
  const name = card.querySelector<HTMLElement>(".ds-card-label-name");
  const pos = name?.style.textAlign || card.querySelector("[data-ds-playtime-position]")?.getAttribute("data-ds-playtime-position");
  return pos === "center" || pos === "right" ? pos : "left";
}

// Overlay left offset inside the shelf: aligned to the card like its own label, kept on screen.
export function heroLabelLeft(shelf: Box, card: Box, labelW: number, align: "left" | "center" | "right"): number {
  const x = card.left - shelf.left;
  const want = align === "center" ? x + (card.width - labelW) / 2 : align === "right" ? x + card.width - labelW : x;
  return Math.round(Math.max(0, Math.min(want, shelf.width - labelW)));
}
