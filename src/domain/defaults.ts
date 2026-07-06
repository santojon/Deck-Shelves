
import type { Settings, Shelf, ShelfFilter, ShelfSource, SmartShelf, SmartShelfMode } from "../types";

export function randomShelfId() {
  return `s_${Math.random().toString(16).slice(2, 10)}`;
}

export function createDefaultFilter(): ShelfFilter {
  return { sort: "alphabetical" };
}

export function createDefaultSource(kind: "collection" | "tab" | "filter", firstCollectionId = ""): ShelfSource {
  if (kind === "collection") return { type: "collection", collectionId: firstCollectionId };
  if (kind === "filter") return { type: "filter", filter: createDefaultFilter() };
  return { type: "tab", tab: "all" };
}

export function createDefaultShelf(firstCollectionId = "", title = "New shelf"): Shelf {
  return { id: randomShelfId(), title, enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, highlightAll: false, hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false, hideRefreshCard: false, source: createDefaultSource("tab", firstCollectionId) };
}

export function createDefaultSmartShelf(mode: SmartShelfMode, title: string): SmartShelf {
  const base: SmartShelf = { id: randomShelfId(), title, mode, enabled: true, hidden: false };
  // Mirror the mode's hardcoded visibility window into `visibleHours` so the
  // user sees and can edit the same constraint that the resolver applies
  // internally. Other modes leave the field unset.
  if (mode === "spare_time") {
    (base as any).visibleHours = [
      { start: 6, end: 9 },
      { start: 12, end: 14 },
      { start: 19, end: 22 },
    ];
  } else if (mode === "long_session_night") {
    // Differentiation from base long_session: this template surfaces only
    // during evening hours (19h–23h) when long sessions are typical.
    (base as any).visibleHours = [{ start: 19, end: 23 }];
  } else if (mode === "friends_playing") {
    // This template surfaces games friends are in — ship it with the friend
    // avatar overlay (+ the 14-day lookback) on by default.
    (base as any).friendsPlayingOverlay = true;
    (base as any).friendsPlayingOverlayRecent = true;
  }
  return base;
}

export function defaultSettings(): Settings {
  return {
    enabled: false,
    hideRecents: false,
    recentsReplaceSource: false,
    hideHomeTabs: false,
    shelfHeroBackground: false,
    globalMatchNativeSize: false,
    globalHighlightFirst: false,
    globalHighlightAll: false,
    globalHideStatusLine: false,
    globalHideNewBadge: false,
    globalHideDiscountBadge: false,
    globalHideCompatIcons: false,
    globalHideNonSteamBadge: false,
    globalHideShelfTitle: false,
    globalHideGameNames: false,
    globalHideInstallIndicator: false,
    globalHideSeeMore: false,
    globalHideRefreshCard: false,
    globalHeroEnabled: false,
    globalGameInfoAbove: false,
    globalFriendsPlayingOverlay: false,
    globalFriendsPlayingOverlayRecent: false,
    globalDedupeByName: false,
    shelves: [],
    smartShelvesEnabled: false,
    smartShelvesAtBottom: false,
    smartShelves: [],
    smartSurpriseMe: false,
    smartSurpriseMeCount: 0,
    savedFilters: [],
    savedSmartFilters: [],
    updateNotifyEnabled: true,
    onlineFeaturesEnabled: false,
    onlineWishlistEnabled: true,
    onlinePriceSortEnabled: true,
    onlinePrivacyAccepted: false,
    onlineMetadataEnabled: false,
    onlineHideOwnedGames: false,
    onlineHideOwnedNonSteam: false,
    onlineHideOwnedNonSteamCloud: false,
    forceCssLoaderThemes: false,
    qamHiddenToggles: [],
    qamHiddenSections: [],
    unifiedListEnabled: false,
    allShelvesOrder: [],
    lightModeEnabled: false, advancedModeEnabled: false, templateSuggestionsEnabled: false, offlineModeEnabled: false,
    featureToggles: {},
    profiles: [],
    integrationsEnabled: {},
    buttonBindings: {
      cardHideRemove: "X",
      cardHighlightToggle: "Y",
      cardQuickLaunch: "VIEW",
      navSearch: "L1+R1",
      navSideNav: "L1+L1",
    },
    buttonBindingsDisabled: [],
  };
}
