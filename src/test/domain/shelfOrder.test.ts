import { describe, it, expect } from 'vitest'
import { pickFirstVisibleShelfId, interleaveSmartShelves } from '../../domain/shelfOrder'

type S = { id: string; source?: { type?: string } }

const tab = (id: string): S => ({ id, source: { type: 'tab' } })
const filter = (id: string): S => ({ id, source: { type: 'filter' } })
const smart = (id: string): S => ({ id, source: { type: 'smart' } })
const wishlist = (id: string): S => ({ id, source: { type: 'wishlist' } })

describe('pickFirstVisibleShelfId', () => {
  it('returns the first non-smart shelf in CONFIG order that is rendering', () => {
    const shelves = [tab('a'), filter('b'), tab('c')]
    const rendered = new Set(['a', 'b', 'c'])
    expect(pickFirstVisibleShelfId(shelves, rendered)).toBe('a')
  })

  it('skips earlier shelves not yet rendering even when later ones are', () => {
    const shelves = [filter('a'), tab('b'), tab('c')]
    const rendered = new Set(['b', 'c'])
    expect(pickFirstVisibleShelfId(shelves, rendered)).toBe('b')
  })

  it('prefers a normal shelf over a smart shelf when both are rendering', () => {
    const shelves = [smart('s1'), smart('s2'), tab('a')]
    const rendered = new Set(['s1', 's2', 'a'])
    expect(pickFirstVisibleShelfId(shelves, rendered)).toBe('a')
  })

  it('returns null when no shelf has rendered yet', () => {
    const shelves = [tab('a'), tab('b')]
    expect(pickFirstVisibleShelfId(shelves, new Set())).toBeNull()
  })

  it('falls back to the first rendering smart shelf when no normal is rendering', () => {
    const shelves = [tab('a'), smart('s1'), smart('s2')]
    expect(pickFirstVisibleShelfId(shelves, new Set(['s1', 's2']))).toBe('s1')
  })

  it('falls back to the first rendering smart shelf when no normal shelf exists', () => {
    const shelves = [smart('s1'), smart('s2')]
    expect(pickFirstVisibleShelfId(shelves, new Set(['s1', 's2']))).toBe('s1')
  })

  it('prefers a local shelf over an online (wishlist) shelf when both are rendering', () => {
    const shelves = [wishlist('w'), tab('a')]
    expect(pickFirstVisibleShelfId(shelves, new Set(['w', 'a']))).toBe('a')
  })

  it('skips an online shelf that rendered first while the earlier-config local shelf has not', () => {
    // Cold restart: config order is [local, online, local]; the online shelf
    // renders from cache before the first local shelf resolves its app data.
    const shelves = [filter('local1'), wishlist('w'), tab('local2')]
    expect(pickFirstVisibleShelfId(shelves, new Set(['w', 'local2']))).toBe('local2')
  })

  it('falls back to an online shelf only when no local or smart shelf is rendering', () => {
    const shelves = [filter('a'), wishlist('w')]
    expect(pickFirstVisibleShelfId(shelves, new Set(['w']))).toBe('w')
  })

  it('handles empty shelves list', () => {
    expect(pickFirstVisibleShelfId([], new Set(['x']))).toBeNull()
  })

  it('ignores null/undefined entries safely', () => {
    const shelves = [null, undefined, tab('a')] as any
    expect(pickFirstVisibleShelfId(shelves, new Set(['a']))).toBe('a')
  })
})

describe('interleaveSmartShelves', () => {
  it('returns the original shelves array when firstVisibleId is null', () => {
    const shelves = [tab('a'), smart('s'), tab('b')]
    expect(interleaveSmartShelves(shelves, null)).toBe(shelves)
  })

  it('returns the original array when firstVisibleId does not match any shelf', () => {
    const shelves = [tab('a'), smart('s'), tab('b')]
    expect(interleaveSmartShelves(shelves, 'missing')).toBe(shelves)
  })

  it('promotes a smart shelf when firstVisibleId points at one', () => {
    const shelves = [tab('a'), smart('s1'), smart('s2'), tab('b')]
    const out = interleaveSmartShelves(shelves, 's1')
    expect(out.map((s: any) => s.id)).toEqual(['s1', 's2', 'a', 'b'])
  })

  it('moves smart shelves between the promoted shelf and the rest', () => {
    const shelves = [tab('a'), tab('b'), smart('s1'), smart('s2'), tab('c')]
    const out = interleaveSmartShelves(shelves, 'a')
    expect(out.map((s: any) => s.id)).toEqual(['a', 's1', 's2', 'b', 'c'])
  })

  it('keeps all smart shelves grouped right after the promoted shelf', () => {
    const shelves = [smart('s1'), tab('a'), smart('s2'), tab('b')]
    const out = interleaveSmartShelves(shelves, 'a')
    expect(out.map((s: any) => s.id)).toEqual(['a', 's1', 's2', 'b'])
  })

  it('preserves the relative order of non-promoted normal shelves', () => {
    const shelves = [tab('a'), tab('b'), tab('c'), tab('d')]
    const out = interleaveSmartShelves(shelves, 'b')
    expect(out.map((s: any) => s.id)).toEqual(['b', 'a', 'c', 'd'])
  })
})
