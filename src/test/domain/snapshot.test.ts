import { describe, it, expect } from 'vitest'
import { buildSnapshot, applySnapshot, readSnapshotConcept, SNAPSHOT_CONCEPTS } from '../../domain/snapshot'
import type { Settings, Shelf } from '../../types'

function makeShelf(id: string, overrides: Partial<Shelf> = {}): Shelf {
  return {
    id, title: `Shelf ${id}`, enabled: true, hidden: false, limit: 15,
    matchNativeSize: false, highlightFirst: false, highlightAll: false,
    hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false,
    hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false,
    hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false,
    hideRefreshCard: false, source: { type: 'tab', tab: 'all' }, ...overrides,
  }
}

function makeSettings(over: Partial<Settings> = {}): Settings {
  return { enabled: true, hideRecents: false, recentsReplaceSource: false, hideHomeTabs: false, shelfHeroBackground: false, globalMatchNativeSize: false, globalHighlightFirst: false, globalHighlightAll: false, globalHideStatusLine: false, globalHideNewBadge: false, globalHideDiscountBadge: false, globalHideCompatIcons: false, globalHideNonSteamBadge: false, globalHideShelfTitle: false, globalHideGameNames: false, globalHideInstallIndicator: false, globalHideSeeMore: false, globalHideRefreshCard: false, globalHeroEnabled: false, globalGameInfoAbove: false, globalFriendsPlayingOverlay: false, globalFriendsPlayingOverlayRecent: false, globalDedupeByName: false, shelves: [], smartShelvesEnabled: false, smartShelvesAtBottom: false, smartShelves: [], smartSurpriseMe: false, smartSurpriseMeCount: 0, savedFilters: [], savedSmartFilters: [], updateNotifyEnabled: true, onlineFeaturesEnabled: false, onlineWishlistEnabled: true, onlinePriceSortEnabled: true, onlinePrivacyAccepted: false, onlineMetadataEnabled: false, onlineHideOwnedGames: false, onlineHideOwnedNonSteam: false, onlineHideOwnedNonSteamCloud: false, forceCssLoaderThemes: false, qamHiddenToggles: [], qamHiddenSections: [], unifiedListEnabled: false, allShelvesOrder: [], lightModeEnabled: false, advancedModeEnabled: false, templateSuggestionsEnabled: false, offlineModeEnabled: false, featureToggles: {}, profiles: [], integrationsEnabled: {}, buttonBindings: {}, buttonBindingsDisabled: [], ...over }
}

describe('domain/snapshot', () => {
  it('round-trips every concept through build -> apply(replace) on an empty target', () => {
    const source = makeSettings({
      shelves: [makeShelf('a'), makeShelf('b')],
      savedFilters: [{ id: 'f1', name: 'F1', filterGroup: { mode: 'and', items: [] } } as any],
      savedSmartFilters: [{ id: 's1', name: 'S1' } as any],
    })
    const bundle = buildSnapshot(source)
    // survives JSON serialization (the real export/import path)
    const parsed = JSON.parse(JSON.stringify(bundle))
    const restored = applySnapshot(makeSettings(), parsed, 'replace')
    for (const concept of SNAPSHOT_CONCEPTS) {
      expect((restored as any)[concept]).toEqual((source as any)[concept])
    }
  })

  it('narrows the bundle to the requested concepts', () => {
    const source = makeSettings({ shelves: [makeShelf('a')], savedFilters: [{ id: 'f1', name: 'F1' } as any] })
    const bundle = buildSnapshot(source, ['shelves'])
    expect(bundle.state.shelves).toHaveLength(1)
    expect(bundle.state.savedFilters).toBeUndefined()
  })

  it('merge appends and de-duplicates by id, leaving absent concepts untouched', () => {
    const target = makeSettings({ shelves: [makeShelf('a'), makeShelf('b')], smartShelves: [{ id: 'keep' } as any] })
    const bundle = buildSnapshot(makeSettings({ shelves: [makeShelf('b'), makeShelf('c')] }), ['shelves'])
    const merged = applySnapshot(target, bundle, 'merge')
    expect(merged.shelves.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    // concept not present in the bundle is left as-is
    expect(merged.smartShelves).toEqual(target.smartShelves)
  })

  it('reads both the { state: {...} } and bare { shelves: [] } shapes', () => {
    expect(readSnapshotConcept({ state: { shelves: [1] } }, 'shelves')).toEqual([1])
    expect(readSnapshotConcept({ shelves: [2] }, 'shelves')).toEqual([2])
    expect(readSnapshotConcept({}, 'shelves')).toBeNull()
  })

  it('does not mutate the source settings arrays', () => {
    const shelves = [makeShelf('a')]
    const source = makeSettings({ shelves })
    const bundle = buildSnapshot(source)
    ;(bundle.state.shelves as any[]).push(makeShelf('x'))
    expect(source.shelves).toHaveLength(1)
  })
})
