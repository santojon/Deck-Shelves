import { describe, it, expect } from 'vitest'
import { mergeCompositeResults } from '../../steam'

describe('mergeCompositeResults — union', () => {
  it('returns empty when no children', () => {
    expect(mergeCompositeResults([], 'union')).toEqual([])
  })

  it('round-robin interleaves children so each contributes to the head', () => {
    // Round 1: take 3 (child 0), then 4 (child 1).
    // Round 2: child 0's next is 1 (fresh) → push. Child 1's next is 1 (seen) → skip to 5 → push.
    // Round 3: child 0's next is 2 (fresh) → push. Child 1's cursor past end. → stop.
    expect(mergeCompositeResults([[3, 1, 2], [4, 1, 5]], 'union')).toEqual([3, 4, 1, 5, 2])
  })

  it('de-duplicates ids that appear in multiple children (first occurrence wins)', () => {
    // Round 1: 1 (child 0), then 2 (child 1's first fresh — its 2 hasn't been seen yet, child 0 already pushed 1).
    // Wait — round 1: child 0 → 1, child 1 → 2.
    // Round 2: child 0 → 2 (seen, skip) → end of arr. Child 1 → 1 (seen, skip) → 3 (fresh).
    expect(mergeCompositeResults([[1, 2], [2, 1, 3]], 'union')).toEqual([1, 2, 3])
  })

  it('returns the only child unchanged when there is one', () => {
    expect(mergeCompositeResults([[7, 8, 9]], 'union')).toEqual([7, 8, 9])
  })

  it('handles three+ children stacking round-robin in declaration order', () => {
    // Round 1: 1 (child 0), 2 (child 1), 3 (child 2).
    // Round 2: child 0 exhausted, child 1 exhausted, child 2 → 1 (seen) → 2 (seen) → end. → stop.
    expect(mergeCompositeResults([[1], [2], [3, 1, 2]], 'union')).toEqual([1, 2, 3])
  })

  it('keeps secondary source visible in the head even when primary is large', () => {
    // Regression for the "filter as last source disappears" bug — the
    // previous concat-then-slice merge dropped secondary items from the
    // tail. Round-robin interleaves so filter ids reach the head of
    // the result before the final overShootLimit slice cuts.
    const primary = [10, 11, 12, 13, 14]
    const filter = [99]
    const merged = mergeCompositeResults([primary, filter], 'union')
    expect(merged.indexOf(99)).toBeLessThan(merged.length - 1)
    expect(merged).toEqual([10, 99, 11, 12, 13, 14])
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
