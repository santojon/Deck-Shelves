import type { FilterGroup, FilterItem, Settings, Shelf, ShelfFilter, ShelfSource } from "../types";
import { createDefaultFilter } from "./defaults";

export function normalizeFilter(source: ShelfSource): ShelfFilter {
  if (source.type !== "filter") return createDefaultFilter();
  return { ...createDefaultFilter(), ...(source.filter ?? {}) };
}

export function patchShelfInSettings(settings: Settings, id: string, patch: Partial<Shelf>): Settings {
  return {
    ...settings,
    shelves: settings.shelves.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
}

export function deleteShelfFromSettings(settings: Settings, id: string): Settings {
  return {
    ...settings,
    shelves: settings.shelves.filter((s) => s.id !== id),
  };
}

export function addShelfToSettings(settings: Settings, shelf: Shelf, afterId?: string): Settings {
  if (afterId) {
    const idx = settings.shelves.findIndex((s) => s.id === afterId);
    if (idx >= 0) {
      const shelves = settings.shelves.slice();
      shelves.splice(idx + 1, 0, shelf);
      return { ...settings, shelves };
    }
  }
  // Default: insert at the top
  return {
    ...settings,
    shelves: [shelf, ...settings.shelves],
  };
}

export function moveShelf(settings: Settings, id: string, direction: -1 | 1): Settings {
  const idx = settings.shelves.findIndex((s) => s.id === id);
  if (idx < 0) return settings;
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= settings.shelves.length) return settings;
  const shelves = settings.shelves.slice();
  const [item] = shelves.splice(idx, 1);
  shelves.splice(nextIdx, 0, item);
  return { ...settings, shelves };
}

export function reorderShelves(settings: Settings, draggedId: string, targetId: string): Settings {
  if (draggedId === targetId) return settings;
  const shelves = settings.shelves.slice();
  const from = shelves.findIndex((item) => item.id === draggedId);
  const to = shelves.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0) return settings;
  const [item] = shelves.splice(from, 1);
  shelves.splice(to, 0, item);
  return { ...settings, shelves };
}

export function hiddenModeToValue(value: ShelfFilter["hidden"]) {
  if (value === "only" || value === true) return "only";
  if (value === false) return "exclude";
  return "any";
}

export function hiddenValueFromMode(mode: string): ShelfFilter["hidden"] {
  if (mode === "only") return "only";
  if (mode === "exclude") return false;
  return undefined;
}

/**
 * Converts a legacy flat ShelfFilter into the new CustomTabs-style FilterGroup.
 * Used when opening an old shelf for editing in the new filter UI.
 */
export function legacyFilterToGroup(filter: ShelfFilter): FilterGroup {
  const items: FilterItem[] = [];

  if (filter.installed !== undefined) {
    items.push({ type: "installed", inverted: filter.installed === false, params: {} });
  }
  if (filter.favorites) {
    items.push({ type: "favorites", inverted: false, params: {} });
  }
  if (filter.nonSteam) {
    items.push({ type: "nonSteam", inverted: false, params: {} });
  }
  if (filter.hidden !== undefined) {
    const mode = filter.hidden === "only" ? "only" : filter.hidden === false ? "exclude" : "any";
    if (mode !== "any") {
      items.push({ type: "hidden", inverted: false, params: { mode } });
    }
  }
  if (filter.updatePending !== undefined) {
    items.push({ type: "updatePending", inverted: filter.updatePending === false, params: {} });
  }
  if (filter.deckCompatibility && filter.deckCompatibility.length > 0) {
    items.push({ type: "deckCompatibility", inverted: false, params: { levels: filter.deckCompatibility } });
  }
  if (typeof filter.playedWithinDays === "number") {
    items.push({ type: "playedWithinDays", inverted: false, params: { days: filter.playedWithinDays } });
  }
  if (filter.minPlaytimeMinutes != null || filter.maxPlaytimeMinutes != null) {
    items.push({
      type: "playtimeRange",
      inverted: false,
      params: {
        minHours: filter.minPlaytimeMinutes != null ? Math.round(filter.minPlaytimeMinutes / 60 * 10) / 10 : undefined,
        maxHours: filter.maxPlaytimeMinutes != null ? Math.round(filter.maxPlaytimeMinutes / 60 * 10) / 10 : undefined,
      },
    });
  }
  if (filter.nameIncludes) {
    items.push({ type: "nameIncludes", inverted: false, params: { text: filter.nameIncludes } });
  }
  if (filter.nameRegex) {
    items.push({ type: "nameRegex", inverted: false, params: { pattern: filter.nameRegex } });
  }

  return { mode: "and", items };
}

/**
 * Returns a ShelfFilter that uses the new filterGroup system, preserving
 * the sort + sortReverse fields. `sortReverse` accepts the same
 * `boolean | boolean[]` shape that the schema does — required for
 * multi-key sort chains saved on filter sources, since the shelf-level
 * `sortReverse` field is never populated for filter shelves (filter sort
 * lives entirely inside the filter object).
 */
export function filterGroupToFilter(
  group: FilterGroup,
  sort: ShelfFilter["sort"] = "alphabetical",
  sortReverse?: ShelfFilter["sortReverse"],
): ShelfFilter {
  const out: ShelfFilter = { sort, filterGroup: group };
  if (sortReverse !== undefined && sortReverse !== false &&
    !(Array.isArray(sortReverse) && sortReverse.every((b) => !b))) {
    out.sortReverse = sortReverse;
  }
  return out;
}

/**
 * Returns the effective FilterGroup for a ShelfFilter — using the new filterGroup if present,
 * or migrating from legacy fields otherwise.
 */
export function getEffectiveFilterGroup(filter: ShelfFilter): FilterGroup {
  if (filter.filterGroup && Array.isArray(filter.filterGroup.items) && filter.filterGroup.items.length > 0) {
    return filter.filterGroup;
  }
  return legacyFilterToGroup(filter);
}
