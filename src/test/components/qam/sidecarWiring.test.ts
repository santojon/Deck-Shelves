// @vitest-environment jsdom
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18next from 'i18next'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type InputEvent = { button: number; pressed: boolean }

const edge = vi.hoisted(() => ({
  stored: null as Record<string, unknown> | null,
  visible: true,
  inputSubscribers: new Set<(e: { button: number; pressed: boolean }) => void>(),
  modals: [] as unknown[],
}))

vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const { createElement: el } = await import('react')
  function Focusable(props: any) {
    return el('div', { ref: props.ref, className: props.className, onClick: props.onClick ?? props.onActivate }, props.children)
  }
  function ToggleField(props: any) {
    return el('button', { type: 'button', className: 'test-toggle', 'data-label': props.label }, props.label)
  }
  function showModal(element: ReactElement) {
    edge.modals.push(element)
    return { Close: () => {} }
  }
  return { ...actual, Focusable, ToggleField, showModal }
})
vi.mock('../../../runtime/controllerInput', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  subscribeControllerInput: (cb: (e: InputEvent) => void) => {
    edge.inputSubscribers.add(cb)
    return () => { edge.inputSubscribers.delete(cb) }
  },
}))
vi.mock('../../../store/settingsStore', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCurrentSettings: () => edge.stored,
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
import { DeckQAMSettings } from '../../../components/DeckQAMSettings'

// Raw ids of the client's controller messages.
const RAW = { L4: 44, R4: 45, DPAD_LEFT: 22, DPAD_RIGHT: 23 }
const REMAPPED = { buttonBindings: { navSidecarOpen: 'L4', navSidecarClose: 'R4' } }

const platform = { resolveShelfAppIds: async () => [], listCollections: async () => [], listLibraryTabs: async () => [] } as any
const realWindow = document.defaultView as unknown as Record<string, unknown>
let root: Root
let mount: HTMLDivElement
let menuStore: { m_eOpenSideMenu: number }
let opener: { postMessage: ReturnType<typeof vi.fn>; SteamUIStore: unknown; SteamClient: unknown }
let registerInput: ReturnType<typeof vi.fn>
let unregisterInput: ReturnType<typeof vi.fn>
let docHidden = false

class ReportingObserver {
  constructor(private readonly report: (entries: unknown[]) => void) {}
  observe() { this.report([{ isIntersecting: edge.visible, intersectionRatio: edge.visible ? 1 : 0 }]) }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => { initI18n() })

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('IntersectionObserver', ReportingObserver)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  edge.stored = { ...defaultSettings(), enabled: true, showcaseSeen: true }
  edge.visible = true
  edge.inputSubscribers.clear()
  edge.modals.length = 0
  menuStore = { m_eOpenSideMenu: 0 }
  unregisterInput = vi.fn()
  registerInput = vi.fn(() => ({ unregister: unregisterInput }))
  opener = {
    postMessage: vi.fn(),
    SteamUIStore: { WindowStore: { GamepadUIMainWindowInstance: { m_MenuStore: menuStore } } },
    SteamClient: { Input: { RegisterForControllerInputMessages: registerInput } },
  }
  Object.defineProperty(realWindow, 'opener', { configurable: true, writable: true, value: opener })
  docHidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => docHidden })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (docHidden ? 'hidden' : 'visible') })
  mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  // A hidden copy never resets the shared open state, so leave it closed for the next case.
  if (expanded() === '1') act(() => { row().click() })
  act(() => root.unmount())
  delete (document as unknown as Record<string, unknown>).hidden
  delete (document as unknown as Record<string, unknown>).visibilityState
  Object.defineProperty(realWindow, 'opener', { configurable: true, writable: true, value: null })
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

function makeController(patch: Record<string, unknown> = {}) {
  const settings = { ...defaultSettings(), enabled: true, ...patch } as any
  const actions = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined
      target[key] ??= vi.fn(async () => {})
      return target[key]
    },
  })
  return { t: i18next.t.bind(i18next), settings, shelves: settings.shelves, collections: [], tabs: [], actions }
}

function renderPanel(into: Root = root) {
  act(() => into.render(h(PlatformProvider, { platform, children: h(DeckQAMSettings as any, { controller: makeController() }) })))
}

const panel = () => mount.querySelector<HTMLElement>('.deck-shelves-qam-panel')
const expanded = () => panel()?.getAttribute('data-ds-qam-expanded') ?? null
const row = () => mount.querySelector<HTMLElement>('.deck-shelves-qam-sidecar-row')!
const sidecar = () => mount.querySelector<HTMLElement>('.deck-shelves-qam-sidecar')
const messages = () => opener.postMessage.mock.calls.map((call) => (call[0] as { message: string }).message)
const lastMessage = () => messages().at(-1) ?? null

function openWithRow() {
  act(() => { row().click() })
  expect(expanded()).toBe('1')
}

function press(button: number, pressed = true) {
  act(() => { for (const cb of [...edge.inputSubscribers]) cb({ button, pressed }) })
}

function keydown(target: EventTarget, init: KeyboardEventInit) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })) })
}

const SHORTCUT: KeyboardEventInit = { code: 'KeyS', ctrlKey: true, shiftKey: true }

function fire(target: EventTarget, type: string) {
  act(() => { target.dispatchEvent(new Event(type)) })
}

describe('sidecar open and close from the panel', () => {
  it('starts closed and tells the client to stay narrow', () => {
    renderPanel()
    expect(expanded()).toBe('0')
    expect(sidecar()).toBeNull()
    expect(messages()).not.toContain('QamFriendsExpanded')
    expect(lastMessage()).toBe('QamFriendsHidden')
  })

  it('the row under the master switch opens it and closes it again', () => {
    renderPanel()
    openWithRow()
    expect(sidecar()).not.toBeNull()
    expect(lastMessage()).toBe('QamFriendsExpanded')

    act(() => { row().click() })
    expect(expanded()).toBe('0')
    expect(sidecar()).toBeNull()
    expect(lastMessage()).toBe('QamFriendsHidden')
  })

  it("the sidecar's own back control closes it", () => {
    renderPanel()
    openWithRow()
    act(() => { mount.querySelector<HTMLElement>('.ds-sidecar-back')!.click() })
    expect(expanded()).toBe('0')
    expect(sidecar()).toBeNull()
    expect(lastMessage()).toBe('QamFriendsHidden')
  })

  it('is closed again when the panel goes away while open and comes back', () => {
    renderPanel()
    openWithRow()
    act(() => root.unmount())
    expect(lastMessage()).toBe('QamFriendsHidden')

    root = createRoot(mount)
    renderPanel()
    expect(expanded()).toBe('0')
    expect(sidecar()).toBeNull()
  })
})

describe('sidecar shortcuts', () => {
  it('the default keyboard shortcut opens it', () => {
    renderPanel()
    keydown(document.body, SHORTCUT)
    expect(expanded()).toBe('1')
    expect(lastMessage()).toBe('QamFriendsExpanded')
  })

  it('a key typed in a text field, a held key and another key leave it alone', () => {
    renderPanel()
    const field = document.createElement('input')
    document.body.append(field)
    keydown(field, SHORTCUT)
    expect(expanded()).toBe('0')

    keydown(document.body, { ...SHORTCUT, repeat: true })
    expect(expanded()).toBe('0')

    keydown(document.body, { code: 'KeyS' })
    keydown(document.body, { ...SHORTCUT, code: 'KeyD' })
    expect(expanded()).toBe('0')
  })

  it('a remapped keyboard pair opens and closes it', () => {
    edge.stored = { ...edge.stored, keyboardBindings: { navSidecarOpen: 'F7', navSidecarClose: 'F8' } }
    renderPanel()
    keydown(document.body, { code: 'F7' })
    expect(expanded()).toBe('1')
    keydown(document.body, { code: 'F8' })
    expect(expanded()).toBe('0')
    keydown(document.body, SHORTCUT)
    expect(expanded()).toBe('0')
  })

  it('a remapped controller pair opens and closes it, read when the button is pressed', () => {
    renderPanel()
    press(RAW.L4)
    expect(expanded()).toBe('0')

    edge.stored = { ...edge.stored, ...REMAPPED }
    press(RAW.L4, false)
    expect(expanded()).toBe('0')
    press(RAW.L4)
    expect(expanded()).toBe('1')
    expect(lastMessage()).toBe('QamFriendsExpanded')
    press(RAW.R4)
    expect(expanded()).toBe('0')
    expect(lastMessage()).toBe('QamFriendsHidden')
  })

  it('the default controller gesture is not handled a second time here', () => {
    renderPanel()
    press(RAW.DPAD_RIGHT)
    press(RAW.DPAD_RIGHT)
    expect(expanded()).toBe('0')

    openWithRow()
    press(RAW.DPAD_LEFT)
    expect(expanded()).toBe('1')
  })

  it('a turned-off controller binding does nothing', () => {
    edge.stored = { ...edge.stored, ...REMAPPED, buttonBindingsDisabled: ['navSidecarOpen'] }
    renderPanel()
    press(RAW.L4)
    expect(expanded()).toBe('0')
  })

  it('listens to the controller only while the panel is mounted', () => {
    renderPanel()
    expect(edge.inputSubscribers.size).toBe(1)
    expect(registerInput).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
    expect(edge.inputSubscribers.size).toBe(0)
    expect(unregisterInput).toHaveBeenCalledTimes(1)
    root = createRoot(mount)
  })
})

describe('sidecar closes when the Quick Access panel goes away', () => {
  it("closes when the panel's document hides, and not while it stays visible", () => {
    renderPanel()
    openWithRow()
    fire(document, 'visibilitychange')
    expect(expanded()).toBe('1')

    docHidden = true
    fire(document, 'visibilitychange')
    expect(expanded()).toBe('0')
  })

  for (const { name, target, type } of [
    { name: 'the page is hidden', target: () => window, type: 'pagehide' },
    { name: 'the page is frozen', target: () => document, type: 'freeze' },
  ]) {
    it(`closes when ${name}`, () => {
      renderPanel()
      openWithRow()
      fire(target(), type)
      expect(expanded()).toBe('0')
      expect(sidecar()).toBeNull()
    })
  }

  for (const { name, target, type } of [
    { name: 'focus', target: () => window, type: 'focus' },
    { name: 'resume', target: () => document, type: 'resume' },
  ]) {
    it(`closes on ${name} while the document is still hidden, and not when it is visible`, () => {
      renderPanel()
      openWithRow()
      fire(target(), type)
      expect(expanded()).toBe('1')

      docHidden = true
      fire(target(), type)
      expect(expanded()).toBe('0')
      expect(lastMessage()).toBe('QamFriendsHidden')
    })
  }

  it("closes when Steam's open side menu changes while it is open", () => {
    renderPanel()
    openWithRow()
    act(() => { vi.advanceTimersByTime(900) })
    expect(expanded()).toBe('1')

    menuStore.m_eOpenSideMenu = 2
    act(() => { vi.advanceTimersByTime(299) })
    expect(expanded()).toBe('1')
    act(() => { vi.advanceTimersByTime(1) })
    expect(expanded()).toBe('0')
  })

  it('closes after a long pause with the document not visible, and not after a short one', () => {
    renderPanel()
    openWithRow()
    docHidden = true
    act(() => { vi.advanceTimersByTime(600) })
    expect(expanded()).toBe('1')

    vi.setSystemTime(Date.now() + 5000)
    act(() => { vi.advanceTimersByTime(300) })
    expect(expanded()).toBe('0')
  })

  it('a long pause with the document visible leaves it open', () => {
    renderPanel()
    openWithRow()
    vi.setSystemTime(Date.now() + 5000)
    act(() => { vi.advanceTimersByTime(300) })
    expect(expanded()).toBe('1')
  })
})

describe('a hidden copy of the panel', () => {
  it('does not drive the sidecar', () => {
    edge.visible = false
    renderPanel()
    expect(edge.inputSubscribers.size).toBe(0)
    expect(registerInput).not.toHaveBeenCalled()
    expect(opener.postMessage).not.toHaveBeenCalled()

    keydown(document.body, SHORTCUT)
    expect(expanded()).toBe('0')

    openWithRow()
    expect(sidecar()).toBeNull()

    docHidden = true
    fire(document, 'visibilitychange')
    fire(window, 'pagehide')
    fire(document, 'freeze')
    menuStore.m_eOpenSideMenu = 2
    act(() => { vi.advanceTimersByTime(900) })
    expect(expanded()).toBe('1')
  })
})

describe('first-run tour next to the sidecar wiring', () => {
  it('opens once for a profile that has not seen it, and not for one that has', () => {
    renderPanel()
    expect(edge.modals).toHaveLength(0)
    act(() => root.unmount())

    edge.stored = { ...edge.stored, showcaseSeen: false }
    root = createRoot(mount)
    renderPanel()
    renderPanel()
    expect(edge.modals).toHaveLength(1)
  })
})
