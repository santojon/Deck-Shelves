import { describe, it, expect, vi } from 'vitest'

vi.mock('i18next', () => ({ default: { t: (k: string) => k } }))
vi.mock('../../../../components/notify', () => ({ notify: vi.fn() }))
vi.mock('../../../../steam/usageTracking', () => ({ trackFeature: vi.fn() }))
vi.mock('../../../../settingsStore', () => ({ writeJsonFile: vi.fn(), readJsonFile: vi.fn() }))
const snapshots = vi.hoisted(() => ({ kinds: [] as string[] }))
vi.mock('../../../../store/settingsStore', () => ({ snapshotOnNextSave: (kind: string) => { snapshots.kinds.push(kind) }, createPreImportSnapshot: async () => { snapshots.kinds.push('import') } }))
vi.mock('../../../../domain/defaults', () => ({
  defaultSettings: () => ({ enabled: false, shelves: [], smartShelves: [], allShelvesOrder: [], theme: 'default' }),
}))

import { createProfileActions, stickyShowcaseSeen, FACTORY_PROFILE_NAME } from '../../../../features/settings/controller/profiles'

function makeDeps(initial: any) {
  const state = { current: initial }
  const persisted: any[] = []
  const deps = {
    liveSettings: () => state.current,
    persist: async (next: any) => { persisted.push(next); state.current = next; return true },
  }
  return { deps, state, persisted }
}

describe('stickyShowcaseSeen', () => {
  it('is true once seen live, regardless of the incoming source', () => {
    expect(stickyShowcaseSeen({ showcaseSeen: true } as any, { showcaseSeen: false })).toBe(true)
  })
  it('is true when the incoming source has seen it even if live has not', () => {
    expect(stickyShowcaseSeen({ showcaseSeen: false } as any, { showcaseSeen: true })).toBe(true)
  })
  it('falls through to the live value when neither source is true', () => {
    expect(stickyShowcaseSeen({ showcaseSeen: false } as any, { showcaseSeen: false })).toBe(false)
    expect(stickyShowcaseSeen({} as any, undefined)).toBeUndefined()
  })
})

describe('createProfile', () => {
  it('snapshots settings without profiles, activeProfileName or showcaseSeen', async () => {
    const { deps, persisted } = makeDeps({
      enabled: true, shelves: [{ id: 's1' }], profiles: [], activeProfileName: null, showcaseSeen: true,
    })
    const actions = createProfileActions(deps)
    const profile = await actions.createProfile('Docked')
    expect(profile).not.toBeNull()
    expect(profile!.snapshot).not.toHaveProperty('showcaseSeen')
    expect(profile!.snapshot).not.toHaveProperty('profiles')
    expect(profile!.snapshot).not.toHaveProperty('activeProfileName')
    expect(persisted[0].activeProfileName).toBe('Docked')
  })

  it('snapshots settings without any device-local field (dev/debug tooling, own QAM tab)', async () => {
    const { deps } = makeDeps({
      enabled: true, shelves: [], profiles: [], activeProfileName: null,
      devModeEnabled: true, verboseLoggingEnabled: true, ownQamTabEnabled: false, debugOverlayEnabled: true,
    })
    const actions = createProfileActions(deps)
    const profile = await actions.createProfile('Docked')
    expect(profile!.snapshot).not.toHaveProperty('devModeEnabled')
    expect(profile!.snapshot).not.toHaveProperty('verboseLoggingEnabled')
    expect(profile!.snapshot).not.toHaveProperty('ownQamTabEnabled')
    expect(profile!.snapshot).not.toHaveProperty('debugOverlayEnabled')
  })
})

describe('applyProfile', () => {
  const profile = { id: 'p1', name: 'Docked', createdAt: 't', snapshot: { enabled: true, theme: 'dark', shelves: [{ id: 'p-shelf' }] } }

  it('keeps showcaseSeen true when live already saw the tour, even though the snapshot has none', async () => {
    const { deps, persisted } = makeDeps({
      enabled: false, shelves: [{ id: 'live-shelf' }], profiles: [profile], activeProfileName: null, showcaseSeen: true,
    })
    const actions = createProfileActions(deps)
    const ok = await actions.applyProfile('p1')
    expect(ok).toBe(true)
    expect(persisted[0].showcaseSeen).toBe(true)
    expect(persisted[0].activeProfileName).toBe('Docked')
  })

  it('leaves showcaseSeen unset when neither live nor the profile has seen it', async () => {
    const { deps, persisted } = makeDeps({
      enabled: false, shelves: [], profiles: [profile], activeProfileName: null,
    })
    const actions = createProfileActions(deps)
    await actions.applyProfile('p1')
    expect(persisted[0].showcaseSeen).toBeUndefined()
  })

  it('keeps the live shelves for an unlinked profile', async () => {
    const { deps, persisted } = makeDeps({
      enabled: false, shelves: [{ id: 'live-shelf' }], smartShelves: [], allShelvesOrder: [], profiles: [profile], activeProfileName: null,
    })
    const actions = createProfileActions(deps)
    await actions.applyProfile('p1')
    expect(persisted[0].shelves).toEqual([{ id: 'live-shelf' }])
  })

  it('swaps in the profile shelves when it is shelf-linked', async () => {
    const linked = { ...profile, linkShelves: true }
    const { deps, persisted } = makeDeps({
      enabled: false, shelves: [{ id: 'live-shelf' }], profiles: [linked], activeProfileName: null,
    })
    const actions = createProfileActions(deps)
    await actions.applyProfile('p1')
    expect(persisted[0].shelves).toEqual([{ id: 'p-shelf' }])
  })

  it('returns false for an unknown profile id and persists nothing', async () => {
    const { deps, persisted } = makeDeps({ enabled: false, profiles: [profile], activeProfileName: null })
    const actions = createProfileActions(deps)
    const ok = await actions.applyProfile('missing')
    expect(ok).toBe(false)
    expect(persisted.length).toBe(0)
  })

  it('keeps device-local fields from live, even when the profile snapshot carries different values', async () => {
    const withDebug = { id: 'p2', name: 'Debug', createdAt: 't', snapshot: { enabled: true, devModeEnabled: false, debugOverlayEnabled: false } }
    const { deps, persisted } = makeDeps({
      enabled: false, shelves: [], profiles: [withDebug], activeProfileName: null,
      devModeEnabled: true, debugOverlayEnabled: true,
    })
    const actions = createProfileActions(deps)
    await actions.applyProfile('p2')
    expect(persisted[0].devModeEnabled).toBe(true)
    expect(persisted[0].debugOverlayEnabled).toBe(true)
  })
})

describe('applyFactoryProfile', () => {
  it("keeps this device's backup of Steam's idle timeout, so the screensaver can restore it", async () => {
    const { deps, persisted } = makeDeps({
      enabled: true, shelves: [], screensaverShelvesEnabled: true,
      screensaverIdleBackupAcSec: 300, screensaverIdleBackupBatterySec: 120,
    })
    await createProfileActions(deps).applyFactoryProfile()
    expect(persisted[0].screensaverIdleBackupAcSec).toBe(300)
    expect(persisted[0].screensaverIdleBackupBatterySec).toBe(120)
  })

  it('resets to defaults, keeps the master toggle on, clears the active profile, keeps saved profiles', async () => {
    const savedProfiles = [{ id: 'p1', name: 'Docked', createdAt: 't', snapshot: {} }]
    const { deps, persisted } = makeDeps({
      enabled: false, shelves: [{ id: 'live-shelf' }], profiles: savedProfiles, activeProfileName: 'Docked', showcaseSeen: false,
    })
    const actions = createProfileActions(deps)
    await actions.applyFactoryProfile()
    expect(persisted[0].enabled).toBe(true)
    expect(persisted[0].activeProfileName).toBeNull()
    expect(persisted[0].profiles).toBe(savedProfiles)
    expect(persisted[0].theme).toBe('default') // from the mocked defaultSettings()
  })

  it('keeps showcaseSeen sticky true through a factory reset', async () => {
    const { deps, persisted } = makeDeps({ enabled: true, profiles: [], activeProfileName: null, showcaseSeen: true })
    const actions = createProfileActions(deps)
    await actions.applyFactoryProfile()
    expect(persisted[0].showcaseSeen).toBe(true)
  })

  it('keeps the live shelves unless resetShelves is requested', async () => {
    const { deps, persisted } = makeDeps({
      enabled: true, shelves: [{ id: 'live-shelf' }], smartShelves: [], allShelvesOrder: [], profiles: [], activeProfileName: null,
    })
    const actions = createProfileActions(deps)
    await actions.applyFactoryProfile(false)
    expect(persisted[0].shelves).toEqual([{ id: 'live-shelf' }])

    await actions.applyFactoryProfile(true)
    expect(persisted[1].shelves).toEqual([]) // from the mocked defaultSettings()
  })

  it('names the synthetic factory profile "Padrão"', () => {
    expect(FACTORY_PROFILE_NAME).toBe('Padrão')
  })

  it('keeps device-local fields through a factory reset instead of resetting them to defaults', async () => {
    const { deps, persisted } = makeDeps({
      enabled: true, shelves: [], profiles: [], activeProfileName: null,
      devModeEnabled: true, verboseLoggingEnabled: true, ownQamTabEnabled: false,
    })
    const actions = createProfileActions(deps)
    await actions.applyFactoryProfile()
    expect(persisted[0].devModeEnabled).toBe(true)
    expect(persisted[0].verboseLoggingEnabled).toBe(true)
    expect(persisted[0].ownQamTabEnabled).toBe(false)
  })
})

describe('a profile switch keeps a safety snapshot of what it replaces', () => {
  const live = () => ({ enabled: true, shelves: [{ id: 's1' }], theme: 'a', profiles: [{ id: 'p1', name: 'Work', snapshot: { enabled: true, shelves: [], theme: 'b' } }], activeProfileName: null })

  it('asks for it on the save of a manual apply', async () => {
    snapshots.kinds = []
    const { deps } = makeDeps(live())
    await createProfileActions(deps as any).applyProfile('p1')
    expect(snapshots.kinds).toEqual(['profile'])
  })

  it('asks for it before a Default profile reset too', async () => {
    snapshots.kinds = []
    const { deps } = makeDeps(live())
    await createProfileActions(deps as any).applyFactoryProfile(false)
    expect(snapshots.kinds).toEqual(['profile'])
  })

  it('does not ask when the switch changes nothing', async () => {
    snapshots.kinds = []
    const { deps } = makeDeps({ ...live(), theme: 'b', shelves: [{ id: 's1' }] })
    const actions = createProfileActions(deps as any)
    await actions.applyProfile('p1')
    snapshots.kinds = []
    await actions.applyProfile('p1')
    expect(snapshots.kinds).toEqual([])
  })
})

describe('setProfileLinkShelves', () => {
  it('links or unlinks the shelves of a saved profile, and nothing else', async () => {
    const { deps, state } = makeDeps({ enabled: true, shelves: [], profiles: [{ id: 'p1', name: 'Work', snapshot: {} }, { id: 'p2', name: 'Home', snapshot: {}, linkShelves: true }] })
    const actions = createProfileActions(deps as any)
    expect(await actions.setProfileLinkShelves('p1', true)).toBe(true)
    expect(state.current.profiles[0]).toEqual({ id: 'p1', name: 'Work', snapshot: {}, linkShelves: true })
    expect(await actions.setProfileLinkShelves('p2', false)).toBe(true)
    expect('linkShelves' in state.current.profiles[1]).toBe(false)
    expect(await actions.setProfileLinkShelves('p2', false)).toBe(false)
    expect(await actions.setProfileLinkShelves('nope', true)).toBe(false)
  })
})

