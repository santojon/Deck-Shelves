import { describe, it, expect } from 'vitest'
import { makeApi } from '../../core/pluginApi'
import { buildSnapshot, applySnapshot } from '../../domain/snapshot'
import type { Settings, Shelf } from '../../types'

function makeShelf(id: string): Shelf {
  return {
    id, title: `Shelf ${id}`, enabled: true, hidden: false, limit: 15,
    matchNativeSize: false, highlightFirst: false, highlightAll: false,
    hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false,
    hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false,
    hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false,
    hideRefreshCard: false, source: { type: 'tab', tab: 'all' },
  }
}

function makeSettings(over: Partial<Settings> = {}): Settings {
  return { enabled: true, hideRecents: false, recentsReplaceSource: false, hideHomeTabs: false, shelfHeroBackground: false, globalMatchNativeSize: false, globalHighlightFirst: false, globalHighlightAll: false, globalHideStatusLine: false, globalHideNewBadge: false, globalHideDiscountBadge: false, globalHideCompatIcons: false, globalHideNonSteamBadge: false, globalHideShelfTitle: false, globalHideGameNames: false, globalHideInstallIndicator: false, globalHideSeeMore: false, globalHideRefreshCard: false, globalHeroEnabled: false, globalGameInfoAbove: false, globalFriendsPlayingOverlay: false, globalFriendsPlayingOverlayRecent: false, globalDedupeByName: false, shelves: [], smartShelvesEnabled: false, smartShelvesAtBottom: false, smartShelves: [], smartSurpriseMe: false, smartSurpriseMeCount: 0, savedFilters: [], savedSmartFilters: [], updateNotifyEnabled: true, onlineFeaturesEnabled: false, onlineWishlistEnabled: true, onlinePriceSortEnabled: true, onlinePrivacyAccepted: false, onlineHideOwnedGames: false, onlineHideOwnedNonSteam: false, onlineHideOwnedNonSteamCloud: false, forceCssLoaderThemes: false, qamHiddenToggles: [], qamHiddenSections: [], unifiedListEnabled: false, allShelvesOrder: [], lightModeEnabled: false, advancedModeEnabled: false, templateSuggestionsEnabled: false, offlineModeEnabled: false, featureToggles: {}, profiles: [], integrationsEnabled: {}, buttonBindings: {}, buttonBindingsDisabled: [], ...over }
}

describe('export/import handler registry', () => {
  it('registers, lists, and unsubscribes an export handler', () => {
    const api = makeApi()
    const d = { id: 'test.export.json', displayName: 'Test JSON', export: (s: string) => s }
    const unsub = api.registerExportHandler(d)
    expect(api.getRegisteredExportHandlers().some((h) => h.id === d.id)).toBe(true)
    unsub()
    expect(api.getRegisteredExportHandlers().some((h) => h.id === d.id)).toBe(false)
  })

  it('registers, lists, and unsubscribes an import handler', () => {
    const api = makeApi()
    const d = { id: 'test.import.json', displayName: 'Test JSON', import: (s: string) => s }
    const unsub = api.registerImportHandler(d)
    expect(api.getRegisteredImportHandlers().some((h) => h.id === d.id)).toBe(true)
    unsub()
    expect(api.getRegisteredImportHandlers().some((h) => h.id === d.id)).toBe(false)
  })

  it('round-trips a snapshot through a handler pair (export -> import -> apply)', async () => {
    // A trivial handler pair that wraps the snapshot JSON in its own format,
    // proving the format-agnostic contract: whatever a handler emits on export,
    // its import counterpart turns back into the same snapshot JSON.
    const exportFn = (json: string) => `TESTFMT:v1\n${json}`
    const importFn = (raw: string) => raw.replace(/^TESTFMT:v1\n/, '')

    const source = makeSettings({
      shelves: [makeShelf('a'), makeShelf('b')],
      savedFilters: [{ id: 'f1', name: 'F1' } as any],
    })
    const encoded = exportFn(JSON.stringify(buildSnapshot(source)))
    const decodedJson = importFn(encoded)
    const restored = applySnapshot(makeSettings(), JSON.parse(decodedJson), 'replace')

    expect(restored.shelves).toEqual(source.shelves)
    expect(restored.savedFilters).toEqual(source.savedFilters)
  })
})
