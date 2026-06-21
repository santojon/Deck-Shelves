import { describe, it, expect } from 'vitest'
import {
  computeLibraryStatistics, computeShelfStatistics, appendSnapshot, summarizeHistory, deriveSuggestions,
  type LibraryStatGame, type ShelfStatInput, type LibraryStat,
} from '../../domain/statistics'

function shelf(over: Partial<ShelfStatInput>): ShelfStatInput {
  return { kind: 'regular', sourceType: 'filter', enabled: true, hidden: false, limit: 20, featured: false, fullPage: false, decorativeCards: 0, gapCards: 0, linkedCards: 0, ...over }
}

function valById(stats: LibraryStat[], id: string): string | number | undefined {
  return stats.find((s) => s.id === id)?.value
}

const NOW_MS = 1_700_000_000_000
const NOW_SEC = Math.floor(NOW_MS / 1000)
const DAY = 86_400

function game(over: Partial<LibraryStatGame>): LibraryStatGame {
  return {
    appid: 1,
    isSteam: true,
    isNonSteam: false,
    installed: false,
    isFavorite: false,
    isHidden: false,
    playtimeMinutes: 0,
    lastPlayed: 0,
    deckCompat: 0,
    updatePending: false,
    ...over,
  }
}

function statMap(games: LibraryStatGame[]) {
  const out: Record<string, string | number> = {}
  for (const s of computeLibraryStatistics(games, NOW_MS)) out[s.id] = s.value
  return out
}

describe('computeLibraryStatistics', () => {
  it('returns the full stable set of stat ids on an empty library', () => {
    const stats = computeLibraryStatistics([], NOW_MS)
    expect(stats.length).toBe(18)
    expect(stats.find((s) => s.id === 'total_games')?.value).toBe(0)
    expect(new Set(stats.map((s) => s.id)).size).toBe(stats.length)
  })

  it('counts steam vs non-steam, installed, favorites, hidden', () => {
    const m = statMap([
      game({ appid: 1, isSteam: true, installed: true, isFavorite: true }),
      game({ appid: 2, isNonSteam: true, isSteam: false, isHidden: true }),
      game({ appid: 3, installed: true }),
    ])
    expect(m.total_games).toBe(3)
    expect(m.steam_games).toBe(2)
    expect(m.non_steam_games).toBe(1)
    expect(m.installed_games).toBe(2)
    expect(m.favorite_games).toBe(1)
    expect(m.hidden_games).toBe(1)
  })

  it('splits played vs never-played and sums playtime in hours', () => {
    const m = statMap([
      game({ appid: 1, playtimeMinutes: 120 }),
      game({ appid: 2, playtimeMinutes: 60 }),
      game({ appid: 3, playtimeMinutes: 0 }),
    ])
    expect(m.played_games).toBe(2)
    expect(m.never_played_games).toBe(1)
    expect(m.total_playtime).toBe(3)
    expect(m.avg_playtime).toBe(1.5)
    expect(m.most_played).toBe(2)
  })

  it('buckets deck compatibility categories', () => {
    const m = statMap([
      game({ appid: 1, deckCompat: 3 }),
      game({ appid: 2, deckCompat: 3 }),
      game({ appid: 3, deckCompat: 2 }),
      game({ appid: 4, deckCompat: 1 }),
      game({ appid: 5, deckCompat: 0 }),
    ])
    expect(m.deck_verified).toBe(2)
    expect(m.deck_playable).toBe(1)
    expect(m.deck_unsupported).toBe(1)
    expect(m.deck_unknown).toBe(1)
  })

  it('counts recent activity within 7- and 30-day windows', () => {
    const m = statMap([
      game({ appid: 1, lastPlayed: NOW_SEC - 2 * DAY }),
      game({ appid: 2, lastPlayed: NOW_SEC - 20 * DAY }),
      game({ appid: 3, lastPlayed: NOW_SEC - 90 * DAY }),
      game({ appid: 4, lastPlayed: 0 }),
    ])
    expect(m.recently_played_7d).toBe(1)
    expect(m.recently_played_30d).toBe(2)
  })

  it('ignores negative playtime and future last-played timestamps', () => {
    const m = statMap([
      game({ appid: 1, playtimeMinutes: -50, lastPlayed: NOW_SEC + 5 * DAY }),
    ])
    expect(m.played_games).toBe(0)
    expect(m.total_playtime).toBe(0)
    expect(m.recently_played_7d).toBe(0)
  })

  it('tags every entry with a known category', () => {
    const cats = new Set(['library', 'status', 'time', 'compat'])
    for (const s of computeLibraryStatistics([game({})], NOW_MS)) {
      expect(cats.has(s.category as string)).toBe(true)
    }
  })
})

describe('computeShelfStatistics', () => {
  it('counts regular vs smart, enabled, hidden', () => {
    const s = computeShelfStatistics([
      shelf({ kind: 'regular', enabled: true }),
      shelf({ kind: 'smart', enabled: true }),
      shelf({ kind: 'regular', enabled: false, hidden: true }),
    ])
    expect(valById(s, 'shelves_total')).toBe(3)
    expect(valById(s, 'shelves_regular')).toBe(2)
    expect(valById(s, 'shelves_smart')).toBe(1)
    expect(valById(s, 'shelves_enabled')).toBe(2)
    expect(valById(s, 'shelves_hidden')).toBe(1)
  })

  it('sums card slots for visible shelves and averages them', () => {
    const s = computeShelfStatistics([
      shelf({ limit: 10 }),
      shelf({ limit: 30 }),
      shelf({ limit: 50, hidden: true }), // excluded from totals
    ])
    expect(valById(s, 'shelf_slots_total')).toBe(40)
    expect(valById(s, 'shelf_slots_avg')).toBe(20)
  })

  it('keeps wishlist and store shelf types distinct', () => {
    const s = computeShelfStatistics([
      shelf({ sourceType: 'tab' }),
      shelf({ sourceType: 'wishlist' }),
      shelf({ sourceType: 'store' }),
      shelf({ kind: 'smart' }),
    ])
    expect(valById(s, 'shelf_type_tab')).toBe(1)
    expect(valById(s, 'shelf_type_wishlist')).toBe(1)
    expect(valById(s, 'shelf_type_store')).toBe(1)
    expect(valById(s, 'shelf_type_smart')).toBe(1)
    expect(valById(s, 'shelf_type_online')).toBeUndefined() // no longer merged
  })

  it('counts featured/full-page as shelves and decorative/gap/linked as cards', () => {
    const s = computeShelfStatistics([
      shelf({ featured: true, fullPage: true, decorativeCards: 3, gapCards: 1, linkedCards: 2 }),
      shelf({ decorativeCards: 2, gapCards: 2 }),
    ])
    expect(valById(s, 'shelves_featured')).toBe(1)
    expect(valById(s, 'shelves_full_page')).toBe(1)
    expect(valById(s, 'decorative_cards')).toBe(5) // 3 + 2
    expect(valById(s, 'gap_cards')).toBe(3)        // 1 + 2
    expect(valById(s, 'linked_cards')).toBe(2)
    // these now live in the right categories
    expect(s.find((x) => x.id === 'shelves_featured')?.category).toBe('shelves')
    expect(s.find((x) => x.id === 'decorative_cards')?.category).toBe('card_types')
  })
})

describe('appendSnapshot + summarizeHistory', () => {
  it('replaces same-day entry and caps length', () => {
    let h = appendSnapshot([], { date: '2026-01-01', shelves: 2, games: 40 })
    h = appendSnapshot(h, { date: '2026-01-01', shelves: 3, games: 60 }) // same day overwrites
    expect(h.length).toBe(1)
    expect(h[0].shelves).toBe(3)
    for (let i = 0; i < 200; i++) h = appendSnapshot(h, { date: `d${i}`, shelves: i, games: i }, 90)
    expect(h.length).toBe(90)
  })

  it('averages shelves and games across the history', () => {
    const s = summarizeHistory([
      { date: 'a', shelves: 2, games: 40 },
      { date: 'b', shelves: 4, games: 60 },
    ])
    expect(valById(s, 'history_days')).toBe(2)
    expect(valById(s, 'history_avg_shelves')).toBe(3)
    expect(valById(s, 'history_avg_games')).toBe(50)
  })

  it('returns nothing for empty history', () => {
    expect(summarizeHistory([])).toEqual([])
  })
})

describe('deriveSuggestions', () => {
  it('suggests creating a first shelf when there are none', () => {
    const lib = computeLibraryStatistics([], NOW_MS)
    const shelfStats = computeShelfStatistics([])
    const sg = deriveSuggestions(lib, shelfStats)
    expect(sg.some((x) => x.id === 'first_shelf')).toBe(true)
  })

  it('suggests a backlog shelf when many games are never played', () => {
    const lib = computeLibraryStatistics(
      Array.from({ length: 15 }, (_, i) => game({ appid: i + 1, playtimeMinutes: 0 })),
      NOW_MS,
    )
    const shelfStats = computeShelfStatistics([shelf({})])
    const sg = deriveSuggestions(lib, shelfStats)
    const backlog = sg.find((x) => x.id === 'backlog')
    expect(backlog?.templateId).toBe('never_played')
    expect(backlog?.params.count).toBe(15)
  })

  it('caps suggestions at five', () => {
    const lib = computeLibraryStatistics(
      Array.from({ length: 20 }, (_, i) => game({ appid: i + 1, playtimeMinutes: 0, deckCompat: 3, updatePending: true })),
      NOW_MS,
    )
    const sg = deriveSuggestions(lib, computeShelfStatistics([]))
    expect(sg.length).toBeLessThanOrEqual(5)
    expect(sg.length).toBeGreaterThan(0)
  })

  it('rotates the visible subset by seed (variety over time)', () => {
    // 8 eligible regular candidates, capped at 3 → different seeds differ.
    const lib = computeLibraryStatistics(
      Array.from({ length: 30 }, (_, i) =>
        game({ appid: i + 1, playtimeMinutes: i < 20 ? 0 : 60, deckCompat: i % 2 ? 3 : 2, updatePending: i < 12, isNonSteam: i < 8, isFavorite: i < 5, lastPlayed: NOW_SEC - 2 * DAY })),
      NOW_MS,
    )
    const shelfStats = computeShelfStatistics([shelf({})])
    const day0 = deriveSuggestions(lib, shelfStats, { seed: 0, max: 3 }).map((s) => s.id)
    const day3 = deriveSuggestions(lib, shelfStats, { seed: 3, max: 3 }).map((s) => s.id)
    expect(day0).not.toEqual(day3)
    // stable for a given seed
    expect(deriveSuggestions(lib, shelfStats, { seed: 3, max: 3 }).map((s) => s.id)).toEqual(day3)
  })

  it('adds smart-shelf suggestions only when smart shelves are enabled', () => {
    const lib = computeLibraryStatistics(
      Array.from({ length: 15 }, (_, i) => game({ appid: i + 1, playtimeMinutes: 0, deckCompat: 3 })),
      NOW_MS,
    )
    const shelfStats = computeShelfStatistics([shelf({})])
    const off = deriveSuggestions(lib, shelfStats, { smartEnabled: false, max: 10 })
    const on = deriveSuggestions(lib, shelfStats, { smartEnabled: true, max: 10 })
    expect(off.some((s) => s.smartMode)).toBe(false)
    expect(on.some((s) => s.smartMode === 'best_unplayed')).toBe(true)
  })

  it('excludes templates already present', () => {
    const lib = computeLibraryStatistics(
      Array.from({ length: 15 }, (_, i) => game({ appid: i + 1, playtimeMinutes: 0 })),
      NOW_MS,
    )
    const sg = deriveSuggestions(lib, computeShelfStatistics([shelf({})]), { exclude: ['never_played'], max: 10 })
    expect(sg.some((s) => s.templateId === 'never_played')).toBe(false)
  })
})
