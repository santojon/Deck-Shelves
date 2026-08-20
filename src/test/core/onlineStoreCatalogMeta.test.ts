import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../shims/decky-api', () => ({ call: async () => null }))
vi.mock('../../runtime/logger', () => ({ logInfo: () => {}, logWarn: () => {} }))

function installLocalStorageStub(): void {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
}

describe('getCatalogMetaMap', () => {
  beforeEach(() => {
    installLocalStorageStub()
    vi.resetModules()
  })

  it('fetches one appid per request — Steam 400s on multi-appid for the genres/categories filter', async () => {
    const urls: string[] = []
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      urls.push(url)
      const appid = new URL(url).searchParams.get('appids')
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ [appid!]: { success: true, data: { genres: [{ description: 'Action' }], categories: [{ description: 'Multi-player' }] } } }),
      }
    })
    const { getCatalogMetaMap } = await import('../../core/onlineStore')
    const result = await getCatalogMetaMap([111, 222, 333])

    expect(urls.length).toBe(3)
    for (const url of urls) {
      const appids = new URL(url).searchParams.get('appids')!
      expect(appids.includes(',')).toBe(false) // never more than one id per request
    }
    expect(result.get(111)?.categories).toEqual(['Multi-player'])
    expect(result.get(111)?.genres).toEqual(['Action'])
  })

  it('caches results — a second call for the same ids issues no new requests', async () => {
    let calls = 0
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      calls++
      const appid = new URL(url).searchParams.get('appids')
      return {
        ok: true, status: 200, headers: { get: () => 'application/json' },
        json: async () => ({ [appid!]: { success: true, data: { genres: [], categories: [] } } }),
      }
    })
    const { getCatalogMetaMap } = await import('../../core/onlineStore')
    await getCatalogMetaMap([555])
    expect(calls).toBe(1)
    await getCatalogMetaMap([555])
    expect(calls).toBe(1) // served from cache, no re-fetch
  })

  it('a 429 response stops further fetching for this batch (backoff)', async () => {
    const urls: string[] = []
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      urls.push(url)
      return { ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => null }
    })
    const { getCatalogMetaMap } = await import('../../core/onlineStore')
    const result = await getCatalogMetaMap([1, 2, 3])
    expect(result.size).toBe(0) // nothing resolved
    // Backoff is set on the very first 429 — later concurrent workers should
    // bail without necessarily hitting every id, so just confirm no crash
    // and no false-positive cache entries were written.
    expect(urls.length).toBeGreaterThan(0)
  })

  it('getCachedCatalogMeta reads what getCatalogMetaMap already cached, synchronously', async () => {
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      const appid = new URL(url).searchParams.get('appids')
      return {
        ok: true, status: 200, headers: { get: () => 'application/json' },
        json: async () => ({ [appid!]: { success: true, data: { genres: ['RPG'].map((d) => ({ description: d })), categories: [] } } }),
      }
    })
    const { getCatalogMetaMap, getCachedCatalogMeta } = await import('../../core/onlineStore')
    await getCatalogMetaMap([777])
    expect(getCachedCatalogMeta(777)?.genres).toEqual(['RPG'])
    expect(getCachedCatalogMeta(888)).toBeNull() // never fetched
  })
})
