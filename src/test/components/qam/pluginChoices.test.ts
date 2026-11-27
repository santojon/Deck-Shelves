// @vitest-environment jsdom
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({
  dropdowns: new Map<string, any[]>(), lists: [] as any[][], pickers: [] as any[], allTabs: false, platform: {}, payload: undefined as any,
}))

vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    DropdownItem: ({ label, rgOptions }: any) => { seen.dropdowns.set(String(label), rgOptions); seen.lists.push(rgOptions); return null },
    Dropdown: (props: any) => { seen.lists.push(props.rgOptions); seen.pickers.push(props); return null },
  }
})
vi.mock('../../../components/qam/modals/editShelf/EditorTabs', async () => {
  const { createElement: el } = await import('react')
  return {
    EditorTabs: ({ tabs, activeTab }: any) => el('div', null, seen.allTabs
      ? tabs.map((tab: any) => el('section', { key: tab.id }, tab.content))
      : tabs.find((tab: any) => tab.id === activeTab)?.content),
  }
})
vi.mock('../../../components/qam/modals/editShelf/useShelfPreview', () => ({
  useShelfPreview: () => ({
    previewSource: null, previewCount: 0, resolvedIds: [], resolvedMeta: new Map(),
    effectiveManualOrder: [], reorderManual: () => {}, SYNTH_SENTINEL: (i: number) => -(i + 1),
  }),
}))
vi.mock('../../../components/qam/modals/editShelf/useModalCollections', () => ({ useModalCollections: () => [] }))
vi.mock('../../../runtime/platformContext', () => ({ usePlatform: () => seen.platform }))
vi.mock('../../../components/qam/modals/editShelf/PreviewPanel', () => ({ PreviewPanel: () => null }))
vi.mock('../../../components/qam/modals/editShelf/VisualTabContent', () => ({ VisualTabContent: () => null }))
vi.mock('../../../components/qam/modals/editShelf/DisplayTabContent', () => ({ DisplayTabContent: () => null }))
vi.mock('../../../components/qam/modals/editShelf/VisibilityRulesEditor', () => ({ VisibilityRulesEditor: () => null }))
vi.mock('../../../components/qam/modals/editShelf/SavedSmartFiltersBar', () => ({
  SavedSmartFiltersBar: ({ currentPayload }: any) => { seen.payload = currentPayload; return null },
}))
vi.mock('../../../components/notify', () => ({ notify: () => {} }))
vi.mock('../../../steam', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveShelfAppIds: async () => [],
}))

import '../../../core/internalRegistry'
import i18n, { initI18n } from '../../../i18n'
import { installPluginApi, makeApi } from '../../../core/pluginApi'
import { EditShelfModal } from '../../../components/qam/modals/EditShelfModal'
import { EditSmartShelfModal } from '../../../components/qam/modals/EditSmartShelfModal'
import { SMART_MODE_OPTIONS } from '../../../components/qam/modals/editShelf/constants'
import { SortField } from '../../../components/qam/modals/editShelf/SortField'
import { buildInitialSmartState } from '../../../components/qam/modals/editShelf/buildSmartInitialState'
import { persistSmartShelf } from '../../../components/qam/modals/editShelf/buildSmartSavePatch'
import {
  defaultSortForMode, smartModeChoices, smartModeDefaults, smartModeName, smartParamControl, smartParamKeys,
} from '../../../components/qam/modals/editShelf/smartModes'
import { SMART_PARAM_DEFAULTS, DEFAULT_SORT_FOR_MODE } from '../../../steam/smartParams'

const api = makeApi()
const offs: Array<() => void> = []
let root: Root
let opened = 0

const t = (key: string, options?: Record<string, unknown>) => String(i18n.t(key, options as any))
const controller = (): any => ({ t: i18n.t.bind(i18n), tabs: [], collections: [], actions: {}, settings: {} })
const shelfOf = (source: Record<string, unknown>): any => ({ id: 's', title: 'S', enabled: true, limit: 10, source })
const smartShelfOf = (over: Record<string, unknown> = {}): any => ({ id: 'sm', title: 'Smart', enabled: true, hidden: false, mode: 'acme.mode', ...over })
const optionIds = (label: string) => (seen.dropdowns.get(i18n.t(label)) ?? []).map((o: any) => o.data)
const listWith = (id: string) => seen.lists.find((list) => list.some((o: any) => o.data === id))

const acmeMode = {
  id: 'acme.mode', displayName: 'Acme mode',
  defaultParams: { minutes: 20, count: 5 },
  paramMeta: {
    minutes: { label: 'Acme minutes', min: 0, max: 120, step: 5, unit: 'min' },
    count: { label: 'Acme count', min: 1, max: 10, step: 1 },
    broken: { label: 'Broken', min: 0, max: Number.NaN, step: 1 },
  },
  resolve: async () => [],
} as any

function forgetRendered() {
  seen.dropdowns.clear()
  seen.lists.length = 0
  seen.pickers.length = 0
}

function render(element: ReturnType<typeof h>) {
  forgetRendered()
  opened += 1
  act(() => root.render(h('div', { key: opened }, element)))
}

const showShelf = (source: Record<string, unknown>) => render(h(EditShelfModal, { controller: controller(), shelf: shelfOf(source) }))
const showSmartShelf = (shelf: any) => render(h(EditSmartShelfModal, { controller: controller(), shelf }))

beforeAll(() => {
  initI18n()
  installPluginApi()
})

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  seen.allTabs = false
  const mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  act(() => root.unmount())
  for (const off of offs.splice(0)) off()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('plugin entries in the shelf editor', () => {
  it('offers the External source type only once a plugin source is registered, and lists plugin sources only', () => {
    showShelf({ type: 'builtin', sourceId: 'pinned_games' })
    expect(optionIds('source')).not.toContain('external')
    offs.push(api.registerShelfSource({ id: 'acme.source', displayName: 'Acme', resolve: async () => [] }))
    showShelf({ type: 'external', sourceId: 'acme.source' })
    expect(optionIds('source')).toContain('external')
    expect(optionIds('source_external')).toEqual(['acme.source'])
  })

  it('keeps the External source type on offer for a shelf of that type while its plugin is away', () => {
    showShelf({ type: 'external', sourceId: 'acme.gone' })
    expect(optionIds('source')).toContain('external')
  })

  it('offers every smart mode, plugin ones last, as the source of a regular shelf', () => {
    offs.push(api.registerSmartShelfSource(acmeMode))
    showShelf({ type: 'smart', mode: 'quick_play' })
    expect(optionIds('source')).toContain('smart')
    expect(optionIds('source_smart')).toEqual([...SMART_MODE_OPTIONS, 'acme.mode'])
  })

  it('names a plugin smart source offered on a multi-source shelf with its own name', () => {
    offs.push(api.registerSmartShelfSource(acmeMode))
    showShelf({ type: 'composite', combine: 'union', sources: [{ type: 'tab', tab: 'all' }, { type: 'smart', mode: 'recently_played' }] })
    expect(listWith('acme.mode')?.find((o: any) => o.data === 'acme.mode')?.label).toBe('Acme mode')
  })
})

describe('plugin smart modes', () => {
  it('offers a plugin smart source as a mode after the built-in ones, in the editor and in Combine modes', () => {
    offs.push(api.registerSmartShelfSource(acmeMode))
    showSmartShelf(smartShelfOf({ mode: 'quick_play' }))
    const modes = listWith('daily_pick') as any[]
    expect(modes.map((o) => o.data)).toEqual([...SMART_MODE_OPTIONS, 'acme.mode'])
    expect(modes.at(-1).label).toBe('Acme mode')
    const combine = seen.lists.find((list) => list[0]?.data === '__add_placeholder__') as any[]
    expect(combine.map((o) => o.data)).toEqual(['__add_placeholder__', ...SMART_MODE_OPTIONS.filter((m) => m !== 'quick_play'), 'acme.mode'])
  })

  it('takes its controls from paramMeta and its starting values from defaultParams', () => {
    offs.push(api.registerSmartShelfSource(acmeMode))
    expect(smartModeDefaults('acme.mode')).toEqual({ minutes: 20, count: 5 })
    expect(smartModeDefaults('acme.mode')).not.toBe(acmeMode.defaultParams)
    expect(smartParamKeys('acme.mode')).toEqual(['minutes', 'count', 'broken'])
    expect(smartParamControl(t, 'acme.mode', 'minutes')).toEqual({ label: 'Acme minutes', unit: 'min', min: 0, max: 120, step: 5 })
    expect(buildInitialSmartState(smartShelfOf({ smartParams: { minutes: 35 } })).smartParams).toEqual({ minutes: 35, count: 5 })
    seen.allTabs = true
    showSmartShelf(smartShelfOf({ smartParams: { minutes: 35 } }))
    const text = document.body.textContent ?? ''
    expect(text).toContain('Acme minutes')
    expect(text).toContain('35 min')
    expect(text).toContain('Acme count')
  })

  it('gives no control for a malformed paramMeta entry', () => {
    offs.push(api.registerSmartShelfSource(acmeMode))
    expect(smartParamControl(t, 'acme.mode', 'broken')).toBeNull()
    expect(smartParamControl(t, 'acme.mode', 'missing')).toBeNull()
  })

  it('starts a plugin mode in source order', () => {
    offs.push(api.registerSmartShelfSource(acmeMode))
    expect(defaultSortForMode('acme.mode')).toBe('source_order')
    expect(buildInitialSmartState(smartShelfOf()).sort).toBe('source_order')
  })

  it('keeps the names, controls and default sort of a built-in mode', () => {
    expect(smartModeName(t, 'quick_play')).toBe(t('smart_template_quick_play'))
    expect(smartModeDefaults('quick_play')).toEqual(SMART_PARAM_DEFAULTS.quick_play)
    expect(smartParamKeys('quick_play')).toEqual(Object.keys(SMART_PARAM_DEFAULTS.quick_play ?? {}))
    expect(smartParamControl(t, 'quick_play', 'maxPlaytimeMinutes')?.label).toBe(t('smart_param_max_playtime'))
    expect(defaultSortForMode('quick_play')).toBe(DEFAULT_SORT_FOR_MODE.quick_play)
  })

  it('keeps a saved mode nothing answers for selectable as Unavailable, with its saved parameter keys', () => {
    const choices = smartModeChoices(t, 'acme.gone')
    expect(choices.at(-1)).toEqual({ data: 'acme.gone', label: t('filter_type_unavailable', { type: 'acme.gone' }) })
    expect(smartParamKeys('acme.gone', { minutes: 30 })).toEqual(['minutes'])
    showSmartShelf(smartShelfOf({ mode: 'acme.gone', smartParams: { minutes: 30 } }))
    const modePicker = seen.pickers.find((p) => p.selectedOption === 'acme.gone')
    expect(modePicker?.rgOptions).toContainEqual({ data: 'acme.gone', label: t('filter_type_unavailable', { type: 'acme.gone' }) })
  })

  it('does not rename a built-in mode the editor does not offer', () => {
    expect(smartModeName(t, 'custom')).toBe(t('smart_template_custom'))
    expect(smartModeChoices(t, 'custom').some((o) => o.data === 'custom')).toBe(false)
  })

  it('switches to source order and the plugin defaults when a plugin mode is picked', () => {
    offs.push(api.registerSmartShelfSource(acmeMode))
    seen.allTabs = true
    showSmartShelf(smartShelfOf({ mode: 'quick_play' }))
    const modePicker = seen.pickers.find((p) => p.selectedOption === 'quick_play')
    forgetRendered()
    act(() => modePicker.onChange({ data: 'acme.mode', label: 'Acme mode' }))
    const primarySort = seen.pickers.find((p) => p.rgOptions.some((o: any) => o.data === 'alphabetical'))
    expect(primarySort?.selectedOption).toBe('source_order')
    const text = document.body.textContent ?? ''
    expect(text).toContain('Acme minutes')
    expect(text).toContain('20 min')
  })

  it('keeps the saved parameters of a mode nothing answers for in what the editor saves', () => {
    seen.payload = undefined
    showSmartShelf(smartShelfOf({ mode: 'acme.gone', smartParams: { minutes: 30 } }))
    expect(seen.payload?.smartParams).toEqual({ minutes: 30 })
  })

  it('saves only the values that differ from the plugin defaults, and the saved values once the plugin is gone', async () => {
    const off = api.registerSmartShelfSource(acmeMode)
    const patches: any[] = []
    const actions: any = { patchSmartShelf: async (_id: string, patch: any) => { patches.push(patch); return true } }
    const save = async (shelf: any) => {
      const state = buildInitialSmartState(shelf)
      const paramKeys = smartParamKeys(shelf.mode, shelf.smartParams)
      await persistSmartShelf({ state, shelf, mode: 'edit', isManual: false, highlightPickerOpen: false, hiddenPickerOpen: false, paramKeys, actions })
    }
    await save(smartShelfOf({ smartParams: { minutes: 30, count: 5 } }))
    off()
    await save(smartShelfOf({ smartParams: { minutes: 30, count: 5 } }))
    expect(patches.map((p) => [p.mode, p.smartParams])).toEqual([
      ['acme.mode', { minutes: 30 }],
      ['acme.mode', { minutes: 30, count: 5 }],
    ])
  })
})

describe('plugin sorts in the editors', () => {
  const acmeSort = () => api.registerSortOption({ id: 'acme.order', displayName: 'Acme order', sort: (ids) => ids.slice() })
  const sortLists = () => seen.lists.filter((list) => list.some((o: any) => o.data === 'acme.order'))

  it('offers a plugin sort under Order by and Base order in the shelf editor', () => {
    offs.push(acmeSort())
    showShelf({ type: 'filter', filter: { sort: 'manual' } })
    const lists = sortLists()
    expect(lists.some((list) => list.some((o: any) => o.data === 'manual'))).toBe(true)
    expect(lists.some((list) => !list.some((o: any) => o.data === 'manual' || o.data === 'random'))).toBe(true)
    expect(lists.flat().find((o: any) => o.data === 'acme.order')?.label).toBe('Acme order')
  })

  it('offers a plugin sort under Order by and Base order in the smart-shelf editor', () => {
    offs.push(acmeSort())
    showSmartShelf(smartShelfOf({ mode: 'quick_play', sort: 'manual' }))
    const lists = sortLists()
    expect(lists.some((list) => list.some((o: any) => o.data === 'manual'))).toBe(true)
    expect(lists.some((list) => !list.some((o: any) => o.data === 'manual' || o.data === 'random'))).toBe(true)
  })

  it('lists a saved key that is no longer offered as Unavailable in the first sort position', () => {
    const options = [{ data: 'alphabetical', label: 'Name' }]
    render(h(SortField, { label: 'Order', options, sort: 'acme.gone', onSortChange: () => {}, reverse: false, onReverseChange: () => {} }))
    expect(seen.lists[0]).toEqual([...options, { data: 'acme.gone', label: t('filter_type_unavailable', { type: 'acme.gone' }) }])
  })
})
