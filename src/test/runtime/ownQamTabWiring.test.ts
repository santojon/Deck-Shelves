import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsSchema } from '../../types'
import { defaultSettings } from '../../domain/defaults'
import { DEVICE_LOCAL_FIELDS, mergeSettings } from '../../domain/settingsMerge'
import { hostProvidesNativeTab } from '../../runtime/host/resolve'
import { createProfileActions, takeSnapshot } from '../../features/settings/controller/profiles'

vi.mock('../../components/notify', () => ({ notify: vi.fn() }))
vi.mock('../../steam/usageTracking', () => ({ trackFeature: vi.fn() }))

const TEXT_KEYS = [
  'own_qam_tab_enabled',
  'own_qam_tab_restart_title',
  'own_qam_tab_restart_body',
  'own_qam_tab_restart_body_off',
  'own_qam_tab_restart_now',
  'own_qam_tab_restart_later',
]

afterEach(() => { vi.unstubAllGlobals() })

describe('own Quick Access tab wiring', () => {
  it('U41 — the setting is off for new configurations and for ones saved without it', () => {
    expect(defaultSettings().ownQamTabEnabled).toBe(false)
    expect(SettingsSchema.shape.ownQamTabEnabled.parse(undefined)).toBe(false)
    expect(SettingsSchema.shape.ownQamTabEnabled.parse(null)).toBe(false)
    expect(SettingsSchema.shape.ownQamTabEnabled.parse(true)).toBe(true)
  })

  it('U42 — the setting is local to the device: a synced configuration does not change it', () => {
    expect(DEVICE_LOCAL_FIELDS).toContain('ownQamTabEnabled')
    const local = { ...defaultSettings(), ownQamTabEnabled: true, preferencesUpdatedAt: 1 } as any
    const remote = { ...defaultSettings(), ownQamTabEnabled: false, preferencesUpdatedAt: 2 } as any
    expect((mergeSettings(local, remote) as any).ownQamTabEnabled).toBe(true)
  })

  it('U42 — profiles and the Default profile keep the setting on this device', async () => {
    const live = { ...defaultSettings(), ownQamTabEnabled: true } as any
    expect('ownQamTabEnabled' in takeSnapshot(live)).toBe(false)
    live.profiles = [{ id: 'p1', name: 'Saved', createdAt: '', snapshot: { ...takeSnapshot(live), ownQamTabEnabled: false } }]
    const saved: any[] = []
    const actions = createProfileActions({ liveSettings: () => live, persist: async (next) => { saved.push(next); return true } })
    expect(await actions.applyProfile('p1')).toBe(true)
    await actions.applyFactoryProfile()
    expect(saved.map((next) => next.ownQamTabEnabled)).toEqual([true, true])
  })

  it('U43 — the option and the tab apply only with no neutral host present, and follow a host that appears later', () => {
    expect(hostProvidesNativeTab()).toBe(false)
    vi.stubGlobal('__SHELVES_HOST__', {})
    expect(hostProvidesNativeTab()).toBe(true)
    vi.unstubAllGlobals()
    vi.stubGlobal('window', { __SHELVES_QAM__: { registerPanel: () => undefined } })
    expect(hostProvidesNativeTab()).toBe(true)
    vi.unstubAllGlobals()
    expect(hostProvidesNativeTab()).toBe(false)
  })

  it('U46 — every shipped language has the label, the prompt title, both bodies and both buttons', () => {
    const files = import.meta.glob<Record<string, string>>('../../../i18n/*/common.json', { eager: true, import: 'default' })
    const entries = Object.entries(files)
    expect(entries.length).toBe(19)
    for (const [file, texts] of entries) {
      for (const key of TEXT_KEYS) {
        expect(typeof texts[key], `${file} ${key}`).toBe('string')
        expect(texts[key].trim().length, `${file} ${key}`).toBeGreaterThan(0)
      }
    }
  })
})
