import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../shims/host-api', () => ({ call: async () => null }))
vi.mock('../../runtime/logger', () => ({ logInfo: () => {}, logWarn: () => {} }))
vi.mock('../../runtime/steamAccount', () => ({ readSteamId: () => null }))

function installLocalStorageStub(): void {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
}

const json = (body: unknown) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body })
const idOf = (url: string) => Number(new URL(url).searchParams.get('appids'))

describe('store API gate', () => {
  beforeEach(() => {
    installLocalStorageStub()
    vi.resetModules()
  })
  afterEach(() => { vi.useRealTimers() })

  it('a failed fetch, which is how a 429 without CORS headers reaches the client, stops every store API call', async () => {
    const urls: string[] = []
    ;(globalThis as any).fetch = vi.fn(async (url: string) => { urls.push(url); throw new TypeError('Failed to fetch') })
    const store = await import('../../core/onlineStore')

    const meta = await store.getCatalogMetaMap([1, 2, 3, 4, 5, 6, 7, 8])
    expect(meta.size).toBe(0)
    const afterCatalog = urls.length
    expect(afterCatalog).toBeLessThanOrEqual(4)

    expect((await store.fetchGameNames([9, 10])).size).toBe(0)
    expect((await store.getPriceMap([11])).size).toBe(0)
    expect((await store.getStoreScreenshots([12])).size).toBe(0)
    expect(urls.length).toBe(afterCatalog)
  })

  it('opens again once the pause is over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    let fail = true
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      if (fail) throw new TypeError('Failed to fetch')
      return json({ [idOf(url)]: { success: true, data: { name: 'Game' } } })
    })
    const store = await import('../../core/onlineStore')
    await store.fetchGameNames([1])
    fail = false
    expect((await store.fetchGameNames([2])).size).toBe(0)
    vi.setSystemTime(Date.now() + 16 * 60 * 1000)
    expect((await store.fetchGameNames([2])).get(2)).toBe('Game')
  })

  it('a 429 that does arrive stops the calls too', async () => {
    let calls = 0
    ;(globalThis as any).fetch = vi.fn(async () => { calls++; return { ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => null } })
    const store = await import('../../core/onlineStore')
    await store.fetchGameNames([1, 2, 3, 4, 5, 6])
    const first = calls
    expect(first).toBeLessThanOrEqual(3)
    await store.getCatalogMetaMap([7, 8])
    expect(calls).toBe(first)
  })
})

describe('fetchGameNames', () => {
  beforeEach(() => {
    installLocalStorageStub()
    vi.resetModules()
  })

  it('asks for one id per request and keeps the names it gets', async () => {
    const urls: string[] = []
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      urls.push(url)
      const id = idOf(url)
      return json({ [id]: id === 3 ? { success: false } : { success: true, data: { name: `Game ${id}` } } })
    })
    const { fetchGameNames } = await import('../../core/onlineStore')
    const names = await fetchGameNames([1, 2, 3])
    expect(urls.length).toBe(3)
    expect(urls.every((u) => !new URL(u).searchParams.get('appids')!.includes(','))).toBe(true)
    expect([...names.entries()]).toEqual(expect.arrayContaining([[1, 'Game 1'], [2, 'Game 2']]))
    expect(names.has(3)).toBe(false)
  })

  it('does not ask again for ids a running pass is already fetching', async () => {
    const urls: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      urls.push(url)
      await gate
      return json({ [idOf(url)]: { success: true, data: { name: 'x' } } })
    })
    const { fetchGameNames } = await import('../../core/onlineStore')
    const first = fetchGameNames([1, 2])
    const second = fetchGameNames([1, 2, 3])
    release()
    await Promise.all([first, second])
    expect(urls.map(idOf).sort()).toEqual([1, 2, 3])
  })
})

describe('refreshing an online shelf', () => {
  beforeEach(() => {
    installLocalStorageStub()
    vi.resetModules()
  })

  it('drops the store list with the names that came with it, so both come back from one search', async () => {
    vi.doMock('../../store/settingsStore', () => ({ getCurrentSettings: () => null, saveSettings: async () => true }))
    const urls: string[] = []
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      urls.push(url)
      return json({ items: [{ name: 'Fresh Game', logo: 'https://cdn/steam/apps/42/capsule.jpg' }] })
    })
    localStorage.setItem('ds-store-cache-v3', JSON.stringify({ ts: Date.now(), data: { ids: [42], priceHints: [] } }))
    localStorage.setItem('ds-game-name-cache-v1', JSON.stringify({ 42: 'Old name' }))
    const { clearOnlineShelfCache } = await import('../../core/shelfActions')
    const { getStoreGameIds } = await import('../../core/onlineStore')

    clearOnlineShelfCache()
    expect(await getStoreGameIds()).toEqual([42])
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => u.includes('/search/results/'))).toBe(true)
    expect(JSON.parse(localStorage.getItem('ds-game-name-cache-v1')!)[42]).toBe('Fresh Game')
  })
})
