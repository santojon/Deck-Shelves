// @vitest-environment jsdom
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({ panel: null as any, display: null as any, row: null as any, settings: {} as Record<string, unknown> }))

vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  const { createElement: el, forwardRef } = await import('react')
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    Tabs: ({ tabs }: any) => el('div', null, tabs.map((tab: any) => el('section', { key: tab.id }, tab.content))),
    Focusable: forwardRef(({ children, style }: any, ref: any) => el('div', { ref, style }, children)),
  }
})
vi.mock('../../../components/qam/modals/editShelf/EditorTabs', async () => {
  const { createElement: el } = await import('react')
  return { EditorTabs: ({ tabs }: any) => el('div', null, tabs.map((tab: any) => el('section', { key: tab.id }, tab.content))) }
})
vi.mock('../../../store/settingsStore', async (orig) => ({ ...(await orig<any>()), getCurrentSettings: () => seen.settings }))
vi.mock('../../../components/qam/modals/editShelf/useShelfPreview', () => ({
  useShelfPreview: () => ({
    previewSource: { type: 'wishlist' }, previewCount: 0, resolvedIds: [], resolvedMeta: new Map(),
    effectiveManualOrder: [], reorderManual: () => {}, SYNTH_SENTINEL: (i: number) => -(i + 1),
  }),
}))
vi.mock('../../../components/qam/modals/editShelf/useModalCollections', () => ({ useModalCollections: () => [] }))
vi.mock('../../../runtime/platformContext', () => ({ usePlatform: () => ({}) }))
vi.mock('../../../components/qam/modals/editShelf/PreviewPanel', () => ({ PreviewPanel: (props: any) => { seen.panel = props; return null } }))
vi.mock('../../../components/qam/modals/editShelf/DisplayTabContent', () => ({ DisplayTabContent: (props: any) => { seen.display = props; return null } }))
vi.mock('../../../components/qam/modals/editShelf/VisualTabContent', () => ({ VisualTabContent: () => null }))
vi.mock('../../../components/qam/modals/editShelf/VisibilityRulesEditor', () => ({ VisibilityRulesEditor: () => null }))
vi.mock('../../../components/shelf/ShelfRow', async () => {
  const { createElement: el } = await import('react')
  return {
    ShelfRow: (props: any) => {
      seen.row = props
      return props.items.map((it: any) => el('div', { key: it.id, className: 'ds-card', 'data-appid': it.appid, tabIndex: 0 }))
    },
  }
})
vi.mock('../../../components/notify', () => ({ notify: () => {} }))

import { initI18n } from '../../../i18n'
import { EditShelfModal } from '../../../components/qam/modals/EditShelfModal'
import { ShelfPreview } from '../../../components/qam/modals/editShelf/ShelfPreview'
import { createDefaultShelf } from '../../../domain/defaults'

let root: Root

const controller = (): any => ({ t: (k: string) => k, tabs: [], collections: [], actions: {}, settings: {} })
const meta = new Map<number, any>([[10, { appid: 10, name: 'Ten' }], [11, { appid: 11, name: 'Eleven' }]])
const showPreview = (over: Record<string, unknown> = {}) => act(() => root.render(h(ShelfPreview, {
  t: (k: string) => k, ids: [10, 11], meta, shelfSource: { type: 'wishlist' },
  hideStatusLine: false, hideNewBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, hideGameNames: false,
  hideInstallIndicator: false, hideSeeMore: true, hideRefreshCard: true, highlightFirst: false, highlightAll: false, highlightedAppIds: [],
  ...over,
} as any)))
const item = (appid: number) => seen.row.items.find((it: any) => it.appid === appid)

beforeAll(() => initI18n())

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  seen.settings = {}
  localStorage.setItem('ds-price-cache-v1', JSON.stringify({ 10: { data: { discount: 50, formatted: '$5.00' } }, 11: { data: { discount: 0, formatted: '$9.00' } } }))
  const mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  act(() => root.unmount())
  localStorage.clear()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('the editor preview of a new shelf', () => {
  it('follows the unsaved discount badge settings', () => {
    act(() => root.render(h(EditShelfModal, { controller: controller(), shelf: createDefaultShelf(''), mode: 'create' })))
    expect(seen.panel).toMatchObject({ hideDiscountBadge: false, discountBadgeMode: 'percent', discountBadgeFocusMode: null })
    act(() => seen.display.setDiscountBadgeMode('price'))
    act(() => seen.display.setDiscountBadgeFocusMode('both'))
    expect(seen.panel).toMatchObject({ discountBadgeMode: 'price', discountBadgeFocusMode: 'both' })
    act(() => seen.display.setDisplay({ hideDiscountBadge: true }))
    expect(seen.panel.hideDiscountBadge).toBe(true)
  })
})

describe('the preview row', () => {
  it('gives the cards their sale price and the row the badge mode', () => {
    showPreview({ discountBadgeMode: 'price', hideDiscountBadge: true })
    expect(seen.row).toMatchObject({ discountBadgeMode: 'price', hideDiscountBadge: true })
    expect(item(10)).toMatchObject({ discountPercent: 50, priceText: '$5.00' })
    expect(item(11).discountPercent).toBeUndefined()
  })

  it('shows the selected-card mode on the selected card only, until focus leaves the row', () => {
    showPreview({ discountBadgeMode: 'price', discountBadgeFocusMode: 'both' })
    const other = item(11)
    const card = document.querySelector<HTMLElement>('.ds-card[data-appid="10"]')!
    act(() => { card.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(item(10).discountBadgeMode).toBe('both')
    expect(item(11)).toBe(other)
    act(() => { card.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null })) })
    expect(item(10).discountBadgeMode).toBeUndefined()
  })

  it('takes the global modes when they are set, as the Home does', () => {
    seen.settings = { discountBadgeMode: 'both', discountBadgeFocusMode: 'percent_price' }
    showPreview({ discountBadgeMode: 'price', discountBadgeFocusMode: 'percent' })
    expect(seen.row.discountBadgeMode).toBe('both')
    const card = document.querySelector<HTMLElement>('.ds-card[data-appid="10"]')!
    act(() => { card.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(item(10).discountBadgeMode).toBe('percent_price')
  })

  it('keeps the percentage when no mode is given', () => {
    showPreview()
    expect(seen.row.discountBadgeMode).toBe('percent')
    expect(item(10).discountBadgeMode).toBeUndefined()
  })
})
