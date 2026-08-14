import { describe, it, expect } from 'vitest'
import type { AppOverview } from '../../steam'
import { FilterItemTypeSchema } from '../../types'
import { ALL_FILTER_TYPES, canBeInverted, defaultParams } from '../../components/filter/utils'
import { FILTER_V3_EVALUATORS, type ChildEvaluator } from '../../steam/v3Extensions'

const COMPOSITES = ['weightedFilter', 'priorityFilter', 'exclusionGroup']

const app = (over: Partial<AppOverview> & { appid: number }): AppOverview =>
  ({ display_name: `App ${over.appid}`, ...over } as AppOverview)

/* Stand-in for the host evaluator the dispatch injects: understands the two
   base predicates used below, so these tests prove composites can combine
   NON-v3 children (the point of the upgrade). */
const hostEval: ChildEvaluator = (item, a: any) => {
  const res = item.type === 'installed' ? a.installed === true
    : item.type === 'favorites' ? a.is_favorite === true
    : false
  return item.inverted ? !res : res
}

const weighted = (children: any[], threshold: number) =>
  FILTER_V3_EVALUATORS.weightedFilter({ type: 'weightedFilter', params: { children, threshold } }, app({ appid: 1 }), hostEval)

describe('composite filters — exposure', () => {
  it.each(COMPOSITES)('%s is a schema type, in the picker, invertible, with an evaluator', (id) => {
    expect(FilterItemTypeSchema.options).toContain(id)
    expect(ALL_FILTER_TYPES).toContain(id)
    expect(canBeInverted(id as any)).toBe(true)
    expect(typeof FILTER_V3_EVALUATORS[id]).toBe('function')
  })

  it('seeds an empty children list (and a threshold for weighted)', () => {
    expect(defaultParams('weightedFilter' as any)).toEqual({ children: [], threshold: 1 })
    expect(defaultParams('priorityFilter' as any)).toEqual({ children: [] })
    expect(defaultParams('exclusionGroup' as any)).toEqual({ children: [] })
  })
})

describe('composite filters — evaluate children of ANY type', () => {
  const both = app({ appid: 1, installed: true, is_favorite: true } as any)
  const onlyInstalled = app({ appid: 2, installed: true, is_favorite: false } as any)
  const neither = app({ appid: 3, installed: false, is_favorite: false } as any)
  const kids = [{ type: 'installed', params: {} }, { type: 'favorites', params: {} }]

  it('weighted: matches when at least `threshold` children match', () => {
    const run = (a: AppOverview, threshold: number) =>
      FILTER_V3_EVALUATORS.weightedFilter({ type: 'weightedFilter', params: { children: kids, threshold } }, a, hostEval)
    expect(run(both, 2)).toBe(true)
    expect(run(onlyInstalled, 2)).toBe(false)
    expect(run(onlyInstalled, 1)).toBe(true)
    expect(run(neither, 1)).toBe(false)
  })

  it('weighted: honours per-child weights', () => {
    const heavy = [{ type: 'installed', params: {}, weight: 5 }]
    expect(weighted(heavy, 5)).toBe(false) // app 1 in `weighted()` has no flags
    expect(FILTER_V3_EVALUATORS.weightedFilter(
      { type: 'weightedFilter', params: { children: heavy, threshold: 5 } }, onlyInstalled, hostEval,
    )).toBe(true)
  })

  it('priority: matches when any child matches', () => {
    const run = (a: AppOverview) =>
      FILTER_V3_EVALUATORS.priorityFilter({ type: 'priorityFilter', params: { children: kids } }, a, hostEval)
    expect(run(onlyInstalled)).toBe(true)
    expect(run(neither)).toBe(false)
  })

  it('exclusion: excludes when any child matches', () => {
    const run = (a: AppOverview) =>
      FILTER_V3_EVALUATORS.exclusionGroup({ type: 'exclusionGroup', params: { children: kids } }, a, hostEval)
    expect(run(onlyInstalled)).toBe(false)
    expect(run(neither)).toBe(true)
  })

  it('is fail-soft with no children and with no host evaluator', () => {
    expect(FILTER_V3_EVALUATORS.priorityFilter({ type: 'priorityFilter', params: { children: [] } }, both, hostEval)).toBe(false)
    expect(FILTER_V3_EVALUATORS.exclusionGroup({ type: 'exclusionGroup', params: {} }, both, hostEval)).toBe(true)
    // No evaluator injected → children can't be judged, so nothing matches.
    expect(FILTER_V3_EVALUATORS.priorityFilter({ type: 'priorityFilter', params: { children: kids } }, both)).toBe(false)
  })
})
