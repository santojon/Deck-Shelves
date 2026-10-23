// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../store/settingsStore', async (orig) => ({ ...(await orig<any>()), getCurrentSettings: () => null }))

import { computeEnabledSmartShelves } from '../../../components/home/homeInjectHelpers'
import { computeEffectiveShelfDisplayProps } from '../../../components/Shelf'

const smart = (over: Record<string, unknown> = {}) =>
  ({ id: 'smart-1', title: 'Roulette', mode: 'random_pick', enabled: true, hidden: false, limit: 10, ...over }) as any

// Every global visual switch off / unset.
const globalsOff = {
  hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false, hideCompatIcons: false, hideNonSteamBadge: false,
  hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, enableLogo: false, enableIcon: false,
  enableDescription: false, descriptionBelowLogo: false, logoBelowShelf: false, logoPosition: undefined,
  descriptionPosition: undefined, logoSize: undefined, logoTopOffset: undefined, fullPageShelf: false,
  iconVerticalAlign: null, shelfTitlePosition: null, gameNamePosition: null, playtimePosition: null, descriptionHeight: null,
} as any

describe('smart shelf conversion for Home', () => {
  it('carries hiddenAppIds (next to manualOrder) so the resolver drops the games hidden from the shelf', () => {
    const [shelf] = computeEnabledSmartShelves([smart({ hiddenAppIds: [220, 440], manualOrder: [440] })]) as any[]
    expect(shelf.id).toBe('smart-1')
    expect(shelf.hiddenAppIds).toEqual([220, 440])
    expect(shelf.manualOrder).toEqual([440])
  })

  it('leaves hiddenAppIds unset when the smart shelf has none', () => {
    const [shelf] = computeEnabledSmartShelves([smart()]) as any[]
    expect(shelf.hiddenAppIds).toBeUndefined()
  })

  it('carries the logo, description, layout and hide options the smart-shelf editor saves', () => {
    const own = {
      enableLogo: true, enableIcon: true, enableDescription: true, descriptionBelowLogo: true, descriptionScale: 150,
      logoPosition: 'center', descriptionPosition: 'right', logoSize: 120, logoTopOffset: -10, logoBelowShelf: true,
      fullPageShelf: true, iconVerticalAlign: 'bottom', shelfTitlePosition: 'center', gameNamePosition: 'right',
      playtimePosition: 'center', descriptionHeight: 3, descriptionLogoGap: 12, highlightRandom: true,
      hideGameNames: true, hideInstallIndicator: true, hideSeeMore: true, hideRefreshCard: true,
      gameInfoAbove: true, dedupeByExactName: true,
    }
    const [shelf] = computeEnabledSmartShelves([smart(own)]) as any[]
    expect(shelf).toMatchObject(own)
  })

  it('with the global switches off, each smart shelf decides its own logo, description and game names on the Home', () => {
    const [mine, plain] = computeEnabledSmartShelves([
      smart({ enableLogo: true, enableDescription: true, hideGameNames: true }),
      smart({ id: 'smart-2' }),
    ]) as any[]
    expect(computeEffectiveShelfDisplayProps(mine, false, globalsOff))
      .toMatchObject({ effectiveEnableLogo: true, effectiveEnableDescription: true, effectiveHideGameNames: true })
    expect(computeEffectiveShelfDisplayProps(plain, false, globalsOff))
      .toMatchObject({ effectiveEnableLogo: false, effectiveEnableDescription: false, effectiveHideGameNames: false })
  })

  it('carries the pin and collapse rules from the Display tab', () => {
    const rules = { mode: 'all', rules: [{ kind: 'charging', value: true }] }
    const [shelf] = computeEnabledSmartShelves([smart({ autoPin: rules, autoCollapse: rules, autoCollapseWhenEmpty: true })]) as any[]
    expect(shelf).toMatchObject({ autoPin: rules, autoCollapse: rules, autoCollapseWhenEmpty: true })
  })
})
