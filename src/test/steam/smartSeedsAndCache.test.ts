import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AppOverview } from '../../steam'
import { resolveDailyPick } from '../../steam/smartLibraryModes'
import { rotateWindow, localDayIndex } from '../../steam/heuristics'

const app = (appid: number): AppOverview => ({ appid, installed: true, app_type: 1 } as unknown as AppOverview)
const apps = [1, 2, 3, 4, 5].map(app)
const ids = (list: AppOverview[]) => list.map((a) => a.appid)

function installStorage(): Map<string, string> {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  return store
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); delete (globalThis as any).localStorage })

describe('periodic picks', () => {
  it('the daily pick stays the same through the local day and moves at local midnight', () => {
    vi.setSystemTime(new Date(2026, 10, 20, 0, 0, 1))
    const morning = resolveDailyPick(apps, 1)
    vi.setSystemTime(new Date(2026, 10, 20, 23, 59, 59))
    expect(resolveDailyPick(apps, 1)).toEqual(morning)
    vi.setSystemTime(new Date(2026, 10, 21, 0, 0, 1))
    expect(resolveDailyPick(apps, 1)).not.toEqual(morning)
  })

  it('a rotation keeps its games for the whole window and changes after it', () => {
    const firstDay = Math.floor(localDayIndex(new Date(2026, 10, 20, 12).getTime()) / 7) * 7
    const at = (day: number, hour: number) => {
      const d = new Date(2026, 10, 20, hour)
      d.setDate(d.getDate() + day - localDayIndex(new Date(2026, 10, 20, 12).getTime()))
      return d
    }
    vi.setSystemTime(at(firstDay, 0))
    const first = ids(rotateWindow(apps, 'weekly_rotation:a', 7, 2))
    vi.setSystemTime(at(firstDay + 6, 23))
    expect(ids(rotateWindow(apps, 'weekly_rotation:a', 7, 2))).toEqual(first)
    vi.setSystemTime(at(firstDay + 7, 0))
    expect(ids(rotateWindow(apps, 'weekly_rotation:a', 7, 2))).not.toEqual(first)
  })

  for (const tz of ['America/Sao_Paulo', 'Asia/Tokyo', 'UTC']) {
    it(`the daily pick turns at local midnight, not UTC midnight, in ${tz}`, () => {
      const env = (globalThis as any).process.env as Record<string, string | undefined>
      const saved = env.TZ
      env.TZ = tz
      try {
        vi.setSystemTime(new Date(2026, 10, 20, 0, 0, 1))
        const today = resolveDailyPick(apps, 1)
        vi.setSystemTime(new Date(2026, 10, 20, 23, 59, 59))
        expect(resolveDailyPick(apps, 1)).toEqual(today)
        vi.setSystemTime(new Date(2026, 10, 21, 0, 0, 1))
        expect(resolveDailyPick(apps, 1)).not.toEqual(today)
      } finally {
        if (saved === undefined) delete env.TZ
        else env.TZ = saved
      }
    })
  }

  it('two shelves with the same rotation start at different games on the same day', () => {
    vi.setSystemTime(Date.UTC(2026, 10, 20, 12))
    const keys = ['weekly_rotation:a', 'weekly_rotation:b', 'weekly_rotation:c']
    const starts = new Set(keys.map((k) => rotateWindow(apps, k, 7, 1)[0].appid))
    expect(starts.size).toBeGreaterThan(1)
  })

  it('an empty library gives no pick instead of failing', () => {
    expect(resolveDailyPick([], 3)).toEqual([])
    expect(rotateWindow([], 'weekly_rotation:a', 7, 3)).toEqual([])
  })
})

describe('smart shelf result cache', () => {
  async function freshCache() {
    vi.resetModules()
    return import('../../steam/smartShelfCache')
  }

  it('serves a fresh result and computes again once the lifetime has passed', async () => {
    installStorage()
    const { cached } = await freshCache()
    vi.setSystemTime(1_000_000)
    let runs = 0
    const compute = () => { runs++; return [runs] }
    expect(cached('s1:mode', 60_000, compute)).toEqual([1])
    vi.setSystemTime(1_000_000 + 59_999)
    expect(cached('s1:mode', 60_000, compute)).toEqual([1])
    vi.setSystemTime(1_000_000 + 60_000)
    expect(cached('s1:mode', 60_000, compute)).toEqual([2])
  })

  it('a still-fresh result survives a restart through local storage', async () => {
    installStorage()
    vi.setSystemTime(5_000_000)
    const first = await freshCache()
    first.cached('s1:mode', 60_000, () => [7, 8])
    const second = await freshCache()
    expect(second.cached('s1:mode', 60_000, () => [9])).toEqual([7, 8])
  })

  it('clearing one shelf leaves the other shelves cached', async () => {
    installStorage()
    const { cached, invalidateSmartShelfCache } = await freshCache()
    vi.setSystemTime(9_000_000)
    cached('s1:mode', 60_000, () => [1])
    cached('s2:mode', 60_000, () => [2])
    invalidateSmartShelfCache('s1')
    expect(cached('s1:mode', 60_000, () => [10])).toEqual([10])
    expect(cached('s2:mode', 60_000, () => [20])).toEqual([2])
  })

  it('works without local storage', async () => {
    const { cached } = await freshCache()
    expect(cached('s1:mode', 60_000, () => [3])).toEqual([3])
  })
})
