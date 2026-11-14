import { describe, it, expect } from 'vitest'
import type { AppOverview } from '../../steam'
import { FilterItemTypeSchema } from '../../types'
import { ALL_FILTER_TYPES, startingOptions } from '../../components/conditions/utils'
import { evaluateFilterItem, flattenItems, unsupportedFilterType } from '../../steam/filterEval'

const COMPOSITES = ['weightedFilter', 'priorityFilter', 'exclusionGroup'] as const

const app = (over: Record<string, unknown> & { appid: number }): AppOverview =>
  ({ display_name: `App ${over.appid}`, ...over } as unknown as AppOverview)

const both = app({ appid: 1, installed: true, is_favorite: true })
const onlyInstalled = app({ appid: 2, installed: true, is_favorite: false })
const neither = app({ appid: 3, installed: false, is_favorite: false })
const kids = [{ type: 'installed', params: {} }, { type: 'favorites', params: {} }]
const run = (type: string, params: Record<string, unknown>, a: AppOverview, inverted = false) =>
  evaluateFilterItem({ type, inverted, params } as any, a)

describe('composite conditions', () => {
  it.each(COMPOSITES)('%s is a schema type, offered, and starts with no conditions inside', (id) => {
    expect(FilterItemTypeSchema.options).toContain(id)
    expect(ALL_FILTER_TYPES).toContain(id)
    expect(startingOptions(id)).toEqual(id === 'weightedFilter' ? { children: [], threshold: 1 } : { children: [] })
  })

  it('weighted: matches when at least `threshold` children match, each counting its weight', () => {
    expect(run('weightedFilter', { children: kids, threshold: 2 }, both)).toBe(true)
    expect(run('weightedFilter', { children: kids, threshold: 2 }, onlyInstalled)).toBe(false)
    expect(run('weightedFilter', { children: kids, threshold: 1 }, onlyInstalled)).toBe(true)
    expect(run('weightedFilter', { children: kids, threshold: 1 }, neither)).toBe(false)
    const heavy = [{ type: 'installed', params: {}, weight: 5 }]
    expect(run('weightedFilter', { children: heavy, threshold: 5 }, onlyInstalled)).toBe(true)
    expect(run('weightedFilter', { children: heavy, threshold: 5 }, neither)).toBe(false)
  })

  it('priority: matches when any child matches; exclusion: excludes when any child matches', () => {
    expect(run('priorityFilter', { children: kids }, onlyInstalled)).toBe(true)
    expect(run('priorityFilter', { children: kids }, neither)).toBe(false)
    expect(run('exclusionGroup', { children: kids }, onlyInstalled)).toBe(false)
    expect(run('exclusionGroup', { children: kids }, neither)).toBe(true)
  })

  it('with nothing inside, priority matches nothing and exclusion everything', () => {
    expect(run('priorityFilter', { children: [] }, both)).toBe(false)
    expect(run('exclusionGroup', {}, both)).toBe(true)
  })

  it('is negated like any condition, and the conditions inside count at any depth', () => {
    expect(run('priorityFilter', { children: kids }, neither, true)).toBe(true)
    const nested = { type: 'exclusionGroup', params: { children: [{ type: 'merge', params: { mode: 'and', items: [{ type: 'launchCount', params: {} }] } }] } }
    expect(flattenItems([nested]).map((i) => i.type)).toEqual(['exclusionGroup', 'merge', 'launchCount'])
    expect(unsupportedFilterType({ mode: 'and', items: [nested] } as any)).toBe('launchCount')
  })
})
