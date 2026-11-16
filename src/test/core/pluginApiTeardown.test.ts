import { describe, it, expect, vi } from 'vitest'
import { installPluginApi, makeApi, getExternalSearchProviders, getExternalWidgetProviders } from '../../core/pluginApi'

describe('installPluginApi teardown clears every registry', () => {
  it('a registered search provider does not survive teardown', () => {
    const uninstall = installPluginApi()
    const unregister = makeApi().registerSearchProvider({
      id: 'test.search', displayName: 'Test', search: () => [],
    })
    expect(getExternalSearchProviders().some((p) => p.id === 'test.search')).toBe(true)
    uninstall()
    expect(getExternalSearchProviders().some((p) => p.id === 'test.search')).toBe(false)
    unregister()
  })

  it('a registered widget provider does not survive teardown', () => {
    const uninstall = installPluginApi()
    const unregister = makeApi().registerWidgetProvider({
      id: 'test.widget', displayName: 'Test', render: () => null,
    })
    expect(getExternalWidgetProviders().some((p) => p.id === 'test.widget')).toBe(true)
    uninstall()
    expect(getExternalWidgetProviders().some((p) => p.id === 'test.widget')).toBe(false)
    unregister()
  })
})

describe('integration registration', () => {
  it('mounts and unmounts a queued integration once even when it registers twice', async () => {
    const PENDING = Symbol.for('deck-shelves/pending')
    let mounts = 0
    let unmounts = 0
    const integration = { name: 'twice', onMount: () => { mounts++ }, onUnmount: () => { unmounts++ } }
    ;(globalThis as any)[PENDING] = [{ integration }]
    vi.stubGlobal('window', globalThis)
    const uninstall = installPluginApi()
    ;(window as any).deckShelves.register(integration)
    await Promise.resolve()
    await Promise.resolve()
    expect(mounts).toBe(1)
    uninstall()
    expect(unmounts).toBe(1)
    vi.unstubAllGlobals()
  })
})
