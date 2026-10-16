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
