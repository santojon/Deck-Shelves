import { describe, it, expect, afterEach, vi } from 'vitest'
import type { AppOverview } from '../../steam'

const { catalogMeta } = vi.hoisted(() => ({ catalogMeta: new Map<number, any>() }))
vi.mock('../../core/onlineStore', () => ({
  getCachedCatalogMeta: (id: number) => catalogMeta.get(id) ?? null,
}))

import { FILTER_V3_EVALUATORS, isLocalPlayKind } from '../../steam/v3Extensions'

const app = (appid: number): AppOverview => ({ appid } as AppOverview)
const mp = (kind: string, inverted = false) => ({ type: 'multiplayerType', inverted, params: { kind } } as any)
const matches = (kind: string, appid: number) => FILTER_V3_EVALUATORS.multiplayerType(mp(kind), app(appid))

function ownedWith(categoryIdsByAppid: Record<number, number[]>) {
  ;(globalThis as any).appStore = {
    GetAppOverviewByAppID: (id: number) => {
      const ids = categoryIdsByAppid[id]
      return ids ? { appid: id, BHasStoreCategory: (c: number) => ids.includes(c) } : null
    },
  }
}

afterEach(() => {
  delete (globalThis as any).appStore
  catalogMeta.clear()
})

describe('local play conditions on games in the library', () => {
  it('a local co-op game is local co-op and local multiplayer, not local versus', () => {
    ownedWith({ 1: [39] })
    expect(matches('local_coop', 1)).toBe(true)
    expect(matches('local', 1)).toBe(true)
    expect(matches('local_versus', 1)).toBe(false)
  })

  it('a local versus game is local versus and local multiplayer, not local co-op', () => {
    ownedWith({ 1: [37] })
    expect(matches('local_versus', 1)).toBe(true)
    expect(matches('local', 1)).toBe(true)
    expect(matches('local_coop', 1)).toBe(false)
  })

  it('a shared screen game alone is local multiplayer only', () => {
    ownedWith({ 1: [24] })
    expect(matches('local', 1)).toBe(true)
    expect(matches('local_coop', 1)).toBe(false)
    expect(matches('local_versus', 1)).toBe(false)
  })

  it('online co-op, LAN co-op and Remote Play Together are not local play', () => {
    ownedWith({ 1: [38], 2: [48], 3: [44], 4: [1, 9, 49] })
    for (const id of [1, 2, 3, 4]) {
      expect(matches('local', id)).toBe(false)
      expect(matches('local_coop', id)).toBe(false)
      expect(matches('local_versus', id)).toBe(false)
    }
  })

  it('a game with both local and online co-op is local co-op', () => {
    ownedWith({ 1: [39, 38] })
    expect(matches('local_coop', 1)).toBe(true)
  })

  it('a game with both local co-op and local versus fits both', () => {
    ownedWith({ 1: [39, 37] })
    expect(matches('local_coop', 1)).toBe(true)
    expect(matches('local_versus', 1)).toBe(true)
  })

  it('the older choices keep their meaning, LAN co-op still counts as co-op', () => {
    ownedWith({ 1: [48], 2: [24] })
    expect(matches('coop', 1)).toBe(true)
    expect(matches('any', 2)).toBe(false)
  })

  it('a non-Steam shortcut has no store categories and is never local play', () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => ({ appid: 7, BHasStoreCategory: () => false }) }
    expect(matches('local', 7)).toBe(false)
  })
})

describe('local play conditions on games outside the library', () => {
  it('reads the category ids the Store gave', () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => null }
    catalogMeta.set(5, { genres: [], categories: [], categoryIds: [2, 39], vrSupported: false })
    expect(matches('local_coop', 5)).toBe(true)
    expect(matches('local_versus', 5)).toBe(false)
  })

  it('does not depend on the language of the category names', () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => null }
    catalogMeta.set(5, { genres: [], categories: ['Cooperação em tela dividida'], categoryIds: [39], vrSupported: false })
    expect(matches('local_coop', 5)).toBe(true)
  })

  it('a cached entry without ids does not match, even when its names look local', () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => null }
    catalogMeta.set(5, { genres: [], categories: ['Shared/Split Screen Co-op'], vrSupported: false })
    expect(matches('local_coop', 5)).toBe(false)
  })

  it('no data at all does not match', () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => null }
    expect(matches('local', 5)).toBe(false)
  })
})

describe('isLocalPlayKind', () => {
  it('names only the three same-screen choices', () => {
    expect(['local', 'local_coop', 'local_versus', 'LOCAL'].every(isLocalPlayKind)).toBe(true)
    expect(['any', 'coop', 'online', undefined, ''].some(isLocalPlayKind)).toBe(false)
  })
})
