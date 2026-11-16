import { describe, it, expect } from 'vitest'
import { applySortToIds, type AppOverview } from '../../steam'

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
    const apps = [
      mk(1, 'Zeta', undefined, 0),
      mk(2, 'Alpha', undefined, 0),
      mk(3, 'Bravo', 999, 50),
    ]
    const sorted = applySortToIds([1, 2, 3], ['playtime', 'alphabetical'], apps)
    expect(sorted[0]).toBe(3)
    expect(sorted.slice(1)).toEqual([2, 1])
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
    expect(sorted[0]).toBe(3)
    expect(sorted.slice(1)).toEqual([2, 1])
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
    const apps = [
      mk(1, 'Alpha', 100, 100),
      mk(2, 'Bravo', 100, 100),
      mk(3, 'Charlie', 200, 100),
    ]
    const sorted = applySortToIds(
      [1, 2, 3],
      ['playtime', 'recent', 'alphabetical'],
      apps,
    )
    expect(sorted).toEqual([3, 1, 2])
  })

  it('price keys participate in the chain when a priceMap is provided', () => {
    const apps = [
      mk(1, 'Alpha', undefined, 0),
      mk(2, 'Bravo', undefined, 0),
      mk(3, 'Charlie', undefined, 0),
    ] as any[]
    apps[0].metacritic_score = 80
    apps[1].metacritic_score = 95
    apps[2].metacritic_score = 70
    const priceMap = new Map([
      [1, { price: 0, originalPrice: 100, discount: 50 }],
      [2, { price: 0, originalPrice: 100, discount: 50 }],
      [3, { price: 0, originalPrice: 100, discount: 90 }],
    ])
    const sorted = (applySortToIds as any)(
      [1, 2, 3], ['discount_high', 'metacritic'], apps, undefined, [false, false], priceMap,
    )
    expect(sorted).toEqual([3, 2, 1])
  })

  it('boolean reverse (single) applies to every key in the chain', () => {
    const apps = [
      mk(1, 'Alpha', undefined, 100),
      mk(2, 'Bravo', undefined, 100),
      mk(3, 'Charlie', undefined, 50),
    ]
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
