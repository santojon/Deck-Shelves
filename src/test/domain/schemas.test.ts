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

describe('unknown-field round-trip (.passthrough())', () => {
  it('keeps an unrecognised root-level field', () => {
    const r = SettingsSchema.parse({ futureRootField: 'z' } as any)
    expect((r as any).futureRootField).toBe('z')
  })

  it('keeps an unrecognised field on a regular shelf', () => {
    const r = SettingsSchema.parse({
      shelves: [{
        id: 's', title: 'Shelf', source: { type: 'tab', tab: 'all' },
        futureShelfField: 'y',
      }],
    } as any)
    expect((r.shelves[0] as any).futureShelfField).toBe('y')
  })

  it('keeps an unrecognised field on a smart shelf', () => {
    const r = SettingsSchema.parse({
      smartShelves: [{ id: 'ss', title: 'Smart', mode: 'quick_play', futureSmartField: 'x' }],
    } as any)
    expect((r.smartShelves[0] as any).futureSmartField).toBe('x')
  })
})

describe('profile fields survive parsing', () => {
  it('keeps linkShelves and the sync clock on a profile', () => {
    const r = SettingsSchema.parse({
      profiles: [{ id: 'p', name: 'P', createdAt: 'x', snapshot: {}, linkShelves: true, updatedAt: 42 }],
    } as any)
    expect(r.profiles[0].linkShelves).toBe(true)
    expect(r.profiles[0].updatedAt).toBe(42)
  })
})

describe('a smart mode this build does not know', () => {
  const smart = (over: Record<string, unknown> = {}) => ({ id: 'sm', title: 'Smart', mode: 'acme.mode', ...over })
  const smartSource = (mode: string) => ({
    id: 's', title: 'Shelf',
    source: { type: 'composite', combine: 'union', sources: [{ type: 'tab', tab: 'all' }, { type: 'smart', mode }] },
  })

  it('is kept on a smart shelf, as a combined mode and as a smart extra source', () => {
    expect(SmartShelfSchema.parse(smart()).mode).toBe('acme.mode')
    expect(SmartShelfSchema.parse(smart({ mode: 'quick_play', compositeModes: ['acme.mode'] })).compositeModes).toEqual(['acme.mode'])
    expect((ShelfSchema.parse(smartSource('acme.mode')).source as any).sources[1].mode).toBe('acme.mode')
  })

  it('leaves the whole settings document parseable', () => {
    const r = SettingsSchema.safeParse({ smartShelves: [smart()], shelves: [smartSource('acme.mode')] })
    expect(r.success).toBe(true)
  })

  it('is still refused when empty or longer than 64 characters', () => {
    expect(SmartShelfSchema.safeParse(smart({ mode: '' })).success).toBe(false)
    expect(SmartShelfSchema.safeParse(smart({ mode: 'x'.repeat(65) })).success).toBe(false)
    expect(SmartShelfSchema.safeParse(smart({ mode: 'quick_play', compositeModes: [''] })).success).toBe(false)
    expect(ShelfSchema.safeParse(smartSource('x'.repeat(65))).success).toBe(false)
  })

  it('does not stop a retired mode from parsing', () => {
    expect(SmartShelfSchema.parse(smart({ mode: 'long_session_night' })).mode).toBe('long_session_night')
  })
})
