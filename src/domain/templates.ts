import type { ShelfSource } from "../types";

export type ShelfTemplate = {
  id: string;
  titleKey: string;
  source: ShelfSource;
};

export const SHELF_TEMPLATES: ShelfTemplate[] = [
  {
    id: "favorites",
    titleKey: "template_favorites",
    source: { type: "tab", tab: "favorites" },
  },
  {
    id: "recent",
    titleKey: "template_recent",
    source: { type: "tab", tab: "recent" },
  },
  {
    id: "installed",
    titleKey: "template_installed",
    source: { type: "tab", tab: "installed" },
  },
  {
    id: "most_played",
    titleKey: "template_most_played",
    source: { type: "filter", filter: { installed: true, sort: "playtime" } },
  },
  {
    id: "recently_added",
    titleKey: "template_recently_added",
    source: { type: "filter", filter: { sort: "added" } },
  },
  {
    id: "awaiting_update",
    titleKey: "template_awaiting_update",
    source: { type: "filter", filter: { installed: true, updatePending: true, sort: "alphabetical" } },
  },
  {
    id: "non_steam",
    titleKey: "template_non_steam",
    source: { type: "filter", filter: { nonSteam: true, sort: "recent" } },
  },
  {
    id: "long_session",
    titleKey: "template_long_session",
    source: { type: "filter", filter: { installed: true, minPlaytimeMinutes: 180, sort: "playtime" } },
  },
];

export const DEFAULT_SHELF_TEMPLATES: ShelfTemplate[] = [
  SHELF_TEMPLATES[0],
  SHELF_TEMPLATES[1],
  SHELF_TEMPLATES[4],
];
