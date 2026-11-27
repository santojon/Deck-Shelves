import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withOnlineSwr, invalidateOnlineResolveCache } from '../../steam/onlineCache'

const MINUTE = 60_000
const ctx = { source: { type: 'wishlist' }, overShootLimit: 20 } as any

describe('online resolve cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    invalidateOnlineResolveCache()
  })
  afterEach(() => { vi.useRealTimers() })

  it('retries an empty result after a minute and serves the new ids on the next resolve', async () => {
    const inner = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([1, 2])
    const resolve = withOnlineSwr('wishlist', inner)
    await expect(resolve(ctx)).resolves.toEqual([])
    vi.advanceTimersByTime(MINUTE - 1)
    await expect(resolve(ctx)).resolves.toEqual([])
    expect(inner).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await expect(resolve(ctx)).resolves.toEqual([])
    expect(inner).toHaveBeenCalledTimes(2)
    await Promise.resolve()
    await expect(resolve(ctx)).resolves.toEqual([1, 2])
  })

  it('keeps a result with games for ten minutes', async () => {
    const inner = vi.fn().mockResolvedValue([5])
    const resolve = withOnlineSwr('store', inner)
    await resolve(ctx)
    vi.advanceTimersByTime(10 * MINUTE - 1)
    await expect(resolve(ctx)).resolves.toEqual([5])
    expect(inner).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await resolve(ctx)
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it('retries a result that stays empty at most once a minute', async () => {
    const inner = vi.fn().mockResolvedValue([])
    const resolve = withOnlineSwr('wishlist', inner)
    await resolve(ctx)
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(10_000)
      await resolve(ctx)
      await Promise.resolve()
    }
    expect(inner).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(MINUTE - 1)
    await resolve(ctx)
    expect(inner).toHaveBeenCalledTimes(2)
  })
})
