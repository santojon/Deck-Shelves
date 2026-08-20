import { describe, it, expect, afterEach, vi } from 'vitest'
import type { AppOverview } from '../../steam'

// getCachedCatalogMeta is what v3Extensions' catalogFallbackOverview() reaches
// for via a lazy require() — mock it so these tests never hit the network.
const { catalogMeta } = vi.hoisted(() => ({ catalogMeta: new Map<number, any>() }))
vi.mock('../../core/onlineStore', () => ({
  getCachedCatalogMeta: (id: number) => catalogMeta.get(id) ?? null,
}))

import { FILTER_V3_EVALUATORS, SORT_V3_COMPARATORS, prefetchFranchise } from '../../steam/v3Extensions'

const app = (appid: number): AppOverview => ({ appid } as AppOverview)

afterEach(() => {
  delete (globalThis as any).appStore
  catalogMeta.clear()
})

describe('catalog fallback — unowned Store items get genre/category/VR data', () => {
  it('multiplayerType matches a fetched (not locally owned) item using cached Store categories', () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => null } // not in the local library
    catalogMeta.set(42, { genres: [], categories: ['Multi-player', 'PvP'], vrSupported: false })
    const item = { type: 'multiplayerType', params: { kind: 'multi' } } as any
    expect(FILTER_V3_EVALUATORS.multiplayerType(item, app(42))).toBe(true)
  })

  it('genres/vrSupport also resolve through the fallback for the same unowned item', () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => null }
    catalogMeta.set(42, { genres: ['Action', 'RPG'], categories: [], vrSupported: true })
    expect(FILTER_V3_EVALUATORS.genres({ type: 'genres', params: { genres: ['rpg'] } } as any, app(42))).toBe(true)
    expect(FILTER_V3_EVALUATORS.vrSupport({ type: 'vrSupport', params: {} } as any, app(42))).toBe(true)
  })

  it('a local AppOverview always wins over fetched catalog data, even if both exist', () => {
    ;(globalThis as any).appStore = {
      GetAppOverviewByAppID: (id: number) => (id === 42 ? { appid: 42, categories: [{ name: 'single-player' }] } : null),
    }
    catalogMeta.set(42, { genres: [], categories: ['Multi-player'], vrSupported: false })
    // Local data says single-player only — the fetched "Multi-player" must not leak through.
    expect(FILTER_V3_EVALUATORS.multiplayerType({ type: 'multiplayerType', params: { kind: 'multi' } } as any, app(42))).toBe(false)
  })

  it('no fetched data and no local data → filters fail closed, not a crash', () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => null }
    expect(FILTER_V3_EVALUATORS.multiplayerType({ type: 'multiplayerType', params: { kind: 'any' } } as any, app(99))).toBe(false)
  })

  it('"Games I own" sort never treats a catalog-fallback-only item as owned', () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => null }
    catalogMeta.set(42, { genres: [], categories: ['Multi-player'], vrSupported: false })
    // Fetched catalog data exists, but the game isn't in the local library —
    // owned_games must rank it the same as a genuinely unowned app (0, not 1).
    expect(SORT_V3_COMPARATORS.owned_games(app(42), app(99))).toBe(0)
  })

  it('genres/categories fall through to fetched data for a game that IS locally owned — the real bug', () => {
    // A real local AppOverview: has BHasStoreCategory (so isOwnedLocally is
    // true) but, like the actual Steam client, carries none of the fields
    // these filters read (no "genres", no "categories" name-string array).
    ;(globalThis as any).appStore = {
      GetAppOverviewByAppID: (id: number) => (id === 42 ? { appid: 42, BHasStoreCategory: () => false } : null),
    }
    catalogMeta.set(42, { genres: ['RPG'], categories: ['Co-op'], vrSupported: false })
    expect(FILTER_V3_EVALUATORS.genres({ type: 'genres', params: { genres: ['rpg'] } } as any, app(42))).toBe(true)
    expect(FILTER_V3_EVALUATORS.categories({ type: 'categories', params: { categories: ['co-op'] } } as any, app(42))).toBe(true)
  })
})

describe('franchise — owned or not, only the Steam client details cache has it', () => {
  afterEach(() => { delete (globalThis as any).SteamClient })

  it('prefetchFranchise + the franchise filter work for a locally-owned game', async () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: (id: number) => (id === 42 ? { appid: 42 } : null) }
    ;(globalThis as any).SteamClient = {
      Apps: {
        GetCachedAppDetails: async () => [
          ['associations', { data: { rgFranchises: [{ strName: 'KINGDOM HEARTS' }] } }],
        ],
      },
    }
    await prefetchFranchise([42])
    expect(FILTER_V3_EVALUATORS.franchise({ type: 'franchise', params: { franchise: 'kingdom hearts' } } as any, app(42))).toBe(true)
    expect(FILTER_V3_EVALUATORS.franchise({ type: 'franchise', params: { franchise: 'zelda' } } as any, app(42))).toBe(false)
  })

  it('a game with no franchise association does not match any franchise filter', async () => {
    ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => null }
    ;(globalThis as any).SteamClient = {
      Apps: { GetCachedAppDetails: async () => [['associations', { data: {} }]] },
    }
    await prefetchFranchise([99])
    expect(FILTER_V3_EVALUATORS.franchise({ type: 'franchise', params: { franchise: 'anything' } } as any, app(99))).toBe(false)
  })
})
