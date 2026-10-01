import { describe, it, expect } from 'vitest'
import { installPluginApi, makeApi, getExternalSearchProviders, getExternalWidgetProviders } from '../../core/pluginApi'

// Regression test for a hot-swap leak: `installPluginApi()`'s returned
// teardown only cleared 7 of the module's 16 registries — search/side-menu/
// context/widget/shelf-renderer/metadata/export/import-handler providers and
// context-aware shelf sources all survived a teardown, so a bundle re-inject
// (dev mode, or a host hot-swap) accumulated stale entries from every prior
// instance instead of starting clean. This pins two of the previously-missed
// ones; the fix (src/core/pluginApi.ts) clears all 16 the same way.
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
