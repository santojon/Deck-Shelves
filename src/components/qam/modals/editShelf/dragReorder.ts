/* Shared pointer-drag reorder + price-cache helpers — used by both
   ShelfPreview's manual-sort row and the standalone ManualSortRow (same
   drag mechanics, same discount-badge lookup). */

export function readPriceCache(isOnlineShelfSource: boolean): any {
  if (!isOnlineShelfSource) return null
  try {
    const raw = (globalThis as any).localStorage?.getItem?.('ds-price-cache-v1')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// Which card (by index) the pointer's X currently sits over.
export function findCardIndexAtX(cards: HTMLElement[], clientX: number): number {
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect()
    if (clientX >= r.left && clientX <= r.right) return i
  }
  return -1
}

// Move `fromId` to where `toId` currently sits; null when either id is
// missing or they're already in place (nothing to reorder).
export function reorderIds(order: number[], fromId: number, toId: number): number[] | null {
  const base = order.slice()
  const from = base.indexOf(fromId)
  const to = base.indexOf(toId)
  if (from === -1 || to === -1 || from === to) return null
  const [picked] = base.splice(from, 1)
  base.splice(to, 0, picked)
  return base
}
