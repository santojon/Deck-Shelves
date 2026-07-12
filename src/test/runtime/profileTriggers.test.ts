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
})
