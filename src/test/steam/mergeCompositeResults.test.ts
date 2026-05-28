import { describe, it, expect } from 'vitest'
import { mergeCompositeResults } from '../../steam'

describe('mergeCompositeResults — union', () => {
  it('returns empty when no children', () => {
    expect(mergeCompositeResults([], 'union')).toEqual([])
  })

  it('preserves the first child order and appends new ids from the second', () => {
    expect(mergeCompositeResults([[3, 1, 2], [4, 1, 5]], 'union')).toEqual([3, 1, 2, 4, 5])
  })

  it('de-duplicates ids that appear in multiple children (first occurrence wins)', () => {
    expect(mergeCompositeResults([[1, 2], [2, 1, 3]], 'union')).toEqual([1, 2, 3])
  })

  it('returns the only child unchanged when there is one', () => {
    expect(mergeCompositeResults([[7, 8, 9]], 'union')).toEqual([7, 8, 9])
  })

  it('handles three+ children stacking in declaration order', () => {
    expect(mergeCompositeResults([[1], [2], [3, 1, 2]], 'union')).toEqual([1, 2, 3])
  })
})

describe('mergeCompositeResults — intersection', () => {
  it('returns empty when no children', () => {
    expect(mergeCompositeResults([], 'intersection')).toEqual([])
  })

  it('returns ids present in every child, in first-child order', () => {
    expect(mergeCompositeResults([[1, 2, 3], [2, 3, 4]], 'intersection')).toEqual([2, 3])
  })

  it('drops ids missing from any child', () => {
    expect(mergeCompositeResults([[1, 2, 3], [1, 3], [3, 99]], 'intersection')).toEqual([3])
  })

  it('returns the only child unchanged when there is one', () => {
    expect(mergeCompositeResults([[5, 6, 7]], 'intersection')).toEqual([5, 6, 7])
  })

  it('returns empty when no overlap exists', () => {
    expect(mergeCompositeResults([[1, 2], [3, 4]], 'intersection')).toEqual([])
  })

  it('treats the first child as ordering source even when subsequent children rearrange', () => {
    expect(mergeCompositeResults([[10, 20, 30], [30, 20, 10]], 'intersection')).toEqual([10, 20, 30])
  })
})

describe('mergeCompositeResults — invariants', () => {
  it('does not mutate child arrays', () => {
    const a = [1, 2, 3]
    const b = [3, 4, 5]
    mergeCompositeResults([a, b], 'union')
    mergeCompositeResults([a, b], 'intersection')
    expect(a).toEqual([1, 2, 3])
    expect(b).toEqual([3, 4, 5])
  })

  it('union of identical children equals one of them (no duplicates)', () => {
    const a = [10, 20, 30]
    expect(mergeCompositeResults([a, a], 'union')).toEqual([10, 20, 30])
  })

  it('intersection of identical children equals one of them', () => {
    const a = [10, 20, 30]
    expect(mergeCompositeResults([a, a], 'intersection')).toEqual([10, 20, 30])
  })
})
