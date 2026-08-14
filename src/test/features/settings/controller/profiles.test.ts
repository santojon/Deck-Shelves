import { describe, it, expect, vi } from 'vitest'

vi.mock('i18next', () => ({ default: { t: (k: string) => k } }))
vi.mock('../../../../components/notify', () => ({ notify: vi.fn() }))
vi.mock('../../../../steam/usageTracking', () => ({ trackFeature: vi.fn() }))
vi.mock('../../../../settingsStore', () => ({ writeJsonFile: vi.fn(), readJsonFile: vi.fn() }))
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
})

describe('applyFactoryProfile', () => {
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
})
