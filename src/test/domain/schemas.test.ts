import { describe, it, expect } from 'vitest'
import { ShelfSchema, SettingsSchema, SmartShelfSchema } from '../../types'

describe('ShelfSchema hideShelfTitle', () => {
  it('defaults to false when absent', () => {
    const r = ShelfSchema.parse({
      id: 's',
      title: 'Shelf',
      source: { type: 'tab', tab: 'all' },
    })
    expect(r.hideShelfTitle).toBe(false)
  })

  it('round-trips an explicit true', () => {
    const r = ShelfSchema.parse({
      id: 's',
      title: 'Shelf',
      hideShelfTitle: true,
      source: { type: 'tab', tab: 'all' },
    })
    expect(r.hideShelfTitle).toBe(true)
  })
})

describe('SettingsSchema globalHideShelfTitle', () => {
  it('defaults to false when absent', () => {
    const r = SettingsSchema.parse({})
    expect(r.globalHideShelfTitle).toBe(false)
  })

  it('round-trips an explicit true', () => {
    const r = SettingsSchema.parse({ globalHideShelfTitle: true })
    expect(r.globalHideShelfTitle).toBe(true)
  })
})

describe('SmartShelfSchema hideShelfTitle', () => {
  it('is optional and undefined when absent', () => {
    const r = SmartShelfSchema.parse({
      id: 'a',
      title: 'A',
      mode: 'quick_play',
    })
    expect(r.hideShelfTitle).toBeUndefined()
  })

  it('accepts an explicit true', () => {
    const r = SmartShelfSchema.parse({
      id: 'a',
      title: 'A',
      mode: 'quick_play',
      hideShelfTitle: true,
    })
    expect(r.hideShelfTitle).toBe(true)
  })
})

describe('SettingsSchema with new templates', () => {
  it('accepts a shelf using the steam_cloud filterGroup shape', () => {
    const r = SettingsSchema.parse({
      shelves: [{
        id: 'cloud',
        title: 'Cloud',
        source: {
          type: 'filter',
          filter: {
            filterGroup: { mode: 'and', items: [{ type: 'cloudAvailable', inverted: false, params: {} }] },
            sort: 'alphabetical',
          },
        },
      }],
    })
    expect(r.shelves).toHaveLength(1)
    const src = r.shelves[0].source
    expect(src.type).toBe('filter')
    if (src.type === 'filter') {
      expect(src.filter.filterGroup?.items[0].type).toBe('cloudAvailable')
    }
  })

  it('accepts a shelf using the deck_verified filterGroup shape', () => {
    const r = SettingsSchema.parse({
      shelves: [{
        id: 'verified',
        title: 'Verified',
        source: {
          type: 'filter',
          filter: {
            filterGroup: { mode: 'and', items: [{ type: 'deckCompatibility', inverted: false, params: { levels: ['verified'] } }] },
            sort: 'alphabetical',
          },
        },
      }],
    })
    const src = r.shelves[0].source
    if (src.type === 'filter') {
      expect(src.filter.filterGroup?.items[0].params?.levels).toEqual(['verified'])
    }
  })
})
