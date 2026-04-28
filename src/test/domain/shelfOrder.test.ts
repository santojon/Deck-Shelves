import { describe, it, expect } from 'vitest'
import { pickFirstVisibleShelfId, interleaveSmartShelves } from '../../domain/shelfOrder'

type S = { id: string; source?: { type?: string } }

const tab = (id: string): S => ({ id, source: { type: 'tab' } })
const filter = (id: string): S => ({ id, source: { type: 'filter' } })
const smart = (id: string): S => ({ id, source: { type: 'smart' } })

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

  it('skips smart shelves entirely', () => {
    const shelves = [smart('s1'), smart('s2'), tab('a')]
    const rendered = new Set(['s1', 's2', 'a'])
    expect(pickFirstVisibleShelfId(shelves, rendered)).toBe('a')
  })

  it('returns null when no normal shelf has rendered yet', () => {
    const shelves = [tab('a'), tab('b')]
    expect(pickFirstVisibleShelfId(shelves, new Set())).toBeNull()
  })

  it('returns null when only smart shelves are rendering', () => {
    const shelves = [tab('a'), smart('s')]
    expect(pickFirstVisibleShelfId(shelves, new Set(['s']))).toBeNull()
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

  it('returns the original array when firstVisibleId is not in the normal shelves', () => {
    const shelves = [tab('a'), smart('s'), tab('b')]
    expect(interleaveSmartShelves(shelves, 'missing')).toBe(shelves)
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
