import { describe, it, expect, afterEach } from 'vitest'
import type { AppOverview } from '../../steam'
import { FILTER_V3_EVALUATORS } from '../../steam/v3Extensions'

/* Regression guard for a real bug: the local Steam AppOverview never exposes
   "categories"/"store_categories" as name-string arrays (the shape this
   filter used to assume) — it only has numeric category ids via a
   BHasStoreCategory(id) method. Before the fix, multiplayerType silently
   returned false for every owned game, no matter its real categories. */
function mockAppStore(categoryIdsByAppid: Record<number, number[]>) {
  ;(globalThis as any).appStore = {
    GetAppOverviewByAppID: (id: number) => {
      const ids = categoryIdsByAppid[id];
      if (!ids) return null;
      return { appid: id, BHasStoreCategory: (catId: number) => ids.includes(catId) };
    },
  }
}

const app = (appid: number): AppOverview => ({ appid } as AppOverview)
const mp = (kind: string) => ({ type: 'multiplayerType', params: { kind } } as any)

afterEach(() => { delete (globalThis as any).appStore })

describe('multiplayerType — local (owned) games use BHasStoreCategory, not name strings', () => {
  it('"any" matches a real multiplayer game (Multi-player + Co-op + PvP + Online PvP/Co-op ids)', () => {
    mockAppStore({ 282800: [2, 1, 49, 36, 9, 38] }) // shape sampled live from a real owned game
    expect(FILTER_V3_EVALUATORS.multiplayerType(mp('any'), app(282800))).toBe(true)
  })

  it('"any" does not match a single-player-only game', () => {
    mockAppStore({ 100: [2, 22, 23] }) // Single-player, Steam Achievements, Steam Cloud — no multiplayer id
    expect(FILTER_V3_EVALUATORS.multiplayerType(mp('any'), app(100))).toBe(false)
  })

  it('"multi", "coop" and "online" each match their specific category id', () => {
    mockAppStore({ 1: [1], 2: [9], 3: [36] })
    expect(FILTER_V3_EVALUATORS.multiplayerType(mp('multi'), app(1))).toBe(true)
    expect(FILTER_V3_EVALUATORS.multiplayerType(mp('coop'), app(2))).toBe(true)
    expect(FILTER_V3_EVALUATORS.multiplayerType(mp('online'), app(3))).toBe(true)
    expect(FILTER_V3_EVALUATORS.multiplayerType(mp('coop'), app(1))).toBe(false) // multi-only ≠ coop
  })

  it('"single" matches only the Single-player category id (2)', () => {
    mockAppStore({ 100: [2] })
    expect(FILTER_V3_EVALUATORS.multiplayerType(mp('single'), app(100))).toBe(true)
  })

  it('local data always wins over the fetched-Store fallback when both exist', () => {
    mockAppStore({ 42: [2] }) // locally: single-player only
    expect(FILTER_V3_EVALUATORS.multiplayerType(mp('multi'), app(42))).toBe(false)
  })
})
