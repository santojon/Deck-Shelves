import { describe, expect, it } from 'vitest'
import { isToggleHiddenWithAncestors } from '../../../components/qam/hiddenToggles'

describe('an option hidden in the panel', () => {
  it('is hidden when it is listed, and shown when nothing is', () => {
    expect(isToggleHiddenWithAncestors('hideHomeTabs', ['hideHomeTabs'])).toBe(true)
    expect(isToggleHiddenWithAncestors('hideHomeTabs', [])).toBe(false)
    expect(isToggleHiddenWithAncestors('hideHomeTabs', ['hideRecents'])).toBe(false)
  })

  it('takes the options under it out too', () => {
    expect(isToggleHiddenWithAncestors('shelfHeroBackground', ['hideRecents'])).toBe(true)
    expect(isToggleHiddenWithAncestors('recentsReplaceSource', ['hideRecents'])).toBe(true)
    expect(isToggleHiddenWithAncestors('smartSurpriseMe', ['smartShelvesEnabled'])).toBe(true)
    expect(isToggleHiddenWithAncestors('hideRecents', ['shelfHeroBackground'])).toBe(false)
  })

  it('reaches an option three levels down', () => {
    expect(isToggleHiddenWithAncestors('onlineHideOwnedNonSteamCloud', ['onlineFeaturesEnabled'])).toBe(true)
    expect(isToggleHiddenWithAncestors('onlineHideOwnedNonSteamCloud', ['onlineHideOwnedGames'])).toBe(true)
    expect(isToggleHiddenWithAncestors('onlineHideOwnedGames', ['onlineHideOwnedNonSteamCloud'])).toBe(false)
  })
})
