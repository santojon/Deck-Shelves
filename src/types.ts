import { z } from "zod";

export const FilterItemTypeSchema = z.enum([
  "installed",
  "favorites",
  "nonSteam",
  "hidden",
  "updatePending",
  "isNew",
  "deckCompatibility",
  "playedWithinDays",
  "playtimeRange",
  "nameIncludes",
  "nameRegex",
  "friends",
  "storeTag",
  "achievements",
  "collection",
  "developer",
  "publisher",
  "appIdList",
  "cloudAvailable",
  "controllerSupport",
  "merge",
]);
export type FilterItemType = z.infer<typeof FilterItemTypeSchema>;

export const FilterItemSchema = z.object({
  type: FilterItemTypeSchema,
  inverted: z.boolean().optional(),
  params: z.record(z.string(), z.any()).optional(),
});
export type FilterItem = z.infer<typeof FilterItemSchema>;

export const FilterGroupSchema = z.object({
  mode: z.enum(["and", "or"]).default("and"),
  items: z.array(FilterItemSchema).default([]),
});
export type FilterGroup = z.infer<typeof FilterGroupSchema>;

// --- Legacy flat filter schema (kept for backwards compatibility) ---

export const FilterSchema = z.object({
  // Legacy fields
  favorites: z.boolean().optional(),
  hidden: z.union([z.boolean(), z.literal("only")]).optional(),
  nonSteam: z.boolean().optional(),
  installed: z.boolean().optional(),
  playedWithinDays: z.number().int().positive().optional(),
  nameIncludes: z.string().optional(),
  nameRegex: z.string().optional(),
  deckCompatibility: z.array(z.enum(["verified", "playable", "unsupported", "unknown"])).optional(),
  // Allow known sort enums but accept unknown strings for forward compatibility
  sort: z.union([
    z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score"]),
    z.string(),
  ]).optional(),
  minPlaytimeMinutes: z.number().int().min(0).optional(),
  maxPlaytimeMinutes: z.number().int().min(0).optional(),
  updatePending: z.boolean().optional(),
  // New CustomTabs-style filter group (takes priority over legacy fields when present)
  filterGroup: FilterGroupSchema.optional(),
}).passthrough();

export const SmartShelfModeSchema = z.enum([
  "quick_play",
  "not_started",
  "deck_picks",
  "rediscover",
  "best_unplayed",
  "interrupted",
  "time_of_day",
  "daily_pick",
  "on_deck",
  "recently_played",
  "long_session",
  "non_steam",
  "random_pick",
  "forgotten",
  "spare_time",
]);
export type SmartShelfMode = z.infer<typeof SmartShelfModeSchema>;

export const SmartShelfSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(64),
  mode: SmartShelfModeSchema,
  enabled: z.boolean().default(true),
  hidden: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).optional(),
});
export type SmartShelf = z.infer<typeof SmartShelfSchema>;

export const ShelfSourceSchema = z.union([
  z.object({ type: z.literal("collection"), collectionId: z.string() }),
  z.object({ type: z.literal("tab"), tab: z.string().min(1) }),
  z.object({ type: z.literal("filter"), filter: FilterSchema.default({}) }),
  z.object({ type: z.literal("external"), sourceId: z.string().min(1) }),
  z.object({ type: z.literal("smart"), mode: SmartShelfModeSchema }),
]);

export type ShelfSource = z.infer<typeof ShelfSourceSchema>;
export type ShelfFilter = z.infer<typeof FilterSchema>;

export const ShelfSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  hidden: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
  sort: z.union([z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual"]), z.string()]).optional(),
  manualOrder: z.array(z.number().int()).optional(),
  matchNativeSize: z.boolean().default(false),
  highlightFirst: z.boolean().default(false),
  highlightAll: z.boolean().default(false),
  highlightedAppIds: z.array(z.number().int()).optional(),
  hideStatusLine: z.boolean().default(false),
  hideNewBadge: z.boolean().default(false),
  hideCompatIcons: z.boolean().default(false),
  hideNonSteamBadge: z.boolean().default(false),
  source: ShelfSourceSchema
});

export type Shelf = z.infer<typeof ShelfSchema>;

export const SettingsSchema = z.object({
  enabled: z.boolean().default(true),
  hideRecents: z.boolean().default(false),
  recentsReplaceSource: z.boolean().default(false),
  hideHomeTabs: z.boolean().default(false),
  shelfHeroBackground: z.boolean().default(false),
  globalMatchNativeSize: z.boolean().default(false),
  globalHighlightFirst: z.boolean().default(false),
  globalHighlightAll: z.boolean().default(false),
  globalHideStatusLine: z.boolean().default(false),
  globalHideNewBadge: z.boolean().default(false),
  globalHideCompatIcons: z.boolean().default(false),
  globalHideNonSteamBadge: z.boolean().default(false),
  shelves: z.array(ShelfSchema).default([]),
  smartShelvesEnabled: z.boolean().default(false),
  smartShelvesAtBottom: z.boolean().default(false),
  smartShelves: z.array(SmartShelfSchema).default([]),
  smartSurpriseMe: z.boolean().default(false),
  smartSurpriseMeCount: z.number().int().min(0).max(5).default(0),
});

export type Settings = z.infer<typeof SettingsSchema>;
