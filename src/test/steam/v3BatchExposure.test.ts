import { describe, it, expect } from 'vitest'
import { FilterItemTypeSchema, ShelfSourceSchema, SmartShelfModeSchema } from '../../types'
import { ALL_FILTER_TYPES } from '../../components/conditions/utils'
import { FILTER_V3_EVALUATORS, SORT_V3_COMPARATORS, SOURCE_V3_RESOLVERS } from '../../steam/v3Extensions'
import { SORT_OPTIONS, V3_SOURCE_OPTIONS } from '../../components/qam/modals/editShelf/constants'
import { SMART_TEMPLATES } from '../../components/qam/modals/smartTemplates'
import { RETIRED_SMART_MODES, resolveSmartShelf } from '../../steam/smartShelves'

// The conditions beyond the base set that stay: each is a schema type, offered, and evaluated.
const EXTRA_FILTERS = [
  'vrSupport', 'genres', 'categories', 'franchise', 'multiplayerType', 'playedOnce',
  'installedSizeRange', 'customTags', 'parserCategories', 'reviewScore', 'releaseDate', 'comingSoon',
  'storeTag', 'friends', 'achievements', 'achievementPercentRange', 'neverCompleted', 'familySharing',
  'storeCategory', 'purchaseDate',
]

// Evaluated with the group evaluator, since they hold conditions of any type.
const COMPOSITE_FILTERS = ['weightedFilter', 'priorityFilter', 'exclusionGroup']

// Read data the client never had, or matched names: not a schema type, not offered, not evaluated.
const RETIRED_FILTERS = [
  'demo', 'installedNeverPlayed', 'recentlyAbandoned', 'compatDataQuality', 'hiddenLauncherShortcuts',
  'dlcOwned', 'soundtrackOwned', 'launchCount', 'avgSessionMinutes', 'storageDevice', 'executableType',
  'launchOptionTags', 'emuDeckSystem', 'retroDeckSystem', 'heroicLauncher', 'lutrisApp', 'chiakiApp', 'moonlightApp',
]

const EXTRA_SORTS = [
  'friends_playing_now', 'owned_games', 'completion_percent', 'closest_to_completion',
  'most_friends_owning', 'trending_among_friends', 'family_shared_games',
]

const RETIRED_SORTS = [
  'most_launched', 'least_launched', 'longest_session', 'shortest_session', 'most_ignored',
  'rediscovered_recently', 'rarest_achievements', 'newest_installed', 'oldest_installed', 'oldest_unplayed',
  'newest_purchased', 'largest_install', 'smallest_install', 'ssd_priority', 'sd_priority',
  'weighted_random', 'smart_random', 'seeded_random', 'rotating_daily_random', 'avoid_recently_shown',
]

const RETIRED_SOURCES = [
  'followed_games', 'ignored_games', 'dlc_source', 'soundtrack_source', 'recently_updated', 'with_events',
  'with_workshop_updates', 'controller_specific_source', 'emudeck_collections', 'retrodeck_collections',
  'heroic_library', 'lutris_library', 'moonlight_sessions', 'chiaki_sessions',
]

describe('conditions beyond the base set', () => {
  it.each(EXTRA_FILTERS)('%s is a schema type, offered, with an evaluator', (id) => {
    expect(FilterItemTypeSchema.options).toContain(id)
    expect(ALL_FILTER_TYPES).toContain(id)
    expect(typeof FILTER_V3_EVALUATORS[id]).toBe('function')
  })

  it.each(COMPOSITE_FILTERS)('%s is a schema type and offered', (id) => {
    expect(FilterItemTypeSchema.options).toContain(id)
    expect(ALL_FILTER_TYPES).toContain(id)
  })

  it.each(RETIRED_FILTERS)('%s is retired everywhere', (id) => {
    expect(FilterItemTypeSchema.options).not.toContain(id)
    expect(ALL_FILTER_TYPES).not.toContain(id)
    expect(FILTER_V3_EVALUATORS[id]).toBeUndefined()
  })
})

describe('sorts beyond the base set', () => {
  const offered = SORT_OPTIONS.map((o) => o.value)

  it.each(EXTRA_SORTS)('%s is offered with a comparator', (id) => {
    expect(offered).toContain(id)
    expect(typeof SORT_V3_COMPARATORS[id]).toBe('function')
  })

  it.each(RETIRED_SORTS)('%s is retired everywhere', (id) => {
    expect(offered).not.toContain(id)
    expect(SORT_V3_COMPARATORS[id]).toBeUndefined()
  })
})

describe('built-in sources', () => {
  it('offers the dynamic collections and the four game lists, each with a resolver and a label', () => {
    expect(V3_SOURCE_OPTIONS.map((o) => o.value).sort()).toEqual(['dynamic_collections', 'history_source', 'pinned_games', 'session_queue_source', 'temporary_queue_source'])
    for (const o of V3_SOURCE_OPTIONS) {
      expect(typeof SOURCE_V3_RESOLVERS[o.value]).toBe('function')
      expect(Boolean(o.label) || Boolean(o.labelKey)).toBe(true)
    }
  })

  it.each(RETIRED_SOURCES)('%s is retired everywhere', (id) => {
    expect(V3_SOURCE_OPTIONS.map((o) => o.value)).not.toContain(id)
    expect(SOURCE_V3_RESOLVERS[id]).toBeUndefined()
  })

  it('ShelfSourceSchema accepts a builtin source and requires a sourceId', () => {
    expect(ShelfSourceSchema.safeParse({ type: 'builtin', sourceId: 'pinned_games' }).success).toBe(true)
    expect(ShelfSourceSchema.safeParse({ type: 'builtin', sourceId: '' }).success).toBe(false)
    expect(ShelfSourceSchema.safeParse({ type: 'builtin' }).success).toBe(false)
  })
})

describe('smart modes', () => {
  it('the modes that duplicated another still parse, so a saved shelf survives, but are not offered and resolve to nothing', () => {
    expect([...RETIRED_SMART_MODES].sort()).toEqual(['long_session_night', 'monthly_spotlight', 'never_touched_classics', 'seasonal_rotation'])
    for (const mode of RETIRED_SMART_MODES) {
      expect(SmartShelfModeSchema.options).toContain(mode)
      expect(SMART_TEMPLATES.some((t) => t.mode === mode)).toBe(false)
      expect(resolveSmartShelf(mode as any, [], 10)).toEqual([])
    }
  })

  it.each(['almost_finished', 'couch_gaming', 'coop_ready', 'party_games'])('%s is offered again, reading the client data', (mode) => {
    expect(SMART_TEMPLATES.some((t) => t.mode === mode)).toBe(true)
    expect(RETIRED_SMART_MODES.has(mode)).toBe(false)
  })

  it('every offered template is a live mode', () => {
    for (const t of SMART_TEMPLATES) expect(RETIRED_SMART_MODES.has(t.mode)).toBe(false)
  })
})
