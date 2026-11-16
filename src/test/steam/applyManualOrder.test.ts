import { describe, it, expect } from 'vitest'
import { applyManualOrder, manualResolveLimit } from '../../steam'

describe('applyManualOrder', () => {
  it('returns the original ids when manualOrder is undefined', () => {
    const ids = [1, 2, 3]
    expect(applyManualOrder(ids)).toEqual([1, 2, 3])
  })

  it('returns the original ids when manualOrder is empty', () => {
    expect(applyManualOrder([1, 2, 3], [])).toEqual([1, 2, 3])
  })

  it('moves manual ids to the front in their declared order', () => {
    expect(applyManualOrder([1, 2, 3, 4], [3, 1])).toEqual([3, 1, 2, 4])
  })

  it('keeps non-manual ids in their incoming relative order', () => {
    expect(applyManualOrder([10, 20, 30, 40, 50], [40])).toEqual([40, 10, 20, 30, 50])
  })

  it('appends manual ids not in the incoming list at the end', () => {
    expect(applyManualOrder([1, 2, 3], [99, 2, 100])).toEqual([2, 1, 3, 99, 100])
  })

  it('deduplicates repeated manual ids', () => {
    expect(applyManualOrder([1, 2, 3], [2, 2, 1])).toEqual([2, 1, 3])
  })

  it('returns the manual prefix only when ids are exactly the manual list', () => {
    expect(applyManualOrder([3, 2, 1], [1, 2, 3])).toEqual([1, 2, 3])
  })

  it('does not mutate the input ids array', () => {
    const ids = [1, 2, 3]
    applyManualOrder(ids, [3])
    expect(ids).toEqual([1, 2, 3])
  })

  it('does not mutate the input manualOrder array', () => {
    const manual = [3, 1]
    applyManualOrder([1, 2, 3], manual)
    expect(manual).toEqual([3, 1])
  })

  it('keeps the games placed first by hand on top when the limit drops below their place in the base order', () => {
    const baseOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const manual = [9, 10, 1, 2, 3, 4, 5, 6, 7, 8]
    const limit = 3
    const read = baseOrder.slice(0, manualResolveLimit(limit, manual))
    expect(applyManualOrder(read, manual).slice(0, limit)).toEqual([9, 10, 1])
  })

  it('reads only the limit when there is no manual order', () => {
    expect(manualResolveLimit(12)).toBe(12)
    expect(manualResolveLimit(12, [])).toBe(12)
  })
})
