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
  "shortcutType",
  "appStatus",
  "discount",
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

export const SavedFilterSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  group: FilterGroupSchema,
});
export type SavedFilter = z.infer<typeof SavedFilterSchema>;

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
  // When true, reverse the sort result. Ignored for `manual` and `random`
  // (re-orderings would be meaningless). Default false.
  sortReverse: z.boolean().optional(),
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
  "custom",
]);
export type SmartShelfMode = z.infer<typeof SmartShelfModeSchema>;

export const SmartShelfSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(64),
  mode: SmartShelfModeSchema,
  enabled: z.boolean().default(true),
  hidden: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).optional(),
  // Optional user overrides — apply on top of the mode's built-in behavior.
  // `sort` overrides the mode's default ordering (supports the same values as
  // regular shelves, including "manual" + `manualOrder` / `manualBaseSort`).
  // `filterGroup` narrows the mode's candidate pool with additional filters.
  sort: z.union([z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual", "price_low", "discount_high", "original_price_high"]), z.string()]).optional(),
  // When true, reverse the sort result (asc/desc toggle). Ignored for
  // `manual` and `random`. Default false.
  sortReverse: z.boolean().optional(),
  manualOrder: z.array(z.number().int()).optional(),
  manualBaseSort: z.union([z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random"]), z.string()]).optional(),
  // When true, reverse the manual base sort. Default false.
  manualBaseSortReverse: z.boolean().optional(),
  filterGroup: FilterGroupSchema.optional(),
  // Visual overrides — mirrored from `ShelfSchema` so smart shelves can
  // share the regular-shelf visual customization surface.
  matchNativeSize: z.boolean().optional(),
  highlightFirst: z.boolean().optional(),
  highlightAll: z.boolean().optional(),
  highlightedAppIds: z.array(z.number().int()).optional(),
  hideStatusLine: z.boolean().optional(),
  hideNewBadge: z.boolean().optional(),
  hideCompatIcons: z.boolean().optional(),
  hideNonSteamBadge: z.boolean().optional(),
  hideShelfTitle: z.boolean().optional(),
  hideGameNames: z.boolean().optional(),
  hideInstallIndicator: z.boolean().optional(),
  hideSeeMore: z.boolean().optional(),
  hideRefreshCard: z.boolean().optional(),
  // Per-shelf hero opt-in (same semantics as the regular Shelf flag).
  heroEnabled: z.boolean().optional(),
  dedupeByExactName: z.boolean().optional(),
  hiddenAppIds: z.array(z.number().int()).optional(),
  // Optional refresh cadence in minutes. When unset the resolver uses its
  // default 60-minute TTL; otherwise the cached result is reused for
  // `refreshIntervalMinutes * 60 * 1000` ms. Capped at 30 days.
  refreshIntervalMinutes: z.number().int().min(1).max(43200).optional(),
  // Per-mode tuning knobs for the heuristic resolvers. Keys are mode-specific
  // (see `SMART_PARAM_META` in `src/steam/smartParams.ts`); values are
  // numbers. Missing entries fall back to the resolver's hardcoded defaults.
  smartParams: z.record(z.string(), z.number()).optional(),
  // Optional visibility windows. When non-empty, the shelf only appears
  // when the current local time falls inside ANY of the ranges (OR across
  // the array). Each range has `start`/`end` hours in `[0, 23]`. Empty
  // array = no window restriction (same as `undefined`). For backwards
  // compatibility the sanitizer also accepts a single `{ start, end }`
  // object and migrates it to a one-element array.
  visibleHours: z.array(z.object({
    start: z.number().int().min(0).max(23),
    end: z.number().int().min(0).max(23),
    days: z.array(z.number().int().min(0).max(6)).optional(),
  })).optional(),
  // Optional restriction to specific weekdays. 0 = Sunday … 6 = Saturday.
  // Empty array is treated as "no restriction" (same as undefined). Duplicates
  // are stripped by the sanitizer.
  visibleDaysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
});
export type SmartShelf = z.infer<typeof SmartShelfSchema>;

export const ShelfSourceSchema = z.union([
  z.object({ type: z.literal("collection"), collectionId: z.string(), childFilter: FilterGroupSchema.optional() }),
  z.object({ type: z.literal("tab"), tab: z.string().min(1), childFilter: FilterGroupSchema.optional() }),
  z.object({ type: z.literal("filter"), filter: FilterSchema.default({}) }),
  z.object({ type: z.literal("external"), sourceId: z.string().min(1) }),
  z.object({ type: z.literal("smart"), mode: SmartShelfModeSchema }),
  z.object({ type: z.literal("wishlist"), childFilter: FilterGroupSchema.optional(), excludeOwned: z.boolean().optional(), excludeOwnedNonSteam: z.boolean().optional() }),
  z.object({ type: z.literal("store"), childFilter: FilterGroupSchema.optional(), excludeOwned: z.boolean().optional(), excludeOwnedNonSteam: z.boolean().optional() }),
]);

export type ShelfSource = z.infer<typeof ShelfSourceSchema>;
export type ShelfFilter = z.infer<typeof FilterSchema>;

export const ShelfSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  hidden: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
  sort: z.union([z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual", "price_low", "discount_high", "original_price_high"]), z.string()]).optional(),
  // When true, reverse the sort result (asc/desc toggle). Ignored for
  // `manual` and `random`. Default false.
  sortReverse: z.boolean().optional(),
  manualOrder: z.array(z.number().int()).optional(),
  // Base sort used to order items NOT covered by `manualOrder` when `sort === "manual"`.
  // Defaults to "alphabetical" when absent; must not be "manual" itself.
  manualBaseSort: z.union([z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random"]), z.string()]).optional(),
  // When true, reverse the manual base sort. Default false.
  manualBaseSortReverse: z.boolean().optional(),
  matchNativeSize: z.boolean().default(false),
  highlightFirst: z.boolean().default(false),
  highlightAll: z.boolean().default(false),
  highlightedAppIds: z.array(z.number().int()).optional(),
  hideStatusLine: z.boolean().default(false),
  hideNewBadge: z.boolean().default(false),
  hideCompatIcons: z.boolean().default(false),
  hideNonSteamBadge: z.boolean().default(false),
  hideShelfTitle: z.boolean().default(false),
  hideGameNames: z.boolean().default(false),
  hideInstallIndicator: z.boolean().default(false),
  hideSeeMore: z.boolean().default(false),
  hideRefreshCard: z.boolean().default(false),
  // Per-shelf "Enable hero art" toggle. When true, focusing any card in this
  // shelf paints the hero image (same overlay used by the global
  // `shelfHeroBackground`) tied to the focused appid. Independent of
  // `hideRecents` — a regular shelf below the native recents row can opt in.
  heroEnabled: z.boolean().optional(),
  dedupeByExactName: z.boolean().optional(),
  hiddenAppIds: z.array(z.number().int()).optional(),
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
  globalHideShelfTitle: z.boolean().default(false),
  globalHideGameNames: z.boolean().default(false),
  globalHideInstallIndicator: z.boolean().default(false),
  globalHideSeeMore: z.boolean().default(false),
  globalHideRefreshCard: z.boolean().default(false),
  globalDedupeByName: z.boolean().default(false),
  globalHeroEnabled: z.boolean().default(false),
  shelves: z.array(ShelfSchema).default([]),
  smartShelvesEnabled: z.boolean().default(false),
  smartShelvesAtBottom: z.boolean().default(false),
  smartShelves: z.array(SmartShelfSchema).default([]),
  smartSurpriseMe: z.boolean().default(false),
  smartSurpriseMeCount: z.number().int().min(0).max(5).default(0),
  savedFilters: z.array(SavedFilterSchema).default([]),
  // `nullable()` is mandatory: the Python sanitizer in `main.py` returns `null`
  // for these when the user hasn't set them, and Zod's `optional()` alone
  // rejects null — which previously failed `safeParse` on the entire Settings
  // object and silently reset every shelf to defaults on the next load.
  updateNotifyEnabled: z.boolean().nullable().optional().transform((v) => v ?? true),
  updateNotifyDismissedVersion: z.string().nullable().optional(),
  onlineFeaturesEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  onlineWishlistEnabled: z.boolean().nullable().optional().transform((v) => v ?? true),
  onlinePriceSortEnabled: z.boolean().nullable().optional().transform((v) => v ?? true),
  onlinePrivacyAccepted: z.boolean().nullable().optional().transform((v) => v ?? false),
  onlineHideOwnedGames: z.boolean().nullable().optional().transform((v) => v ?? false),
  onlineHideOwnedNonSteam: z.boolean().nullable().optional().transform((v) => v ?? false),
  forceCssLoaderThemes: z.boolean().nullable().optional().transform((v) => v ?? false),
});

export type Settings = z.infer<typeof SettingsSchema>;
