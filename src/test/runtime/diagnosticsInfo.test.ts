import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('../../core/steamOSVersion', () => ({ getSteamOSVersion: () => '3.6.20' }))
vi.mock('../../core/cssLoaderDetect', () => ({
  isCssLoaderActive: () => true,
  isArtHeroActive: () => false,
  isTiltedHomeActive: () => true,
  isHeroFullscreenActive: () => false,
  isNoHomeTextActive: () => false,
  listCssLoaderThemeNames: () => [],
}))
vi.mock('../../integrations/registry', () => ({
  isTabMasterInstalled: () => true,
  isUnifiDeckInstalled: () => false,
  isNonSteamBadgesInstalled: () => false,
}))

import { collectRuntimeInfo, collectSystemInfo, listCoLoadedPlugins } from '../../runtime/diagnosticsInfo'

afterEach(() => vi.unstubAllGlobals())

describe('diagnosticsInfo', () => {
  it('listCoLoadedPlugins dedupes and sorts loader plugin names', () => {
    vi.stubGlobal('window', { DeckyPluginLoader: { plugins: [{ name: 'Zeta' }, { name: 'Alpha' }, { name: 'Zeta' }] } })
    expect(listCoLoadedPlugins()).toEqual(['Alpha', 'Zeta'])
  })

  it('reads a Map-shaped plugin registry', () => {
    const plugins = new Map<string, any>([['a', { name: 'Beta' }], ['b', { name: 'Gamma' }]])
    vi.stubGlobal('window', { DeckyPluginLoader: { plugins } })
    expect(listCoLoadedPlugins()).toEqual(['Beta', 'Gamma'])
  })

  it('returns [] when no loader is present', () => {
    vi.stubGlobal('window', {})
    expect(listCoLoadedPlugins()).toEqual([])
  })

  it('collectRuntimeInfo reports the detected runtime + joined theme', () => {
    vi.stubGlobal('window', { DeckyPluginLoader: { plugins: [] } })
    const info = collectRuntimeInfo()
    expect(info.steamOS).toBe('3.6.20')
    expect(info.decky).toBe(true)
    expect(info.cssLoader).toBe(true)
    expect(info.theme).toBe('TiltedHome')
    expect(info.tabMaster).toBe(true)
    expect(info.unifiDeck).toBe(false)
    expect(typeof info.version).toBe('string')
  })

  it('collectSystemInfo reads Steam + OS from GetSystemInfo', async () => {
    vi.stubGlobal('SteamClient', { System: { GetSystemInfo: async () => ({ sOSName: 'SteamOS Holo', sOSVersionId: '3.6.20', sSteamUIVersion: '1700000000' }) } })
    const sys = await collectSystemInfo()
    expect(sys.osName).toBe('SteamOS Holo')
    expect(sys.osVersion).toBe('3.6.20')
    expect(sys.steamVersion).toBe('1700000000')
  })

  it('collectSystemInfo falls back to the user agent for the OS name', async () => {
    vi.stubGlobal('SteamClient', {})
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Valve Steam Client' })
    const sys = await collectSystemInfo()
    expect(sys.osName).toBe('Windows')
  })
})
