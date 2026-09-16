import { describe, it, expect } from 'vitest'
import {
  makeApi,
  isContextAwareSource,
  contextAwareSourceRequiresFocus,
  resolveExternalSource,
  resolveContextAwareExternalSource,
} from '../../core/pluginApi'
import { subscribeShelfRefresh } from '../../core/shelfRefresh'

describe('context-aware shelf source registry', () => {
  it('registers, lists, and unsubscribes via the dedicated registry', () => {
    const api = makeApi()
    const d = {
      id: 'test.context.similar',
      label: 'Similar To Selected Game',
      context: { requiresFocusedApp: true },
      resolve: () => [1, 2, 3],
    }
    const unsub = api.registerContextAwareShelfSource(d)
    expect(api.getRegisteredContextAwareShelfSources().some((s) => s.id === d.id)).toBe(true)
    expect(isContextAwareSource(d.id)).toBe(true)
    expect(contextAwareSourceRequiresFocus(d.id)).toBe(true)
    unsub()
    expect(api.getRegisteredContextAwareShelfSources().some((s) => s.id === d.id)).toBe(false)
    expect(isContextAwareSource(d.id)).toBe(false)
  })

  it('is also visible through the plain external-source registry (structural superset)', () => {
    const api = makeApi()
    const d = {
      id: 'test.context.also-plain',
      resolve: () => [4, 5],
    }
    const unsub = api.registerContextAwareShelfSource(d)
    expect(api.getRegisteredSources().some((s) => s.id === d.id)).toBe(true)
    unsub()
    expect(api.getRegisteredSources().some((s) => s.id === d.id)).toBe(false)
  })

  it('a source that never declared requiresFocusedApp reports false', () => {
    const api = makeApi()
    const d = { id: 'test.context.no-focus-required', resolve: () => [] }
    const unsub = api.registerContextAwareShelfSource(d)
    expect(contextAwareSourceRequiresFocus(d.id)).toBe(false)
    unsub()
  })

  it('resolveContextAwareExternalSource passes params/context/signal through and never throws', async () => {
    const api = makeApi()
    let seen: unknown[] = []
    const d = {
      id: 'test.context.passthrough',
      resolve: (...args: unknown[]) => { seen = args; return [9] },
    }
    const unsub = api.registerContextAwareShelfSource(d)
    const context = { focusedAppid: 620, shelfId: 's_1' }
    const controller = new AbortController()
    const ids = await resolveContextAwareExternalSource(d.id, 10, { a: 1 }, context, controller.signal)
    expect(ids).toEqual([9])
    expect(seen).toEqual([10, { a: 1 }, context, controller.signal])
    unsub()
  })

  it('resolveContextAwareExternalSource resolves to [] when the provider throws', async () => {
    const api = makeApi()
    const d = { id: 'test.context.throws', resolve: () => { throw new Error('boom') } }
    const unsub = api.registerContextAwareShelfSource(d)
    await expect(
      resolveContextAwareExternalSource(d.id, 10, undefined, { focusedAppid: null, shelfId: null }),
    ).resolves.toEqual([])
    unsub()
  })

  it('resolves to [] for an unregistered source id', async () => {
    await expect(
      resolveContextAwareExternalSource('does.not.exist', 10, undefined, { focusedAppid: null, shelfId: null }),
    ).resolves.toEqual([])
  })

  it('plain resolveExternalSource still works for a context-aware source via the dual registry', async () => {
    const api = makeApi()
    const d = { id: 'test.context.plain-path', resolve: (limit: number) => [limit] }
    const unsub = api.registerContextAwareShelfSource(d)
    const ids = await resolveExternalSource(d.id, 7)
    expect(ids).toEqual([7])
    unsub()
  })
})

describe('api.refreshShelf', () => {
  it('emits a manual, shelf-scoped refresh signal', () => {
    const api = makeApi()
    const seen: Array<{ manual?: boolean; shelfId?: string } | undefined> = []
    const off = subscribeShelfRefresh((opts) => { seen.push(opts) })
    api.refreshShelf('shelf-xyz')
    expect(seen).toEqual([{ manual: true, shelfId: 'shelf-xyz' }])
    off()
  })
})
