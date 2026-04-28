import { describe, it, expect } from 'vitest'
import { findReorderTargetIndex, moveInOrder } from '../../core/reorder'

const horizontalRects = [
  { left: 0,   right: 100, top: 0, bottom: 50 },
  { left: 110, right: 210, top: 0, bottom: 50 },
  { left: 220, right: 320, top: 0, bottom: 50 },
]

const verticalRects = [
  { left: 0, right: 100, top: 0,   bottom: 50 },
  { left: 0, right: 100, top: 60,  bottom: 110 },
  { left: 0, right: 100, top: 120, bottom: 170 },
]

describe('findReorderTargetIndex', () => {
  it('horizontal: pointer inside the second rect returns 1', () => {
    expect(findReorderTargetIndex(horizontalRects, { x: 150, y: 25 }, 'horizontal')).toBe(1)
  })

  it('horizontal: pointer in the gap between rects returns -1', () => {
    expect(findReorderTargetIndex(horizontalRects, { x: 105, y: 25 }, 'horizontal')).toBe(-1)
  })

  it('horizontal: pointer past the last rect returns -1', () => {
    expect(findReorderTargetIndex(horizontalRects, { x: 500, y: 25 }, 'horizontal')).toBe(-1)
  })

  it('horizontal ignores y entirely', () => {
    expect(findReorderTargetIndex(horizontalRects, { x: 50, y: 9999 }, 'horizontal')).toBe(0)
  })

  it('vertical: pointer inside the third rect returns 2', () => {
    expect(findReorderTargetIndex(verticalRects, { x: 25, y: 150 }, 'vertical')).toBe(2)
  })

  it('vertical: pointer in the gap returns -1', () => {
    expect(findReorderTargetIndex(verticalRects, { x: 25, y: 55 }, 'vertical')).toBe(-1)
  })

  it('vertical ignores x entirely', () => {
    expect(findReorderTargetIndex(verticalRects, { x: 9999, y: 80 }, 'vertical')).toBe(1)
  })

  it('returns -1 on empty rects list', () => {
    expect(findReorderTargetIndex([], { x: 0, y: 0 }, 'horizontal')).toBe(-1)
  })
})

describe('moveInOrder', () => {
  it('moves the picked id to the target index', () => {
    expect(moveInOrder(['a', 'b', 'c', 'd'], 'd', 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('returns null when the id is already at the target index', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', 1)).toBeNull()
  })

  it('returns null when the id is not in the order', () => {
    expect(moveInOrder(['a', 'b'], 'z', 0)).toBeNull()
  })

  it('moving from the end to the start works', () => {
    expect(moveInOrder([1, 2, 3], 3, 0)).toEqual([3, 1, 2])
  })

  it('moving from the start to the end works', () => {
    expect(moveInOrder([1, 2, 3], 1, 2)).toEqual([2, 3, 1])
  })

  it('does not mutate the input order', () => {
    const order = ['a', 'b', 'c']
    moveInOrder(order, 'a', 2)
    expect(order).toEqual(['a', 'b', 'c'])
  })
})
