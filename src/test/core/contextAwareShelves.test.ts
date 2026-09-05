import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type FocusInfo = { appid: number; shelfId: string | null } | null

const h = vi.hoisted(() => ({
  requiresFocus: new Set<string>(),
  resolveImpl: null as null | ((
    sourceId: string, limit: number, params: unknown, context: unknown, signal?: AbortSignal,
  ) => Promise<number[]>),
  resolveCallCount: 0,
  focusedInfo: null as { appid: number; shelfId: string | null } | null,
  focusListeners: new Set<(info: FocusInfo) => void>(),
}))

vi.mock('../../core/pluginApi', () => ({
  contextAwareSourceRequiresFocus: (id: string) => h.requiresFocus.has(id),
  resolveContextAwareExternalSource: async (
    sourceId: string, limit: number, params: unknown, context: unknown, signal?: AbortSignal,
  ) => {
    h.resolveCallCount++
    if (h.resolveImpl) return h.resolveImpl(sourceId, limit, params, context, signal)
    return []
  },
}))

vi.mock('../../core/focusedCardTracker', () => ({
  getFocusedCard: () => h.focusedInfo,
  subscribeFocusedCard: (cb: (info: FocusInfo) => void) => {
    h.focusListeners.add(cb)
    cb(h.focusedInfo) // matches the real tracker's immediate-fire-on-subscribe semantics
    return () => { h.focusListeners.delete(cb) }
  },
}))

import {
  subscribeContextInvalidation,
  maybeSubscribeContextInvalidation,
  resolveContextAwareShelf,
  __resetContextAwareShelvesForTest,
} from '../../core/contextAwareShelves'

function setFocus(info: FocusInfo): void {
  h.focusedInfo = info
  for (const cb of Array.from(h.focusListeners)) cb(info)
}

beforeEach(() => {
  h.requiresFocus = new Set()
  h.resolveImpl = null
  h.resolveCallCount = 0
  h.focusedInfo = null
  h.focusListeners = new Set()
  __resetContextAwareShelvesForTest()
})

describe('maybeSubscribeContextInvalidation — static vs context-aware sources', () => {
  it('returns null for a non-external source', () => {
    expect(maybeSubscribeContextInvalidation({ type: 'tab', sourceId: 'x' }, () => {})).toBeNull()
  })

  it('returns null for an external source that does not require focus', () => {
    expect(maybeSubscribeContextInvalidation({ type: 'external', sourceId: 'static-src' }, () => {})).toBeNull()
  })

  it('returns a real unsubscribe for a source that requires focus', () => {
    h.requiresFocus.add('suggestme/similar-to-selected')
    const off = maybeSubscribeContextInvalidation({ type: 'external', sourceId: 'suggestme/similar-to-selected' }, () => {})
    expect(typeof off).toBe('function')
    off?.()
  })
})

describe('subscribeContextInvalidation — debounce', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('does not fire on the initial subscribe (seeding only)', () => {
    setFocus({ appid: 620, shelfId: 's_1' })
    const cb = vi.fn()
    const off = subscribeContextInvalidation(cb)
    vi.advanceTimersByTime(1000)
    expect(cb).not.toHaveBeenCalled()
    off()
  })

  it('does not fire when only shelfId changes with the same appid', () => {
    setFocus({ appid: 620, shelfId: 's_1' })
    const cb = vi.fn()
    const off = subscribeContextInvalidation(cb)
    setFocus({ appid: 620, shelfId: 's_2' })
    vi.advanceTimersByTime(1000)
    expect(cb).not.toHaveBeenCalled()
    off()
  })

  it('coalesces a rapid A→B→C→D sequence into a single call for D', () => {
    setFocus({ appid: 1, shelfId: null })
    const cb = vi.fn()
    const off = subscribeContextInvalidation(cb)

    setFocus({ appid: 2, shelfId: null })
    vi.advanceTimersByTime(50)
    setFocus({ appid: 3, shelfId: null })
    vi.advanceTimersByTime(50)
    setFocus({ appid: 4, shelfId: null })
    vi.advanceTimersByTime(300) // past the debounce window

    expect(cb).toHaveBeenCalledOnce()
    off()
  })

  it('stops firing after unsubscribe', () => {
    setFocus({ appid: 1, shelfId: null })
    const cb = vi.fn()
    const off = subscribeContextInvalidation(cb)
    off()
    setFocus({ appid: 2, shelfId: null })
    vi.advanceTimersByTime(1000)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('resolveContextAwareShelf — focus requirement', () => {
  it('returns [] without calling the provider when focus is required and absent', async () => {
    h.requiresFocus.add('suggestme/similar')
    setFocus(null)
    const ids = await resolveContextAwareShelf('suggestme/similar', 'shelf-1', 10, undefined)
    expect(ids).toEqual([])
    expect(h.resolveCallCount).toBe(0)
  })

  it('passes the live focus context through when focus is present', async () => {
    h.requiresFocus.add('suggestme/similar')
    setFocus({ appid: 367520, shelfId: 's_home' })
    let seenContext: any = null
    h.resolveImpl = async (_id, _limit, _params, context) => { seenContext = context; return [1, 2, 3] }
    const ids = await resolveContextAwareShelf('suggestme/similar', 'shelf-1', 10, undefined)
    expect(ids).toEqual([1, 2, 3])
    expect(seenContext).toEqual({ focusedAppid: 367520, shelfId: 's_home' })
  })
})

describe('resolveContextAwareShelf — cache', () => {
  it('reuses a cached result for the same source+shelf+params+focus', async () => {
    setFocus({ appid: 620, shelfId: 's_1' })
    h.resolveImpl = async () => [620, 400]
    const first = await resolveContextAwareShelf('src', 'shelf-1', 10, undefined)
    const second = await resolveContextAwareShelf('src', 'shelf-1', 10, undefined)
    expect(first).toEqual([620, 400])
    expect(second).toEqual([620, 400])
    expect(h.resolveCallCount).toBe(1)
  })

  it('does not reuse the cache across a different focused appid', async () => {
    setFocus({ appid: 620, shelfId: 's_1' })
    h.resolveImpl = async (_id, _limit, _params, context: any) => [context.focusedAppid]
    const a = await resolveContextAwareShelf('src', 'shelf-1', 10, undefined)
    setFocus({ appid: 400, shelfId: 's_1' })
    const b = await resolveContextAwareShelf('src', 'shelf-1', 10, undefined)
    expect(a).toEqual([620])
    expect(b).toEqual([400])
    expect(h.resolveCallCount).toBe(2)
  })
})

describe('resolveContextAwareShelf — cancellation', () => {
  it('aborts the earlier in-flight call for the same shelf+source', async () => {
    setFocus({ appid: 1, shelfId: 's_1' })
    let firstSignal: AbortSignal | null = null
    h.resolveImpl = async (_id, _limit, _params, _context, signal) => {
      if (!firstSignal) { firstSignal = signal ?? null; return new Promise(() => {}) } // never resolves
      return [42]
    }
    void resolveContextAwareShelf('src', 'shelf-1', 10, undefined) // request #1, left in-flight forever
    await new Promise((r) => setTimeout(r, 0))
    await resolveContextAwareShelf('src', 'shelf-1', 10, undefined) // request #2 supersedes it
    expect(firstSignal).not.toBeNull()
    expect((firstSignal as unknown as AbortSignal).aborted).toBe(true)
  })
})

describe('resolveContextAwareShelf — provider failure', () => {
  it('resolves to [] instead of throwing when the provider rejects', async () => {
    setFocus({ appid: 1, shelfId: null })
    h.resolveImpl = async () => { throw new Error('boom') }
    await expect(resolveContextAwareShelf('src', 'shelf-1', 10, undefined)).resolves.toEqual([])
  })
})
