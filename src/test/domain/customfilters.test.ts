import { describe, it, expect } from 'vitest'
import {
  mapFilterTypeToInternal,
  convertFilterToItem,
  convertFiltersToGroup,
  containerToShelfSource,
} from '../../domain/customfilters'

describe('mapFilterTypeToInternal', () => {
  it('maps all known filter type variants to the correct internal type', () => {
    expect(mapFilterTypeToInternal('last played')).toBe('playedWithinDays')
    expect(mapFilterTypeToInternal('lastPlayed')).toBe('playedWithinDays')
    expect(mapFilterTypeToInternal('playedWithinNDays')).toBe('playedWithinDays')
    expect(mapFilterTypeToInternal('installed')).toBe('installed')
    expect(mapFilterTypeToInternal('installation')).toBe('installed')
    expect(mapFilterTypeToInternal('non-steam')).toBe('nonSteam')
    expect(mapFilterTypeToInternal('platform')).toBe('nonSteam')
    expect(mapFilterTypeToInternal('hidden')).toBe('hidden')
    expect(mapFilterTypeToInternal('update pending')).toBe('updatePending')
    expect(mapFilterTypeToInternal('update_pending')).toBe('updatePending')
    expect(mapFilterTypeToInternal('deck compatibility')).toBe('deckCompatibility')
    expect(mapFilterTypeToInternal('deck-compatibility')).toBe('deckCompatibility')
    expect(mapFilterTypeToInternal('deckVerde')).toBe('deckCompatibility')
    expect(mapFilterTypeToInternal('system compatibility')).toBe('systemCompatibility')
    expect(mapFilterTypeToInternal('systemCompat')).toBe('systemCompatibility')
    expect(mapFilterTypeToInternal('os compatibility')).toBe('systemCompatibility')
    expect(mapFilterTypeToInternal('remote play')).toBe('remotePlayLocation')
    expect(mapFilterTypeToInternal('remotePlayLocation')).toBe('remotePlayLocation')
    expect(mapFilterTypeToInternal('remote install')).toBe('remotePlayLocation')
    expect(mapFilterTypeToInternal('playtime')).toBe('playtimeRange')
    expect(mapFilterTypeToInternal('playtimeRange')).toBe('playtimeRange')
    expect(mapFilterTypeToInternal('recentlyActive')).toBe('recentlyActive')
    expect(mapFilterTypeToInternal('current rotation')).toBe('recentlyActive')
    expect(mapFilterTypeToInternal('neglected')).toBe('neglected')
    expect(mapFilterTypeToInternal('abandoned')).toBe('neglected')
    expect(mapFilterTypeToInternal('name')).toBe('nameIncludes')
    expect(mapFilterTypeToInternal('nameIncludes')).toBe('nameIncludes')
    expect(mapFilterTypeToInternal('nameregex')).toBe('nameRegex')
    expect(mapFilterTypeToInternal('friends')).toBe('friends')
    expect(mapFilterTypeToInternal('store tag')).toBe('storeTag')
    expect(mapFilterTypeToInternal('storetag')).toBe('storeTag')
    expect(mapFilterTypeToInternal('tag')).toBe('storeTag')
    expect(mapFilterTypeToInternal('achievements')).toBe('achievements')
    expect(mapFilterTypeToInternal('collection')).toBe('collection')
    expect(mapFilterTypeToInternal('merge')).toBe('merge')
    expect(mapFilterTypeToInternal('favorites')).toBe('favorites')
  })

  it('falls back to nameIncludes for unknown types', () => {
    expect(mapFilterTypeToInternal('unknown_type')).toBe('nameIncludes')
    expect(mapFilterTypeToInternal('')).toBe('nameIncludes')
    expect(mapFilterTypeToInternal('something_else')).toBe('nameIncludes')
  })

  it('is case and separator insensitive', () => {
    expect(mapFilterTypeToInternal('INSTALLED')).toBe('installed')
    expect(mapFilterTypeToInternal('Update_Pending')).toBe('updatePending')
    expect(mapFilterTypeToInternal('Update Pending')).toBe('updatePending')
    expect(mapFilterTypeToInternal('NON STEAM')).toBe('nonSteam')
  })
})

describe('convertFilterToItem', () => {
  it('converts a basic filter with explicit type', () => {
    const item = convertFilterToItem({ type: 'installed', params: {} })
    expect(item.type).toBe('installed')
    expect(item.inverted).toBe(false)
  })

  it('reads inverted flag', () => {
    const item = convertFilterToItem({ type: 'installed', inverted: true, params: {} })
    expect(item.inverted).toBe(true)
  })

  it('reads params from filter.options as fallback', () => {
    const item = convertFilterToItem({ type: 'nameIncludes', options: { text: 'elden' } })
    expect(item.params).toMatchObject({ text: 'elden' })
  })

  it('normalizes storeTag params.tag to params.tags array', () => {
    const item = convertFilterToItem({ type: 'store tag', params: { tag: 'RPG' } })
    expect(item.type).toBe('storeTag')
    expect(item.params?.tags).toEqual(['RPG'])
  })

  it('normalizes collection params.id to params.collectionId', () => {
    const item = convertFilterToItem({ type: 'collection', params: { id: 'abc123' } })
    expect(item.type).toBe('collection')
    expect(item.params?.collectionId).toBe('abc123')
  })

  it('converts merge filter recursively', () => {
    const item = convertFilterToItem({
      type: 'merge',
      params: {
        mode: 'or',
        filters: [
          { type: 'installed', params: {} },
          { type: 'favorites', params: {} },
        ],
      },
    })
    expect(item.type).toBe('merge')
    expect(item.params?.mode).toBe('or')
    expect(item.params?.items).toHaveLength(2)
    expect(item.params?.items[0].type).toBe('installed')
  })
})

describe('convertFiltersToGroup', () => {
  it('returns AND group with empty items for empty input', () => {
    const result = convertFiltersToGroup([])
    expect(result.mode).toBe('and')
    expect(result.items).toHaveLength(0)
  })

  it('skips null/falsy entries', () => {
    const result = convertFiltersToGroup([null, undefined, false] as any[])
    expect(result.items).toHaveLength(0)
  })

  it('converts all valid filters in array', () => {
    const result = convertFiltersToGroup([
      { type: 'installed', params: {} },
      { type: 'favorites', params: {} },
    ])
    expect(result.items).toHaveLength(2)
    expect(result.items[0].type).toBe('installed')
    expect(result.items[1].type).toBe('favorites')
  })
})

describe('containerToShelfSource', () => {
  it('returns tab source when container has no filters', () => {
    const result = containerToShelfSource({ id: 'my-tab', title: 'My Tab' })
    expect(result.type).toBe('tab')
    expect((result as any).tab).toBe('my-tab')
  })

  it('returns tab source for empty filters array', () => {
    const result = containerToShelfSource({ id: 'my-tab', filters: [] })
    expect(result.type).toBe('tab')
  })

  it('returns filter source when container has filters', () => {
    const result = containerToShelfSource({
      id: 'my-tab',
      filters: [{ type: 'installed', params: {} }],
    })
    expect(result.type).toBe('filter')
    expect((result as any).filter?.filterGroup?.items).toHaveLength(1)
  })

  it('uses title as tab id fallback when id is missing', () => {
    const result = containerToShelfSource({ title: 'My Tab' })
    expect(result.type).toBe('tab')
    expect((result as any).tab).toBe('My Tab')
  })

  it('handles null container', () => {
    const result = containerToShelfSource(null)
    expect(result.type).toBe('tab')
    expect((result as any).tab).toBe('')
  })
})

describe('TabMaster v2.10+ filter parity (import mapping)', () => {
  it('maps current TabMaster filter types instead of falling back to nameIncludes', () => {
    expect(mapFilterTypeToInternal('regex')).toBe('nameRegex')
    expect(mapFilterTypeToInternal('tags')).toBe('storeTag')
    expect(mapFilterTypeToInternal('time played')).toBe('playtimeRange')
    expect(mapFilterTypeToInternal('size on disk')).toBe('installedSizeRange')
    expect(mapFilterTypeToInternal('review score')).toBe('reviewScore')
    expect(mapFilterTypeToInternal('release date')).toBe('releaseDate')
    expect(mapFilterTypeToInternal('coming soon')).toBe('comingSoon')
    expect(mapFilterTypeToInternal('demo')).toBe('demo')
    expect(mapFilterTypeToInternal('streamable')).toBe('remotePlayLocation')
    expect(mapFilterTypeToInternal('install folder')).toBe('storageDevice')
  })

  it('keeps SteamOS compatibility DISTINCT from system compatibility (divergent data)', () => {
    expect(mapFilterTypeToInternal('steamos compatibility')).toBe('steamosCompatibility')
    expect(mapFilterTypeToInternal('system compatibility')).toBe('systemCompatibility')
  })

  it('normalizes SteamOS/Deck { category } to our levels[]', () => {
    expect(convertFilterToItem({ type: 'steamos compatibility', params: { category: 3 } }).params!.levels).toEqual(['verified'])
    expect(convertFilterToItem({ type: 'deck compatibility', params: { category: 2 } }).params!.levels).toEqual(['playable'])
  })

  it('normalizes review score / release date / size params', () => {
    const rs = convertFilterToItem({ type: 'review score', params: { scoreThreshold: 80, condition: 'below', type: 'steam' } })
    expect(rs.params).toMatchObject({ value: 80, op: '<=', source: 'steam' })
    const rd = convertFilterToItem({ type: 'release date', params: { date: 1600000000, condition: 'above' } })
    expect(rd.params).toMatchObject({ ts: 1600000000, op: 'after' })
    const sz = convertFilterToItem({ type: 'size on disk', params: { gbThreshold: 10, condition: 'above' } })
    expect(sz.params!.minMB).toBe(10240)
  })

  it('inverts blacklist and non-coming-soon on import', () => {
    expect(convertFilterToItem({ type: 'blacklist', params: { appIds: [1] } }).inverted).toBe(true)
    expect(convertFilterToItem({ type: 'coming soon', params: { isComingSoon: false } }).inverted).toBe(true)
    expect(convertFilterToItem({ type: 'coming soon', params: { isComingSoon: true } }).inverted).toBe(false)
  })
})
