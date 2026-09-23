import { describe, it, expect, vi, afterEach } from 'vitest'

let hardwareInfoResponse: any = null
vi.mock('../../runtime/host/decky', () => ({
  call: async () => hardwareInfoResponse,
}))

vi.mock('../../core/steamOSVersion', () => ({ getSteamOSVersion: () => '3.6.20' }))
vi.mock('../../core/cssLoaderDetect', () => ({
  isCssLoaderActive: () => true,
  getActiveCssLoaderThemes: () => [],
  isArtHeroActive: () => false,
  isTiltedHomeActive: () => true,
  isHeroFullscreenActive: () => false,
  isNoHomeTextActive: () => false,
  cssLoaderStyleCount: () => 0,
}))
vi.mock('../../integrations/registry', () => ({
  isTabMasterInstalled: () => true,
  isUnifiDeckInstalled: () => false,
  isNonSteamBadgesInstalled: () => false,
}))

import { collectRuntimeInfo, collectSystemInfo, listCoLoadedPlugins, collectHardwareInfo, hwExternalDiskText } from '../../runtime/diagnosticsInfo'

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

  it('collectHardwareInfo parses externalDisks from the backend probe', async () => {
    hardwareInfoResponse = {
      supported: true, model: 'Steam Deck (OLED)', diskTotalBytes: 512, diskFreeBytes: 128,
      externalDisks: [{ label: 'SD_CARD', totalBytes: 256, freeBytes: 64 }, { label: 'BAD' }],
    }
    const hw = await collectHardwareInfo()
    expect(hw?.externalDisks).toEqual([
      { label: 'SD_CARD', totalBytes: 256, freeBytes: 64 },
      { label: 'BAD', totalBytes: null, freeBytes: null },
    ])
  })

  it('collectHardwareInfo defaults externalDisks to [] when the backend omits it', async () => {
    hardwareInfoResponse = { supported: true }
    const hw = await collectHardwareInfo()
    expect(hw?.externalDisks).toEqual([])
  })

  it('hwExternalDiskText formats label + capacity, or just the label when unknown', () => {
    expect(hwExternalDiskText({ label: 'SD_CARD', totalBytes: 64 * 1024 ** 3, freeBytes: 32 * 1024 ** 3 })).toBe('SD_CARD: 64 GB (32 GB free)')
    expect(hwExternalDiskText({ label: 'MYSTERY', totalBytes: null, freeBytes: null })).toBe('MYSTERY')
  })
})
