// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../store/settingsStore', async (orig) => ({ ...(await orig<any>()), getCurrentSettings: () => ({ lightModeEnabled: false }) }))

import { computeDerivedGlobalFlags } from '../../components/home/homeInjectHelpers'
import { computeEffectiveShelfDisplayProps } from '../../components/Shelf'

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
})
