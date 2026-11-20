// @vitest-environment jsdom
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({
  tabs: [] as any[], pickers: [] as any[], bars: [] as any[], confirms: [] as any[], preview: {} as Record<string, unknown>, previewProps: undefined as any,
  resolve: async (..._args: any[]): Promise<number[]> => [],
}))

vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  const { createElement: el } = await import('react')
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    Tabs: ({ tabs }: any) => {
      seen.tabs = tabs
      return el('div', null, tabs.map((tab: any) => el('section', { key: tab.id, 'data-tab': tab.id }, el('header', null, tab.title), tab.content)))
    },
    DropdownItem: (props: any) => { seen.pickers.push(props); return null },
    Dropdown: (props: any) => { seen.pickers.push(props); return null },
  }
})
vi.mock('../../../components/qam/modals/editShelf/useShelfPreview', () => ({
  useShelfPreview: () => ({
    previewSource: null, previewCount: 0, resolvedIds: [], resolvedMeta: new Map(),
    effectiveManualOrder: [], reorderManual: () => {}, SYNTH_SENTINEL: (i: number) => -(i + 1), ...seen.preview,
  }),
}))
vi.mock('../../../components/qam/modals/editShelf/useModalCollections', () => ({ useModalCollections: () => [] }))
vi.mock('../../../runtime/platformContext', () => ({ usePlatform: () => ({}) }))
vi.mock('../../../components/qam/modals/editShelf/PreviewPanel', () => ({ PreviewPanel: (props: any) => { seen.previewProps = props; return null } }))
vi.mock('../../../components/qam/modals/editShelf/VisualTabContent', () => ({ VisualTabContent: () => null }))
vi.mock('../../../components/qam/modals/editShelf/DisplayTabContent', () => ({ DisplayTabContent: () => null }))
vi.mock('../../../components/qam/modals/editShelf/VisibilityRulesEditor', () => ({ VisibilityRulesEditor: () => null }))
vi.mock('../../../components/qam/modals/editShelf/SavedPresetBar', () => ({ SavedPresetBar: (props: any) => { seen.bars.push(props); return null } }))
vi.mock('../../../components/qam/modals/ConfirmActionModal', () => ({ confirmAction: (options: any) => { seen.confirms.push(options) } }))
vi.mock('../../../components/notify', () => ({ notify: () => {} }))
vi.mock('../../../steam', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveShelfAppIds: (...args: any[]) => seen.resolve(...args),
}))

import '../../../core/internalRegistry'
import i18n, { initI18n } from '../../../i18n'
import type { FilterGroup, FilterItem } from '../../../types'
import { EditShelfModal } from '../../../components/qam/modals/EditShelfModal'
import { buildInitialShelfState } from '../../../components/qam/modals/editShelf/buildInitialState'
import { usePreviewResolution } from '../../../components/qam/modals/editShelf/usePreviewResolution'
import { ConditionRow, describeCondition } from '../../../components/conditions/ConditionRow'
import { POST_FILTER_TYPES } from '../../../steam/compositePostFilter'

let root: Root
let opened = 0

const t = (key: string, options?: Record<string, unknown>) => String(i18n.t(key, options as any))
const actions = { saveFilter: vi.fn(async () => {}) }
const controller = (settings: Record<string, unknown> = {}): any => ({ t: i18n.t.bind(i18n), tabs: [], collections: [], actions, settings })
const shelfOf = (source: Record<string, unknown>): any => ({ id: 's', title: 'S', enabled: true, limit: 10, source })
const and = (...items: FilterItem[]): FilterGroup => ({ mode: 'and', items })
const localCoop: FilterItem = { type: 'categories', params: { categories: ['Shared/Split Screen'] } }
const smart = { type: 'smart', mode: 'recently_played' }
const builtin = { type: 'builtin', sourceId: 'pinned_games' }

const LOCAL_TITLE = () => describeCondition(localCoop)
const tab = (id: string) => document.querySelector<HTMLElement>(`section[data-tab="${id}"]`)
const tabIds = () => seen.tabs.map((x: any) => x.id)

function render(element: ReturnType<typeof h>) {
  seen.pickers.length = 0
  seen.bars.length = 0
  opened += 1
  act(() => root.render(h('div', { key: opened }, element)))
}

const showShelf = (source: Record<string, unknown>, settings?: Record<string, unknown>) => render(h(EditShelfModal, { controller: controller(settings), shelf: shelfOf(source) }))

beforeAll(() => {
  initI18n()
})

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  seen.confirms.length = 0
  seen.preview = {}
  actions.saveFilter.mockClear()
  seen.resolve = async () => []
  const mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('the tab that holds the combined-result filters', () => {
  it('is labelled Filters when every source is local', () => {
    showShelf({ type: 'composite', combine: 'union', sources: [builtin, smart] })
    expect(tab('childFilters')?.querySelector('header')?.textContent).toBe(t('edit_tab_filters'))
    expect(tab('childFilters')?.textContent).toContain(t('composite_post_filter_title'))
  })

  it('is the Filters tab of a Filter source with only local extra sources, after its own conditions', () => {
    showShelf({ type: 'composite', combine: 'union', sources: [{ type: 'filter', filter: { sort: 'alphabetical', filterGroup: and() } }, smart] })
    expect(tabIds()).not.toContain('childFilters')
    expect(tab('filters')?.textContent).toContain(t('composite_post_filter_title'))
    expect(tab('filters')?.textContent).toContain(`${t('source_filter')} 1`)
  })

  it('stays the online filters tab when a source is online', () => {
    showShelf({ type: 'composite', combine: 'union', sources: [{ type: 'wishlist' }, { type: 'store' }] })
    expect(tab('childFilters')?.querySelector('header')?.textContent).toBe(t('edit_tab_online_filters'))
    expect(tab('childFilters')?.textContent).toContain(t('composite_post_filter_title'))
  })
})

describe('saved filters in the combined-result area', () => {
  const grouped = and({ type: 'merge', params: { mode: 'and', items: [localCoop] } })
  const savedFilters = [
    { id: 'coop', name: 'Coop', group: and(localCoop) },
    { id: 'mine', name: 'Installed', group: and({ type: 'installed', params: {} }) },
    { id: 'deep', name: 'Deep', group: and({ type: 'merge', params: { mode: 'and', items: [{ type: 'favorites', params: {} }] } }) },
    { id: 'grouped', name: 'Grouped', group: grouped },
  ]
  const wishlistAndStore = { type: 'composite', combine: 'union', sources: [{ type: 'wishlist' }, { type: 'store' }] }

  it('offers only the saved filters whose every condition the combined result reads, nested ones included', () => {
    showShelf(wishlistAndStore, { savedFilters })
    expect(seen.bars).toHaveLength(3)
    expect(seen.bars[0].items.map((f: any) => f.id)).toEqual(['coop', 'mine', 'deep', 'grouped'])
    expect(seen.bars[2].items.map((f: any) => f.id)).toEqual(['coop', 'grouped'])
  })

  it('applies a saved filter to the combined result and saves the combined group like the other areas', async () => {
    showShelf(wishlistAndStore, { savedFilters })
    act(() => seen.bars[2].onApply('grouped'))
    await act(async () => { await seen.bars.at(-1).onSave('Combo') })
    expect(actions.saveFilter).toHaveBeenCalledWith('Combo', grouped)
  })
})

describe('the per-source areas next to the combined-result filters', () => {
  const area = () => tab('childFilters')?.textContent ?? ''
  const count = (text: string, part: string) => text.split(part).length - 1

  it('show a short text in each source area that has no condition', () => {
    showShelf({ type: 'composite', combine: 'union', sources: [{ type: 'wishlist' }, { type: 'store', childFilter: and(localCoop) }] })
    expect(count(area(), t('composite_no_conditions'))).toBe(1)
  })

  it('name the first source when it is a library section sharing the tab', () => {
    showShelf({ type: 'composite', combine: 'union', sources: [{ type: 'tab', tab: 'all' }, { type: 'wishlist' }] })
    expect(area()).toContain(t('source_tab'))
    expect(area()).toContain(t('source_wishlist'))
  })

  it('name a lone source area when the combined area follows it', () => {
    showShelf({ type: 'composite', combine: 'union', sources: [{ type: 'wishlist' }, smart] })
    expect(area()).toContain(t('source_wishlist'))
  })

  it('say how the sources are combined', () => {
    showShelf({ type: 'composite', combine: 'intersection', sources: [{ type: 'wishlist' }, { type: 'store' }] })
    expect(area()).toContain(t('composite_combine_summary', { mode: t('composite_combine_intersection') }))
  })

  it('stay as they were on a single source', () => {
    showShelf({ type: 'wishlist' })
    expect(area()).not.toContain(t('composite_no_conditions'))
    expect(area()).not.toContain(t('source_wishlist'))
  })
})

describe('the preview of a shelf whose combined result left games out for missing data', () => {
  const ctx = { mode: 'edit' as const, collections: [], platformTabs: [], externalSources: [] }
  const platform: any = { getAppMeta: async (appid: number) => ({ appid, name: `Game ${appid}` }) }
  let result: any

  function Probe({ state, nonce }: { state: any; nonce: number }) {
    result = usePreviewResolution({ state, previewSource: state, previewShelfId: 's-preview', hiddenPickerOpen: false, previewRefreshNonce: nonce, platform })
    return null
  }

  function reportMissing(missing: number[]) {
    seen.resolve = async (_source: any, _limit: number, _sort: any, _id: any, _rev: any, options: any) => {
      for (const n of missing) options?.onMissingData?.(n)
      return [1, 2]
    }
  }

  it('knows how many games its last resolve left out', async () => {
    const state = buildInitialShelfState({ ...ctx, shelf: shelfOf({ type: 'composite', combine: 'union', sources: [builtin, smart], postFilter: and(localCoop) }) })
    vi.useFakeTimers()
    try {
      reportMissing([2, 1])
      act(() => root.render(h(Probe, { state, nonce: 0 })))
      await act(async () => { await vi.advanceTimersByTimeAsync(600) })
      expect(result.previewCount).toBe(2)
      expect(result.missingData).toBe(3)
      reportMissing([])
      act(() => root.render(h(Probe, { state, nonce: 1 })))
      await act(async () => { await vi.advanceTimersByTimeAsync(600) })
      expect(result.missingData).toBe(0)
    } finally { vi.useRealTimers() }
  })

  it('shows one short note under the preview, and none when nothing was left out', () => {
    seen.preview = { missingData: 3 }
    showShelf({ type: 'composite', combine: 'union', sources: [builtin, smart] })
    expect(seen.previewProps.note).toBe(t('preview_missing_data'))
    seen.preview = { missingData: 0 }
    showShelf({ type: 'composite', combine: 'union', sources: [builtin, smart] })
    expect(seen.previewProps.note).toBeUndefined()
  })

  it('renders the note below the games', async () => {
    const { PreviewPanel } = await vi.importActual<typeof import('../../../components/qam/modals/editShelf/PreviewPanel')>('../../../components/qam/modals/editShelf/PreviewPanel')
    const props: any = { t, title: 'S', hideShelfTitle: true, activeTab: 'source', resolvedIds: [], effectiveManualOrder: [], resolvedMeta: new Map(), isManualSort: false, onReorderManual: () => {}, highlightFirst: false, highlightAll: false, highlightedAppIds: [], alternatingMode: null, hiddenAppIds: [] }
    render(h(PreviewPanel, { ...props, note: t('preview_missing_data') }))
    expect(document.body.textContent).toContain(t('preview_missing_data'))
  })
})

describe('a group inside the combined-result filters', () => {
  const savedFilters = [
    { id: 'coop', name: 'Coop', group: and(localCoop) },
    { id: 'mine', name: 'Installed', group: and({ type: 'installed', params: {} }) },
    { id: 'deep', name: 'Deep', group: and({ type: 'merge', params: { mode: 'and', items: [{ type: 'installed', params: {} }] } }) },
  ]
  const typePickers = () => seen.pickers.filter((p) => p.label === t('filter_condition_type'))

  function Host({ item }: { item: FilterItem }) {
    const [current, setCurrent] = useState(item)
    return h(ConditionRow, {
      item: current, startOpen: true, nodeRef: () => {}, onChange: setCurrent, onRemove: () => {},
      controller: controller({ savedFilters }), allowOnlineFilters: true, onlineFeaturesOn: true, onlyTypes: POST_FILTER_TYPES,
    })
  }

  it.each([
    ['a merge', { type: 'merge', params: { mode: 'and', items: [] } }],
    ['a weighted group', { type: 'weightedFilter', params: { threshold: 1, children: [] } }],
  ])('offers only the supported types to a condition added inside %s', (_name, item) => {
    render(h(Host, { item: item as FilterItem }))
    const add = document.querySelector<HTMLButtonElement>(`button[aria-label="${t('filter_condition_add')}"]`)
    act(() => add?.click())
    const inner = typePickers().at(-1)
    expect(inner?.selectedOption).toBe('multiplayerType')
    expect(new Set(inner?.rgOptions.map((o: any) => o.data))).toEqual(new Set(POST_FILTER_TYPES))
  })

  it('offers only the saved filters the combined result reads', () => {
    render(h(Host, { item: { type: 'merge', params: { mode: 'and', items: [] } } }))
    expect(seen.bars.at(-1)?.items.map((f: any) => f.id)).toEqual(['coop'])
  })
})

describe('the combined-result area in the shelf editor', () => {
  const online = { onlineFeaturesEnabled: true }
  const filtered = { type: 'composite', combine: 'union', sources: [{ type: 'wishlist' }, { type: 'store' }], postFilter: and(localCoop) }
  const removeButtons = () => Array.from(document.querySelectorAll('button')).filter((b) => b.textContent === '×')
  const combinedText = () => tab('childFilters')?.textContent ?? ''

  it('is there on a multi-source shelf whose sources have no filter area of their own', () => {
    showShelf({ type: 'composite', combine: 'union', sources: [builtin, smart] })
    expect(tab('childFilters')?.textContent).toContain(t('composite_post_filter_title'))
  })

  it('offers only the types the combined result reads', () => {
    showShelf({ type: 'composite', combine: 'union', sources: [{ type: 'wishlist' }, { type: 'store' }] }, online)
    const adds = document.querySelectorAll<HTMLButtonElement>(`section[data-tab="childFilters"] button[aria-label="${t('filter_condition_add')}"]`)
    act(() => adds[adds.length - 1].click())
    const picker = seen.pickers.filter((p) => p.label === t('filter_condition_type')).at(-1)
    expect(picker?.selectedOption).toBe('multiplayerType')
    expect(new Set(picker?.rgOptions.map((o: any) => o.data))).toEqual(new Set(POST_FILTER_TYPES))
  })

  it('asks before dropping its conditions with the last extra source, and keeps both on cancel', () => {
    showShelf(filtered, online)
    expect(combinedText()).toContain(LOCAL_TITLE())
    act(() => removeButtons()[0].click())
    expect(seen.confirms).toHaveLength(1)
    act(() => seen.confirms[0].onCancel?.())
    expect(removeButtons()).toHaveLength(1)
    expect(combinedText()).toContain(LOCAL_TITLE())
    act(() => seen.confirms[0].onConfirm(false))
    expect(removeButtons()).toHaveLength(0)
    expect(combinedText()).not.toContain(t('composite_post_filter_title'))
  })
})

describe('a shared filter saved on the shelf by an earlier version', () => {
  const area = () => tab('childFilters')?.textContent ?? ''

  it('is mentioned once, as plain text, in the filter tab of a shelf with an online source', () => {
    showShelf({ type: 'composite', combine: 'union', childFilter: and(localCoop), sources: [{ type: 'wishlist' }, { type: 'store' }] })
    expect(area().split(t('composite_legacy_shared_filter')).length - 1).toBe(1)
    expect(area()).not.toContain(LOCAL_TITLE())
  })

  it('is not mentioned when the shelf has none, or no online source it could apply to', () => {
    showShelf({ type: 'composite', combine: 'union', sources: [{ type: 'wishlist' }, { type: 'store' }] })
    expect(area()).not.toContain(t('composite_legacy_shared_filter'))
    showShelf({ type: 'composite', combine: 'union', childFilter: and(localCoop), sources: [builtin, smart] })
    expect(area()).not.toContain(t('composite_legacy_shared_filter'))
  })
})
