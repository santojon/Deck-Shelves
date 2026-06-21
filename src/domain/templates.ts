import type { ShelfSource } from "../types";

export type ShelfTemplateCategory = "status" | "time" | "platform" | "online";

export type ShelfTemplate = {
  id: string;
  titleKey: string;
  category: ShelfTemplateCategory;
  source: ShelfSource;
  requiresOnline?: boolean;
  defaultSort?: string;
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
    /* listLibraryTabs() exposes [all, favorites, installed, hidden, nonsteam]
       — no "recent" tab. A tab-source shelf with tab="recent" can't be
       matched in the edit modal's dropdown and visibly falls back to the
       first option. Filter source with sort="recent" reproduces "recently
       played" semantically and round-trips cleanly through the modal. */
    source: { type: "filter", filter: { sort: "recent" } },
  },
  {
    id: "installed",
    titleKey: "template_installed",
    category: "status",
    // Use the legacy `installed: true` filter directly — Steam's tab
    /* store reliably populates LATE (or sometimes not at all on certain
       theme combinations), and chasing it through the tab→fallback path
       produced empty shelves for some users. The filter reads off the
       same `installed` field every shelf already consults, so the result
       is identical to what Steam's "Installed" tab would return. */
    source: { type: "filter", filter: { installed: true, sort: "alphabetical" } },
  },
  {
    id: "most_played",
    titleKey: "template_most_played",
    category: "time",
    source: { type: "filter", filter: { sort: "playtime" } },
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
    /* cloudAvailable / controllerSupport / deckCompatibility aren't on the
       flat ShelfFilter schema — wrap them in a filterGroup so the resolver
       routes through evaluateFilterGroup. Same pattern works in the Edit
       modal Filters tab without any schema migration. */
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
    source: { type: "filter", filter: { sort: "review_score" } },
  },
  {
    id: "never_played",
    titleKey: "template_never_played",
    category: "status",
    // Backlog: maps to the `never_played_games` statistic. maxPlaytimeMinutes:0
    // means playtime_forever <= 0 — games you own but never launched.
    source: { type: "filter", filter: { maxPlaytimeMinutes: 0, sort: "alphabetical" } },
  },
  {
    id: "deck_playable",
    titleKey: "template_deck_playable",
    category: "platform",
    // Pairs with deck_verified; maps to the `deck_playable` statistic.
    source: {
      type: "filter",
      filter: {
        filterGroup: { mode: "and", items: [{ type: "deckCompatibility", inverted: false, params: { levels: ["playable"] } }] },
        sort: "alphabetical",
      },
    },
  },
];

export const ONLINE_SHELF_TEMPLATES: ShelfTemplate[] = [
  {
    id: "wishlist",
    titleKey: "template_wishlist",
    category: "online",
    requiresOnline: true,
    source: { type: "wishlist" },
  },
  {
    id: "wishlist_on_sale",
    titleKey: "template_wishlist_on_sale",
    category: "online",
    requiresOnline: true,
    source: {
      type: "wishlist",
      childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 1, maxDiscount: 99 } }] },
    } as any,
    defaultSort: "discount_high",
  },
  {
    id: "free_wishlist",
    titleKey: "template_free_wishlist",
    category: "online",
    requiresOnline: true,
    source: {
      type: "wishlist",
      childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 100, maxDiscount: 100 } }] },
    } as any,
    defaultSort: "original_price_high",
  },
  {
    id: "free_now",
    titleKey: "template_free_now",
    category: "online",
    requiresOnline: true,
    source: {
      type: "store",
      childFilter: {
        mode: "and",
        items: [{ type: "discount", inverted: false, params: { minDiscount: 100, maxDiscount: 100 } }],
      },
    } as any,
    defaultSort: "original_price_high",
  },
];

export const DEFAULT_SHELF_TEMPLATES: ShelfTemplate[] = [
  SHELF_TEMPLATES[0],
  SHELF_TEMPLATES[1],
  SHELF_TEMPLATES[4],
];

function levelsSuffix(it: any): string {
  return it?.params?.levels ? `=${[...it.params.levels].sort().join(",")}` : "";
}

function filterSignatureParts(f: any): string[] {
  const parts: string[] = [];
  if (f.installed) parts.push("installed");
  if (f.nonSteam) parts.push("nonSteam");
  if (f.updatePending) parts.push("updatePending");
  if (typeof f.maxPlaytimeMinutes === "number") parts.push(`max=${f.maxPlaytimeMinutes}`);
  if (typeof f.minPlaytimeMinutes === "number") parts.push(`min=${f.minPlaytimeMinutes}`);
  for (const it of f.filterGroup?.items ?? []) parts.push(`${it?.type}${levelsSuffix(it)}`);
  return parts;
}

// Stable signature for a shelf source (sort excluded, so a re-sorted shelf
// still matches its template). Used to detect "already have this template".
export function shelfSourceSignature(source: any): string {
  if (!source || typeof source !== "object") return "";
  if (source.type === "tab") return `tab:${source.tab}`;
  if (source.type === "filter") return `filter:${filterSignatureParts(source.filter ?? {}).sort().join("|")}`;
  return String(source.type ?? "");
}

// Template ids whose signature matches an existing shelf + the smart modes
// already present, so suggestions can skip duplicates.
export function coveredTemplateIds(
  shelves: ReadonlyArray<{ source?: any }>,
  smartModes: ReadonlyArray<string>,
): string[] {
  const existing = new Set(shelves.map((s) => shelfSourceSignature(s.source)));
  const covered = new Set<string>(smartModes);
  for (const tpl of [...SHELF_TEMPLATES, ...ONLINE_SHELF_TEMPLATES]) {
    if (existing.has(shelfSourceSignature(tpl.source))) covered.add(tpl.id);
  }
  return [...covered];
}
