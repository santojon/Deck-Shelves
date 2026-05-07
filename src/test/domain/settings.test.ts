import { describe, it, expect } from 'vitest'
import {
  patchShelfInSettings,
  deleteShelfFromSettings,
  addShelfToSettings,
  moveShelf,
  legacyFilterToGroup,
  filterGroupToFilter,
  getEffectiveFilterGroup,
  normalizeFilter,
} from '../../domain/settings'
import { ShelfSchema } from '../../types'
import type { Settings, Shelf } from '../../types'

function makeShelf(id: string, overrides: Partial<Shelf> = {}): Shelf {
  return {
    id,
    title: `Shelf ${id}`,
    enabled: true,
    hidden: false,
    limit: 15,
    matchNativeSize: false,
    highlightFirst: false,
    highlightAll: false,
    hideStatusLine: false,
    hideNewBadge: false,
    hideCompatIcons: false,
    hideNonSteamBadge: false,
    hideShelfTitle: false,
    hideGameNames: false,
    hideInstallIndicator: false,
    hideSeeMore: false,
    hideRefreshCard: false,
    source: { type: 'tab', tab: 'all' },
    ...overrides,
  }
}

function makeSettings(shelves: Shelf[] = []): Settings {
  return { enabled: true, hideRecents: false, recentsReplaceSource: false, hideHomeTabs: false, shelfHeroBackground: false, globalMatchNativeSize: false, globalHighlightFirst: false, globalHighlightAll: false, globalHideStatusLine: false, globalHideNewBadge: false, globalHideCompatIcons: false, globalHideNonSteamBadge: false, globalHideShelfTitle: false, globalHideGameNames: false, globalHideInstallIndicator: false, globalHideSeeMore: false, globalHideRefreshCard: false, globalDedupeByName: false, shelves, smartShelvesEnabled: false, smartShelvesAtBottom: false, smartShelves: [], smartSurpriseMe: false, smartSurpriseMeCount: 0, savedFilters: [] }
}

describe('patchShelfInSettings', () => {
  it('patches only the targeted shelf', () => {
    const settings = makeSettings([makeShelf('a'), makeShelf('b')])
    const result = patchShelfInSettings(settings, 'a', { title: 'Updated' })
    expect(result.shelves[0].title).toBe('Updated')
    expect(result.shelves[1].title).toBe('Shelf b')
  })

  it('does not mutate the original settings', () => {
    const settings = makeSettings([makeShelf('a')])
    patchShelfInSettings(settings, 'a', { title: 'X' })
    expect(settings.shelves[0].title).toBe('Shelf a')
  })

  it('preserves shelf count', () => {
    const settings = makeSettings([makeShelf('a'), makeShelf('b'), makeShelf('c')])
    const result = patchShelfInSettings(settings, 'b', { hidden: true })
    expect(result.shelves).toHaveLength(3)
  })

  it('no-ops when shelf id not found', () => {
    const settings = makeSettings([makeShelf('a')])
    const result = patchShelfInSettings(settings, 'missing', { title: 'X' })
    expect(result.shelves[0].title).toBe('Shelf a')
  })
})

describe('deleteShelfFromSettings', () => {
  it('removes only the targeted shelf', () => {
    const settings = makeSettings([makeShelf('a'), makeShelf('b'), makeShelf('c')])
    const result = deleteShelfFromSettings(settings, 'b')
    expect(result.shelves).toHaveLength(2)
    expect(result.shelves.find((s) => s.id === 'b')).toBeUndefined()
    expect(result.shelves.find((s) => s.id === 'a')).toBeDefined()
    expect(result.shelves.find((s) => s.id === 'c')).toBeDefined()
  })

  it('does not mutate the original settings', () => {
    const settings = makeSettings([makeShelf('a'), makeShelf('b')])
    deleteShelfFromSettings(settings, 'a')
    expect(settings.shelves).toHaveLength(2)
  })

  it('returns unchanged settings when id not found', () => {
    const settings = makeSettings([makeShelf('a')])
    const result = deleteShelfFromSettings(settings, 'missing')
    expect(result.shelves).toHaveLength(1)
  })
})

describe('addShelfToSettings', () => {
  it('prepends a new shelf to the top', () => {
    const settings = makeSettings([makeShelf('a')])
    const result = addShelfToSettings(settings, makeShelf('b'))
    expect(result.shelves).toHaveLength(2)
    expect(result.shelves[0].id).toBe('b')
  })

  it('inserts after a specific shelf when afterId is given', () => {
    const settings = makeSettings([makeShelf('a'), makeShelf('c')])
    const result = addShelfToSettings(settings, makeShelf('b'), 'a')
    expect(result.shelves).toHaveLength(3)
    expect(result.shelves[0].id).toBe('a')
    expect(result.shelves[1].id).toBe('b')
    expect(result.shelves[2].id).toBe('c')
  })

  it('does not mutate the original settings', () => {
    const settings = makeSettings([makeShelf('a')])
    addShelfToSettings(settings, makeShelf('b'))
    expect(settings.shelves).toHaveLength(1)
  })

  it('works on empty shelves list', () => {
    const settings = makeSettings([])
    const result = addShelfToSettings(settings, makeShelf('a'))
    expect(result.shelves).toHaveLength(1)
    expect(result.shelves[0].id).toBe('a')
  })
})

describe('moveShelf', () => {
  it('moves a shelf up by one position', () => {
    const settings = makeSettings([makeShelf('a'), makeShelf('b'), makeShelf('c')])
    const result = moveShelf(settings, 'b', -1)
    expect(result.shelves[0].id).toBe('b')
    expect(result.shelves[1].id).toBe('a')
    expect(result.shelves[2].id).toBe('c')
  })

  it('moves a shelf down by one position', () => {
    const settings = makeSettings([makeShelf('a'), makeShelf('b'), makeShelf('c')])
    const result = moveShelf(settings, 'b', 1)
    expect(result.shelves[0].id).toBe('a')
    expect(result.shelves[1].id).toBe('c')
    expect(result.shelves[2].id).toBe('b')
  })

  it('does not move the first shelf further up', () => {
    const settings = makeSettings([makeShelf('a'), makeShelf('b')])
    const result = moveShelf(settings, 'a', -1)
    expect(result.shelves[0].id).toBe('a')
    expect(result.shelves[1].id).toBe('b')
  })

  it('does not move the last shelf further down', () => {
    const settings = makeSettings([makeShelf('a'), makeShelf('b')])
    const result = moveShelf(settings, 'b', 1)
    expect(result.shelves[0].id).toBe('a')
    expect(result.shelves[1].id).toBe('b')
  })

  it('returns unchanged settings when id not found', () => {
    const settings = makeSettings([makeShelf('a'), makeShelf('b')])
    const result = moveShelf(settings, 'missing', -1)
    expect(result.shelves[0].id).toBe('a')
    expect(result.shelves[1].id).toBe('b')
  })
})

describe('legacyFilterToGroup', () => {
  it('converts installed:false to inverted installed item', () => {
    const result = legacyFilterToGroup({ installed: false, sort: 'alphabetical' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].type).toBe('installed')
    expect(result.items[0].inverted).toBe(true)
  })

  it('converts installed:true to non-inverted installed item', () => {
    const result = legacyFilterToGroup({ installed: true, sort: 'alphabetical' })
    expect(result.items[0].type).toBe('installed')
    expect(result.items[0].inverted).toBe(false)
  })

  it('converts favorites:true to favorites item', () => {
    const result = legacyFilterToGroup({ favorites: true, sort: 'alphabetical' })
    expect(result.items[0].type).toBe('favorites')
  })

  it('converts nonSteam:true to nonSteam item', () => {
    const result = legacyFilterToGroup({ nonSteam: true, sort: 'alphabetical' })
    expect(result.items[0].type).toBe('nonSteam')
  })

  it('converts hidden:"only" to hidden item', () => {
    const result = legacyFilterToGroup({ hidden: 'only', sort: 'alphabetical' })
    expect(result.items[0].type).toBe('hidden')
    expect(result.items[0].params?.mode).toBe('only')
  })

  it('converts playedWithinDays to playedWithinDays item', () => {
    const result = legacyFilterToGroup({ playedWithinDays: 7, sort: 'alphabetical' })
    expect(result.items[0].type).toBe('playedWithinDays')
    expect(result.items[0].params?.days).toBe(7)
  })

  it('converts nameIncludes to nameIncludes item', () => {
    const result = legacyFilterToGroup({ nameIncludes: 'elden', sort: 'alphabetical' })
    expect(result.items[0].type).toBe('nameIncludes')
    expect(result.items[0].params?.text).toBe('elden')
  })

  it('converts nameRegex to nameRegex item', () => {
    const result = legacyFilterToGroup({ nameRegex: '^The', sort: 'alphabetical' })
    expect(result.items[0].type).toBe('nameRegex')
    expect(result.items[0].params?.pattern).toBe('^The')
  })

  it('converts deckCompatibility array to deckCompatibility item', () => {
    const result = legacyFilterToGroup({ deckCompatibility: ['verified', 'playable'], sort: 'alphabetical' })
    expect(result.items[0].type).toBe('deckCompatibility')
    expect(result.items[0].params?.levels).toEqual(['verified', 'playable'])
  })

  it('converts multiple legacy fields into multiple items', () => {
    const result = legacyFilterToGroup({ installed: true, favorites: true, sort: 'alphabetical' })
    expect(result.items).toHaveLength(2)
  })

  it('returns empty group for filter with only sort', () => {
    const result = legacyFilterToGroup({ sort: 'alphabetical' })
    expect(result.items).toHaveLength(0)
    expect(result.mode).toBe('and')
  })
})

describe('filterGroupToFilter', () => {
  it('wraps a group as the filterGroup field', () => {
    const group = { mode: 'or' as const, items: [] }
    const result = filterGroupToFilter(group, 'recent')
    expect(result.filterGroup).toBe(group)
    expect(result.sort).toBe('recent')
  })

  it('defaults sort to alphabetical', () => {
    const result = filterGroupToFilter({ mode: 'and', items: [] })
    expect(result.sort).toBe('alphabetical')
  })
})

describe('getEffectiveFilterGroup', () => {
  it('returns filterGroup when present and non-empty', () => {
    const group = { mode: 'or' as const, items: [{ type: 'favorites' as const, params: {} }] }
    const result = getEffectiveFilterGroup({ filterGroup: group, sort: 'alphabetical' })
    expect(result.mode).toBe('or')
    expect(result.items[0].type).toBe('favorites')
  })

  it('falls back to legacy fields when filterGroup is absent', () => {
    const result = getEffectiveFilterGroup({ installed: true, sort: 'alphabetical' })
    expect(result.items[0].type).toBe('installed')
  })

  it('falls back to legacy fields when filterGroup items is empty', () => {
    const result = getEffectiveFilterGroup({
      filterGroup: { mode: 'and', items: [] },
      installed: true,
      sort: 'alphabetical',
    })
    expect(result.items[0].type).toBe('installed')
  })
})

describe('normalizeFilter', () => {
  it('returns default filter when source is not a filter type', () => {
    const result = normalizeFilter({ type: 'tab', tab: 'all' })
    expect(result.sort).toBe('alphabetical')
    expect(result.installed).toBe(true)
  })

  it('merges source filter with defaults', () => {
    const result = normalizeFilter({ type: 'filter', filter: { sort: 'recent' } })
    expect(result.sort).toBe('recent')
  })
})

describe('ShelfSchema matchNativeSize', () => {
  it('defaults to false when field is absent', () => {
    const result = ShelfSchema.parse({
      id: 'test',
      title: 'Test',
      source: { type: 'tab', tab: 'all' },
    })
    expect(result.matchNativeSize).toBe(false)
  })

  it('accepts explicit false', () => {
    const result = ShelfSchema.parse({
      id: 'test',
      title: 'Test',
      matchNativeSize: false,
      source: { type: 'tab', tab: 'all' },
    })
    expect(result.matchNativeSize).toBe(false)
  })

  it('accepts explicit true', () => {
    const result = ShelfSchema.parse({
      id: 'test',
      title: 'Test',
      matchNativeSize: true,
      source: { type: 'tab', tab: 'all' },
    })
    expect(result.matchNativeSize).toBe(true)
  })
})
