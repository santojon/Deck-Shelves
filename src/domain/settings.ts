import type { Settings, Shelf, ShelfFilter, ShelfSource } from "../types";
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

export function addShelfToSettings(settings: Settings, shelf: Shelf): Settings {
  return {
    ...settings,
    shelves: [...settings.shelves, shelf],
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
