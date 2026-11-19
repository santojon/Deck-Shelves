import { describe, it, expect } from 'vitest'
import {
  makeApi, installPluginApi, setInternalBootstrap, hasExternalIntegrations,
  hasExternalSource, isContextAwareSource, hasExternalSmartSource, hasExternalFilterType, hasExternalSortOption,
  getExternalSources, getExternalSmartSources, getExternalFilterTypes, getExternalSortOptions,
  getExternalImportTypes, getExternalSearchProviders, getExternalSideMenuProviders, getExternalContextProviders,
  getExternalWidgetProviders, getExternalShelfRenderers, getExternalMetadataProviders, getExternalStatisticsProviders,
  getExternalRecommendationProviders, getExternalExportHandlers, getExternalImportHandlers,
  registerInternalShelfSource, registerInternalSmartShelfSource, registerInternalFilterType, registerInternalSortOption,
  registerInternalImportType, registerInternalSearchProvider, registerInternalStatisticsProvider,
} from '../../core/pluginApi'

type Api = ReturnType<typeof makeApi>
type Listed = ReadonlyArray<{ id: string }>

const descriptor = (id: string, displayName = id): any => ({
  id, displayName, label: displayName,
  resolve: () => [], evaluate: () => true, sort: (ids: number[]) => ids, search: () => [],
  render: () => null, parse: () => null, export: (s: string) => s, import: (s: string) => s,
})

const listed = (list: Listed, id: string): boolean => list.some((d) => d.id === id)

const REGISTRIES: Array<{ name: string; register: (api: Api, d: any) => () => void; has: (id: string) => boolean }> = [
  { name: 'shelf sources', register: (api, d) => api.registerShelfSource(d), has: hasExternalSource },
  { name: 'context-aware shelf sources', register: (api, d) => api.registerContextAwareShelfSource(d), has: isContextAwareSource },
  { name: 'smart shelf sources', register: (api, d) => api.registerSmartShelfSource(d), has: hasExternalSmartSource },
  { name: 'filter types', register: (api, d) => api.registerFilterType(d), has: hasExternalFilterType },
  { name: 'sort options', register: (api, d) => api.registerSortOption(d), has: hasExternalSortOption },
  { name: 'import types', register: (api, d) => api.registerImportType(d), has: (id) => listed(getExternalImportTypes(), id) },
  { name: 'search providers', register: (api, d) => api.registerSearchProvider(d), has: (id) => listed(getExternalSearchProviders(), id) },
  { name: 'side menu providers', register: (api, d) => api.registerSideMenuProvider(d), has: (id) => listed(getExternalSideMenuProviders(), id) },
  { name: 'context providers', register: (api, d) => api.registerContextProvider(d), has: (id) => listed(getExternalContextProviders(), id) },
  { name: 'widget providers', register: (api, d) => api.registerWidgetProvider(d), has: (id) => listed(getExternalWidgetProviders(), id) },
  { name: 'shelf renderers', register: (api, d) => api.registerShelfRenderer(d), has: (id) => listed(getExternalShelfRenderers(), id) },
  { name: 'metadata providers', register: (api, d) => api.registerMetadataProvider(d), has: (id) => listed(getExternalMetadataProviders(), id) },
  { name: 'statistics providers', register: (api, d) => api.registerStatisticsProvider(d), has: (id) => listed(getExternalStatisticsProviders(), id) },
  { name: 'recommendation providers', register: (api, d) => api.registerRecommendationProvider(d), has: (id) => listed(getExternalRecommendationProviders(), id) },
  { name: 'export handlers', register: (api, d) => api.registerExportHandler(d), has: (id) => listed(getExternalExportHandlers(), id) },
  { name: 'import handlers', register: (api, d) => api.registerImportHandler(d), has: (id) => listed(getExternalImportHandlers(), id) },
]

const BUILT_INS: Array<{
  name: string
  registerInternal: (d: any) => () => void
  register: (api: Api, d: any) => () => void
  list: () => Listed
}> = [
  { name: 'shelf sources', registerInternal: registerInternalShelfSource, register: (api, d) => api.registerShelfSource(d), list: getExternalSources },
  { name: 'smart shelf sources', registerInternal: registerInternalSmartShelfSource, register: (api, d) => api.registerSmartShelfSource(d), list: getExternalSmartSources },
  { name: 'filter types', registerInternal: registerInternalFilterType, register: (api, d) => api.registerFilterType(d), list: getExternalFilterTypes },
  { name: 'sort options', registerInternal: registerInternalSortOption, register: (api, d) => api.registerSortOption(d), list: getExternalSortOptions },
  { name: 'import types', registerInternal: registerInternalImportType, register: (api, d) => api.registerImportType(d), list: getExternalImportTypes },
  { name: 'search providers', registerInternal: registerInternalSearchProvider, register: (api, d) => api.registerSearchProvider(d), list: getExternalSearchProviders },
  { name: 'statistics providers', registerInternal: registerInternalStatisticsProvider, register: (api, d) => api.registerStatisticsProvider(d), list: getExternalStatisticsProviders },
]

describe('plugin API registries are shared with the plugin\'s own lookups', () => {
  it.each(REGISTRIES)('what a plugin registers in $name is what the plugin\'s own lookup returns', ({ register, has }) => {
    const id = 'ext.shared.lookup'
    expect(has(id)).toBe(false)
    const unregister = register(makeApi(), descriptor(id))
    expect(has(id)).toBe(true)
    unregister()
    expect(has(id)).toBe(false)
  })

  it('teardown leaves every registry empty', () => {
    const uninstall = installPluginApi()
    const api = makeApi()
    const id = 'ext.shared.teardown'
    for (const r of REGISTRIES) r.register(api, descriptor(id))
    expect(REGISTRIES.filter((r) => !r.has(id)).map((r) => r.name)).toEqual([])
    expect(hasExternalIntegrations()).toBe(true)
    uninstall()
    expect(REGISTRIES.filter((r) => r.has(id)).map((r) => r.name)).toEqual([])
    expect(hasExternalIntegrations()).toBe(false)
  })

  it.each(BUILT_INS)('an id a built-in took in $name is refused to third parties', ({ registerInternal, register, list }) => {
    const id = 'shared_built_in'
    const builtIn = descriptor(id, 'built-in')
    const unBuiltIn = registerInternal(builtIn)
    const unregister = register(makeApi(), descriptor(id, 'third party'))
    expect(list().find((d) => d.id === id)).toBe(builtIn)
    unregister()
    expect(list().find((d) => d.id === id)).toBe(builtIn)
    unBuiltIn()
    expect(listed(list(), id)).toBe(false)
  })

  it('installing runs the built-in bootstrap once and teardown undoes it', () => {
    let installs = 0
    let uninstalls = 0
    setInternalBootstrap(() => { installs++; return () => { uninstalls++ } })
    const uninstall = installPluginApi()
    expect([installs, uninstalls]).toEqual([1, 0])
    uninstall()
    expect([installs, uninstalls]).toEqual([1, 1])
    setInternalBootstrap(() => () => {})
  })
})
