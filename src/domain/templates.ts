import type { FilterGroup, FilterItem, ShelfSource } from "../types";

export type ShelfTemplateCategory = "status" | "time" | "platform" | "together" | "online";

export type ShelfTemplate = {
  id: string;
  titleKey: string;
  category: ShelfTemplateCategory;
  source: ShelfSource;
  requiresOnline?: boolean;
  defaultSort?: string;
  // Its filter also reads Store games, so the picker asks where the games come from.
  chooseOrigin?: boolean;
};

export type TemplateOrigin = "library" | "store" | "both";

function playTogetherTemplate(id: string, kind: string): ShelfTemplate {
  return {
    id,
    titleKey: `template_${id}`,
    category: "together",
    chooseOrigin: true,
    source: {
      type: "filter",
      filter: {
        filterGroup: { mode: "and", items: [{ type: "multiplayerType", inverted: false, params: { kind } }] },
        sort: "alphabetical",
      },
    },
  };
}

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
    // There is no "recent" library tab, so a sorted filter stands in for it.
    source: { type: "filter", filter: { sort: "recent" } },
  },
  {
    id: "installed",
    titleKey: "template_installed",
    category: "status",
    // Steam's tab store can fill in late or never, so read the installed field directly.
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
        filterGroup: { mode: "and", items: [{ type: "deviceCompatibility", inverted: false, params: { levels: ["verified"] } }] },
        sort: "alphabetical",
      },
    },
  },
  {
    id: "vr_games",
    titleKey: "template_vr_games",
    category: "platform",
    source: {
      type: "filter",
      filter: {
        filterGroup: { mode: "and", items: [{ type: "vrSupport", inverted: false, params: { levels: ["only", "supported"] } }] },
        sort: "recent",
      },
    },
  },
  {
    id: "vr_only",
    titleKey: "template_vr_only",
    category: "platform",
    source: {
      type: "filter",
      filter: {
        filterGroup: { mode: "and", items: [{ type: "vrSupport", inverted: false, params: { levels: ["only"] } }] },
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
    source: { type: "filter", filter: { maxPlaytimeMinutes: 0, sort: "alphabetical" } },
  },
  {
    id: "deck_playable",
    titleKey: "template_deck_playable",
    category: "platform",
    source: {
      type: "filter",
      filter: {
        filterGroup: { mode: "and", items: [{ type: "deviceCompatibility", inverted: false, params: { levels: ["playable"] } }] },
        sort: "alphabetical",
      },
    },
  },
  playTogetherTemplate("local_multiplayer", "local"),
  playTogetherTemplate("local_coop", "local_coop"),
  playTogetherTemplate("local_versus", "local_versus"),
  {
    id: "borrowed_games",
    titleKey: "template_borrowed_games",
    category: "together",
    source: {
      type: "filter",
      filter: {
        filterGroup: { mode: "and", items: [{ type: "familySharing", inverted: false, params: {} }] },
        sort: "alphabetical",
      },
    },
  },
];

const BORROWED_ITEM: FilterItem = { type: "familySharing", inverted: false, params: {} };

// "Only borrowed" narrows the library part alone: Store games are never borrowed.
export function templateSourceForOrigin(tpl: ShelfTemplate, origin: TemplateOrigin, borrowedOnly = false): ShelfSource {
  if (tpl.source.type !== "filter") return tpl.source;
  const group: FilterGroup = tpl.source.filter.filterGroup ?? { mode: "and", items: [] };
  const libraryGroup: FilterGroup = borrowedOnly ? { ...group, items: [...group.items, BORROWED_ITEM] } : group;
  const library: ShelfSource = { ...tpl.source, filter: { ...tpl.source.filter, filterGroup: libraryGroup } };
  if (origin === "library") return library;
  if (origin === "store") return { type: "store", childFilter: group };
  return { type: "composite", combine: "union", sources: [library, { type: "store", childFilter: group, excludeOwned: true }] };
}

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
  const kind = typeof it?.params?.kind === "string" ? `:${it.params.kind}` : "";
  return (it?.params?.levels ? `=${[...it.params.levels].sort().join(",")}` : "") + kind;
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

export function shelfSourceSignature(source: any): string {
  if (!source || typeof source !== "object") return "";
  if (source.type === "tab") return `tab:${source.tab}`;
  if (source.type === "filter") return `filter:${filterSignatureParts(source.filter ?? {}).sort().join("|")}`;
  return String(source.type ?? "");
}

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
