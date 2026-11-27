import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../shims/host-api', () => ({ call: () => Promise.resolve(null) }))
vi.mock('../../runtime/logger', () => ({ logInfo: () => {}, logWarn: () => {} }))
vi.mock('../../runtime/steamAccount', () => ({ readSteamId: () => null }))

const STORE_KEY = 'ds-store-cache-v3'
const PRICE_KEY = 'ds-price-cache-v1'
const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 0, 10, 12)

let mem: Map<string, string>
let priceWrites: number

const usdHint = { price: 500, originalPrice: 1000, discount: 50, currency: 'USD', isFree: false }
const storePrice = { price: 499, originalPrice: 999, discount: 50, currency: 'BRL', isFree: false, formatted: 'R$ 4,99' }

function seedStore(ageMs: number, hints: Array<{ id: number; original: number; final: number }>): void {
  mem.set(STORE_KEY, JSON.stringify({ ts: NOW - ageMs, data: { ids: hints.map((h) => h.id), priceHints: hints } }))
}

function seedPrices(entries: Record<number, { ageMs: number; data: unknown }>): void {
  const cache: Record<number, { ts: number; data: unknown }> = {}
  for (const [id, e] of Object.entries(entries)) cache[Number(id)] = { ts: NOW - e.ageMs, data: e.data }
  mem.set(PRICE_KEY, JSON.stringify(cache))
}

const prices = () => JSON.parse(mem.get(PRICE_KEY) ?? '{}')

describe('store price hints', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mem = new Map()
    priceWrites = 0
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { if (k === PRICE_KEY) priceWrites++; mem.set(k, String(v)) },
      removeItem: (k: string) => { mem.delete(k) }, clear: () => mem.clear(), key: () => null, length: 0,
    })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('leaves a fresh hint entry untouched on a warm store list', async () => {
    seedStore(HOUR, [{ id: 10, original: 1000, final: 500 }])
    seedPrices({ 10: { ageMs: HOUR, data: usdHint } })
    const { getStoreGameIds } = await import('../../core/onlineStore')
    await expect(getStoreGameIds()).resolves.toEqual([10])
    expect(priceWrites).toBe(0)
    expect(prices()[10].ts).toBe(NOW - HOUR)
  })

  it('refreshes hint entries older than half the price lifetime in one write', async () => {
    seedStore(HOUR, [{ id: 10, original: 1000, final: 500 }, { id: 20, original: 2000, final: 500 }, { id: 30, original: 800, final: 800 }])
    seedPrices({ 10: { ageMs: 4 * HOUR, data: usdHint }, 20: { ageMs: 5 * HOUR, data: usdHint } })
    const { getStoreGameIds } = await import('../../core/onlineStore')
    await getStoreGameIds()
    expect(priceWrites).toBe(1)
    const cache = prices()
    expect(cache[10]).toEqual({ ts: NOW, data: usdHint })
    expect(cache[20]).toEqual({ ts: NOW, data: { ...usdHint, originalPrice: 2000, discount: 75 } })
    expect(cache[30]).toEqual({ ts: NOW, data: { ...usdHint, price: 800, originalPrice: 800, discount: 0 } })
  })

  it('does not put a USD hint over a fresh store price, only over an expired one', async () => {
    seedStore(HOUR, [{ id: 10, original: 1000, final: 500 }, { id: 20, original: 1000, final: 500 }])
    seedPrices({ 10: { ageMs: 4 * HOUR, data: storePrice }, 20: { ageMs: 7 * HOUR, data: storePrice } })
    const { getStoreGameIds, getCachedPriceMap } = await import('../../core/onlineStore')
    await getStoreGameIds()
    const cache = prices()
    expect(cache[10]).toEqual({ ts: NOW - 4 * HOUR, data: storePrice })
    expect(cache[20]).toEqual({ ts: NOW, data: usdHint })
    expect(getCachedPriceMap([10]).get(10)?.formatted).toBe('R$ 4,99')
  })

  it('writes every hint after a fresh store fetch, as before', async () => {
    seedPrices({ 10: { ageMs: HOUR, data: storePrice }, 20: { ageMs: HOUR, data: usdHint } })
    const items = [
      { name: 'Ten', logo: 'https://cdn/steam/apps/10/capsule.jpg', original_price: 1000, final_price: 500 },
      { name: 'Twenty', logo: 'https://cdn/steam/apps/20/capsule.jpg', original_price: 1000, final_price: 500 },
    ]
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ items }), { headers: { 'content-type': 'application/json' } })))
    const { getStoreGameIds } = await import('../../core/onlineStore')
    await expect(getStoreGameIds()).resolves.toEqual([10, 20])
    const cache = prices()
    expect(cache[10]).toEqual({ ts: NOW, data: usdHint })
    expect(cache[20]).toEqual({ ts: NOW, data: usdHint })
  })
})
