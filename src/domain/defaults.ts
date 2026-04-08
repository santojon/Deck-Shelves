
import type { Settings, Shelf, ShelfFilter, ShelfSource } from "../types";

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
  return { id: randomShelfId(), title, enabled: true, hidden: false, limit: 20, matchNativeSize: false, source: createDefaultSource("tab", firstCollectionId) };
}

export function defaultSettings(): Settings {
  return {
    enabled: false,
    shelves: [],
  };
}
