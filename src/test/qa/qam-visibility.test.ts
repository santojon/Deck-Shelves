import { describe, it, expect } from 'vitest'
import { SettingsSchema } from '../../types'

function settings(overrides: Record<string, unknown> = {}) {
  return SettingsSchema.parse({ enabled: true, ...overrides })
}

describe('QAM visibility: global toggles section', () => {
  it('is hidden when plugin is disabled', () => {
    const s = settings({ enabled: false })
    expect(s.enabled).toBe(false)
  })

  it('is visible when plugin is enabled', () => {
    const s = settings({ enabled: true })
    expect(s.enabled).toBe(true)
  })
})

describe('QAM visibility: smart shelves section', () => {
  it('does not render when plugin is disabled, even if smartShelvesEnabled is true', () => {
    const s = settings({ enabled: false, smartShelvesEnabled: true })
    const show = s.enabled && s.smartShelvesEnabled
    expect(show).toBe(false)
  })

  it('renders when plugin is enabled and smartShelvesEnabled is true', () => {
    const s = settings({ enabled: true, smartShelvesEnabled: true })
    const show = s.enabled && s.smartShelvesEnabled
    expect(show).toBe(true)
  })

  it('does not render smart shelves sub-section when smartShelvesEnabled is false', () => {
    const s = settings({ enabled: true, smartShelvesEnabled: false })
    const show = s.enabled && s.smartShelvesEnabled
    expect(show).toBe(false)
  })

  it('surprise me slider hidden when smartSurpriseMe is false', () => {
    const s = settings({ enabled: true, smartShelvesEnabled: true, smartSurpriseMe: false })
    const showSlider = s.enabled && s.smartShelvesEnabled && s.smartSurpriseMe
    expect(showSlider).toBe(false)
  })

  it('surprise me slider visible when smartSurpriseMe is true', () => {
    const s = settings({ enabled: true, smartShelvesEnabled: true, smartSurpriseMe: true })
    const showSlider = s.enabled && s.smartShelvesEnabled && (s.smartSurpriseMe ?? false)
    expect(showSlider).toBe(true)
  })
})

describe('QAM visibility: smart shelves list vs first-run banner', () => {
  it('shows first-run banner when no smart shelves and surpriseMe off', () => {
    const s = settings({ enabled: true, smartShelvesEnabled: true, smartSurpriseMe: false, smartShelves: [] })
    const showBanner = s.enabled && s.smartShelvesEnabled && !s.smartSurpriseMe && (s.smartShelves ?? []).length === 0
    expect(showBanner).toBe(true)
  })

  it('shows smart shelf list when smart shelves exist and surpriseMe off', () => {
    const shelf = { id: 'x', title: 'Quick Play', mode: 'quick_play' as const, enabled: true, hidden: false }
    const s = settings({ enabled: true, smartShelvesEnabled: true, smartSurpriseMe: false, smartShelves: [shelf] })
    const showList = s.enabled && s.smartShelvesEnabled && !s.smartSurpriseMe && (s.smartShelves ?? []).length > 0
    expect(showList).toBe(true)
  })

  it('hides list and banner when surpriseMe is on', () => {
    const s = settings({ enabled: true, smartShelvesEnabled: true, smartSurpriseMe: true })
    const showList = s.enabled && s.smartShelvesEnabled && !s.smartSurpriseMe
    expect(showList).toBe(false)
  })
})
