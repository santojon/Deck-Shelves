import { describe, it, expect, beforeEach } from 'vitest'
import { resolveSmartShelf, invalidateSmartShelfCache, isInVisibilityWindow, nextVisibilityBoundary } from '../../steam/smartShelves'
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

  it('best_unplayed excludes non-game app types (tools, Proton, runtimes)', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, playtime_forever: 0, last_played: 0, deck_compatibility_category: 3, app_type: 1 }),
      app({ appid: 2, installed: true, playtime_forever: 0, last_played: 0, deck_compatibility_category: 3, app_type: 4 }),
      app({ appid: 3, installed: true, playtime_forever: 0, last_played: 0, deck_compatibility_category: 3, app_type: undefined }),
    ]
    const ids = resolveSmartShelf('best_unplayed', apps, 10)
    expect(ids).toContain(1)
    expect(ids).not.toContain(2)
    expect(ids).toContain(3)
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

  it('custom mode returns [] when called directly (dispatched via resolveShelfAppIds)', () => {
    const apps: AppOverview[] = [app({ appid: 1, installed: true })]
    const ids = resolveSmartShelf('custom' as any, apps, 10)
    expect(ids).toEqual([])
  })
})

describe('isInVisibilityWindow', () => {
  function at(hour: number, day = 1) {
    const d = new Date(2026, 4, 4 + day, hour, 30, 0, 0) // base Mon 2026-05-04
    return d
  }

  it('returns true when no window and no day restriction', () => {
    expect(isInVisibilityWindow(undefined, undefined, at(13))).toBe(true)
  })

  it('returns true when start === end (treated as always)', () => {
    expect(isInVisibilityWindow({ start: 5, end: 5 }, undefined, at(13))).toBe(true)
  })

  it('accepts an empty array as no restriction', () => {
    expect(isInVisibilityWindow([], undefined, at(13))).toBe(true)
  })

  it('OR-combines multiple ranges (any match → visible)', () => {
    const ranges = [
      { start: 6, end: 9 },
      { start: 12, end: 14 },
      { start: 19, end: 22 },
    ]
    expect(isInVisibilityWindow(ranges, undefined, at(7))).toBe(true)
    expect(isInVisibilityWindow(ranges, undefined, at(13))).toBe(true)
    expect(isInVisibilityWindow(ranges, undefined, at(20))).toBe(true)
    expect(isInVisibilityWindow(ranges, undefined, at(10))).toBe(false)
    expect(isInVisibilityWindow(ranges, undefined, at(23))).toBe(false)
  })

  it('day filter still applies with multi-range windows', () => {
    const ranges = [{ start: 6, end: 9 }, { start: 19, end: 22 }]
    const monday7 = new Date(2026, 4, 4, 7, 0, 0, 0)
    const tuesday7 = new Date(2026, 4, 5, 7, 0, 0, 0)
    expect(isInVisibilityWindow(ranges, [1], monday7)).toBe(true)
    expect(isInVisibilityWindow(ranges, [1], tuesday7)).toBe(false)
  })

  it('non-wrap window: visible inside [start, end)', () => {
    expect(isInVisibilityWindow({ start: 9, end: 17 }, undefined, at(9))).toBe(true)
    expect(isInVisibilityWindow({ start: 9, end: 17 }, undefined, at(16))).toBe(true)
    expect(isInVisibilityWindow({ start: 9, end: 17 }, undefined, at(17))).toBe(false)
    expect(isInVisibilityWindow({ start: 9, end: 17 }, undefined, at(8))).toBe(false)
  })

  it('wrap window: visible across midnight', () => {
    expect(isInVisibilityWindow({ start: 22, end: 6 }, undefined, at(23))).toBe(true)
    expect(isInVisibilityWindow({ start: 22, end: 6 }, undefined, at(2))).toBe(true)
    expect(isInVisibilityWindow({ start: 22, end: 6 }, undefined, at(6))).toBe(false)
    expect(isInVisibilityWindow({ start: 22, end: 6 }, undefined, at(12))).toBe(false)
  })

  it('day-of-week filter restricts to listed days', () => {
    // Monday
    const monday = new Date(2026, 4, 4, 12, 0, 0, 0)
    expect(isInVisibilityWindow(undefined, [1], monday)).toBe(true)
    expect(isInVisibilityWindow(undefined, [0, 6], monday)).toBe(false)
  })

  it('undefined day filter = no restriction; empty array = never visible', () => {
    const monday = new Date(2026, 4, 4, 12, 0, 0, 0)
    expect(isInVisibilityWindow(undefined, undefined, monday)).toBe(true)
    expect(isInVisibilityWindow(undefined, [], monday)).toBe(false)
  })

  it('window AND day filter both apply', () => {
    const monday12 = new Date(2026, 4, 4, 12, 0, 0, 0)
    expect(isInVisibilityWindow({ start: 9, end: 17 }, [1], monday12)).toBe(true)
    expect(isInVisibilityWindow({ start: 9, end: 17 }, [2], monday12)).toBe(false)
    expect(isInVisibilityWindow({ start: 18, end: 22 }, [1], monday12)).toBe(false)
  })
})

describe('nextVisibilityBoundary', () => {
  it('returns null when no window and no day restriction', () => {
    expect(nextVisibilityBoundary(undefined, undefined, new Date(2026, 4, 4, 12))).toBeNull()
  })

  it('returns the next hour boundary when inside the window', () => {
    const now = new Date(2026, 4, 4, 10, 30, 0, 0)
    const next = nextVisibilityBoundary({ start: 9, end: 17 }, undefined, now)
    // Next flip = 17:00 (out)
    expect(next).not.toBeNull()
    const nextDate = new Date(next!)
    expect(nextDate.getHours()).toBe(17)
  })

  it('returns the start of the window when outside', () => {
    const now = new Date(2026, 4, 4, 7, 0, 0, 0)
    const next = nextVisibilityBoundary({ start: 9, end: 17 }, undefined, now)
    expect(next).not.toBeNull()
    const nextDate = new Date(next!)
    expect(nextDate.getHours()).toBe(9)
  })

  it('handles wrap-around windows', () => {
    const now = new Date(2026, 4, 4, 23, 0, 0, 0) // inside 22→6
    const next = nextVisibilityBoundary({ start: 22, end: 6 }, undefined, now)
    expect(next).not.toBeNull()
    const nextDate = new Date(next!)
    expect(nextDate.getHours()).toBe(6)
  })
})
