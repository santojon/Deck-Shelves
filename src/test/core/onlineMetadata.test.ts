import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let settings: any = { advancedModeEnabled: true, onlineFeaturesEnabled: true, onlineMetadataEnabled: true }
vi.mock('../../store/settingsStore', () => ({ getCurrentSettings: () => settings }))
vi.mock('../../runtime/logger', () => ({ logInfo: () => {}, logWarn: () => {} }))

import { getGameMetadata, enrichApps } from '../../core/onlineMetadata'

function mockFetch(handler: (url: string) => any) {
  return vi.fn(async (url: string) => ({ json: async () => handler(String(url)) }))
}

// In-memory localStorage stub (the Vitest node env has none).
const lsStore = new Map<string, string>()
const localStorageStub = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => { lsStore.set(k, v) },
  removeItem: (k: string) => { lsStore.delete(k) },
  clear: () => lsStore.clear(),
}

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageStub)
  lsStore.clear()
  settings = { advancedModeEnabled: true, onlineFeaturesEnabled: true, onlineMetadataEnabled: true }
})
afterEach(() => vi.unstubAllGlobals())

describe('onlineMetadata', () => {
  it('getGameMetadata parses appdetails + appreviews and caches (no refetch)', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('/api/appdetails')) return { '620': { data: { metacritic: { score: 90 }, release_date: { date: '2007-10-10' } } } }
      if (url.includes('/appreviews/')) return { query_summary: { total_reviews: 100, total_positive: 95 } }
      return {}
    })
    vi.stubGlobal('fetch', fetchMock)
    const m = await getGameMetadata(620, 'Portal', false)
    expect(m.metacritic).toBe(90)
    expect(m.reviewPct).toBe(95)
    expect(m.releaseTs).toBe(Math.floor(Date.parse('2007-10-10') / 1000))

    const before = fetchMock.mock.calls.length
    await getGameMetadata(620, 'Portal', false) // cached
    expect(fetchMock.mock.calls.length).toBe(before)
  })

  it('non-Steam title resolves name → Steam appid via storesearch', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('/api/storesearch/')) return { items: [{ id: 1091500, name: 'Cyberpunk 2077' }] }
      if (url.includes('/api/appdetails')) return { '1091500': { data: { metacritic: { score: 86 } } } }
      if (url.includes('/appreviews/')) return { query_summary: { total_reviews: 50, total_positive: 40 } }
      return {}
    })
    vi.stubGlobal('fetch', fetchMock)
    const m = await getGameMetadata(0, 'Cyberpunk 2077', true)
    expect(m.metacritic).toBe(86)
    expect(m.reviewPct).toBe(80)
  })

  it('enrichApps writes fields when on, no-op when off', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('/api/appdetails')) return { '10': { data: { metacritic: { score: 77 } } } }
      if (url.includes('/appreviews/')) return { query_summary: { total_reviews: 10, total_positive: 9 } }
      return {}
    })
    vi.stubGlobal('fetch', fetchMock)
    const apps = [{ appid: 10, display_name: 'X' }]
    expect(await enrichApps(apps)).toBe(1)
    expect((apps[0] as any).metacritic_score).toBe(77)
    expect((apps[0] as any).review_percentage).toBe(90)

    localStorage.clear()
    settings = { onlineFeaturesEnabled: false, onlineMetadataEnabled: true } // master off
    const apps2 = [{ appid: 11, display_name: 'Y' }]
    expect(await enrichApps(apps2)).toBe(0)
    expect((apps2[0] as any).metacritic_score).toBeUndefined()
  })

  it('does not fetch when the app already carries all fields', async () => {
    const fetchMock = mockFetch(() => ({}))
    vi.stubGlobal('fetch', fetchMock)
    const apps = [{ appid: 20, display_name: 'Z', metacritic_score: 80, review_percentage: 70, rt_original_release_date: 123 }]
    expect(await enrichApps(apps)).toBe(0)
    expect(fetchMock.mock.calls.length).toBe(0)
  })
})
