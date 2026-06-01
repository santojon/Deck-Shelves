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

// ── v2 heuristic templates (shipped in 2.4.0) ─────────────────────────────────

describe('resolveSmartShelf — v2 heuristic templates (round 1)', () => {
  beforeEach(() => invalidateSmartShelfCache())

  it('backlog_rescue surfaces installed games with playtime > min and stale last_played', () => {
    const now = Math.floor(Date.now() / 1000)
    const stale = now - 60 * 24 * 3600 // 60 days ago
    const fresh = now - 5 * 24 * 3600
    const apps: AppOverview[] = [
      // installed + has playtime + stale → eligible
      app({ appid: 1, installed: true, playtime_forever: 120, last_played: stale, deck_compatibility_category: 3 }),
      // installed but TOO RECENT → excluded
      app({ appid: 2, installed: true, playtime_forever: 120, last_played: fresh }),
      // never played → excluded
      app({ appid: 3, installed: true, playtime_forever: 0, last_played: 0 }),
      // not installed → excluded
      app({ appid: 4, installed: false, playtime_forever: 120, last_played: stale }),
    ]
    const ids = resolveSmartShelf('backlog_rescue', apps, 10, undefined, undefined, 's1')
    expect(ids).toContain(1)
    expect(ids).not.toContain(2)
    expect(ids).not.toContain(3)
    expect(ids).not.toContain(4)
  })

  it('forgotten_gems surfaces never-played games with high review_percentage OR metacritic', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, playtime_forever: 0, last_played: 0, deck_compatibility_category: 3, ...({ review_percentage: 90 } as any) }),
      app({ appid: 2, playtime_forever: 0, last_played: 0, deck_compatibility_category: 3, ...({ metacritic_score: 85 } as any) }),
      app({ appid: 3, playtime_forever: 0, last_played: 0, deck_compatibility_category: 3, ...({ review_percentage: 50 } as any) }),
      app({ appid: 4, playtime_forever: 60, last_played: 1, ...({ review_percentage: 95 } as any) }),
    ]
    const ids = resolveSmartShelf('forgotten_gems', apps, 10)
    expect(ids).toContain(1)
    expect(ids).toContain(2)
    expect(ids).not.toContain(3)
    expect(ids).not.toContain(4)
  })

  it('weekly_rotation returns a slice from the installed Deck-friendly pool', () => {
    const apps: AppOverview[] = Array.from({ length: 12 }, (_, i) =>
      app({ appid: i + 1, installed: true, deck_compatibility_category: 2 }),
    )
    const ids = resolveSmartShelf('weekly_rotation', apps, 5, undefined, undefined, 'wr1')
    expect(ids).toHaveLength(5)
    for (const id of ids) expect(id).toBeGreaterThanOrEqual(1)
  })
})

// ── Second-wave heuristic templates (round 2 — Sprint 8 closure) ──────────────

describe('resolveSmartShelf — second-wave heuristic templates (round 2)', () => {
  beforeEach(() => invalidateSmartShelfCache())

  it('short_battery requires installed + small size + low playtime + Deck-friendly', () => {
    const apps: AppOverview[] = [
      // installed + 2GB + 60min + Deck verified → eligible
      app({ appid: 1, installed: true, deck_compatibility_category: 3, playtime_forever: 60, ...({ size_on_disk: 2 * 1024 * 1024 * 1024 } as any) }),
      // size too big (10GB > 4GB default) → excluded
      app({ appid: 2, installed: true, deck_compatibility_category: 3, playtime_forever: 60, ...({ size_on_disk: 10 * 1024 * 1024 * 1024 } as any) }),
      // playtime too high (200min > 120min default) → excluded
      app({ appid: 3, installed: true, deck_compatibility_category: 3, playtime_forever: 200, ...({ size_on_disk: 2 * 1024 * 1024 * 1024 } as any) }),
      // not installed → excluded
      app({ appid: 4, installed: false, deck_compatibility_category: 3, playtime_forever: 60, ...({ size_on_disk: 2 * 1024 * 1024 * 1024 } as any) }),
    ]
    const ids = resolveSmartShelf('short_battery', apps, 10)
    expect(ids).toContain(1)
    expect(ids).not.toContain(2)
    expect(ids).not.toContain(3)
    expect(ids).not.toContain(4)
  })

  it('long_session_night surfaces installed games with playtime > 3h (mirrors long_session pool)', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, playtime_forever: 240 }),       // 4h ✓
      app({ appid: 2, installed: true, playtime_forever: 60 }),        // 1h ✗ (below 180min default)
      app({ appid: 3, installed: false, playtime_forever: 300 }),      // not installed ✗
      app({ appid: 4, is_non_steam: true, installed: true, playtime_forever: 300 }), // non-Steam ✗
    ]
    const ids = resolveSmartShelf('long_session_night', apps, 10)
    expect(ids).toEqual([1])
  })

  it('travel_mode surfaces installed games small enough for travel + sorts smallest-first', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, deck_compatibility_category: 3, ...({ size_on_disk: 4 * 1024 * 1024 * 1024 } as any) }),
      app({ appid: 2, installed: true, deck_compatibility_category: 3, ...({ size_on_disk: 1 * 1024 * 1024 * 1024 } as any) }),
      // 30GB > 5GB default → excluded
      app({ appid: 3, installed: true, deck_compatibility_category: 3, ...({ size_on_disk: 30 * 1024 * 1024 * 1024 } as any) }),
    ]
    const ids = resolveSmartShelf('travel_mode', apps, 10)
    // Smallest first (1GB before 4GB), 3 excluded
    expect(ids).toEqual([2, 1])
  })

  it('hidden_gems surfaces never-played games with review_percentage ≥ 85', () => {
    const apps: AppOverview[] = [
      app({ appid: 1, playtime_forever: 0, last_played: 0, ...({ review_percentage: 90 } as any) }),
      app({ appid: 2, playtime_forever: 0, last_played: 0, ...({ review_percentage: 50 } as any) }),
      app({ appid: 3, playtime_forever: 60, last_played: 1, ...({ review_percentage: 95 } as any) }),
    ]
    const ids = resolveSmartShelf('hidden_gems', apps, 10)
    expect(ids).toEqual([1])
  })

  it('never_touched_classics surfaces games acquired 3+ years ago with no playtime', () => {
    const now = Math.floor(Date.now() / 1000)
    const fourYearsAgo = now - 4 * 365 * 24 * 3600
    const oneYearAgo = now - 1 * 365 * 24 * 3600
    const apps: AppOverview[] = [
      app({ appid: 1, playtime_forever: 0, last_played: 0, ...({ rt_purchased_time: fourYearsAgo } as any) }),
      app({ appid: 2, playtime_forever: 0, last_played: 0, ...({ rt_purchased_time: oneYearAgo } as any) }),     // too recent
      app({ appid: 3, playtime_forever: 60, last_played: 1, ...({ rt_purchased_time: fourYearsAgo } as any) }), // played → excluded
    ]
    const ids = resolveSmartShelf('never_touched_classics', apps, 10)
    expect(ids).toEqual([1])
  })

  it('recent_hidden_installs surfaces installed games acquired in last 30d with no playtime', () => {
    const now = Math.floor(Date.now() / 1000)
    const tenDaysAgo = now - 10 * 24 * 3600
    const sixtyDaysAgo = now - 60 * 24 * 3600
    const apps: AppOverview[] = [
      app({ appid: 1, installed: true, playtime_forever: 0, last_played: 0, ...({ rt_purchased_time: tenDaysAgo } as any) }),
      app({ appid: 2, installed: true, playtime_forever: 0, last_played: 0, ...({ rt_purchased_time: sixtyDaysAgo } as any) }), // too old
      app({ appid: 3, installed: false, playtime_forever: 0, last_played: 0, ...({ rt_purchased_time: tenDaysAgo } as any) }), // not installed
      app({ appid: 4, installed: true, playtime_forever: 30, last_played: 1, ...({ rt_purchased_time: tenDaysAgo } as any) }), // played
    ]
    const ids = resolveSmartShelf('recent_hidden_installs', apps, 10)
    expect(ids).toEqual([1])
  })

  it('monthly_spotlight returns a rotated slice over installed Deck-friendly games', () => {
    const apps: AppOverview[] = Array.from({ length: 8 }, (_, i) =>
      app({ appid: i + 1, installed: true, deck_compatibility_category: 2 }),
    )
    const ids = resolveSmartShelf('monthly_spotlight', apps, 4, undefined, undefined, 'ms1')
    expect(ids).toHaveLength(4)
  })

  it('seasonal_rotation returns a rotated slice over installed Deck-friendly games', () => {
    const apps: AppOverview[] = Array.from({ length: 6 }, (_, i) =>
      app({ appid: i + 1, installed: true, deck_compatibility_category: 2 }),
    )
    const ids = resolveSmartShelf('seasonal_rotation', apps, 3, undefined, undefined, 'sr1')
    expect(ids).toHaveLength(3)
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
