
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
  return { id: randomShelfId(), title, enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, highlightAll: false, hideStatusLine: false, hideNewBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, source: createDefaultSource("tab", firstCollectionId) };
}

export function createDefaultSmartShelf(mode: SmartShelfMode, title: string): SmartShelf {
  return { id: randomShelfId(), title, mode, enabled: true, hidden: false };
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
    globalHideCompatIcons: false,
    globalHideNonSteamBadge: false,
    shelves: [],
    smartShelvesEnabled: false,
    smartShelvesAtBottom: false,
    smartShelves: [],
    smartSurpriseMe: false,
    smartSurpriseMeCount: 0,
  };
}
