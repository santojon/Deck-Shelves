import { describe, it, expect } from 'vitest'
import { FilterItemTypeSchema, ShelfSourceSchema } from '../../types'
import { ALL_FILTER_TYPES, canBeInverted } from '../../components/filter/utils'
import { FILTER_V3_EVALUATORS, SORT_V3_COMPARATORS, SOURCE_V3_RESOLVERS } from '../../steam/v3Extensions'
import { SORT_OPTIONS, V3_SOURCE_OPTIONS } from '../../components/qam/modals/editShelf/constants'

// The Filter v3 predicates exposed in these batches — param-free + parameterized.
const BATCH_FILTERS = [
  // param-free
  'vrSupport', 'soundtrackOwned', 'neverCompleted', 'installedNeverPlayed',
  'compatDataQuality', 'emuDeckSystem', 'retroDeckSystem', 'heroicLauncher',
  'lutrisApp', 'chiakiApp', 'moonlightApp', 'hiddenLauncherShortcuts',
  // parameterized
  'genres', 'categories', 'franchise', 'multiplayerType', 'dlcOwned', 'launchCount',
  'avgSessionMinutes', 'recentlyAbandoned', 'playedOnce', 'achievementPercentRange',
  'storageDevice', 'installedSizeRange', 'executableType', 'launchOptionTags',
  'customTags', 'parserCategories',
]

// The real (non-stub) Sort v3 comparators exposed in this batch.
const BATCH_SORTS = [
  'most_launched', 'least_launched', 'longest_session', 'shortest_session',
  'most_ignored', 'rediscovered_recently', 'completion_percent', 'closest_to_completion',
  'rarest_achievements', 'newest_installed', 'oldest_installed', 'oldest_unplayed',
  'newest_purchased', 'largest_install', 'smallest_install', 'ssd_priority',
  'sd_priority', 'friends_playing_now', 'most_friends_owning', 'trending_among_friends',
]

// Random comparators that are `() => 0` stubs — must stay hidden.
const STUB_SORTS = ['weighted_random', 'smart_random', 'seeded_random', 'rotating_daily_random', 'avoid_recently_shown']

describe('Filter v3 batch — param-free filters exposed and wired', () => {
  it.each(BATCH_FILTERS)('%s is a schema type, in the picker, invertible, with an evaluator', (id) => {
    expect(FilterItemTypeSchema.options).toContain(id)
    expect(ALL_FILTER_TYPES).toContain(id)
    expect(canBeInverted(id as any)).toBe(true)
    expect(typeof FILTER_V3_EVALUATORS[id]).toBe('function')
  })
})

describe('Sort v3 batch — real sorts exposed, stubs hidden', () => {
  const sortValues = SORT_OPTIONS.map((o) => o.value)

  it.each(BATCH_SORTS)('%s is in the picker with a comparator', (id) => {
    expect(sortValues).toContain(id)
    expect(typeof SORT_V3_COMPARATORS[id]).toBe('function')
  })

  it('does not expose the no-op random stubs', () => {
    for (const id of STUB_SORTS) expect(sortValues).not.toContain(id)
  })
})

describe('Source v3 batch — builtin sources exposed and wired', () => {
  it('exposes 19 picker options, each with a real resolver', () => {
    expect(V3_SOURCE_OPTIONS.length).toBe(19)
    for (const o of V3_SOURCE_OPTIONS) {
      expect(typeof SOURCE_V3_RESOLVERS[o.value]).toBe('function')
      // Every option has a label source (proper-noun literal or an i18n key).
      expect(Boolean(o.label) || Boolean(o.labelKey)).toBe(true)
    }
  })

  it('ShelfSourceSchema accepts a builtin source and requires a sourceId', () => {
    expect(ShelfSourceSchema.safeParse({ type: 'builtin', sourceId: 'pinned_games' }).success).toBe(true)
    expect(ShelfSourceSchema.safeParse({ type: 'builtin', sourceId: '' }).success).toBe(false)
    expect(ShelfSourceSchema.safeParse({ type: 'builtin' }).success).toBe(false)
  })
})
