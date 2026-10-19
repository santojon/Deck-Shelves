import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const rpc = vi.hoisted(() => ({ delayMs: 0, resp: null as any, calls: 0 }))
vi.mock('../../shims/host-api', () => ({
  call: (method: string) => {
    if (method !== 'get_wishlist') return Promise.resolve(null)
    rpc.calls++
    return new Promise((resolve) => setTimeout(() => resolve(rpc.resp), rpc.delayMs))
  },
}))
vi.mock('../../runtime/logger', () => ({ logInfo: () => {}, logWarn: () => {} }))

/* A standalone host can take well over 6 s on the first wishlist call (cold
   backend, one call at a time); that used to time out and back off 10 min. */
describe('wishlist fetch through the backend', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    rpc.calls = 0
    ;(globalThis as any).urlStore = { m_steamUrls: { userwishlist: { url: 'https://steamcommunity.com/id/x/wishlist/' } } }
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)) },
      removeItem: (k: string) => { mem.delete(k) }, clear: () => mem.clear(), key: () => null, length: 0,
    })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete (globalThis as any).urlStore })

  it('waits for a slow backend instead of giving up after 6 s', async () => {
    rpc.delayMs = 20000
    rpc.resp = { ok: true, ids: [10, 20, 30] }
    const { getWishlistIds } = await import('../../core/onlineStore')
    const p = getWishlistIds()
    await vi.advanceTimersByTimeAsync(20001)
    await expect(p).resolves.toEqual([10, 20, 30])
  })

  it('after a real timeout, retries within minutes rather than ten', async () => {
    rpc.delayMs = 60000
    rpc.resp = { ok: true, ids: [1] }
    const { getWishlistIds } = await import('../../core/onlineStore')
    const first = getWishlistIds()
    await vi.advanceTimersByTimeAsync(35001)
    await expect(first).resolves.toBeNull()
    expect(rpc.calls).toBe(1)
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 1)
    rpc.delayMs = 10
    const second = getWishlistIds()
    await vi.advanceTimersByTimeAsync(20)
    await expect(second).resolves.toEqual([1])
    expect(rpc.calls).toBe(2)
  })
})
