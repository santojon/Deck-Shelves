// @vitest-environment jsdom
import { act, createElement as h, type ComponentType, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18next from 'i18next'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const edge = vi.hoisted(() => ({
  modals: [] as Array<{ element: ReactElement; closes: number }>,
  restartSteam: vi.fn(),
  stored: null as Record<string, unknown> | null,
  saves: [] as Array<Record<string, unknown>>,
  listeners: new Set<(settings: any) => void>(),
}))

// Host adapter doubles: plain elements that expose their handlers and props.
vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const { createElement: el } = await import('react')
  const dataAttrs = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-')))
  function Focusable(props: any) {
    return el('div', {
      ref: props.ref,
      className: props.className,
      title: props.title,
      onClick: props.onClick ?? props.onActivate,
      ...dataAttrs(props),
    }, props.children)
  }
  function ToggleField(props: any) {
    return el('button', {
      type: 'button',
      className: 'test-toggle',
      'data-label': props.label,
      'aria-pressed': String(props.checked === true),
      disabled: props.disabled === true,
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
  function DialogButton(props: any) {
    return el('button', { type: 'button', className: props.className, onClick: props.onClick }, props.children)
  }
  function showModal(element: ReactElement) {
    const entry = { element, closes: 0 }
    edge.modals.push(entry)
    return { Close: () => { entry.closes++ } }
  }
  return { ...actual, Focusable, ToggleField, ConfirmModal, DialogButton, showModal }
})
vi.mock('../../../runtime/ownQamTab', () => ({
  restartSteam: edge.restartSteam,
  installOwnQamTab: () => () => {},
}))
// Persistence: what the store would write to the backend, and what it hands back.
vi.mock('../../../store/settingsStore', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCurrentSettings: () => edge.stored,
  refreshSettings: async () => edge.stored,
  subscribeSettings: (listener: (settings: any) => void) => {
    edge.listeners.add(listener)
    return () => { edge.listeners.delete(listener) }
  },
  saveSettings: async (next: Record<string, unknown>) => {
    edge.saves.push(next)
    edge.stored = next
    for (const listener of edge.listeners) listener(next)
    return true
  },
}))
// Environment probes: no theme loader, no screensaver hook, no cloud sync, no badge plugin.
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
import { DeckQAMSettings } from '../../../components/DeckQAMSettings'
import { GeneralTab } from '../../../components/qam/sidecar/GeneralTab'
import { useSettingsController } from '../../../features/settings/controller'
import { claimHomeOwnership } from '../../../runtime/host/ownerGuard'

const LABEL = 'Own Quick Access tab (experimental)'
const SHOWCASE_LABEL = 'Showcase mode'
const PROMPT_TITLE = 'Restart Steam now?'
const BODY_ON = 'The Quick Access tab only appears after Steam restarts.'
const BODY_OFF = 'The Quick Access tab may stay visible until Steam restarts.'
const RESTART_NOW = 'Restart now'
const LATER = 'Later'

type Panel = { name: string; component: ComponentType<{ controller: any }> }
const PANEL: Panel = { name: 'panel', component: DeckQAMSettings as ComponentType<{ controller: any }> }
const SIDE_PANEL: Panel = { name: 'side panel', component: GeneralTab as ComponentType<{ controller: any }> }
const NEUTRAL_HOST_SIGNALS = [
  { signal: 'bridge', name: '__SHELVES_QAM__', value: { registerPanel: () => {} } },
  { signal: 'runtime', name: '__SHELVES_HOST__', value: {} },
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
  edge.restartSteam.mockReset()
  edge.stored = null
  edge.saves.length = 0
  edge.listeners.clear()
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

type Controller = ReturnType<typeof makeController>

// The controller the panels receive: real settings shape, a spy for every action.
function makeController(patch: Record<string, unknown> = {}) {
  const settings = { ...defaultSettings(), enabled: true, ...patch } as any
  const spies: Record<string, ReturnType<typeof vi.fn>> = {}
  const actions = new Proxy(spies, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined
      target[key] ??= vi.fn(async () => {})
      return target[key]
    },
  })
  return { t: i18next.t.bind(i18next), settings, shelves: settings.shelves, collections: [], tabs: [], actions, spies }
}

// Same controller, settings as saved by the last action (what the store hands back).
const withSettings = (controller: Controller, patch: Record<string, unknown>): Controller =>
  ({ ...controller, settings: { ...controller.settings, ...patch } })

function render(panel: Panel, controller: Controller) {
  act(() => root.render(h(PlatformProvider, { platform, children: h(panel.component, { controller }) })))
}

const header = (id: string) => mount.querySelector<HTMLElement>(`[data-ds-section="${id}"]`)
const box = (id: string) => header(id)?.closest<HTMLElement>('.ds-collapsible-box') ?? null
const isOpen = (id: string) => !!box(id)?.querySelector('.ds-collapsible-content')
function setSectionOpen(id: string, open: boolean) {
  if (isOpen(id) !== open) act(() => { header(id)!.click() })
  expect(isOpen(id)).toBe(open)
}
const badge = (id: string) => box(id)?.querySelector('.ds-collapsible-badge')?.textContent ?? null
// Compare the attribute exactly: here a class-plus-attribute selector matches values in any case.
const withAttr = <T extends Element>(nodes: NodeListOf<T> | undefined, name: string, value: string) =>
  Array.from(nodes ?? []).find((node) => node.getAttribute(name) === value) ?? null
const toggle = (label = LABEL) =>
  withAttr(box('experimental')?.querySelectorAll<HTMLButtonElement>('.test-toggle'), 'data-label', label)

function renderOpen(panel: Panel, controller: Controller) {
  render(panel, controller)
  setSectionOpen('experimental', true)
}

function prompt(index: number) {
  const entry = edge.modals[index]
  modalRoot ??= createRoot(modalMount)
  act(() => modalRoot!.render(entry.element))
  const text = (selector: string) => modalMount.querySelector(selector)?.textContent ?? null
  return {
    entry,
    title: text('h1'),
    body: text('.test-confirm-body'),
    ok: modalMount.querySelector<HTMLButtonElement>('.test-ok')!,
    cancel: modalMount.querySelector<HTMLButtonElement>('.test-cancel')!,
  }
}

for (const panel of [PANEL, SIDE_PANEL]) {
  describe(`own Quick Access tab option, ${panel.name}`, () => {
    it('U43 — shows in the Experimental section, with its label, when no neutral host is present', () => {
      renderOpen(panel, makeController())
      expect(toggle()?.textContent).toBe(LABEL)
      expect(toggle()?.getAttribute('aria-pressed')).toBe('false')
    })

    for (const { signal, name, value } of NEUTRAL_HOST_SIGNALS) {
      it(`U43 — hidden while the neutral host's ${signal} is present`, () => {
        vi.stubGlobal(name, value)
        renderOpen(panel, makeController())
        expect(toggle(SHOWCASE_LABEL)).not.toBeNull()
        expect(toggle()).toBeNull()
      })

      it(`U43 — hidden from the next render once the neutral host's ${signal} appears`, () => {
        const controller = makeController()
        renderOpen(panel, controller)
        expect(toggle()).not.toBeNull()

        vi.stubGlobal(name, value)
        render(panel, controller)
        expect(toggle(SHOWCASE_LABEL)).not.toBeNull()
        expect(toggle()).toBeNull()
      })
    }

    it('U43 — hidden in a copy that does not own the renderer', () => {
      const scope = window as any
      scope.__DECK_SHELVES_OWNER__ = 'shelveshub'
      try {
        expect(claimHomeOwnership('decky')).toBe(false)
        renderOpen(panel, makeController())
        expect(toggle(SHOWCASE_LABEL)).not.toBeNull()
        expect(toggle()).toBeNull()
      } finally {
        scope.__DECK_SHELVES_OWNER__ = 'decky'
        claimHomeOwnership('decky')
        delete scope.__DECK_SHELVES_OWNER__
      }
    })

    it('U43 — the Experimental count includes the option while it is on', () => {
      const controller = makeController()
      render(panel, controller)
      setSectionOpen('experimental', false)
      expect(badge('experimental')).toBeNull()

      render(panel, withSettings(controller, { ownQamTabEnabled: true }))
      expect(badge('experimental')).toBe('1')

      render(panel, withSettings(controller, { ownQamTabEnabled: true, showcaseModeEnabled: true }))
      expect(badge('experimental')).toBe('2')

      render(panel, withSettings(controller, { ownQamTabEnabled: false, showcaseModeEnabled: true }))
      expect(badge('experimental')).toBe('1')
    })

    it('U44 — on, then off: each change saves the new value and asks for the restart with the body for it', async () => {
      const controller = makeController()
      renderOpen(panel, controller)

      act(() => { toggle()!.click() })
      expect(controller.spies.setOwnQamTabEnabled.mock.calls).toEqual([[true]])
      expect(edge.modals).toHaveLength(1)
      const on = prompt(0)
      expect([on.title, on.body, on.ok.textContent, on.cancel.textContent]).toEqual([PROMPT_TITLE, BODY_ON, RESTART_NOW, LATER])

      await act(async () => { on.ok.click() })
      expect(edge.restartSteam).toHaveBeenCalledTimes(1)
      expect(on.entry.closes).toBe(1)

      render(panel, withSettings(controller, { ownQamTabEnabled: true }))
      expect(toggle()?.getAttribute('aria-pressed')).toBe('true')
      act(() => { toggle()!.click() })
      expect(controller.spies.setOwnQamTabEnabled.mock.calls).toEqual([[true], [false]])
      expect(edge.modals).toHaveLength(2)
      const off = prompt(1)
      expect([off.title, off.body, off.ok.textContent, off.cancel.textContent]).toEqual([PROMPT_TITLE, BODY_OFF, RESTART_NOW, LATER])

      act(() => { off.cancel.click() })
      expect(edge.restartSteam).toHaveBeenCalledTimes(1)
      expect(off.entry.closes).toBe(1)
      // The answer never changes what was saved.
      expect(controller.spies.setOwnQamTabEnabled.mock.calls).toEqual([[true], [false]])
    })

    it('U44 — "Later" only closes the prompt, and "Restart now" restarts once, for either new value', async () => {
      const controller = makeController()
      renderOpen(panel, controller)

      act(() => { toggle()!.click() })
      const on = prompt(0)
      expect(on.body).toBe(BODY_ON)
      act(() => { on.cancel.click() })
      expect(edge.restartSteam).not.toHaveBeenCalled()
      expect(on.entry.closes).toBe(1)

      render(panel, withSettings(controller, { ownQamTabEnabled: true }))
      act(() => { toggle()!.click() })
      const off = prompt(1)
      expect(off.body).toBe(BODY_OFF)
      await act(async () => { off.ok.click() })
      expect(edge.restartSteam).toHaveBeenCalledTimes(1)
      expect(off.entry.closes).toBe(1)
      expect(controller.spies.setOwnQamTabEnabled.mock.calls).toEqual([[true], [false]])
    })

    it('U44 — "Restart now" waits until the new value is saved: a restart before that would drop it', async () => {
      const controller = makeController()
      let finishSave: () => void = () => {}
      controller.spies.setOwnQamTabEnabled = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve }))
      renderOpen(panel, controller)

      act(() => { toggle()!.click() })
      const on = prompt(0)
      await act(async () => { on.ok.click() })
      expect(edge.restartSteam).not.toHaveBeenCalled()
      await act(async () => { finishSave() })
      expect(edge.restartSteam).toHaveBeenCalledTimes(1)
    })

    it('U44 — through the settings controller, the store receives each new value whatever the answer', async () => {
      edge.stored = { ...defaultSettings(), enabled: true, showcaseSeen: true }
      const Component = panel.component
      function WithController() { return h(Component, { controller: useSettingsController() }) }
      await act(async () => { root.render(h(PlatformProvider, { platform, children: h(WithController) })) })
      setSectionOpen('experimental', true)

      await act(async () => { toggle()!.click() })
      expect(edge.saves.map((saved) => saved.ownQamTabEnabled)).toEqual([true])
      expect(toggle()?.getAttribute('aria-pressed')).toBe('true')
      const on = prompt(0)
      expect(on.body).toBe(BODY_ON)
      act(() => { on.cancel.click() })
      expect(edge.restartSteam).not.toHaveBeenCalled()

      await act(async () => { toggle()!.click() })
      expect(edge.saves.map((saved) => saved.ownQamTabEnabled)).toEqual([true, false])
      expect(toggle()?.getAttribute('aria-pressed')).toBe('false')
      const off = prompt(1)
      expect(off.body).toBe(BODY_OFF)
      await act(async () => { off.ok.click() })
      expect(edge.restartSteam).toHaveBeenCalledTimes(1)
      expect(edge.saves).toHaveLength(2)
    })
  })
}

describe('own Quick Access tab option, hiding it like the other options', () => {
  it('U43 — the panel leaves it out when it is hidden, as it does for another hidden option', () => {
    renderOpen(PANEL, makeController({ qamHiddenToggles: ['ownQamTabEnabled'] }))
    expect(toggle()).toBeNull()
    expect(toggle(SHOWCASE_LABEL)).not.toBeNull()

    render(PANEL, makeController({ qamHiddenToggles: ['showcaseModeEnabled'] }))
    expect(toggle()).not.toBeNull()
    expect(toggle(SHOWCASE_LABEL)).toBeNull()
  })

  it('U43 — the side panel gives it the same hide control as the other options', () => {
    const eye = (key: string) =>
      withAttr(box('experimental')?.querySelectorAll<HTMLElement>('[data-ds-eye-toggle]'), 'data-ds-eye-toggle', key)
    const shown = makeController()
    renderOpen(SIDE_PANEL, shown)
    expect(eye('showcaseModeEnabled')?.getAttribute('data-ds-eye-state')).toBe('shown')
    expect(eye('ownQamTabEnabled')?.getAttribute('data-ds-eye-state')).toBe('shown')
    expect(eye('ownQamTabEnabled')?.closest('.ds-hide-row')?.contains(toggle())).toBe(true)
    act(() => { eye('ownQamTabEnabled')!.click() })
    expect(shown.spies.setQamHiddenToggle.mock.calls).toEqual([['ownQamTabEnabled', true]])

    const hidden = makeController({ qamHiddenToggles: ['ownQamTabEnabled'] })
    render(SIDE_PANEL, hidden)
    expect(toggle()).not.toBeNull()
    expect(eye('ownQamTabEnabled')?.getAttribute('data-ds-eye-state')).toBe('hidden')
    act(() => { eye('ownQamTabEnabled')!.click() })
    expect(hidden.spies.setQamHiddenToggle.mock.calls).toEqual([['ownQamTabEnabled', false]])
  })
})
