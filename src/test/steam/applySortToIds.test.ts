import { describe, it, expect } from 'vitest'
import { applySortToIds, type AppOverview } from '../../steam'

// Test fixture — apps with controlled lastPlayed / playtime / name so we
// can assert single-key + multi-key (primary/tiebreaker) ordering.
function mk(appid: number, name: string, lastPlayed?: number, playtime?: number): AppOverview {
  return {
    appid,
    display_name: name,
    rt_last_time_played: lastPlayed,
    playtime_forever: playtime,
  } as AppOverview
}

describe('applySortToIds — single key', () => {
  const apps = [
    mk(1, 'Charlie', 100, 50),
    mk(2, 'Alpha', 200, 100),
    mk(3, 'Bravo', 50, 200),
  ]

  it('alphabetical sorts by display name asc', () => {
    expect(applySortToIds([1, 2, 3], 'alphabetical', apps)).toEqual([2, 3, 1])
  })

  it('recent sorts by last played desc', () => {
    expect(applySortToIds([1, 2, 3], 'recent', apps)).toEqual([2, 1, 3])
  })

  it('playtime sorts by total playtime desc', () => {
    expect(applySortToIds([1, 2, 3], 'playtime', apps)).toEqual([3, 2, 1])
  })

  it('reverse=true flips the natural order (except manual/random)', () => {
    expect(applySortToIds([1, 2, 3], 'alphabetical', apps, undefined, true)).toEqual([1, 3, 2])
  })

  it('reverse on manual is ignored (the user order is sacred)', () => {
    expect(applySortToIds([1, 2, 3], 'manual', apps, 'shelf-x', true).length).toBe(3)
  })
})

describe('applySortToIds — multi-key (primary + tiebreakers)', () => {
  it('alphabetical is applied as a tiebreaker when primary keys tie', () => {
    // Two apps with the same playtime (0); alphabetical should order them.
    const apps = [
      mk(1, 'Zeta', undefined, 0),
      mk(2, 'Alpha', undefined, 0),
      mk(3, 'Bravo', 999, 50),  // higher playtime → wins primary
    ]
    const sorted = applySortToIds([1, 2, 3], ['playtime', 'alphabetical'], apps)
    expect(sorted[0]).toBe(3)   // playtime primary wins
    expect(sorted.slice(1)).toEqual([2, 1])  // alphabetical breaks the 0-playtime tie
  })

  it('recent + alphabetical: never-played games sort alphabetically among themselves', () => {
    const apps = [
      mk(1, 'Zeta', 0, 0),
      mk(2, 'Alpha', 0, 0),
      mk(3, 'Bravo', 500, 0),
    ]
    const sorted = applySortToIds([1, 2, 3], ['recent', 'alphabetical'], apps)
    expect(sorted[0]).toBe(3)
    expect(sorted.slice(1)).toEqual([2, 1])
  })

  it('per-key reverse applies independently to each key', () => {
    // Two apps share playtime; alphabetical reversed → Z before A.
    const apps = [
      mk(1, 'Alpha', undefined, 0),
      mk(2, 'Zeta', undefined, 0),
      mk(3, 'Bravo', undefined, 50),
    ]
    const sorted = applySortToIds(
      [1, 2, 3],
      ['playtime', 'alphabetical'],
      apps,
      undefined,
      [false, true],
    )
    expect(sorted[0]).toBe(3)   // playtime primary unchanged
    expect(sorted.slice(1)).toEqual([2, 1])  // alphabetical reversed
  })

  it('single-element array degrades to single-key sort (same result)', () => {
    const apps = [mk(1, 'Bravo'), mk(2, 'Alpha')]
    expect(applySortToIds([1, 2], ['alphabetical'], apps)).toEqual([2, 1])
  })

  it('empty array returns the original order (no sort applied)', () => {
    const apps = [mk(1, 'Bravo'), mk(2, 'Alpha')]
    expect(applySortToIds([1, 2], [], apps)).toEqual([1, 2])
  })

  it('three-key chain: playtime → recent → alphabetical', () => {
    // Apps with overlapping playtime + lastPlayed so each tier breaks
    // the previous tier's ties.
    const apps = [
      mk(1, 'Alpha', 100, 100),
      mk(2, 'Bravo', 100, 100),  // ties playtime + recent with Alpha → alphabetical wins
      mk(3, 'Charlie', 200, 100),  // ties playtime with the above, but more recent
    ]
    const sorted = applySortToIds(
      [1, 2, 3],
      ['playtime', 'recent', 'alphabetical'],
      apps,
    )
    // All three tie on playtime (100) → fall through to recent.
    // Charlie wins recent (200). Alpha and Bravo tie on recent (100) →
    // fall through to alphabetical: Alpha then Bravo.
    expect(sorted).toEqual([3, 1, 2])
  })

  it('boolean reverse (single) applies to every key in the chain', () => {
    const apps = [
      mk(1, 'Alpha', undefined, 100),
      mk(2, 'Bravo', undefined, 100),
      mk(3, 'Charlie', undefined, 50),
    ]
    // playtime asc (reversed) → Charlie first; alphabetical asc reversed → Bravo before Alpha
    const sorted = applySortToIds(
      [1, 2, 3],
      ['playtime', 'alphabetical'],
      apps,
      undefined,
      true,
    )
    expect(sorted[0]).toBe(3)
    expect(sorted.slice(1)).toEqual([2, 1])
  })
})
