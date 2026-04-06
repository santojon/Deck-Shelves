export type Rect = { left: number; top: number; width: number; height: number };

export function computeCenteredScrollLeft(container: { width: number; scrollWidth: number }, item: Rect) {
  const target = item.left - (container.width / 2) + (item.width / 2);
  const maxScroll = Math.max(0, container.scrollWidth - container.width);
  return Math.max(0, Math.min(target, maxScroll));
}
