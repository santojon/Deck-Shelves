import { describe, it, expect } from 'vitest'
import { isKnownFilterType } from '../../types'
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
    expect(mapFilterTypeToInternal('collection')).toBe('collection')
    expect(mapFilterTypeToInternal('merge')).toBe('merge')
    expect(mapFilterTypeToInternal('favorites')).toBe('favorites')
  })

  it('keeps a type it cannot map under its normalised name, so the condition imports as unavailable', () => {
    expect(mapFilterTypeToInternal('unknown_type')).toBe('unknowntype')
    expect(mapFilterTypeToInternal('')).toBe('')
  })

  it('maps the base-set types that read the client data', () => {
    expect(mapFilterTypeToInternal('store tag')).toBe('storeTag')
    expect(mapFilterTypeToInternal('tags')).toBe('storeTag')
    expect(mapFilterTypeToInternal('friends')).toBe('friends')
    expect(mapFilterTypeToInternal('achievements')).toBe('achievements')
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

  it('imports a demo filter as the demo kind of shortcut type, negated when it says not a demo', () => {
    expect(convertFilterToItem({ type: 'demo', params: {} })).toEqual({ type: 'shortcutType', inverted: false, params: { kinds: ['demo'] } })
    expect(convertFilterToItem({ type: 'demo', params: { isDemo: false } })).toEqual({ type: 'shortcutType', inverted: true, params: { isDemo: false, kinds: ['demo'] } })
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
    expect(mapFilterTypeToInternal('time played')).toBe('playtimeRange')
    expect(mapFilterTypeToInternal('size on disk')).toBe('installedSizeRange')
    expect(mapFilterTypeToInternal('review score')).toBe('reviewScore')
    expect(mapFilterTypeToInternal('release date')).toBe('releaseDate')
    expect(mapFilterTypeToInternal('coming soon')).toBe('comingSoon')
    expect(mapFilterTypeToInternal('demo')).toBe('shortcutType')
    expect(mapFilterTypeToInternal('streamable')).toBe('remotePlayLocation')
    expect(mapFilterTypeToInternal('tags')).toBe('storeTag')
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

describe('TabMaster 3.1 import', () => {
  const tm = (type: string, params: any, inverted = false) => convertFilterToItem({ type, inverted, params })
  const DAY = 86400

  it('maps every filter type of the 3.1 release to a condition the plugin evaluates', () => {
    const defaults: Record<string, any> = {
      collection: { id: 'favorite', name: 'Favorites' }, installed: { installed: true }, regex: { regex: '' },
      friends: { friends: [], mode: 'and' }, tags: { tags: [], mode: 'and' }, whitelist: { games: [] }, blacklist: { games: [] },
      merge: { filters: [], mode: 'and' }, platform: { platform: 'steam' }, 'deck compatibility': { category: 3 },
      'steamos compatibility': { category: 2 }, 'review score': { scoreThreshold: 50, condition: 'above', type: 'metacritic' },
      'time played': { timeThreshold: 60, condition: 'above', units: 'minutes' }, 'size on disk': { gbThreshold: 10, condition: 'above' },
      'release date': { date: undefined, condition: 'above' }, 'purchase date': { date: undefined, condition: 'above' },
      'last played': { date: undefined, condition: 'above' }, 'family sharing': { isFamilyShared: true }, demo: { isDemo: true },
      'coming soon': { isComingSoon: true }, streamable: { isStreamable: true }, 'steam features': { features: [], mode: 'and' },
      achievements: { threshold: 10, thresholdType: 'percent', condition: 'above' }, 'sd card': { card: 0 }, 'install folder': { driveName: '/home' },
    }
    for (const [type, params] of Object.entries(defaults)) {
      const item = tm(type, params)
      expect(isKnownFilterType(item.type), `${type} → ${item.type}`).toBe(true)
    }
  })

  it('negates the flags that mean the opposite of our condition', () => {
    expect(tm('installed', { installed: false })).toMatchObject({ type: 'installed', inverted: true })
    expect(tm('installed', { installed: true }).inverted).toBe(false)
    expect(tm('streamable', { isStreamable: false })).toMatchObject({ type: 'remotePlayLocation', inverted: true })
    expect(tm('platform', { platform: 'steam' })).toMatchObject({ type: 'nonSteam', inverted: true })
    expect(tm('platform', { platform: 'nonSteam' })).toMatchObject({ type: 'nonSteam', inverted: false })
    expect(tm('family sharing', { isFamilyShared: false })).toMatchObject({ type: 'familySharing', inverted: true })
    expect(tm('family sharing', { isFamilyShared: true }, true)).toMatchObject({ type: 'familySharing', inverted: true })
  })

  it('reads the 3.x date shapes: a day/month/year object, days ago, unknown, and the older timestamp', () => {
    const after = tm('release date', { date: { day: 15, month: 3, year: 2024 }, condition: 'above' })
    expect(after.params).toMatchObject({ op: 'after', ts: Math.floor(new Date(2024, 2, 15).getTime() / 1000) })
    const beforeYear = tm('purchase date', { date: { year: 2020 }, condition: 'below' })
    expect(beforeYear).toMatchObject({ type: 'purchaseDate', params: { op: 'before', ts: Math.floor(new Date(2021, 0, 1).getTime() / 1000) - 1 } })
    const beforeMonth = tm('release date', { date: { month: 6, year: 2022 }, condition: 'below' })
    expect(beforeMonth.params!.ts).toBe(Math.floor(new Date(2022, 6, 1).getTime() / 1000) - 1)
    const daysAgo = tm('purchase date', { daysAgo: 30, condition: 'above' })
    expect(Math.abs(Number(daysAgo.params!.ts) - (Date.now() / 1000 - 30 * DAY))).toBeLessThan(5)
    expect(tm('release date', { isUnknown: true, condition: 'above' }).params).toMatchObject({ op: 'unknown' })
    expect(tm('release date', { date: 1600000000, condition: 'below' }).params).toMatchObject({ op: 'before', ts: 1600000000 })
  })

  it('turns "last played" into played within N days or not played for N days', () => {
    expect(tm('last played', { daysAgo: 30, condition: 'above' })).toMatchObject({ type: 'playedWithinDays', params: { days: 30 } })
    expect(tm('last played', { daysAgo: 60, condition: 'below' })).toMatchObject({ type: 'neglected', params: { days: 60 } })
    const since = tm('last played', { date: { day: 1, month: 1, year: 2020 }, condition: 'above' })
    expect(since.type).toBe('playedWithinDays')
    expect(Number(since.params!.days)).toBeGreaterThan(365)
  })

  it('turns the achievements filter into a count range or a percentage range', () => {
    expect(tm('achievements', { threshold: 10, thresholdType: 'count', condition: 'above' })).toMatchObject({ type: 'achievements', params: { min: 10 } })
    expect(tm('achievements', { threshold: 5, thresholdType: 'count', condition: 'below' })).toMatchObject({ type: 'achievements', params: { min: 0, max: 5 } })
    expect(tm('achievements', { threshold: 70, thresholdType: 'percent', condition: 'above' })).toMatchObject({ type: 'achievementPercentRange', params: { min: 70, max: 100 } })
    expect(tm('achievements', { threshold: 30, thresholdType: 'percent', condition: 'below' })).toMatchObject({ type: 'achievementPercentRange', params: { min: 0, max: 30 } })
  })

  it('keeps the friends, tags and features lists with their any/all mode', () => {
    expect(tm('friends', { friends: [11, 22], mode: 'and' }).params).toMatchObject({ friends: [11, 22], min: 2 })
    expect(tm('friends', { friends: [11, 22], mode: 'or' }).params).toMatchObject({ friends: [11, 22], min: 1 })
    expect(tm('tags', { tags: [3964, 19], mode: 'and' })).toMatchObject({ type: 'storeTag', params: { tags: ['3964', '19'], mode: 'all' } })
    expect(tm('tags', { tags: [19], mode: 'or' }).params).toMatchObject({ tags: ['19'], mode: 'any' })
    expect(tm('steam features', { features: [28, 23], mode: 'or' })).toMatchObject({ type: 'storeCategory', params: { ids: [28, 23], mode: 'any' } })
    expect(tm('steam features', { features: [2], mode: 'and' }).params).toMatchObject({ ids: [2], mode: 'all' })
  })

  it('maps the game lists, the SD card and the install folder', () => {
    expect(tm('whitelist', { games: [10, 20] })).toMatchObject({ type: 'appIdList', inverted: false, params: { appIds: [10, 20] } })
    expect(tm('blacklist', { games: [10] })).toMatchObject({ type: 'appIdList', inverted: true, params: { appIds: [10] } })
    expect(tm('sd card', { card: 0 })).toMatchObject({ type: 'libraryLocation', params: { category: 'external' } })
    expect(tm('install folder', { driveName: '/run/media/deck/842f' }).params).toMatchObject({ category: 'external' })
    expect(tm('install folder', { driveName: '/home' }).params).toMatchObject({ category: 'internal' })
  })

  it('keeps the tab\'s any/all mode on the group', () => {
    expect(convertFiltersToGroup([{ type: 'installed', params: { installed: true } }], 'or').mode).toBe('or')
    expect(convertFiltersToGroup([], 'and').mode).toBe('and')
    expect(containerToShelfSource({ id: 't', title: 'T', filters: [{ type: 'installed', params: {} }], filtersMode: 'or' })).toMatchObject({ type: 'filter', filter: { filterGroup: { mode: 'or' } } })
  })

  it('converts a nested 3.1 tab with every child', () => {
    const group = convertFiltersToGroup([
      { type: 'merge', inverted: false, params: { mode: 'or', filters: [
        { type: 'platform', inverted: false, params: { platform: 'steam' } },
        { type: 'achievements', inverted: false, params: { threshold: 50, thresholdType: 'percent', condition: 'above' } },
      ] } },
      { type: 'installed', inverted: false, params: { installed: true } },
    ])
    expect(group.items.map((i) => i.type)).toEqual(['merge', 'installed'])
    expect((group.items[0].params!.items as any[]).map((i) => [i.type, i.inverted])).toEqual([['nonSteam', true], ['achievementPercentRange', false]])
  })
})
