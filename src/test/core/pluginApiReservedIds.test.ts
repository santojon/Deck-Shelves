import { describe, it, expect } from 'vitest'
import { makeApi, registerInternalShelfSource, getExternalSearchProviders } from '../../core/pluginApi'

const source = (id: string) => ({ id, displayName: id, resolve: async () => [] })

describe('public API reserved ids', () => {
  it('refuses an external entry that takes a built-in id, and leaves the built-in in place', () => {
    const unBuiltIn = registerInternalShelfSource(source('pinned_games'))
    const api = makeApi()
    const un = api.registerShelfSource(source('pinned_games'))
    const entry = api.getRegisteredSources().find((s) => s.id === 'pinned_games')
    expect(entry?.displayName).toBe('pinned_games')
    un()
    expect(api.getRegisteredSources().some((s) => s.id === 'pinned_games')).toBe(true)
    unBuiltIn()
  })

  it('refuses ids under the plugin\'s own prefix', () => {
    const api = makeApi()
    api.registerSearchProvider({ id: 'deck-shelves.mine', displayName: 'x', search: async () => [] } as any)
    expect(getExternalSearchProviders().some((p) => p.id === 'deck-shelves.mine')).toBe(false)
  })

  it('an unregister never removes a newer registration under the same id', () => {
    const api = makeApi()
    const first = source('ext.source')
    const second = { ...source('ext.source'), displayName: 'second' }
    const unFirst = api.registerShelfSource(first)
    const unSecond = api.registerShelfSource(second)
    unFirst()
    expect(api.getRegisteredSources().find((s) => s.id === 'ext.source')?.displayName).toBe('second')
    unSecond()
    expect(api.getRegisteredSources().some((s) => s.id === 'ext.source')).toBe(false)
  })
})
