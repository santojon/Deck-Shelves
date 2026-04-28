import type { ShelfSource } from "../types";

export type ShelfTemplateCategory = "status" | "time" | "platform";

export type ShelfTemplate = {
  id: string;
  titleKey: string;
  category: ShelfTemplateCategory;
  source: ShelfSource;
};

export const SHELF_TEMPLATES: ShelfTemplate[] = [
  {
    id: "favorites",
    titleKey: "template_favorites",
    category: "status",
    source: { type: "tab", tab: "favorites" },
  },
  {
    id: "recent",
    titleKey: "template_recent",
    category: "time",
    // listLibraryTabs() exposes [all, favorites, installed, hidden, nonsteam]
    // — no "recent" tab. A tab-source shelf with tab="recent" can't be
    // matched in the edit modal's dropdown and visibly falls back to the
    // first option. Filter source with sort="recent" reproduces "recently
    // played" semantically and round-trips cleanly through the modal.
    source: { type: "filter", filter: { sort: "recent" } },
  },
  {
    id: "installed",
    titleKey: "template_installed",
    category: "status",
    source: { type: "tab", tab: "installed" },
  },
  {
    id: "most_played",
    titleKey: "template_most_played",
    category: "time",
    source: { type: "filter", filter: { installed: true, sort: "playtime" } },
  },
  {
    id: "recently_added",
    titleKey: "template_recently_added",
    category: "time",
    source: { type: "filter", filter: { sort: "added" } },
  },
  {
    id: "awaiting_update",
    titleKey: "template_awaiting_update",
    category: "status",
    source: { type: "filter", filter: { installed: true, updatePending: true, sort: "alphabetical" } },
  },
  {
    id: "non_steam",
    titleKey: "template_non_steam",
    category: "platform",
    source: { type: "filter", filter: { nonSteam: true, sort: "recent" } },
  },
  {
    id: "long_session",
    titleKey: "template_long_session",
    category: "time",
    source: { type: "filter", filter: { installed: true, minPlaytimeMinutes: 180, sort: "playtime" } },
  },
  {
    id: "steam_cloud",
    titleKey: "template_steam_cloud",
    category: "platform",
    // cloudAvailable / controllerSupport / deckCompatibility aren't on the
    // flat ShelfFilter schema — wrap them in a filterGroup so the resolver
    // routes through evaluateFilterGroup. Same pattern works in the Edit
    // modal Filters tab without any schema migration.
    source: {
      type: "filter",
      filter: {
        filterGroup: { mode: "and", items: [{ type: "cloudAvailable", inverted: false, params: {} }] },
        sort: "alphabetical",
      },
    },
  },
  {
    id: "deck_verified",
    titleKey: "template_deck_verified",
    category: "platform",
    source: {
      type: "filter",
      filter: {
        filterGroup: { mode: "and", items: [{ type: "deckCompatibility", inverted: false, params: { levels: ["verified"] } }] },
        sort: "alphabetical",
      },
    },
  },
  {
    id: "top_reviewed",
    titleKey: "template_top_reviewed",
    category: "status",
    source: { type: "filter", filter: { installed: true, sort: "review_score" } },
  },
];

export const DEFAULT_SHELF_TEMPLATES: ShelfTemplate[] = [
  SHELF_TEMPLATES[0],
  SHELF_TEMPLATES[1],
  SHELF_TEMPLATES[4],
];
