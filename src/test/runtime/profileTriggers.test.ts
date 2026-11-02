import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store, saved, resolved, cb, toasts, qa, snapshotKinds } = vi.hoisted(() => ({
  store: { current: null as any },
  saved: { list: [] as any[] },
  resolved: { current: null as string | null },
  cb: { settings: null as null | ((s: any) => void) },
  toasts: { list: [] as string[] },
  qa: { active: false },
  snapshotKinds: [] as string[],
}))

vi.mock('../../store/settingsStore', () => ({
  getCurrentSettings: () => store.current,
  saveSettings: (n: any) => { saved.list.push(n); return Promise.resolve(true); },
  subscribeSettings: (fn: any) => { cb.settings = fn; return () => {}; },
  snapshotOnNextSave: (kind: string) => { snapshotKinds.push(kind) },
}))
vi.mock('../../runtime/deviceState', () => ({ subscribeDeviceState: () => () => {} }))
vi.mock('../../runtime/sessionState', () => ({ subscribeSessionState: () => () => {} }))
vi.mock('../../runtime/notify', () => ({ notifyUser: (_title: string, body: string) => { toasts.list.push(body) } }))
vi.mock('../../qa/harness', () => ({ get qaOverrideActive() { return qa.active } }))
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

  it('does not re-save once the active profile genuinely already matches', () => {
    // Apply for real once, then feed the exact reflected result back as the
    // live settings — a second resolution of the same profile must no-op.
    store.current = { profileTriggersEnabled: true, profiles: [profile], activeProfileName: null }
    resolved.current = 'Docked'
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(1)
    store.current = saved.list[0]
    saved.list = []
    cb.settings!(store.current)
    expect(saved.list.length).toBe(0)
    un()
  })

  it('reconciles real values when activeProfileName already names the profile but the settings were never actually applied', () => {
    // e.g. `activeProfileName` reflects an earlier local trigger fire, but a
    // later cross-device merge pulled in other fields that no longer match
    // the profile's own snapshot — the label alone must not be trusted.
    store.current = { profileTriggersEnabled: true, profiles: [profile], activeProfileName: 'Docked', enabled: false }
    resolved.current = 'Docked'
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(1)
    expect(saved.list[0].enabled).toBe(true) // reconciled from the snapshot
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

  it('names the factory profile by its translated name in the trigger toast, not its stored id', () => {
    toasts.list = []
    store.current = { profileTriggersEnabled: true, profiles: [], activeProfileName: null, factoryProfileTrigger: { rules: [{ kind: 'charging' }] } }
    resolved.current = 'Padrão' // FACTORY_PROFILE_NAME
    const un = installProfileTriggers()
    expect(toasts.list.length).toBe(1)
    expect(toasts.list[0]).not.toContain('Padrão')
    expect(toasts.list[0]).toContain('Default')
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

  it('keeps triggers on when the applied profile was saved with them off', () => {
    const offProfile = { id: 'p2', name: 'Old', snapshot: { enabled: true, profileTriggersEnabled: false } }
    store.current = { profileTriggersEnabled: true, profiles: [offProfile], activeProfileName: null }
    resolved.current = 'Old'
    const un = installProfileTriggers()
    expect(saved.list.length).toBe(1)
    expect(saved.list[0].profileTriggersEnabled).toBe(true)
    un()
  })

  it('reverts to the pre-trigger settings when triggers are switched off mid-trigger', () => {
    store.current = { profileTriggersEnabled: true, profiles: [profile], activeProfileName: null, hideRecents: true }
    resolved.current = 'Docked'
    const un = installProfileTriggers()
    expect(saved.list[0].activeProfileName).toBe('Docked')
    store.current = { ...saved.list[0], profileTriggersEnabled: false }
    saved.list = []
    cb.settings!(store.current)
    expect(saved.list.length).toBe(1)
    expect(saved.list[0].activeProfileName).toBe(null)
    expect(saved.list[0].hideRecents).toBe(true)
    expect(saved.list[0].profileTriggersEnabled).toBe(false)
    un()
  })

  it('reverts after a restart while the trigger was active (stored pre-trigger copy)', () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } })
    store.current = { profileTriggersEnabled: true, profiles: [profile], activeProfileName: null, hideRecents: true }
    resolved.current = 'Docked'
    let un = installProfileTriggers()
    un() // "restart": the in-memory baseline is gone, the stored copy stays
    store.current = saved.list[0]
    saved.list = []
    un = installProfileTriggers() // still triggered: must not adopt the triggered state as the baseline
    resolved.current = null
    cb.settings!(store.current)
    expect(saved.list.length).toBe(1)
    expect(saved.list[0].hideRecents).toBe(true)
    expect(saved.list[0].activeProfileName).toBe(null)
    un()
    vi.unstubAllGlobals()
  })

  it('keeps the edits made during a trigger when it reverts', () => {
    const docked = { id: 'p1', name: 'Docked', snapshot: { enabled: true, hideRecents: true } }
    store.current = { profileTriggersEnabled: true, profiles: [docked], activeProfileName: null, hideRecents: false, globalHideGameNames: false }
    resolved.current = 'Docked'
    const un = installProfileTriggers()
    store.current = { ...saved.list[0], globalHideGameNames: true, shelves: [{ id: 'new', updatedAt: 5 }] } // the user edits while Docked is active
    resolved.current = null
    cb.settings!(store.current)
    const reverted = saved.list[saved.list.length - 1]
    expect(reverted.hideRecents).toBe(false)
    expect(reverted.globalHideGameNames).toBe(true)
    expect(reverted.shelves).toEqual([{ id: 'new', updatedAt: 5 }])
    expect(reverted.activeProfileName).toBe(null)
    un()
  })

  it('carries edits across a restart mid-trigger and still keeps them on revert', () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } })
    const docked = { id: 'p1', name: 'Docked', snapshot: { enabled: true, hideRecents: true } }
    store.current = { profileTriggersEnabled: true, profiles: [docked], activeProfileName: null, hideRecents: false, globalHideGameNames: false }
    resolved.current = 'Docked'
    let un = installProfileTriggers()
    store.current = { ...saved.list[0], globalHideGameNames: true }
    un() // restart with the edit in place
    saved.list = []
    un = installProfileTriggers()
    expect(saved.list.every((s) => s.globalHideGameNames === true)).toBe(true) // the re-apply never drops the edit
    resolved.current = null
    cb.settings!(store.current)
    const reverted = saved.list[saved.list.length - 1]
    expect(reverted.hideRecents).toBe(false)
    expect(reverted.globalHideGameNames).toBe(true)
    un()
    vi.unstubAllGlobals()
  })

  it('a QA build never writes or clears the stored pre-trigger copy', () => {
    const mem = new Map<string, string>()
    const real = JSON.stringify({ name: 'Docked', settings: { hideRecents: false }, applied: { hideRecents: true } })
    mem.set('ds-trigger-baseline-v1', real)
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } })
    qa.active = true
    store.current = { profileTriggersEnabled: true, profiles: [profile], activeProfileName: null, hideRecents: true, __dsQaOverride: true }
    resolved.current = 'Docked'
    const un = installProfileTriggers()
    try {
      resolved.current = null
      cb.settings!(store.current) // the trigger takes over and is denied, all inside the QA session
      expect(mem.get('ds-trigger-baseline-v1')).toBe(real)
    } finally {
      un()
      qa.active = false
      vi.unstubAllGlobals()
    }
  })

  it('a normal boot never reverts to a pre-trigger copy a QA build left behind', () => {
    const mem = new Map<string, string>()
    // Fixture-era values: reverting to them would write fixture data over the real settings.
    const fromQa = { hideRecents: false, recentsReplaceSource: true, shelves: [{ id: 'qa_st_01' }], __dsQaOverride: true }
    mem.set('ds-trigger-baseline-v1', JSON.stringify({ name: 'Docked', settings: fromQa, applied: { ...fromQa, activeProfileName: 'Docked' } }))
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } })
    const docked = { id: 'p1', name: 'Docked', snapshot: { enabled: true, hideRecents: true } }
    store.current = { profileTriggersEnabled: true, profiles: [docked], activeProfileName: 'Docked', enabled: true, hideRecents: true, recentsReplaceSource: false, shelves: [{ id: 'real' }] }
    resolved.current = 'Docked'
    const un = installProfileTriggers() // a restart while the trigger is active
    try {
      saved.list = []
      resolved.current = null
      cb.settings!(store.current)
      expect(saved.list.some((x) => x.recentsReplaceSource === true || x.__dsQaOverride === true)).toBe(false)
      expect(saved.list.some((x) => (x.shelves ?? []).some((sh: any) => sh.id === 'qa_st_01'))).toBe(false)
      expect(mem.get('ds-trigger-baseline-v1') ?? '').not.toContain('__dsQaOverride')
    } finally {
      un()
      vi.unstubAllGlobals()
    }
  })
})

describe('a profile applied by a trigger keeps a safety snapshot of what it replaces', () => {
  it('asks for one with the apply, and none with the revert', () => {
    saved.list = []; snapshotKinds.length = 0
    store.current = { profileTriggersEnabled: true, profiles: [profile], activeProfileName: null, enabled: true, shelves: [] }
    resolved.current = null
    const un = installProfileTriggers()
    resolved.current = 'Docked'
    cb.settings!(store.current)
    expect(saved.list.length).toBe(1)
    expect(snapshotKinds).toEqual(['profile'])
    store.current = saved.list[0]
    resolved.current = null
    cb.settings!(store.current)
    expect(snapshotKinds).toEqual(['profile'])
    un()
  })
})

