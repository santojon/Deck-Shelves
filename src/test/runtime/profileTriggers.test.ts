import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store, saved, resolved, cb } = vi.hoisted(() => ({
  store: { current: null as any },
  saved: { list: [] as any[] },
  resolved: { current: null as string | null },
  cb: { settings: null as null | ((s: any) => void) },
}))

vi.mock('../../store/settingsStore', () => ({
  getCurrentSettings: () => store.current,
  saveSettings: (n: any) => { saved.list.push(n); return Promise.resolve(true); },
  subscribeSettings: (fn: any) => { cb.settings = fn; return () => {}; },
}))
vi.mock('../../runtime/deviceState', () => ({ subscribeDeviceState: () => () => {} }))
vi.mock('../../runtime/sessionState', () => ({ subscribeSessionState: () => () => {} }))
vi.mock('../../steam/smartShelves', () => ({
  resolveTriggeredProfile: () => resolved.current,
  nextProfileTriggerFlip: () => null,
}))

import { installProfileTriggers } from '../../runtime/profileTriggers'

const profile = { id: 'p1', name: 'Docked', snapshot: { enabled: true, shelves: [{ id: 's1' }] } }

describe('installProfileTriggers', () => {
  beforeEach(() => { saved.list = []; cb.settings = null; resolved.current = null })

  it('applies a profile on trigger transition, not when unchanged', () => {
    store.current = { profileTriggersEnabled: true, profiles: [profile], activeProfileName: null }
    resolved.current = null
    const un = installProfileTriggers() // initial: resolved null → nothing
    expect(saved.list.length).toBe(0)
    resolved.current = 'Docked'
    cb.settings!(store.current) // transition null → Docked → apply
    expect(saved.list.length).toBe(1)
    expect(saved.list[0].activeProfileName).toBe('Docked')
    expect(saved.list[0].enabled).toBe(true) // snapshot spread in
    cb.settings!(store.current) // same resolved → no re-apply (transition guard)
    expect(saved.list.length).toBe(1)
    un()
  })

  it('does nothing when profileTriggersEnabled is off', () => {
    store.current = { profileTriggersEnabled: false, profiles: [profile], activeProfileName: null }
    resolved.current = 'Docked'
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(0)
    un()
  })

  it('does not re-apply the already-active profile', () => {
    store.current = { profileTriggersEnabled: true, profiles: [profile], activeProfileName: 'Docked' }
    resolved.current = 'Docked'
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(0)
    un()
  })

  it('does not reset showcaseSeen when a named profile is auto-triggered', () => {
    // The profile's snapshot never carries showcaseSeen (excluded at save
    // time) — a naive spread would wipe the live true back to undefined.
    store.current = { profileTriggersEnabled: true, profiles: [profile], activeProfileName: null, showcaseSeen: true }
    resolved.current = 'Docked'
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(1)
    expect(saved.list[0].showcaseSeen).toBe(true)
    un()
  })

  it('does not reset showcaseSeen when the factory profile is auto-triggered', () => {
    const ft = { rules: [{ kind: 'charging' }] }
    store.current = { profileTriggersEnabled: true, profiles: [], activeProfileName: null, showcaseSeen: true, factoryProfileTrigger: ft }
    resolved.current = 'Padrão' // FACTORY_PROFILE_NAME
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(1)
    expect(saved.list[0].showcaseSeen).toBe(true)
    un()
  })

  it('does not reset device-local fields (dev/debug tooling) when a profile is auto-triggered', () => {
    store.current = {
      profileTriggersEnabled: true, profiles: [profile], activeProfileName: null,
      devModeEnabled: true, debugOverlayEnabled: true,
    }
    resolved.current = 'Docked'
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(1)
    expect(saved.list[0].devModeEnabled).toBe(true)
    expect(saved.list[0].debugOverlayEnabled).toBe(true)
    un()
  })

  it('does not reset device-local fields when the factory profile is auto-triggered', () => {
    const ft = { rules: [{ kind: 'charging' }] }
    store.current = {
      profileTriggersEnabled: true, profiles: [], activeProfileName: null, factoryProfileTrigger: ft,
      devModeEnabled: true, verboseLoggingEnabled: true,
    }
    resolved.current = 'Padrão'
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(1)
    expect(saved.list[0].devModeEnabled).toBe(true)
    expect(saved.list[0].verboseLoggingEnabled).toBe(true)
    un()
  })

  it('keeps the live shelves/smartShelves when the triggered profile is unlinked', () => {
    // Regression: applyByName used to apply the full snapshot verbatim,
    // ignoring linkShelves entirely — unlike the manual apply path
    // (controller/profiles.ts), which already respected it.
    const unlinked = {
      id: 'p2',
      name: 'Unlinked',
      linkShelves: false,
      snapshot: { enabled: true, shelves: [{ id: 'snapshot-shelf' }], smartShelves: [{ id: 'snapshot-smart' }], allShelvesOrder: ['snapshot-shelf'] },
    }
    store.current = {
      profileTriggersEnabled: true,
      profiles: [unlinked],
      activeProfileName: null,
      shelves: [{ id: 'live-shelf' }],
      smartShelves: [{ id: 'live-smart' }],
      allShelvesOrder: ['live-shelf'],
    }
    resolved.current = 'Unlinked'
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(1)
    const applied = saved.list[0]
    expect(applied.shelves).toEqual([{ id: 'live-shelf' }])
    expect(applied.smartShelves).toEqual([{ id: 'live-smart' }])
    expect(applied.allShelvesOrder).toEqual(['live-shelf'])
    expect(applied.enabled).toBe(true) // non-shelf fields still come from the snapshot
    un()
  })

  it('applies the snapshot shelves/smartShelves when the triggered profile is linked', () => {
    const linked = {
      id: 'p3',
      name: 'Linked',
      linkShelves: true,
      snapshot: { enabled: true, shelves: [{ id: 'snapshot-shelf' }], smartShelves: [{ id: 'snapshot-smart' }] },
    }
    store.current = {
      profileTriggersEnabled: true,
      profiles: [linked],
      activeProfileName: null,
      shelves: [{ id: 'live-shelf' }],
      smartShelves: [{ id: 'live-smart' }],
    }
    resolved.current = 'Linked'
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(1)
    const applied = saved.list[0]
    expect(applied.shelves).toEqual([{ id: 'snapshot-shelf' }])
    expect(applied.smartShelves).toEqual([{ id: 'snapshot-smart' }])
    un()
  })

  it('reverts to the pre-trigger profile when the trigger is denied', () => {
    const home = { id: 'p0', name: 'Home', snapshot: { enabled: true, shelves: [] } }
    store.current = { profileTriggersEnabled: true, profiles: [home, profile], activeProfileName: 'Home' }
    resolved.current = null
    const un = installProfileTriggers() // initial: no trigger, no baseline captured
    expect(saved.list.length).toBe(0)
    resolved.current = 'Docked'
    cb.settings!(store.current) // Home → Docked: capture baseline=Home, apply Docked
    expect(saved.list[saved.list.length - 1].activeProfileName).toBe('Docked')
    store.current = { ...store.current, activeProfileName: 'Docked' } // reflect the applied state
    resolved.current = null
    cb.settings!(store.current) // trigger denied → restore Home
    expect(saved.list[saved.list.length - 1].activeProfileName).toBe('Home')
    un()
  })

  it('restores hideRecents (and enabled) to their pre-trigger value on revert — master toggle off, no named profile active', () => {
    // Reproduces the reported scenario: plugin disabled (no DS shelves on
    // home), hideRecents false; an external-display trigger applies a
    // "Docked" profile with enabled+hideRecents true; on disconnect the
    // revert must restore both to their exact pre-trigger values, not just
    // the profile name.
    const docked = { id: 'p1', name: 'Docked', snapshot: { enabled: true, hideRecents: true, shelves: [{ id: 's1' }] } }
    store.current = { profileTriggersEnabled: true, profiles: [docked], activeProfileName: null, enabled: false, hideRecents: false }
    resolved.current = null
    const un = installProfileTriggers() // initial: no trigger, no baseline captured
    expect(saved.list.length).toBe(0)

    resolved.current = 'Docked'
    cb.settings!(store.current) // external display connects → apply Docked
    const applied = saved.list[saved.list.length - 1]
    expect(applied.enabled).toBe(true)
    expect(applied.hideRecents).toBe(true)
    store.current = { ...store.current, ...applied } // reflect the applied state, like the real app's notify()

    resolved.current = null
    cb.settings!(store.current) // external display disconnects → trigger denied, revert
    const reverted = saved.list[saved.list.length - 1]
    expect(reverted.enabled).toBe(false)
    expect(reverted.hideRecents).toBe(false)
    un()
  })
})
