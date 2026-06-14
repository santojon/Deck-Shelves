import { describe, it, expect, beforeEach, vi } from 'vitest'

// Stub the runtime modules BEFORE importing the resolver. vi.mock is hoisted.
vi.mock('../../runtime/batteryState', () => ({
  getBatteryState: vi.fn(() => null),
  isLowBattery: vi.fn(() => false),
  installBatteryState: vi.fn(() => () => {}),
}))

vi.mock('../../runtime/friendsState', () => ({
  getFriendsPlayingAppIds: vi.fn(() => new Set<number>()),
  getFriendsRecentlyPlayedAppIds: vi.fn(() => new Set<number>()),
  installFriendsState: vi.fn(() => () => {}),
  refreshFriendsState: vi.fn(),
}))

vi.mock('../../steam/appDetailsCache', () => ({
  getAppDetailsSummary: vi.fn(() => null),
  preloadAppDetailsSummary: vi.fn(),
  preloadAppDetailsSummaries: vi.fn(),
  clearAppDetailsCache: vi.fn(),
  appHasAnyCategory: vi.fn(() => false),
  getAppAchievementPct: vi.fn(() => NaN),
}))

vi.mock('../../store/settingsStore', () => ({
  getCurrentSettings: vi.fn(() => ({ onlineFeaturesEnabled: true })),
}))

import { resolveSmartShelf, invalidateSmartShelfCache } from '../../steam/smartShelves'
import * as batteryState from '../../runtime/batteryState'
import * as friendsState from '../../runtime/friendsState'
import * as appDetailsCache from '../../steam/appDetailsCache'
import * as settingsStore from '../../store/settingsStore'
import type { AppOverview } from '../../steam'

function app(overrides: Partial<AppOverview> & { appid: number }): AppOverview {
  return { display_name: `App ${overrides.appid}`, ...overrides } as AppOverview
}

beforeEach(() => {
  invalidateSmartShelfCache()
  vi.clearAllMocks()
  // Reset to default mock values.
  vi.mocked(batteryState.getBatteryState).mockReturnValue(null)
  vi.mocked(friendsState.getFriendsPlayingAppIds).mockReturnValue(new Set())
  vi.mocked(friendsState.getFriendsRecentlyPlayedAppIds).mockReturnValue(new Set())
  vi.mocked(appDetailsCache.appHasAnyCategory).mockReturnValue(false)
  vi.mocked(appDetailsCache.getAppAchievementPct).mockReturnValue(NaN)
  vi.mocked(settingsStore.getCurrentSettings).mockReturnValue({ onlineFeaturesEnabled: true } as any)
})

describe('low_battery_mode', () => {
  it('falls back to short_battery candidates when battery is unknown / on AC', () => {
    vi.mocked(batteryState.getBatteryState).mockReturnValue(null)
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, deck_compatibility_category: 3, playtime_forever: 60, ...({ size_on_disk: 2 * 1024 * 1024 * 1024 } as any) }),
      // size too big → excluded
      app({ appid: 2, installed: true, deck_compatibility_category: 3, playtime_forever: 60, ...({ size_on_disk: 10 * 1024 * 1024 * 1024 } as any) }),
    ]
    const ids = resolveSmartShelf('low_battery_mode', apps, 10)
    expect(ids).toContain(1)
    expect(ids).not.toContain(2)
  })

  it('when battery is low + discharging, hoists smallest + shortest-playtime first', () => {
    vi.mocked(batteryState.getBatteryState).mockReturnValue({
      hasBattery: true,
      state: 'discharging',
      level: 0.15, // 15% — below default 30% threshold
      ts: Date.now(),
    })
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, deck_compatibility_category: 3, playtime_forever: 60, ...({ size_on_disk: 3 * 1024 * 1024 * 1024 } as any) }),
      app({ appid: 2, installed: true, deck_compatibility_category: 3, playtime_forever: 60, ...({ size_on_disk: 1 * 1024 * 1024 * 1024 } as any) }),
    ]
    const ids = resolveSmartShelf('low_battery_mode', apps, 10)
    // 1 GB before 3 GB
    expect(ids).toEqual([2, 1])
  })

  it('when battery is NOT discharging (charging / full), falls back to normal sort', () => {
    vi.mocked(batteryState.getBatteryState).mockReturnValue({
      hasBattery: true,
      state: 'charging',
      level: 0.5,
      ts: Date.now(),
    })
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, deck_compatibility_category: 3, playtime_forever: 60, last_played: 100, ...({ size_on_disk: 3 * 1024 * 1024 * 1024 } as any) }),
      app({ appid: 2, installed: true, deck_compatibility_category: 3, playtime_forever: 60, last_played: 200, ...({ size_on_disk: 1 * 1024 * 1024 * 1024 } as any) }),
    ]
    const ids = resolveSmartShelf('low_battery_mode', apps, 10)
    // Deck level (both 3) + last_played desc → 2 (200) before 1 (100)
    expect(ids).toEqual([2, 1])
  })
})

describe('almost_finished', () => {
  it('returns empty when achievement cache is cold (NaN for every app)', () => {
    vi.mocked(appDetailsCache.getAppAchievementPct).mockReturnValue(NaN)
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, playtime_forever: 60, deck_compatibility_category: 3 }),
    ]
    const ids = resolveSmartShelf('almost_finished', apps, 10)
    expect(ids).toEqual([])
    // Should still preload — first paint partial, second populates.
    expect(vi.mocked(appDetailsCache.preloadAppDetailsSummaries)).toHaveBeenCalled()
  })

  it('surfaces apps whose achievement % is >= min threshold and < 100', () => {
    vi.mocked(appDetailsCache.getAppAchievementPct).mockImplementation((id) => {
      if (id === 1) return 85
      if (id === 2) return 50
      if (id === 3) return 100 // already completed — excluded
      return NaN
    })
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, playtime_forever: 60, deck_compatibility_category: 3 }),
      app({ appid: 2, installed: true, playtime_forever: 60, deck_compatibility_category: 3 }),
      app({ appid: 3, installed: true, playtime_forever: 60, deck_compatibility_category: 3 }),
    ]
    const ids = resolveSmartShelf('almost_finished', apps, 10)
    expect(ids).toEqual([1])
  })

  it('excludes apps with no playtime (must have started)', () => {
    vi.mocked(appDetailsCache.getAppAchievementPct).mockReturnValue(80)
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, playtime_forever: 0, deck_compatibility_category: 3 }),
    ]
    const ids = resolveSmartShelf('almost_finished', apps, 10)
    expect(ids).toEqual([])
  })
})

describe('couch_gaming / coop_ready / party_games', () => {
  it('returns empty when no app has the matching category in cache', () => {
    vi.mocked(appDetailsCache.appHasAnyCategory).mockReturnValue(false)
    const apps: AppOverview[] = [
      app({ appid: 1, deck_compatibility_category: 2 }),
    ]
    expect(resolveSmartShelf('couch_gaming', apps, 10)).toEqual([])
    expect(resolveSmartShelf('coop_ready', apps, 10)).toEqual([])
    expect(resolveSmartShelf('party_games', apps, 10)).toEqual([])
    expect(vi.mocked(appDetailsCache.preloadAppDetailsSummaries)).toHaveBeenCalled()
  })

  it('couch_gaming matches when category cache returns true for the app', () => {
    invalidateSmartShelfCache()
    vi.mocked(appDetailsCache.appHasAnyCategory).mockImplementation((id) => id === 1)
    const apps: AppOverview[] = [
      app({ appid: 1, deck_compatibility_category: 2, last_played: 200 }),
      app({ appid: 2, deck_compatibility_category: 2, last_played: 100 }),
    ]
    const ids = resolveSmartShelf('couch_gaming', apps, 10)
    expect(ids).toEqual([1])
  })

  it('coop_ready and party_games use different keyword sets but same shape', () => {
    invalidateSmartShelfCache()
    let lastQueries: string[] = []
    vi.mocked(appDetailsCache.appHasAnyCategory).mockImplementation((_id, queries) => {
      lastQueries = queries
      return true
    })
    const apps: AppOverview[] = [app({ appid: 1, deck_compatibility_category: 2 })]
    resolveSmartShelf('coop_ready', apps, 10)
    expect(lastQueries.some((q) => q.includes('co-op'))).toBe(true)
    invalidateSmartShelfCache()
    resolveSmartShelf('party_games', apps, 10)
    expect(lastQueries.some((q) => q.includes('local'))).toBe(true)
  })

  it('non-Steam shortcuts excluded from category-based templates', () => {
    vi.mocked(appDetailsCache.appHasAnyCategory).mockReturnValue(true)
    const apps: AppOverview[] = [
      app({ appid: 1, is_non_steam: true, deck_compatibility_category: 2 }),
    ]
    expect(resolveSmartShelf('couch_gaming', apps, 10)).toEqual([])
  })
})

describe('friends_playing', () => {
  it('returns empty when onlineFeaturesEnabled is OFF', () => {
    vi.mocked(settingsStore.getCurrentSettings).mockReturnValue({ onlineFeaturesEnabled: false } as any)
    vi.mocked(friendsState.getFriendsPlayingAppIds).mockReturnValue(new Set([1]))
    const apps: AppOverview[] = [app({ appid: 1 })]
    const ids = resolveSmartShelf('friends_playing', apps, 10)
    expect(ids).toEqual([])
  })

  it('returns empty when friend cache is empty (no friend in game)', () => {
    vi.mocked(friendsState.getFriendsPlayingAppIds).mockReturnValue(new Set())
    vi.mocked(friendsState.getFriendsRecentlyPlayedAppIds).mockReturnValue(new Set())
    const apps: AppOverview[] = [app({ appid: 1 })]
    const ids = resolveSmartShelf('friends_playing', apps, 10)
    expect(ids).toEqual([])
  })

  it('returns apps where a friend is currently playing AND user owns the app', () => {
    vi.mocked(friendsState.getFriendsPlayingAppIds).mockReturnValue(new Set([1, 2]))
    vi.mocked(friendsState.getFriendsRecentlyPlayedAppIds).mockReturnValue(new Set([1, 2]))
    const apps: AppOverview[] = [
      app({ appid: 1, last_played: 100 }), // owned (in library)
      app({ appid: 2, last_played: 200 }), // owned
      app({ appid: 3, last_played: 300 }), // owned but no friend playing
    ]
    const ids = resolveSmartShelf('friends_playing', apps, 10)
    expect(ids).toContain(1)
    expect(ids).toContain(2)
    expect(ids).not.toContain(3)
  })

  it('ranks currently-playing friends ahead of recently-played-only', () => {
    invalidateSmartShelfCache()
    // App 1: only in recently-played set
    // App 2: in live set AND recently-played
    vi.mocked(friendsState.getFriendsPlayingAppIds).mockReturnValue(new Set([2]))
    vi.mocked(friendsState.getFriendsRecentlyPlayedAppIds).mockReturnValue(new Set([1, 2]))
    const apps: AppOverview[] = [
      app({ appid: 1, last_played: 500 }), // higher last_played but only recently-played
      app({ appid: 2, last_played: 100 }), // currently playing → first
    ]
    const ids = resolveSmartShelf('friends_playing', apps, 10)
    expect(ids).toEqual([2, 1])
  })

  it('excludes non-Steam shortcuts (friend presence is Steam-only)', () => {
    vi.mocked(friendsState.getFriendsRecentlyPlayedAppIds).mockReturnValue(new Set([1]))
    const apps: AppOverview[] = [
      app({ appid: 1, is_non_steam: true }),
    ]
    const ids = resolveSmartShelf('friends_playing', apps, 10)
    expect(ids).toEqual([])
  })

  it('with includeRecentlyPlayed=0, only currently-playing apps surface', () => {
    invalidateSmartShelfCache()
    vi.mocked(friendsState.getFriendsPlayingAppIds).mockReturnValue(new Set([1]))
    vi.mocked(friendsState.getFriendsRecentlyPlayedAppIds).mockReturnValue(new Set([1, 2]))
    const apps: AppOverview[] = [
      app({ appid: 1 }),
      app({ appid: 2 }), // recently played only — excluded with includeRecentlyPlayed=0
    ]
    const ids = resolveSmartShelf('friends_playing', apps, 10, { includeRecentlyPlayed: 0 })
    expect(ids).toEqual([1])
  })

  it('surfaces NON-OWNED games (friend playing a game user does not have)', () => {
    invalidateSmartShelfCache()
    // Friends in-game: 1 (owned by user) + 99 (NOT in user library)
    vi.mocked(friendsState.getFriendsPlayingAppIds).mockReturnValue(new Set([1, 99]))
    vi.mocked(friendsState.getFriendsRecentlyPlayedAppIds).mockReturnValue(new Set([1, 99]))
    const apps: AppOverview[] = [
      app({ appid: 1, last_played: 100 }),
      // 99 NOT in apps array — represents a non-owned game
    ]
    const ids = resolveSmartShelf('friends_playing', apps, 10)
    // Owned (1) comes first, then non-owned (99). Rendering layer handles
    // metadata-fetch + store navigation for the non-owned id via the
    // `includesNonOwned` source flag.
    expect(ids).toContain(1)
    expect(ids).toContain(99)
    expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(99))
  })

  it('non-owned currently-playing rank ahead of non-owned recently-played-only', () => {
    invalidateSmartShelfCache()
    // App 99: live (currently playing). App 88: recently-played only.
    // Neither is in user library.
    vi.mocked(friendsState.getFriendsPlayingAppIds).mockReturnValue(new Set([99]))
    vi.mocked(friendsState.getFriendsRecentlyPlayedAppIds).mockReturnValue(new Set([88, 99]))
    const apps: AppOverview[] = []
    const ids = resolveSmartShelf('friends_playing', apps, 10)
    expect(ids).toEqual([99, 88])
  })

  it('respects limit when owned + non-owned exceed it', () => {
    invalidateSmartShelfCache()
    vi.mocked(friendsState.getFriendsPlayingAppIds).mockReturnValue(new Set([1, 99]))
    vi.mocked(friendsState.getFriendsRecentlyPlayedAppIds).mockReturnValue(new Set([1, 99]))
    const apps: AppOverview[] = [
      app({ appid: 1, last_played: 100 }),
    ]
    // limit=1 should keep only the owned one (it leads the array).
    const ids = resolveSmartShelf('friends_playing', apps, 1)
    expect(ids).toEqual([1])
  })
})
