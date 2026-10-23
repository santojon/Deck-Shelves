// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Every install the start makes into Steam is inert here and counted.
const edge = vi.hoisted(() => {
  const calls: Record<string, number> = {}
  const uninstalls: Record<string, number> = {}
  const fail = { uninstall: '' }
  const counted = (name: string) => () => {
    calls[name] = (calls[name] ?? 0) + 1
    return () => {
      uninstalls[name] = (uninstalls[name] ?? 0) + 1
      if (fail.uninstall === name) throw new Error(`${name} teardown failed`)
    }
  }
  return { calls, uninstalls, counted, fail }
})

vi.mock('../../runtime/ownQamTab', () => ({ installOwnQamTab: edge.counted('ownQamTab'), restartSteam: () => {} }))
vi.mock('../../runtime/deckyPlatform', async (importOriginal) => ({ ...(await importOriginal<object>()), createDeckyPlatform: () => ({}) }))
vi.mock('../../runtime/homePatch', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  installHomePatch: () => { edge.calls.homePatch = (edge.calls.homePatch ?? 0) + 1; return { uninstall: () => { edge.uninstalls.homePatch = (edge.uninstalls.homePatch ?? 0) + 1 } } },
}))
vi.mock('../../runtime/recentsReplace', async (importOriginal) => ({ ...(await importOriginal<object>()), installRecentsReplace: () => null }))
vi.mock('../../core/shelfRefresh', async (importOriginal) => ({ ...(await importOriginal<object>()), installShelfRefreshEmitter: edge.counted('refresh') }))
vi.mock('../../runtime/powerGate', async (importOriginal) => ({ ...(await importOriginal<object>()), installPowerGate: edge.counted('powerGate') }))
vi.mock('../../runtime/systemEvents', async (importOriginal) => ({ ...(await importOriginal<object>()), installSystemEvents: edge.counted('systemEvents') }))
vi.mock('../../runtime/batteryState', async (importOriginal) => ({ ...(await importOriginal<object>()), installBatteryState: edge.counted('battery') }))
vi.mock('../../runtime/deviceState', async (importOriginal) => ({ ...(await importOriginal<object>()), installDeviceState: edge.counted('device') }))
vi.mock('../../runtime/sessionState', async (importOriginal) => ({ ...(await importOriginal<object>()), installSessionState: edge.counted('session') }))
vi.mock('../../runtime/profileTriggers', async (importOriginal) => ({ ...(await importOriginal<object>()), installProfileTriggers: edge.counted('profileTriggers') }))
vi.mock('../../runtime/showcaseMode', async (importOriginal) => ({ ...(await importOriginal<object>()), installShowcaseMode: edge.counted('showcase') }))
vi.mock('../../runtime/screensaverInject', async (importOriginal) => ({ ...(await importOriginal<object>()), installScreensaverInject: edge.counted('screensaver') }))
vi.mock('../../runtime/cloudSync', async (importOriginal) => ({ ...(await importOriginal<object>()), installCloudSync: edge.counted('cloudSync') }))
vi.mock('../../core/pluginApi', async (importOriginal) => ({ ...(await importOriginal<object>()), installPluginApi: edge.counted('pluginApi') }))
vi.mock('../../core/steamOSVersion', async (importOriginal) => ({ ...(await importOriginal<object>()), prefetchSteamOSVersion: async () => null }))
vi.mock('../../core/userPaths', async (importOriginal) => ({ ...(await importOriginal<object>()), prewarmUserPaths: async () => {} }))
vi.mock('../../runtime/devNavHooks', async (importOriginal) => ({ ...(await importOriginal<object>()), installDevNavHooks: () => () => {} }))
vi.mock('../../runtime/safeMode', async (importOriginal) => ({ ...(await importOriginal<object>()), evaluateBootOutcome: () => false }))
vi.mock('../../runtime/bootPhases', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  installStartupWatchdog: edge.counted('watchdog'),
  startLazyPhases: edge.counted('lazyPhases'),
  installUpdateProbes: edge.counted('updateProbes'),
  scheduleBootToasts: edge.counted('bootToasts'),
  logSystemEnvironment: () => {},
}))
vi.mock('../../components/Settings', async (importOriginal) => {
  const { createElement } = await import('react')
  return { ...(await importOriginal<object>()), SettingsView: () => createElement('div') }
})

type LoaderEntry = { titleView?: unknown; onDismount: () => void }
type Run = (serverAPI?: unknown) => LoaderEntry | undefined

const GLOBALS_SET_BY_START = [
  '__DECK_SHELVES_INSTANCES__', '__DECK_SHELVES_INSTANCE__', '__DECK_SHELVES_OWNER__', '__DECK_SHELVES_OWNER_META__',
  '__SHELVES_QAM_PENDING__', '__DECK_SHELVES_DEFER_TO_HOST__', '__DECK_SHELVES_HOST_BUNDLE_BOOTED__',
]
const scope = () => { const g = globalThis as any; return g.window ?? g }

function loaderServerApi() {
  return { routerHook: { addRoute: vi.fn(), removeRoute: vi.fn() } }
}

// One evaluation of the plugin: a loader reloading the same build calls this same export again.
async function loadPlugin(): Promise<Run> {
  vi.resetModules()
  const mod = await import('../../index')
  return mod.default as Run
}

const ALL_INSTALLS = [
  'homePatch', 'powerGate', 'watchdog', 'refresh', 'systemEvents', 'battery', 'device', 'session', 'profileTriggers',
  'pluginApi', 'lazyPhases', 'updateProbes', 'bootToasts', 'ownQamTab', 'showcase', 'screensaver', 'cloudSync',
]
const expectEveryInstall = (times: number) => {
  for (const name of ALL_INSTALLS) expect([name, edge.calls[name] ?? 0]).toEqual([name, times])
}
const expectEveryUninstall = (times: number) => {
  for (const name of ALL_INSTALLS) expect([name, edge.uninstalls[name] ?? 0]).toEqual([name, times])
}

beforeEach(() => {
  vi.stubGlobal('requestIdleCallback', vi.fn())
  vi.spyOn(console, 'log').mockImplementation(() => {})
  for (const record of [edge.calls, edge.uninstalls]) for (const key of Object.keys(record)) delete record[key]
  edge.fail.uninstall = ''
})

afterEach(() => {
  for (const entry of Object.values<any>(scope().__DECK_SHELVES_INSTANCES__ ?? {})) { try { entry?.dispose?.() } catch {} }
  for (const name of GLOBALS_SET_BY_START) { delete scope()[name]; delete (globalThis as any)[name] }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('plugin entry, the loader reloading the same build', () => {
  it('a second call while the instance is alive returns nothing and installs nothing more', async () => {
    const run = await loadPlugin()
    expect(run(loaderServerApi())?.titleView).toBeDefined()
    expect(run(loaderServerApi())).toBeUndefined()
    expectEveryInstall(1)
    expectEveryUninstall(0)
  })

  it('after the dismount, a call of the same export boots again like a fresh start', async () => {
    const run = await loadPlugin()
    const firstApi = loaderServerApi()
    const first = run(firstApi)!
    first.onDismount()
    expectEveryUninstall(1)
    expect(firstApi.routerHook.removeRoute).toHaveBeenCalled()

    const secondApi = loaderServerApi()
    const second = run(secondApi)
    expect(second?.titleView).toBeDefined()
    expect(typeof second?.onDismount).toBe('function')
    expectEveryInstall(2)
    // The new instance is live: nothing it installed was taken down by the boot.
    expectEveryUninstall(1)
    expect(secondApi.routerHook.addRoute).toHaveBeenCalledTimes(firstApi.routerHook.addRoute.mock.calls.length)
    expect(scope().__DECK_SHELVES_INSTANCES__.decky.dispose).toBe(second?.onDismount)
  })

  it('a teardown step that throws does not skip the later ones, and the next call boots', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    edge.fail.uninstall = 'refresh'
    const run = await loadPlugin()
    run(loaderServerApi())!.onDismount()
    expectEveryUninstall(1)
    expect(run(loaderServerApi())?.titleView).toBeDefined()
    expectEveryInstall(2)
  })

  it('the new instance keeps the guard: a further call returns nothing, also after the old dismount runs again', async () => {
    const run = await loadPlugin()
    const first = run(loaderServerApi())!
    first.onDismount()
    const second = run(loaderServerApi())!
    first.onDismount()
    expect(run(loaderServerApi())).toBeUndefined()
    expectEveryInstall(2)
    expectEveryUninstall(1)
    second.onDismount()
    expectEveryUninstall(2)
    expect(run(loaderServerApi())?.titleView).toBeDefined()
    expectEveryInstall(3)
  })
})
