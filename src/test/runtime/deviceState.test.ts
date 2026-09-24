import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mutable state the mocked modules read (hoisted so vi.mock factories can use it).
const { battery, settings, rpc, libraryRpc } = vi.hoisted(() => ({
  battery: { current: null as any },
  settings: { current: {} as any },
  rpc: { current: null as any },
  libraryRpc: { current: null as any },
}))

vi.mock('../../runtime/batteryState', () => ({
  getBatteryState: () => battery.current,
  isLowBattery: (threshold = 0.3) => {
    const s = battery.current
    return !!s && s.hasBattery && s.state === 'discharging' && s.level > 0 && s.level <= threshold
  },
  subscribeBattery: () => () => {},
}))
vi.mock('../../store/settingsStore', () => ({ getCurrentSettings: () => settings.current }))
vi.mock('../../runtime/host/decky', () => ({
  call: async (method: string) => (method === 'get_library_locations' ? libraryRpc.current : rpc.current),
}))

import { evalDeviceRule, getDeviceState, isDeviceRuleKind, installDeviceState, refreshControllerState, refreshLibraryLocations, getLibraryCategoryOf, getLibraries } from '../../runtime/deviceState'

describe('evalDeviceRule', () => {
  beforeEach(() => { battery.current = null; settings.current = {} })

  it('battery: matches when discharging at/below threshold %, not when charging', () => {
    battery.current = { hasBattery: true, state: 'discharging', level: 0.15 }
    expect(evalDeviceRule({ kind: 'battery', below: 20 })).toBe(true)
    expect(evalDeviceRule({ kind: 'battery', below: 10 })).toBe(false)
    battery.current = { hasBattery: true, state: 'charging', level: 0.15 }
    expect(evalDeviceRule({ kind: 'battery', below: 20 })).toBe(false)
  })

  it('battery: default threshold 20% when unset', () => {
    battery.current = { hasBattery: true, state: 'discharging', level: 0.18 }
    expect(evalDeviceRule({ kind: 'battery' })).toBe(true)
    battery.current = { hasBattery: true, state: 'discharging', level: 0.25 }
    expect(evalDeviceRule({ kind: 'battery' })).toBe(false)
  })

  it('charging: matches charging/full only', () => {
    battery.current = { hasBattery: true, state: 'charging', level: 0.5 }
    expect(evalDeviceRule({ kind: 'charging' })).toBe(true)
    battery.current = { hasBattery: true, state: 'full', level: 1 }
    expect(evalDeviceRule({ kind: 'charging' })).toBe(true)
    battery.current = { hasBattery: true, state: 'discharging', level: 0.5 }
    expect(evalDeviceRule({ kind: 'charging' })).toBe(false)
  })

  it('offline: reads offlineModeEnabled', () => {
    settings.current = { offlineModeEnabled: true }
    expect(evalDeviceRule({ kind: 'offline' })).toBe(true)
    settings.current = { offlineModeEnabled: false }
    expect(evalDeviceRule({ kind: 'offline' })).toBe(false)
  })

  it('unknown kind fails open (true)', () => {
    expect(evalDeviceRule({ kind: 'nope' })).toBe(true)
  })

  it('display kinds fail open when state is unknown (no refresh yet)', () => {
    // _external / _screen start null until a DisplayManager refresh populates them.
    expect(evalDeviceRule({ kind: 'externalDisplay' })).toBe(true)
    expect(evalDeviceRule({ kind: 'resolution', minWidth: 3840 })).toBe(true)
    expect(evalDeviceRule({ kind: 'ultrawide' })).toBe(true)
  })

  it('display kinds reflect refreshed external + screen dims', async () => {
    rpc.current = { external: true, supported: true }
    ;(globalThis as any).SteamUIStore = {
      WindowStore: { GamepadUIMainWindowInstance: { BrowserWindow: { screen: { width: 3440, height: 1440 } } } },
    }
    const cleanup = installDeviceState()
    await new Promise((r) => setTimeout(r, 0)) // let refreshDisplay's RPC resolve
    expect(evalDeviceRule({ kind: 'externalDisplay' })).toBe(true)
    expect(evalDeviceRule({ kind: 'resolution', minWidth: 2560 })).toBe(true)
    expect(evalDeviceRule({ kind: 'resolution', minWidth: 3840 })).toBe(false)
    expect(evalDeviceRule({ kind: 'ultrawide' })).toBe(true) // 3440/1440 ≈ 2.39 ≥ 2.0
    const st = getDeviceState()
    expect(st.external).toBe(true)
    expect(st.screen).toEqual({ w: 3440, h: 1440 })
    cleanup()
    delete (globalThis as any).SteamUIStore
  })

  it('externalDisplay is false when backend reports no external connector', async () => {
    rpc.current = { external: false, supported: true }
    const cleanup = installDeviceState()
    await new Promise((r) => setTimeout(r, 0))
    expect(evalDeviceRule({ kind: 'externalDisplay' })).toBe(false)
    cleanup()
  })

  it('externalDisplay fails open when backend is unsupported (non-SteamOS)', async () => {
    rpc.current = { external: false, supported: false }
    const cleanup = installDeviceState()
    await new Promise((r) => setTimeout(r, 0))
    expect(evalDeviceRule({ kind: 'externalDisplay' })).toBe(true) // null → fail open
    cleanup()
  })

  it('isDeviceRuleKind recognises device kinds only', () => {
    expect(isDeviceRuleKind('battery')).toBe(true)
    expect(isDeviceRuleKind('offline')).toBe(true)
    expect(isDeviceRuleKind('externalDisplay')).toBe(true)
    expect(isDeviceRuleKind('resolution')).toBe(true)
    expect(isDeviceRuleKind('ultrawide')).toBe(true)
    expect(isDeviceRuleKind('controllerConnected')).toBe(true)
    expect(isDeviceRuleKind('timeWindow')).toBe(false)
  })

  it('controllerConnected: true when a controller beyond the built-in is present (device-agnostic)', () => {
    const g = globalThis as any
    const prev = g.ControllerStore
    try {
      // Built-in only → no external
      g.ControllerStore = { GetControllers: () => [{}], GetUnboundControllers: () => [] }
      installDeviceState()()
      expect(evalDeviceRule({ kind: 'controllerConnected' })).toBe(false)
      // A second bound controller → external present
      g.ControllerStore = { GetControllers: () => [{}, {}], GetUnboundControllers: () => [] }
      installDeviceState()()
      expect(getDeviceState().controllerConnected).toBe(true)
      // An unbound (freshly connected) controller → external present
      g.ControllerStore = { GetControllers: () => [{}], GetUnboundControllers: () => [{}] }
      installDeviceState()()
      expect(evalDeviceRule({ kind: 'controllerConnected' })).toBe(true)
    } finally { g.ControllerStore = prev }
  })

  it('refreshControllerState: a controller connected while asleep produces no event — a resume handler forces this live read directly', () => {
    const g = globalThis as any
    const prev = g.ControllerStore
    try {
      g.ControllerStore = { GetControllers: () => [{}], GetUnboundControllers: () => [] }
      const cleanup = installDeviceState()
      expect(getDeviceState().controllerConnected).toBe(false)
      // Simulate a controller having connected with no event firing (as if
      // during sleep) — only a forced re-read should notice it.
      g.ControllerStore = { GetControllers: () => [{}, {}], GetUnboundControllers: () => [] }
      expect(getDeviceState().controllerConnected).toBe(false) // still stale
      refreshControllerState()
      expect(getDeviceState().controllerConnected).toBe(true)
      cleanup()
    } finally { g.ControllerStore = prev }
  })

  it('getDeviceState snapshot reflects battery + offline', () => {
    battery.current = { hasBattery: true, state: 'charging', level: 0.42 }
    settings.current = { offlineModeEnabled: true }
    const st = getDeviceState()
    expect(st.batteryLevel).toBe(0.42)
    expect(st.charging).toBe(true)
    expect(st.offline).toBe(true)
  })
})

describe('libraryAvailable / library locations', () => {
  beforeEach(() => { libraryRpc.current = null })

  it('libraryAvailable: matches when a library of the given category is mounted', async () => {
    libraryRpc.current = {
      supported: true,
      libraries: [
        { id: 'a', label: 'Steam', path: '/x', category: 'internal', mounted: true },
        { id: 'b', label: 'SD_CARD', path: '/y', category: 'external', mounted: true },
      ],
      appLibrary: { '228980': 'a', '99999': 'b' },
    }
    await refreshLibraryLocations()
    expect(evalDeviceRule({ kind: 'libraryAvailable', category: 'external' })).toBe(true)
    expect(evalDeviceRule({ kind: 'libraryAvailable', category: 'network' })).toBe(false)
  })

  it('libraryAvailable: false when the matching library exists but is unmounted', async () => {
    libraryRpc.current = {
      supported: true,
      libraries: [{ id: 'b', label: 'SD_CARD', path: '/y', category: 'external', mounted: false }],
      appLibrary: {},
    }
    await refreshLibraryLocations()
    expect(evalDeviceRule({ kind: 'libraryAvailable', category: 'external' })).toBe(false)
  })

  it('libraryAvailable: can target a specific library id instead of a category', async () => {
    libraryRpc.current = {
      supported: true,
      libraries: [
        { id: 'b', label: 'SD_CARD', path: '/y', category: 'external', mounted: true },
        { id: 'c', label: 'USB', path: '/z', category: 'external', mounted: false },
      ],
      appLibrary: {},
    }
    await refreshLibraryLocations()
    expect(evalDeviceRule({ kind: 'libraryAvailable', libraryId: 'b' })).toBe(true)
    expect(evalDeviceRule({ kind: 'libraryAvailable', libraryId: 'c' })).toBe(false)
  })

  it('libraryAvailable fails open when the backend is unsupported', async () => {
    libraryRpc.current = { supported: false }
    await refreshLibraryLocations()
    expect(evalDeviceRule({ kind: 'libraryAvailable', category: 'external' })).toBe(true)
  })

  it('isDeviceRuleKind recognises libraryAvailable', () => {
    expect(isDeviceRuleKind('libraryAvailable')).toBe(true)
  })

  it('getLibraryCategoryOf / getLibraries reflect the refreshed cache', async () => {
    libraryRpc.current = {
      supported: true,
      libraries: [{ id: 'a', label: 'Steam', path: '/x', category: 'internal', mounted: true }],
      appLibrary: { '228980': 'a' },
    }
    await refreshLibraryLocations()
    expect(getLibraryCategoryOf(228980)).toBe('internal')
    expect(getLibraryCategoryOf(999)).toBeNull()
    expect(getLibraries()).toHaveLength(1)
  })

  it('malformed backend entries are dropped, not thrown', async () => {
    libraryRpc.current = {
      supported: true,
      libraries: [{ label: 'no id' }, { id: 'a', category: 'bogus', mounted: true }],
      appLibrary: { notanumber: 'a', '5': 42 },
    }
    await refreshLibraryLocations()
    const libs = getLibraries()
    expect(libs).toHaveLength(1)
    expect(libs[0].category).toBe('external') // unknown category normalizes to external
    expect(getLibraryCategoryOf(5)).toBeNull() // non-string value dropped
  })
})
