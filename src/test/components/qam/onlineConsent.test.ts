// @vitest-environment jsdom
import { act, createElement as h, type ComponentType, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18next from 'i18next'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const edge = vi.hoisted(() => ({
  modals: [] as Array<{ element: ReactElement; closes: number }>,
}))

vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const { createElement: el } = await import('react')
  const dataAttrs = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-')))
  function Focusable(props: any) {
    return el('div', { ref: props.ref, className: props.className, onClick: props.onClick ?? props.onActivate, ...dataAttrs(props) }, props.children)
  }
  function ToggleField(props: any) {
    return el('button', {
      type: 'button',
      className: 'test-toggle',
      'data-label': props.label,
      'aria-pressed': String(props.checked === true),
      onClick: () => props.onChange?.(!props.checked),
    }, props.label)
  }
  function ConfirmModal(props: any) {
    return el('div', { className: 'test-confirm' },
      el('h1', null, props.strTitle),
      el('div', { className: 'test-confirm-body' }, props.children),
      el('button', { type: 'button', className: 'test-ok', onClick: props.onOK }, props.strOKButtonText),
      el('button', { type: 'button', className: 'test-cancel', onClick: props.onCancel }, props.strCancelButtonText))
  }
  function showModal(element: ReactElement) {
    const entry = { element, closes: 0 }
    edge.modals.push(entry)
    return { Close: () => { entry.closes++ } }
  }
  return { ...actual, Focusable, ToggleField, ConfirmModal, showModal }
})
vi.mock('../../../store/settingsStore', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCurrentSettings: () => ({ showcaseSeen: true }),
}))
vi.mock('../../../core/cssLoaderDetect', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isCssLoaderActive: () => false,
}))
vi.mock('../../../runtime/screensaverInject', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isScreensaverSupportDetected: () => false,
}))
vi.mock('../../../runtime/cloudSync', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasCloudSyncSupport: () => false,
}))
vi.mock('../../../integrations', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isNonSteamBadgesAvailable: () => false,
  isTabMasterInstalled: () => false,
}))

import { initI18n } from '../../../i18n'
import { defaultSettings } from '../../../domain/defaults'
import { PlatformProvider } from '../../../runtime/platformContext'
import { DeckQAMSettings, OnlinePrivacyModal } from '../../../components/DeckQAMSettings'
import { GeneralTab } from '../../../components/qam/sidecar/GeneralTab'

type Panel = { name: string; component: ComponentType<{ controller: any }> }
const PANELS: Panel[] = [
  { name: 'panel', component: DeckQAMSettings as ComponentType<{ controller: any }> },
  { name: 'side panel', component: GeneralTab as ComponentType<{ controller: any }> },
]

const platform = { resolveShelfAppIds: async () => [], listCollections: async () => [], listLibraryTabs: async () => [] } as any
let root: Root
let mount: HTMLDivElement
let modalRoot: Root | null
let modalMount: HTMLDivElement

beforeAll(() => { initI18n() })

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  edge.modals.length = 0
  mount = document.createElement('div')
  modalMount = document.createElement('div')
  document.body.append(mount, modalMount)
  root = createRoot(mount)
  modalRoot = null
})

afterEach(() => {
  act(() => root.unmount())
  if (modalRoot) act(() => modalRoot!.unmount())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

function makeController(patch: Record<string, unknown> = {}) {
  const settings = { ...defaultSettings(), enabled: true, ...patch } as any
  const order: string[] = []
  const spies: Record<string, ReturnType<typeof vi.fn>> = {}
  const actions = new Proxy(spies, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined
      target[key] ??= vi.fn(async (...args: unknown[]) => { order.push(`${key}(${args.join(',')})`) })
      return target[key]
    },
  })
  return { t: i18next.t.bind(i18next), settings, shelves: settings.shelves, collections: [], tabs: [], actions, spies, order }
}

function turnOnlineSwitch(panel: Panel, controller: ReturnType<typeof makeController>) {
  act(() => root.render(h(PlatformProvider, { platform, children: h(panel.component, { controller }) })))
  const header = mount.querySelector<HTMLElement>('[data-ds-section="online"]')!
  const box = header.closest<HTMLElement>('.ds-collapsible-box')!
  if (!box.querySelector('.ds-collapsible-content')) act(() => { header.click() })
  const label = i18next.t('online_features')
  const toggle = Array.from(box.querySelectorAll<HTMLButtonElement>('.test-toggle')).find((node) => node.getAttribute('data-label') === label)!
  act(() => { toggle.click() })
}

function prompt() {
  const entry = edge.modals[0]
  modalRoot ??= createRoot(modalMount)
  act(() => modalRoot!.render(entry.element))
  return {
    entry,
    isConsent: (entry.element as ReactElement).type === OnlinePrivacyModal,
    title: modalMount.querySelector('h1')?.textContent ?? null,
    body: modalMount.querySelector('.test-confirm-body')?.textContent ?? '',
    ok: modalMount.querySelector<HTMLButtonElement>('.test-ok')!,
    cancel: modalMount.querySelector<HTMLButtonElement>('.test-cancel')!,
  }
}

for (const panel of PANELS) {
  describe(`online features consent, ${panel.name}`, () => {
    it('asks before anything is saved the first time they are turned on', () => {
      const controller = makeController()
      turnOnlineSwitch(panel, controller)
      expect(controller.order).toEqual([])
      expect(edge.modals).toHaveLength(1)

      const asked = prompt()
      expect(asked.isConsent).toBe(true)
      expect(asked.title).toBe(i18next.t('online_privacy_title'))
      expect([asked.ok.textContent, asked.cancel.textContent]).toEqual([i18next.t('online_privacy_accept'), i18next.t('close')])
      for (const key of ['online_privacy_body', 'online_privacy_item_wishlist', 'online_privacy_item_price', 'online_privacy_item_ping']) {
        expect(asked.body).toContain(i18next.t(key))
      }
    })

    it('accepting records the consent and then turns them on', async () => {
      const controller = makeController()
      turnOnlineSwitch(panel, controller)
      const asked = prompt()
      await act(async () => { asked.ok.click() })
      expect(asked.entry.closes).toBe(1)
      expect(controller.order).toEqual(['acceptOnlinePrivacy()', 'setOnlineFeaturesEnabled(true)'])
    })

    it('Close leaves them off', async () => {
      const controller = makeController()
      turnOnlineSwitch(panel, controller)
      const asked = prompt()
      await act(async () => { asked.cancel.click() })
      expect(asked.entry.closes).toBe(1)
      expect(controller.order).toEqual([])
    })

    it('with the consent already given they turn on at once, and off needs no question', () => {
      const accepted = makeController({ onlinePrivacyAccepted: true })
      turnOnlineSwitch(panel, accepted)
      expect(edge.modals).toHaveLength(0)
      expect(accepted.order).toEqual(['setOnlineFeaturesEnabled(true)'])

      const on = makeController({ onlineFeaturesEnabled: true })
      turnOnlineSwitch(panel, on)
      expect(edge.modals).toHaveLength(0)
      expect(on.order).toEqual(['setOnlineFeaturesEnabled(false)'])
    })
  })
}
