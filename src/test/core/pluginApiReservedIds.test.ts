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

  it('refuses a condition type or smart mode the plugin evaluates even when no built-in entry lists it', () => {
    const api = makeApi()
    const condition = (id: string) => ({ id, displayName: id, evaluate: () => true })
    api.registerFilterType(condition('isNew'))
    api.registerSmartShelfSource(source('soundtracks'))
    api.registerSmartShelfSource(source('long_session_night'))
    expect(api.getRegisteredFilterTypes().map((d) => d.id)).not.toContain('isNew')
    expect(api.getRegisteredSmartSources().map((d) => d.id)).not.toContain('soundtracks')
    expect(api.getRegisteredSmartSources().map((d) => d.id)).not.toContain('long_session_night')
    const unCondition = api.registerFilterType(condition('acme.thing'))
    const unMode = api.registerSmartShelfSource(source('acme.thing'))
    expect(api.getRegisteredFilterTypes().map((d) => d.id)).toContain('acme.thing')
    expect(api.getRegisteredSmartSources().map((d) => d.id)).toContain('acme.thing')
    unCondition()
    unMode()
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
