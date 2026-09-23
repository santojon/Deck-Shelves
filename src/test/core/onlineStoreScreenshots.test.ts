import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../shims/host-api', () => ({ call: async () => null }))
vi.mock('../../runtime/logger', () => ({ logInfo: () => {}, logWarn: () => {} }))

function installLocalStorageStub(): void {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
}

describe('getStoreScreenshots', () => {
  beforeEach(() => {
    installLocalStorageStub()
    vi.resetModules()
  })

  it('parses path_full urls per appid, batching multiple ids per request', async () => {
    const urls: string[] = []
    ;(globalThis as any).fetch = vi.fn(async (url: string) => {
      urls.push(url)
      return {
        ok: true, status: 200, headers: { get: () => 'application/json' },
        json: async () => ({
          111: { success: true, data: { screenshots: [{ id: 1, path_full: 'https://cdn/1.jpg' }, { id: 2, path_full: 'https://cdn/2.jpg' }] } },
          222: { success: true, data: { screenshots: [] } },
        }),
      }
    })
    const { getStoreScreenshots } = await import('../../core/onlineStore')
    const result = await getStoreScreenshots([111, 222])

    expect(urls.length).toBe(1) // one request covers both ids (batched)
    expect(result.get(111)).toEqual(['https://cdn/1.jpg', 'https://cdn/2.jpg'])
    expect(result.get(222)).toEqual([]) // no screenshots is a real, cached answer
  })

  it('caches results — a second call for the same ids issues no new requests', async () => {
    let calls = 0
    ;(globalThis as any).fetch = vi.fn(async () => {
      calls++
      return {
        ok: true, status: 200, headers: { get: () => 'application/json' },
        json: async () => ({ 333: { success: true, data: { screenshots: [{ path_full: 'https://cdn/3.jpg' }] } } }),
      }
    })
    const { getStoreScreenshots } = await import('../../core/onlineStore')
    await getStoreScreenshots([333])
    expect(calls).toBe(1)
    await getStoreScreenshots([333])
    expect(calls).toBe(1) // served from cache
  })

  it('a 429 response backs off without throwing', async () => {
    ;(globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 429, headers: { get: () => 'application/json' }, json: async () => null }))
    const { getStoreScreenshots } = await import('../../core/onlineStore')
    const result = await getStoreScreenshots([444])
    expect(result.size).toBe(0)
  })
})
