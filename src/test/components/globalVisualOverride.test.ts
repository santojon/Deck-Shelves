// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

const live = vi.hoisted(() => ({ settings: { lightModeEnabled: false } as Record<string, unknown> }))
vi.mock('../../store/settingsStore', async (orig) => ({ ...(await orig<any>()), getCurrentSettings: () => live.settings }))

import { computeDerivedGlobalFlags } from '../../components/home/homeInjectHelpers'
import { computeEffectiveShelfDisplayProps } from '../../components/Shelf'
import { buildInitialShelfState } from '../../components/qam/modals/editShelf/buildInitialState'

const flags = (s: Record<string, unknown>) => computeDerivedGlobalFlags({ settings: s as any, replaceInjecting: false, replaceKillSwitch: false })
const globals = (over: Record<string, unknown> = {}) => ({
  hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false, hideCompatIcons: false, hideNonSteamBadge: false,
  hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, enableLogo: false, enableIcon: false,
  enableDescription: false, descriptionBelowLogo: false, logoBelowShelf: false, logoPosition: undefined,
  descriptionPosition: undefined, logoSize: undefined, logoTopOffset: undefined, fullPageShelf: false,
  iconVerticalAlign: null, shelfTitlePosition: null, gameNamePosition: null, playtimePosition: null, descriptionHeight: null,
  ...over,
}) as any

describe('global visual settings override shelves only when set', () => {
  it('an unset global logo / description value stays unset (no hidden left / 100 / 20)', () => {
    const f = flags({ globalLogoPosition: null, globalDescriptionPosition: null, globalLogoSize: null })
    expect([f.globalLogoPosition, f.globalDescriptionPosition, f.globalLogoSize, f.globalLogoTopOffset]).toEqual([undefined, undefined, undefined, undefined])
    expect(flags({ globalLogoPosition: 'right', globalLogoTopOffset: -50 })).toMatchObject({ globalLogoPosition: 'right', globalLogoTopOffset: -50 })
  })

  it('the shelf value applies while the global is unset, and a set global still wins', () => {
    const shelf = { logoPosition: 'center', logoSize: 150, logoTopOffset: -30 }
    expect(computeEffectiveShelfDisplayProps(shelf, false, globals())).toMatchObject({ effectiveLogoPosition: 'center', effectiveLogoSize: 150, effectiveLogoTopOffset: -30 })
    expect(computeEffectiveShelfDisplayProps(shelf, false, globals({ logoPosition: 'right', logoSize: 80, logoTopOffset: 70 })))
      .toMatchObject({ effectiveLogoPosition: 'right', effectiveLogoSize: 80, effectiveLogoTopOffset: 70 })
  })

  it('a global logo / icon / description toggle that is off lets the shelf decide; on forces it', () => {
    const shelf = { enableLogo: true, enableIcon: false, enableDescription: true }
    expect(computeEffectiveShelfDisplayProps(shelf, false, globals())).toMatchObject({ effectiveEnableLogo: true, effectiveEnableIcon: false, effectiveEnableDescription: true })
    expect(computeEffectiveShelfDisplayProps({}, false, globals({ enableIcon: true }))).toMatchObject({ effectiveEnableLogo: false, effectiveEnableIcon: true })
  })

  it("the discount badge follows the shelf's own mode while the global one is per shelf, and a set global one wins", () => {
    live.settings = { lightModeEnabled: false, discountBadgeMode: null }
    expect(computeEffectiveShelfDisplayProps({ discountBadgeMode: 'price' }, false, globals()).effectiveDiscountBadgeMode).toBe('price')
    expect(computeEffectiveShelfDisplayProps({}, false, globals()).effectiveDiscountBadgeMode).toBe('percent')
    live.settings = { lightModeEnabled: false, discountBadgeMode: 'both' }
    expect(computeEffectiveShelfDisplayProps({ discountBadgeMode: 'price' }, false, globals()).effectiveDiscountBadgeMode).toBe('both')
    live.settings = { lightModeEnabled: false }
  })

  it("the shelf editor loads the shelf's own discount badge mode, the percentage when unset", () => {
    const ctx = { mode: 'edit' as const, collections: [], platformTabs: [], externalSources: [] }
    const shelf = (over: Record<string, unknown>) => ({ id: 'w', title: 'W', enabled: true, limit: 10, source: { type: 'wishlist' }, ...over }) as any
    expect(buildInitialShelfState({ ...ctx, shelf: shelf({ discountBadgeMode: 'both' }) }).discountBadgeMode).toBe('both')
    expect(buildInitialShelfState({ ...ctx, shelf: shelf({}) }).discountBadgeMode).toBe('percent')
    expect(buildInitialShelfState({ ...ctx, shelf: shelf({ discountBadgeFocusMode: 'percent_price' }) }).discountBadgeFocusMode).toBe('percent_price')
    expect(buildInitialShelfState({ ...ctx, shelf: shelf({}) }).discountBadgeFocusMode).toBeNull()
  })
})
