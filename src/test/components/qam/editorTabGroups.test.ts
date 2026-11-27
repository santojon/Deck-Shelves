// @vitest-environment jsdom
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  const { createElement: el } = await import('react')
  const row = ({ label, children }: any) => el('div', { 'data-label': String(label) }, children)
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    ToggleField: row, DropdownItem: row, Field: row, SliderField: row,
    Dropdown: () => null, TextField: () => null,
  }
})
vi.mock('../../../components/qam/modals/editShelf/EditorTabs', async () => {
  const { createElement: el } = await import('react')
  return {
    EditorTabs: ({ tabs }: any) => el('div', null, tabs.map((tab: any) => el('section', { key: tab.id, 'data-tab': tab.id }, tab.content))),
  }
})
vi.mock('../../../components/qam/modals/editShelf/VisibilityRulesEditor', async () => {
  const { createElement: el } = await import('react')
  return { VisibilityRulesEditor: ({ idPrefix }: any) => el('div', { 'data-label': `rules:${idPrefix ?? 'show'}` }) }
})
vi.mock('../../../components/qam/modals/editShelf/useShelfPreview', () => ({
  useShelfPreview: () => ({
    previewSource: null, previewCount: 0, resolvedIds: [], resolvedMeta: new Map(),
    effectiveManualOrder: [], reorderManual: () => {}, SYNTH_SENTINEL: (i: number) => -(i + 1),
  }),
}))
vi.mock('../../../components/qam/modals/editShelf/useModalCollections', () => ({ useModalCollections: () => [] }))
const platform = vi.hoisted(() => ({}))
vi.mock('../../../runtime/platformContext', () => ({ usePlatform: () => platform }))
vi.mock('../../../components/qam/modals/editShelf/PreviewPanel', () => ({ PreviewPanel: () => null }))
vi.mock('../../../components/conditions/ConditionEditor', () => ({ ConditionEditor: () => null }))
vi.mock('../../../components/qam/modals/editShelf/SavedFiltersBar', () => ({ SavedFiltersBar: () => null }))
vi.mock('../../../components/qam/modals/editShelf/SavedSmartFiltersBar', () => ({ SavedSmartFiltersBar: () => null }))
vi.mock('../../../components/notify', () => ({ notify: () => {} }))
vi.mock('../../../steam', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveShelfAppIds: async () => [],
}))

import '../../../core/internalRegistry'
import i18n, { initI18n } from '../../../i18n'
import { EditShelfModal } from '../../../components/qam/modals/EditShelfModal'
import { EditSmartShelfModal } from '../../../components/qam/modals/EditSmartShelfModal'

let root: Root

const t = (key: string) => String(i18n.t(key))
const controller = (): any => ({ t: i18n.t.bind(i18n), tabs: [], collections: [], actions: {}, settings: {} })

function render(element: ReturnType<typeof h>) {
  act(() => root.render(element))
}

// Tabs holding a row with this label; sliders draw their label as plain text.
function tabsWith(label: string): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('section[data-tab]'))
    .filter((section) => Array.from(section.querySelectorAll<HTMLElement>('[data-label], span'))
      .some((node) => node.getAttribute('data-label') === label || (node.tagName === 'SPAN' && node.textContent === label)))
    .map((section) => section.getAttribute('data-tab') ?? '')
}

beforeAll(() => {
  initI18n()
})

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

const REGULAR_TABS: Record<string, string[]> = {
  source: ['source', 'source_tab', 'edit_dedupe_by_name', 'filter_mode', 'limit'],
  visual: [
    'match_native_size', 'highlight_first', 'highlight_all', 'highlight_random', 'hero_enabled_label',
    'game_info_above_label', 'friends_overlay_label', 'enable_logo', 'enable_icon', 'enable_description',
    'description_size_label', 'shelf_title_position_label', 'game_name_position_label', 'playtime_position_label',
    'full_page_shelf_label', 'highlight_specific_games',
  ],
  display: [
    'hide_shelf_title', 'hide_new_badge', 'hide_discount_badge', 'discount_badge_mode', 'discount_badge_focus_mode',
    'hide_game_name', 'hide_compat_icons', 'hide_status_line', 'hide_see_more_card', 'hide_install_indicator',
    'hide_refresh_card', 'edit_hidden_games',
  ],
  behavior: ['visibility_autopin_label', 'visibility_autocollapse_label', 'visibility_autocollapse_empty'],
}

describe('the regular shelf editor tabs', () => {
  const shelf = { id: 's', title: 'S', enabled: true, limit: 10, source: { type: 'tab', tab: 'all' } }

  it('come in this order, grouped by what a change does', () => {
    render(h(EditShelfModal, { controller: controller(), shelf: shelf as any }))
    const ids = Array.from(document.querySelectorAll('section[data-tab]')).map((s) => s.getAttribute('data-tab'))
    expect(ids).toEqual(['source', 'childFilters', 'visual', 'display', 'decoration', 'behavior'])
  })

  it.each(Object.entries(REGULAR_TABS).flatMap(([tab, keys]) => keys.map((key) => [key, tab])))('keep %s in exactly one tab, %s', (key, tab) => {
    render(h(EditShelfModal, { controller: controller(), shelf: shelf as any }))
    expect(tabsWith(t(key))).toEqual([tab])
  })

  it('keep both rule lists in the behavior tab', () => {
    render(h(EditShelfModal, { controller: controller(), shelf: shelf as any }))
    expect(tabsWith('rules:pin')).toEqual(['behavior'])
    expect(tabsWith('rules:col')).toEqual(['behavior'])
  })

  it('keep the decoration cards in their own tab', () => {
    render(h(EditShelfModal, { controller: controller(), shelf: shelf as any }))
    const decoration = document.querySelector('section[data-tab="decoration"]')?.textContent ?? ''
    expect(decoration).toContain(t('decoration_intro'))
  })
})

describe('the smart shelf editor tabs', () => {
  const smartShelf = { id: 'sm', title: 'Smart', enabled: true, hidden: false, mode: 'recently_played' }

  it('come in this order, grouped like the regular editor', () => {
    render(h(EditSmartShelfModal, { controller: controller(), shelf: smartShelf as any }))
    const ids = Array.from(document.querySelectorAll('section[data-tab]')).map((s) => s.getAttribute('data-tab'))
    expect(ids).toEqual(['source', 'smart_filters', 'filters', 'visual', 'display', 'behavior'])
  })

  it('keep their grouping', () => {
    render(h(EditSmartShelfModal, { controller: controller(), shelf: smartShelf as any }))
    expect(tabsWith(t('edit_dedupe_by_name'))).toEqual(['source'])
    expect(tabsWith(t('visibility_autopin_label'))).toEqual(['behavior'])
    expect(tabsWith(t('visibility_autocollapse_empty'))).toEqual(['behavior'])
    expect(tabsWith('rules:pin')).toEqual(['behavior'])
    expect(tabsWith('rules:col')).toEqual(['behavior'])
    expect(tabsWith('rules:show')).toEqual(['smart_filters'])
    expect(tabsWith(t('hide_shelf_title'))).toEqual(['display'])
    expect(tabsWith(t('match_native_size'))).toEqual(['visual'])
  })
})
