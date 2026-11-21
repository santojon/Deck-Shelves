import { describe, it, expect, beforeEach, vi } from 'vitest'

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
      expect(appids.includes(',')).toBe(false)
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
    expect(calls).toBe(1)
  })

  it('a 429 response stops further fetching for this batch (backoff)', async () => {
    const urls: string[] = []
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      urls.push(url)
      return { ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => null }
    })
    const { getCatalogMetaMap } = await import('../../core/onlineStore')
    const result = await getCatalogMetaMap([1, 2, 3])
    expect(result.size).toBe(0)
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
    expect(getCachedCatalogMeta(888)).toBeNull()
  })

  it('keeps the category ids next to the names', async () => {
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      const appid = new URL(url).searchParams.get('appids')
      const categories = [{ id: 2, description: 'Single-player' }, { id: 39, description: 'Shared/Split Screen Co-op' }, { description: 'No id' }]
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ [appid!]: { success: true, data: { genres: [], categories } } }) }
    })
    const { getCatalogMetaMap } = await import('../../core/onlineStore')
    const result = await getCatalogMetaMap([321])
    expect(result.get(321)?.categoryIds).toEqual([2, 39])
    expect(result.get(321)?.categories).toEqual(['Single-player', 'Shared/Split Screen Co-op', 'No id'])
  })

  it('fetches an entry cached without ids again and keeps the old one when that fails', async () => {
    const old = { genres: ['Action'], categories: ['Multi-player'], vrSupported: false }
    localStorage.setItem('ds-catalog-meta-cache-v1', JSON.stringify({ 41: { ts: Date.now(), data: old } }))
    let calls = 0
    ;(globalThis as any).fetch = vi.fn(async () => { calls++; return { ok: false, status: 500, headers: { get: () => 'application/json' }, json: async () => null } })
    const { getCatalogMetaMap } = await import('../../core/onlineStore')
    const failed = await getCatalogMetaMap([41])
    expect(calls).toBe(1)
    expect(failed.get(41)).toEqual(old)

    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      const appid = new URL(url).searchParams.get('appids')
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ [appid!]: { success: true, data: { genres: [], categories: [{ id: 1, description: 'Multi-player' }] } } }) }
    })
    const upgraded = await getCatalogMetaMap([41])
    expect(upgraded.get(41)?.categoryIds).toEqual([1])
    const after = vi.fn()
    ;(globalThis as any).fetch = after
    const again = await getCatalogMetaMap([41])
    expect(again.get(41)?.categoryIds).toEqual([1])
    expect(after).not.toHaveBeenCalled()
  })
})
