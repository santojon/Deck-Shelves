// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import i18next from 'i18next'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../../domain/defaults'

type Install = { options: Record<string, any>; uninstall: ReturnType<typeof vi.fn>; ownerAtInstall: unknown }

const edge = vi.hoisted(() => {
  const installs: Install[] = []
  return {
    installs,
    settings: null as Record<string, unknown> | null,
    storeListeners: new Set<(settings: unknown) => void>(),
    subscribeSettings: (listener: (settings: unknown) => void) => {
      edge.storeListeners.add(listener)
      return () => { edge.storeListeners.delete(listener) }
    },
    fileRead: false,
    fileReadListeners: new Set<() => void>(),
    onSettingsFileRead: (listener: () => void) => {
      edge.fileReadListeners.add(listener)
      return () => { edge.fileReadListeners.delete(listener) }
    },
    requestSettingsFileRead: vi.fn(),
    installOwnQamTab: vi.fn((options: Record<string, any>) => {
      const uninstall = vi.fn()
      const scope = globalThis as any
      installs.push({ options, uninstall, ownerAtInstall: (scope.window ?? scope).__DECK_SHELVES_OWNER__ })
      return uninstall
    }),
    off: () => () => {},
  }
})

// The component itself, and the settings store it reads.
vi.mock('../../runtime/ownQamTab', () => ({ installOwnQamTab: edge.installOwnQamTab, restartSteam: () => {} }))
vi.mock('../../store/settingsStore', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCurrentSettings: () => edge.settings,
  subscribeSettings: edge.subscribeSettings,
  isSettingsFileRead: () => edge.fileRead,
  onSettingsFileRead: edge.onSettingsFileRead,
  requestSettingsFileRead: edge.requestSettingsFileRead,
}))
// Everything else the start installs into Steam: inert here.
vi.mock('../../runtime/deckyPlatform', async (importOriginal) => ({ ...(await importOriginal<object>()), createDeckyPlatform: () => ({}) }))
vi.mock('../../runtime/homePatch', async (importOriginal) => ({ ...(await importOriginal<object>()), installHomePatch: () => null }))
vi.mock('../../runtime/recentsReplace', async (importOriginal) => ({ ...(await importOriginal<object>()), installRecentsReplace: () => null }))
vi.mock('../../core/shelfRefresh', async (importOriginal) => ({ ...(await importOriginal<object>()), installShelfRefreshEmitter: edge.off }))
vi.mock('../../runtime/powerGate', async (importOriginal) => ({ ...(await importOriginal<object>()), installPowerGate: edge.off }))
vi.mock('../../runtime/systemEvents', async (importOriginal) => ({ ...(await importOriginal<object>()), installSystemEvents: edge.off }))
vi.mock('../../runtime/batteryState', async (importOriginal) => ({ ...(await importOriginal<object>()), installBatteryState: edge.off }))
vi.mock('../../runtime/deviceState', async (importOriginal) => ({ ...(await importOriginal<object>()), installDeviceState: edge.off }))
vi.mock('../../runtime/sessionState', async (importOriginal) => ({ ...(await importOriginal<object>()), installSessionState: edge.off }))
vi.mock('../../runtime/profileTriggers', async (importOriginal) => ({ ...(await importOriginal<object>()), installProfileTriggers: edge.off }))
vi.mock('../../runtime/showcaseMode', async (importOriginal) => ({ ...(await importOriginal<object>()), installShowcaseMode: edge.off }))
vi.mock('../../runtime/screensaverInject', async (importOriginal) => ({ ...(await importOriginal<object>()), installScreensaverInject: edge.off }))
vi.mock('../../runtime/cloudSync', async (importOriginal) => ({ ...(await importOriginal<object>()), installCloudSync: edge.off }))
vi.mock('../../core/pluginApi', async (importOriginal) => ({ ...(await importOriginal<object>()), installPluginApi: edge.off }))
vi.mock('../../core/steamOSVersion', async (importOriginal) => ({ ...(await importOriginal<object>()), prefetchSteamOSVersion: async () => null }))
vi.mock('../../core/userPaths', async (importOriginal) => ({ ...(await importOriginal<object>()), prewarmUserPaths: async () => {} }))
vi.mock('../../runtime/devNavHooks', async (importOriginal) => ({ ...(await importOriginal<object>()), installDevNavHooks: edge.off }))
vi.mock('../../runtime/safeMode', async (importOriginal) => ({ ...(await importOriginal<object>()), evaluateBootOutcome: () => false }))
vi.mock('../../runtime/bootPhases', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  installStartupWatchdog: edge.off,
  startLazyPhases: edge.off,
  installUpdateProbes: edge.off,
  scheduleBootToasts: edge.off,
  logSystemEnvironment: () => {},
}))
// The settings editor is a marker here: the entry and the tab are what is checked.
vi.mock('../../components/Settings', async (importOriginal) => {
  const { createElement } = await import('react')
  return { ...(await importOriginal<object>()), SettingsView: () => createElement('div', { className: 'test-settings-view' }) }
})

type LoaderEntry = { name: string; title: ReactNode; titleView: ReactNode; content: ReactNode; icon: ReactNode; onDismount: () => void }

const GLOBALS_SET_BY_START = [
  '__DECK_SHELVES_INSTANCES__', '__DECK_SHELVES_INSTANCE__', '__DECK_SHELVES_OWNER__', '__DECK_SHELVES_OWNER_META__',
  '__SHELVES_QAM_PENDING__', '__DECK_SHELVES_DEFER_TO_HOST__', '__DECK_SHELVES_HOST_BUNDLE_BOOTED__',
]
const scope = () => { const g = globalThis as any; return g.window ?? g }
const markup = (node: ReactNode) => renderToStaticMarkup(node as any)

function loaderServerApi() {
  return { routerHook: { addRoute: vi.fn(), removeRoute: vi.fn() } }
}

function neutralHostRuntime() {
  return {
    notifications: { toast: () => {} },
    lifecycle: { register: () => ({ dispose: () => {} }), onMount: () => {}, onUnmount: () => {} },
    routerHook: { addRoute: () => {}, removeRoute: () => {} },
    handshake: () => null,
  }
}

async function loadPlugin(): Promise<(serverAPI?: unknown) => unknown> {
  vi.resetModules()
  const mod = await import('../../index')
  return mod.default
}

async function startUnderLoader(serverAPI: unknown = loaderServerApi()): Promise<LoaderEntry> {
  const run = await loadPlugin()
  return run(serverAPI) as LoaderEntry
}

function disposeEveryInstance() {
  const instances = scope().__DECK_SHELVES_INSTANCES__ ?? {}
  for (const entry of Object.values<any>(instances)) { try { entry?.dispose?.() } catch {} }
}

// The first load transforms the whole plugin, which takes seconds on a busy machine: done once,
// outside each test's time limit (the tests then load it again, fresh).
beforeAll(async () => { await import('../../index') }, 60_000)

beforeEach(() => {
  vi.stubGlobal('requestIdleCallback', vi.fn())
  vi.spyOn(console, 'log').mockImplementation(() => {})
  edge.installs.length = 0
  edge.installOwnQamTab.mockClear()
  edge.settings = null
  edge.fileRead = false
  edge.fileReadListeners.clear()
  edge.requestSettingsFileRead.mockReset()
  edge.storeListeners.clear()
})

afterEach(() => {
  disposeEveryInstance()
  for (const name of GLOBALS_SET_BY_START) { delete scope()[name]; delete (globalThis as any)[name] }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('own Quick Access tab, installed by the plugin entry', () => {
  it('U45 — a start under the loader alone installs it once, after the renderer is claimed, with the plugin\'s title and icon, the reader and the subscription, and no role option', async () => {
    const entry = await startUnderLoader()
    expect(edge.installOwnQamTab).toHaveBeenCalledTimes(1)
    const { options, ownerAtInstall } = edge.installs[0]
    expect(Object.keys(options).sort()).toEqual(['icon', 'isEnabled', 'renderPanel', 'subscribe', 'title'])
    expect(options.title).toBe(i18next.t('menu_deck_shelves'))
    expect(options.title).toBe('Deck Shelves')
    // Same glyph as the loader's entry, without the fixed size: the strip sizes its icons.
    expect(markup(entry.icon)).toContain(' style="width:18px;height:18px"')
    expect(markup(options.icon)).toBe(markup(entry.icon).replace(' style="width:18px;height:18px"', ''))
    expect(ownerAtInstall).toBe('decky')
  })

  it('U45 — the subscription waits for the settings file, then reports every change', async () => {
    await startUnderLoader()
    const listener = vi.fn()
    const unsubscribe = edge.installs[0].options.subscribe(listener)
    const report = (settings: unknown) => edge.storeListeners.forEach((l) => l(settings))
    report(defaultSettings())
    expect(listener).not.toHaveBeenCalled()
    // The local copy shown at start can be older than the file: the tab decides once, so it waits.
    report({ ...defaultSettings(), schemaVersion: 2, ownQamTabEnabled: false })
    expect(listener).not.toHaveBeenCalled()
    edge.fileRead = true
    report({ ...defaultSettings(), schemaVersion: 2, ownQamTabEnabled: true })
    expect(listener).toHaveBeenCalledTimes(1)
    report({ ...defaultSettings(), ownQamTabEnabled: false })
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    report({ ...defaultSettings(), schemaVersion: 2 })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('U45 — the file being read is enough, even when it matches what was shown (no change notice)', async () => {
    await startUnderLoader()
    const listener = vi.fn()
    edge.installs[0].options.subscribe(listener)
    edge.settings = { ...defaultSettings(), schemaVersion: 2, ownQamTabEnabled: true }
    edge.storeListeners.forEach((l) => l(edge.settings))
    expect(listener).not.toHaveBeenCalled()
    edge.fileRead = true
    edge.fileReadListeners.forEach((l) => l())
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('U45 — the subscription asks for the settings file itself, once it listens, so the tab decides with nothing else reading it (Safe Mode, away from the Home)', async () => {
    await startUnderLoader()
    const listening: number[] = []
    edge.requestSettingsFileRead.mockImplementation(() => { listening.push(edge.fileReadListeners.size) })
    edge.installs[0].options.subscribe(vi.fn())
    expect(edge.requestSettingsFileRead).toHaveBeenCalledTimes(1)
    expect(listening).toEqual([1])
  })

  it('U45 — when the store already trusts its copy (a failed save left the newer one local), the first loaded document counts', async () => {
    edge.fileRead = true
    await startUnderLoader()
    const listener = vi.fn()
    edge.installs[0].options.subscribe(listener)
    edge.storeListeners.forEach((l) => l({ ...defaultSettings(), schemaVersion: 2 }))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(edge.requestSettingsFileRead).not.toHaveBeenCalled()
  })

  it('U45 — with no answer from the file in 10 s, the local copy decides (never the stand-in defaults), and unsubscribing stops the wait', async () => {
    vi.useFakeTimers()
    try {
      await startUnderLoader()
      const listener = vi.fn()
      edge.installs[0].options.subscribe(listener)
      edge.settings = defaultSettings() as Record<string, unknown>
      await vi.advanceTimersByTimeAsync(10_000)
      expect(listener).not.toHaveBeenCalled()
      edge.storeListeners.forEach((l) => l({ ...defaultSettings(), schemaVersion: 2, ownQamTabEnabled: true }))
      expect(listener).toHaveBeenCalledTimes(1)

      const other = vi.fn()
      edge.settings = { ...defaultSettings(), schemaVersion: 2 }
      edge.installs[0].options.subscribe(other)()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(other).not.toHaveBeenCalled()

      const third = vi.fn()
      edge.installs[0].options.subscribe(third)
      await vi.advanceTimersByTimeAsync(9_999)
      expect(third).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(third).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('U45 — the reader follows the setting in the settings store', async () => {
    await startUnderLoader()
    const { isEnabled } = edge.installs[0].options
    expect(isEnabled()).toBe(false)
    edge.settings = { ...defaultSettings(), ownQamTabEnabled: false }
    expect(isEnabled()).toBe(false)
    edge.settings = { ...defaultSettings(), ownQamTabEnabled: true }
    expect(isEnabled()).toBe(true)
  })

  it('U45 — the panel factory is the one the neutral host\'s tab gets: the title row, then the settings editor', async () => {
    const entry = await startUnderLoader()
    const { renderPanel } = edge.installs[0].options
    expect(scope().__SHELVES_QAM_PENDING__.map((panel: any) => panel.content)).toEqual([renderPanel])
    const titleRow = markup(entry.titleView)
    const editor = markup(entry.content)
    expect(titleRow).toContain('Deck Shelves')
    expect(editor).toBe('<div class="test-settings-view"></div>')
    const panel = markup(renderPanel())
    expect(panel.indexOf(titleRow)).toBeGreaterThan(-1)
    expect(panel.endsWith(editor)).toBe(true)
    expect(panel.indexOf(titleRow)).toBeLessThan(panel.length - editor.length)
  })

  it('U45 — once per start: a second call of the entry installs nothing more', async () => {
    const run = await loadPlugin()
    run(loaderServerApi())
    expect(run(loaderServerApi())).toBeUndefined()
    expect(edge.installOwnQamTab).toHaveBeenCalledTimes(1)
  })

  it('U45 — stop: the loader\'s dismount uninstalls it, once', async () => {
    const entry = await startUnderLoader()
    const { uninstall } = edge.installs[0]
    expect(uninstall).not.toHaveBeenCalled()
    entry.onDismount()
    expect(uninstall).toHaveBeenCalledTimes(1)
    entry.onDismount()
    expect(uninstall).toHaveBeenCalledTimes(1)
  })

  it('U45 — reload: the old copy uninstalls at its dismount, and the new copy installs once', async () => {
    const first = await startUnderLoader()
    first.onDismount()
    const second = await startUnderLoader()
    expect(edge.installOwnQamTab).toHaveBeenCalledTimes(2)
    expect(edge.installs[0].uninstall).toHaveBeenCalledTimes(1)
    expect(edge.installs[1].uninstall).not.toHaveBeenCalled()
    second.onDismount()
    expect(edge.installs[1].uninstall).toHaveBeenCalledTimes(1)
  })

  it('U45 — hot swap: the new copy uninstalls the old copy\'s tab, whose dismount never ran, before installing its own', async () => {
    await startUnderLoader()
    await startUnderLoader()
    expect(edge.installOwnQamTab).toHaveBeenCalledTimes(2)
    const [old, current] = edge.installs
    expect(old.uninstall).toHaveBeenCalledTimes(1)
    expect(old.uninstall.mock.invocationCallOrder[0]).toBeLessThan(edge.installOwnQamTab.mock.invocationCallOrder[1])
    expect(current.uninstall).not.toHaveBeenCalled()
  })

  it('U47 — the loader\'s entry is the same with the setting on, off, or not loaded yet', async () => {
    const describeEntry = (entry: LoaderEntry) => ({
      keys: Object.keys(entry).sort(),
      name: entry.name,
      title: markup(entry.title),
      titleView: markup(entry.titleView),
      content: markup(entry.content),
      icon: markup(entry.icon),
      onDismount: typeof entry.onDismount,
    })
    const built = []
    for (const settings of [{ ownQamTabEnabled: true }, { ownQamTabEnabled: false }, null]) {
      edge.settings = settings && { ...defaultSettings(), ...settings }
      const entry = await startUnderLoader()
      built.push(describeEntry(entry))
      entry.onDismount()
    }
    expect(built[0]).toEqual({
      keys: ['content', 'icon', 'name', 'onDismount', 'title', 'titleView'],
      name: 'Deck Shelves',
      title: '',
      titleView: expect.stringContaining('Deck Shelves'),
      content: '<div class="test-settings-view"></div>',
      icon: expect.stringContaining('<svg'),
      onDismount: 'function',
    })
    expect(built[1]).toEqual(built[0])
    expect(built[2]).toEqual(built[0])
  })
})

describe('own Quick Access tab, where the start installs it', () => {
  // The full entry, not the stand-in a copy shows while it waits: the start ran to the end.
  const expectBooted = (entry: LoaderEntry) => expect(entry.titleView).toBeDefined()
  const withNeutralHost = () => {
    const bridge = { registerPanel: vi.fn() }
    vi.stubGlobal('__SHELVES_HOST__', neutralHostRuntime())
    vi.stubGlobal('__SHELVES_QAM__', bridge)
    return bridge
  }

  it('U43 — the loader alone: installed', async () => {
    expectBooted(await startUnderLoader())
    expect(edge.installOwnQamTab).toHaveBeenCalledTimes(1)
  })

  it('U43 — the neutral host alone: not installed', async () => {
    const bridge = withNeutralHost()
    await loadPlugin()
    expect(scope().__DECK_SHELVES_INSTANCES__?.shelveshub).toBeDefined()
    expect(bridge.registerPanel).toHaveBeenCalledTimes(1)
    expect(edge.installOwnQamTab).not.toHaveBeenCalled()
  })

  it('U43 — both hosts: not installed', async () => {
    vi.stubGlobal('DFL', {})
    const bridge = withNeutralHost()
    expectBooted(await startUnderLoader())
    expect(scope().__DECK_SHELVES_OWNER__).toBe('decky')
    expect(bridge.registerPanel).toHaveBeenCalledTimes(1)
    expect(edge.installOwnQamTab).not.toHaveBeenCalled()
  })

  it('U43 — cooperative ownership: not installed', async () => {
    vi.stubGlobal('DFL', {})
    vi.stubGlobal('__SHELVES_FORCE_OWNER__', 'shelveshub')
    const bridge = withNeutralHost()
    expectBooted(await startUnderLoader())
    expect(scope().__DECK_SHELVES_OWNER__).toBe('shelveshub')
    expect(bridge.registerPanel).toHaveBeenCalledTimes(1)
    expect(edge.installOwnQamTab).not.toHaveBeenCalled()
  })

  it('U43 — a copy that does not own the renderer: not installed', async () => {
    vi.stubGlobal('__DECK_SHELVES_OWNER__', 'shelveshub')
    expectBooted(await startUnderLoader())
    expect(scope().__DECK_SHELVES_OWNER__).toBe('shelveshub')
    expect(edge.installOwnQamTab).not.toHaveBeenCalled()
  })
})
