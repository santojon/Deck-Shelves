import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = vi.hoisted(() => ({ collections: [] as any[] }))
vi.mock('../../steam/internals', async (orig) => ({
  ...(await orig<any>()),
  steamCollectionStore: () => ({ m_mapCollectionsFromStorage: store.collections }),
}))

import { isInstalledOf } from '../../steam/appOverview'

const SHORTCUT = 1073741824
const col = (name: string, apps: any[]) => ({ displayName: name, allApps: apps })
const shortcut = (appid: number, extra: Record<string, unknown> = {}) => ({ appid, app_type: SHORTCUT, ...extra })
const localClient = (installed?: boolean) => ({ per_client_data: [{ clientid: '0', ...(installed === undefined ? {} : { installed }) }] })

describe('installed state of non-Steam shortcuts', () => {
  beforeEach(() => { store.collections = [] })

  it("follows Steam's local client flag both ways (what Unifideck writes for its games)", () => {
    expect(isInstalledOf(shortcut(10, { ...localClient(true), size_on_disk: '0' }))).toBe(true)
    expect(isInstalledOf(shortcut(11, { ...localClient(false), rt_last_time_locally_played: 1700000000 }))).toBe(false)
  })

  it('needs no collection, in any language, and ignores collections that disagree', () => {
    store.collections = [col('[Unifideck] Instalados', [{ appid: 11 }])]
    expect(isInstalledOf(shortcut(11, localClient(false)))).toBe(false)
    expect(isInstalledOf(shortcut(12, localClient(true)))).toBe(true)
  })

  it('without an explicit flag, other shortcuts keep their own signals (manual, Heroic, emulators)', () => {
    expect(isInstalledOf(shortcut(20, { ...localClient(), rt_last_time_locally_played: 1700000000 }))).toBe(true)
    expect(isInstalledOf(shortcut(21, { size_on_disk: '0', rt_last_time_locally_played: 0 }))).toBe(false)
    expect(isInstalledOf(shortcut(22, { installed: true }))).toBe(true) // normalized entry, raw fields gone
    expect(isInstalledOf(shortcut(23, { installed: false }))).toBe(false)
  })

  it('reads only the local client, never a remote one', () => {
    expect(isInstalledOf(shortcut(30, { per_client_data: [{ clientid: '987', installed: true }], size_on_disk: '0' }))).toBe(false)
  })

  it('Steam games are unchanged', () => {
    expect(isInstalledOf({ appid: 620, installed: true })).toBe(true)
    expect(isInstalledOf({ appid: 620, installed: false })).toBe(false)
  })
})

import { deduplicateNonSteam, __resetPlatformMapForTest } from '../../steam/resolveShared'

describe('non-Steam duplicate removal keys on all Unifideck collections, by no name', () => {
  beforeEach(() => { __resetPlatformMapForTest() })
  const hades = (...ids: number[]) => ids.map((id) => shortcut(id, { display_name: 'Hades' })) as any[]

  it('two copies in the same collections collapse', () => {
    store.collections = [col('[Unifideck] Epic Games', [40, 41]), col('[Unifideck] All Games', [40, 41])]
    expect(deduplicateNonSteam([40, 41], hades(40, 41))).toEqual([40])
  })

  it('the same game from two stores stays as two cards, whatever the shared collections are called', () => {
    store.collections = [
      col('[Unifideck] Epic Games', [{ appid: 40 }]), col('[Unifideck] GOG', ['42']),
      col('[Unifideck] Todos os jogos', [40, 42]), col('[Unifideck] Installed', [40, 42]),
    ]
    expect(deduplicateNonSteam([40, 42], hades(40, 42))).toEqual([40, 42])
  })
})
