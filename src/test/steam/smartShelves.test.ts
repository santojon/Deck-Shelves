import { describe, it, expect, beforeEach } from 'vitest'
import { resolveSmartShelf, invalidateSmartShelfCache } from '../../steam/smartShelves'
import type { AppOverview } from '../../steam'

function app(overrides: Partial<AppOverview> & { appid: number }): AppOverview {
  return { display_name: `App ${overrides.appid}`, ...overrides } as AppOverview
}

describe('resolveSmartShelf', () => {
  beforeEach(() => invalidateSmartShelfCache())

  it('quick_play prefers Deck-verified installed games with low playtime', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, deck_compatibility_category: 3, playtime_forever: 30 }),
      app({ appid: 2, installed: true, deck_compatibility_category: 2, playtime_forever: 30 }),
      app({ appid: 3, installed: false, deck_compatibility_category: 3, playtime_forever: 30 }),
      app({ appid: 4, installed: true, deck_compatibility_category: 0, playtime_forever: 30 }),
    ]
    const ids = resolveSmartShelf('quick_play', apps, 10)
    expect(ids).toContain(1)
    expect(ids).toContain(2)
    expect(ids).not.toContain(3)
    expect(ids).not.toContain(4)
  })

  it('not_started filters apps with no playtime and no last_played', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, playtime_forever: 0, last_played: 0 }),
      app({ appid: 2, playtime_forever: 100, last_played: 0 }),
      app({ appid: 3, playtime_forever: 0, last_played: 1 }),
    ]
    const ids = resolveSmartShelf('not_started', apps, 10)
    expect(ids).toEqual([1])
  })

  it('deck_picks returns only deck_compatibility_category=3 apps sorted by last_played desc', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, deck_compatibility_category: 3, last_played: 100 }),
      app({ appid: 2, deck_compatibility_category: 3, last_played: 200 }),
      app({ appid: 3, deck_compatibility_category: 2, last_played: 999 }),
    ]
    const ids = resolveSmartShelf('deck_picks', apps, 10)
    expect(ids).toEqual([2, 1])
  })

  it('best_unplayed returns installed apps with no playtime and no last_played', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, playtime_forever: 0, last_played: 0, deck_compatibility_category: 3 }),
      app({ appid: 2, installed: true, playtime_forever: 30, last_played: 0 }),
      app({ appid: 3, installed: false, playtime_forever: 0, last_played: 0 }),
    ]
    const ids = resolveSmartShelf('best_unplayed', apps, 10)
    expect(ids).toEqual([1])
  })

  it('non_steam returns is_non_steam apps', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, is_non_steam: true }),
      app({ appid: 2, is_non_steam: false }),
    ]
    const ids = resolveSmartShelf('non_steam', apps, 10)
    expect(ids).toContain(1)
    expect(ids).not.toContain(2)
  })

  it('unknown mode returns an empty list', () => {
    const apps = [app({ appid: 1 })]
    const ids = resolveSmartShelf('not_a_mode' as any, apps, 10)
    expect(ids).toEqual([])
  })

  it('respects the limit', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, deck_compatibility_category: 3, last_played: 100 }),
      app({ appid: 2, deck_compatibility_category: 3, last_played: 200 }),
      app({ appid: 3, deck_compatibility_category: 3, last_played: 300 }),
    ]
    const ids = resolveSmartShelf('deck_picks', apps, 2)
    expect(ids).toHaveLength(2)
  })

  it('caches the result by mode/limit/params/ttl key — second call returns the same instance', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, deck_compatibility_category: 3, last_played: 100 }),
    ]
    const a = resolveSmartShelf('deck_picks', apps, 10)
    const b = resolveSmartShelf('deck_picks', apps, 10)
    expect(b).toBe(a)
  })

  it('invalidateSmartShelfCache forces a recomputation', () => {
    const apps: AppOverview[] = [app({ appid: 1, deck_compatibility_category: 3 })]
    const a = resolveSmartShelf('deck_picks', apps, 10)
    invalidateSmartShelfCache()
    const b = resolveSmartShelf('deck_picks', apps, 10)
    expect(b).not.toBe(a)
    expect(b).toEqual(a)
  })
})
