import { z } from "zod";

export const FilterItemTypeSchema = z.enum([
  "installed",
  "favorites",
  "nonSteam",
  "hidden",
  "updatePending",
  "isNew",
  "deckCompatibility",
  "deviceCompatibility",
  "playedWithinDays",
  "playtimeRange",
  "recentlyActive",
  "neglected",
  "nameIncludes",
  "nameRegex",
  "friendsPlayingNow",
  "friendsPlayedRecently",
  "collection",
  "developer",
  "publisher",
  "appIdList",
  "cloudAvailable",
  "controllerSupport",
  "systemCompatibility",
  "steamosCompatibility",
  "machineCompatibility",
  "frameCompatibility",
  "remotePlayLocation",
  "libraryLocation",
  "merge",
  "shortcutType",
  "appStatus",
  "discount",
  "priceRange",
  "vrSupport",
  "comingSoon",
  "reviewScore",
  "releaseDate",
  "genres",
  "categories",
  "franchise",
  "multiplayerType",
  "playedOnce",
  "installedSizeRange",
  "customTags",
  "parserCategories",
  "storeTag",
  "storeCategory",
  "purchaseDate",
  "friends",
  "achievements",
  "achievementPercentRange",
  "neverCompleted",
  "familySharing",
  "weightedFilter",
  "priorityFilter",
  "exclusionGroup",
]);
export type FilterItemType = z.infer<typeof FilterItemTypeSchema>;

const KNOWN_FILTER_TYPES: ReadonlySet<string> = new Set(FilterItemTypeSchema.options);

export function isKnownFilterType(type: string): type is FilterItemType {
  return KNOWN_FILTER_TYPES.has(type);
}

// Early imports stored booleans as 0/1.
const legacyFlag = (v: unknown) => (v === 1 ? true : v === 0 ? false : v);
const legacyBool = () => z.preprocess(legacyFlag, z.boolean());

// Unknown types stay in the document and make the query unavailable instead of being dropped.
export const FilterItemSchema = z.object({
  type: z.string().min(1).max(64),
  inverted: z.preprocess(legacyFlag, z.boolean().optional()),
  params: z.record(z.string(), z.any()).optional(),
});
export type FilterItem = z.infer<typeof FilterItemSchema>;

export const FilterGroupSchema = z.object({
  mode: z.enum(["and", "or"]).default("and"),
  items: z.array(FilterItemSchema).default([]),
});
export type FilterGroup = z.infer<typeof FilterGroupSchema>;

// Permissive so a newer build's rules round-trip through an older sanitizer.
export const VisibilityRuleSchema = z.object({
  kind: z.string().min(1).max(40),
}).passthrough();
export type VisibilityRule = { kind: string } & Record<string, unknown>;

export const VisibilitySchema = z.object({
  mode: z.enum(["any", "all"]).default("any"),
  rules: z.array(VisibilityRuleSchema).default([]),
});
export type Visibility = z.infer<typeof VisibilitySchema>;

export const SavedFilterSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  group: FilterGroupSchema,
  updatedAt: z.number().int().nonnegative().optional(),
});
export type SavedFilter = z.infer<typeof SavedFilterSchema>;

export const SavedSmartFilterSchema = z.object({
  id: z.string().min(1).max(64),
  updatedAt: z.number().int().nonnegative().optional(),
  name: z.string().min(1).max(64),
  mode: z.string().min(1).max(64),
  smartParams: z.record(z.string(), z.number()).optional(),
  filterGroup: FilterGroupSchema.optional(),
  sort: z.union([z.string(), z.array(z.string())]).optional(),
  sortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  visibleHours: z.array(z.object({
    start: z.number().int().min(0).max(23),
    end: z.number().int().min(0).max(23),
    days: z.array(z.number().int().min(0).max(6)).optional(),
  })).optional(),
  visibleDaysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  visibility: VisibilitySchema.optional(),
});
export type SavedSmartFilter = z.infer<typeof SavedSmartFilterSchema>;

export const FilterSchema = z.object({
  favorites: legacyBool().optional(),
  hidden: z.union([legacyBool(), z.literal("only")]).optional(),
  nonSteam: legacyBool().optional(),
  installed: legacyBool().optional(),
  playedWithinDays: z.number().int().positive().optional(),
  nameIncludes: z.string().optional(),
  nameRegex: z.string().optional(),
  deckCompatibility: z.array(z.enum(["verified", "playable", "unsupported", "unknown"])).optional(),
  // Unknown strings are accepted for forward compatibility; an array is a multi-key chain.
  sort: z.union([
    z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score"]),
    z.string(),
    z.array(z.union([
      z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score"]),
      z.string(),
    ])),
  ]).optional(),
  // Ignored for `manual` and `random`; an array is per key, aligned with `sort`.
  sortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  minPlaytimeMinutes: z.number().int().min(0).optional(),
  maxPlaytimeMinutes: z.number().int().min(0).optional(),
  updatePending: legacyBool().optional(),
  // Wins over the older flat filter fields when present.
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
  "soundtracks",
  "videos",
  "demos",
  "cloud_games",
  "backlog_rescue",
  "forgotten_gems",
  "weekly_rotation",
  "short_battery",
  "travel_mode",
  "recent_hidden_installs",
  "low_battery_mode",
  "friends_playing",
  "almost_finished",
  "couch_gaming",
  "coop_ready",
  "party_games",
  "custom",
  // Retired: still accepted and rewritten when the settings load.
  "long_session_night",
  "hidden_gems",
  "never_touched_classics",
  "monthly_spotlight",
  "seasonal_rotation",
]);
export type SmartShelfMode = z.infer<typeof SmartShelfModeSchema>;

const SORT_KEYS = ["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual", "price_low", "discount_high", "original_price_high"] as const;
const ShelfSortSchema = z.union([
  z.enum(SORT_KEYS),
  z.string(),
  z.array(z.union([z.enum(SORT_KEYS), z.string()])),
]);
const MANUAL_BASE_SORT_KEYS = ["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random"] as const;
const ManualBaseSortSchema = z.union([
  z.enum(MANUAL_BASE_SORT_KEYS),
  z.string(),
  z.array(z.union([z.enum(MANUAL_BASE_SORT_KEYS), z.string()])),
]);

type LegacyBool = ReturnType<typeof legacyBool>;
type VisualFlag<D extends boolean> = D extends true ? z.ZodDefault<LegacyBool> : z.ZodOptional<LegacyBool>;

// Same fields and order for both kinds, so persisted key order is unchanged.
function shelfVisualFields<D extends boolean>(defaulted: D) {
  const flag = (): VisualFlag<D> => (defaulted ? legacyBool().default(false) : legacyBool().optional()) as VisualFlag<D>;
  return {
    matchNativeSize: flag(),
    highlightFirst: flag(),
    highlightAll: flag(),
    highlightedAppIds: z.array(z.number().int()).optional(),
    highlightRandom: legacyBool().optional(),
    enableLogo: legacyBool().optional(),
    enableIcon: legacyBool().optional(),
    enableDescription: legacyBool().optional(),
    descriptionScale: z.number().int().min(100).max(200).nullable().optional(),
    descriptionBelowLogo: legacyBool().optional(),
    logoBelowShelf: legacyBool().optional(),
    logoPosition: z.enum(['left', 'center', 'right']).nullable().optional(),
    descriptionPosition: z.enum(['left', 'center', 'right']).nullable().optional(),
    logoSize: z.number().int().min(50).max(200).nullable().optional(),
    logoTopOffset: z.number().int().min(-50).max(100).nullable().optional(),
    fullPageShelf: legacyBool().optional(),
    iconVerticalAlign: z.enum(['top', 'center', 'bottom']).nullable().optional(),
    discountBadgeMode: z.enum(['percent', 'price', 'both', 'percent_price']).nullable().optional(),
    discountBadgeFocusMode: z.enum(['percent', 'price', 'both', 'percent_price']).nullable().optional(),
    shelfTitlePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
    gameNamePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
    playtimePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
    descriptionHeight: z.number().int().min(1).max(3).nullable().optional(),
    descriptionLogoGap: z.number().int().min(-40).max(80).nullable().optional(),
    hideStatusLine: flag(),
    hideNewBadge: flag(),
    hideDiscountBadge: flag(),
    hideCompatIcons: flag(),
    hideNonSteamBadge: flag(),
    hideShelfTitle: flag(),
    hideGameNames: flag(),
    hideInstallIndicator: flag(),
    hideSeeMore: flag(),
    hideRefreshCard: flag(),
  };
}

export const SmartShelfSchema = z.object({
  id: z.string().min(1).max(64),
  updatedAt: z.number().int().nonnegative().optional(),
  title: z.string().min(1).max(64),
  mode: SmartShelfModeSchema,
  enabled: legacyBool().default(true),
  hidden: legacyBool().default(false),
  limit: z.number().int().min(1).max(100).optional(),
  sort: ShelfSortSchema.optional(),
  sortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  manualOrder: z.array(z.number().int()).optional(),
  manualBaseSort: ManualBaseSortSchema.optional(),
  manualBaseSortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  filterGroup: FilterGroupSchema.optional(),
  ...shelfVisualFields(false),
  heroEnabled: legacyBool().optional(),
  gameInfoAbove: legacyBool().optional(),
  friendsPlayingOverlay: legacyBool().optional(),
  friendsPlayingOverlayRecent: legacyBool().optional(),
  dedupeByExactName: legacyBool().optional(),
  hiddenAppIds: z.array(z.number().int()).optional(),
  // Unset uses the resolver's 60-minute default.
  refreshIntervalMinutes: z.number().int().min(1).max(43200).optional(),
  smartParams: z.record(z.string(), z.number()).optional(),
  // The primary `mode` counts as the first composite item, so older clients still get single-mode behaviour.
  compositeModes: z.array(SmartShelfModeSchema).max(5).optional(),
  compositeCombine: z.enum(["union", "intersection"]).optional(),
  // The sanitizer also migrates a single `{ start, end }` object.
  visibleHours: z.array(z.object({
    start: z.number().int().min(0).max(23),
    end: z.number().int().min(0).max(23),
    days: z.array(z.number().int().min(0).max(6)).optional(),
  })).optional(),
  visibleDaysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  // Supersedes visibleHours and visibleDaysOfWeek when it has rules.
  visibility: VisibilitySchema.optional(),
  autoPin: VisibilitySchema.optional(),
  autoCollapse: VisibilitySchema.optional(),
  autoCollapseWhenEmpty: legacyBool().optional(),
}).passthrough();
export type SmartShelf = z.infer<typeof SmartShelfSchema>;

// A source's own sort and game limit inside a composite shelf; under a manual sort, the games placed first.
type SourceOrder = { sort?: string | string[]; sortReverse?: boolean | boolean[]; limit?: number; manualOrder?: number[] };

export type ShelfSource = SourceOrder & (
  | { type: "collection"; collectionId: string; childFilter?: FilterGroup }
  | { type: "tab"; tab: string; childFilter?: FilterGroup }
  | { type: "filter"; filter: ShelfFilter }
  | { type: "external"; sourceId: string }
  | { type: "builtin"; sourceId: string }
  | { type: "smart"; mode: SmartShelfMode }
  | { type: "wishlist"; childFilter?: FilterGroup; excludeOwned?: boolean; excludeOwnedNonSteam?: boolean; hideOwnedNonSteamCloud?: boolean }
  | { type: "store"; childFilter?: FilterGroup; excludeOwned?: boolean; excludeOwnedNonSteam?: boolean; hideOwnedNonSteamCloud?: boolean }
  | { type: "composite"; combine: "union" | "intersection"; sources: ShelfSource[]; childFilter?: FilterGroup });

const sourceOrder = {
  sort: z.union([z.string(), z.array(z.string())]).optional(),
  sortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  limit: z.number().nullish(),
  manualOrder: z.array(z.number().int()).optional(),
};

export const ShelfSourceSchema: z.ZodType<ShelfSource> = z.lazy(() => z.union([
  z.object({ type: z.literal("collection"), collectionId: z.string(), childFilter: FilterGroupSchema.optional(), ...sourceOrder }),
  z.object({ type: z.literal("tab"), tab: z.string().min(1), childFilter: FilterGroupSchema.optional(), ...sourceOrder }),
  z.object({ type: z.literal("filter"), filter: FilterSchema.default({}), ...sourceOrder }),
  z.object({ type: z.literal("external"), sourceId: z.string().min(1), ...sourceOrder }),
  z.object({ type: z.literal("builtin"), sourceId: z.string().min(1), ...sourceOrder }),
  z.object({ type: z.literal("smart"), mode: SmartShelfModeSchema, ...sourceOrder }),
  z.object({ type: z.literal("wishlist"), childFilter: FilterGroupSchema.optional(), excludeOwned: legacyBool().optional(), excludeOwnedNonSteam: legacyBool().optional(), hideOwnedNonSteamCloud: legacyBool().optional(), ...sourceOrder }),
  z.object({ type: z.literal("store"), childFilter: FilterGroupSchema.optional(), excludeOwned: legacyBool().optional(), excludeOwnedNonSteam: legacyBool().optional(), hideOwnedNonSteamCloud: legacyBool().optional(), ...sourceOrder }),
  z.object({ type: z.literal("composite"), combine: z.enum(["union", "intersection"]), sources: z.array(ShelfSourceSchema), childFilter: FilterGroupSchema.optional(), ...sourceOrder }),
]) as unknown as z.ZodType<ShelfSource>);
export type ShelfFilter = z.infer<typeof FilterSchema>;

// When both text and image are set, image wins.
function normalizeCardContent(out: any): void {
  if (typeof out.text === "string" && out.text.length === 0) out.text = undefined;
  if (typeof out.image === "string" && out.image.length === 0) out.image = undefined;
  if (typeof out.heroImage === "string" && out.heroImage.length === 0) out.heroImage = undefined;
  if (out.text !== undefined && out.image !== undefined) out.text = undefined;
}

function sanitizeCardLink(out: any, hasContent: boolean): void {
  if (!out.link) return;
  if (!hasContent) { out.link = undefined; return; }
  if (out.link.type !== "url") return;
  const raw = String(out.link.value ?? "").trim();
  const url = /^https?:\/\//i.test(raw) ? raw : (raw ? `https://${raw}` : "");
  try { if (url) new URL(url); else throw new Error(); }
  catch { out.link = undefined; }
}

export const ShelfSchema = z.object({
  id: z.string().min(1).max(64),
  updatedAt: z.number().int().nonnegative().optional(),
  title: z.string().min(1).max(64),
  enabled: legacyBool().default(true),
  hidden: legacyBool().default(false),
  limit: z.number().int().min(1).max(100).default(20),
  sort: ShelfSortSchema.optional(),
  sortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  manualOrder: z.array(z.number().int()).optional(),
  manualBaseSort: ManualBaseSortSchema.optional(),
  manualBaseSortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  ...shelfVisualFields(true),
  heroEnabled: legacyBool().optional(),
  gameInfoAbove: legacyBool().optional(),
  friendsPlayingOverlay: legacyBool().optional(),
  friendsPlayingOverlayRecent: legacyBool().optional(),
  dedupeByExactName: legacyBool().optional(),
  hiddenAppIds: z.array(z.number().int()).optional(),
  source: ShelfSourceSchema,
  syntheticCards: z.array(
    z.object({
      position: z.number().int().min(0),
      image: z.string().optional(),
      text: z.string().max(64).optional(),
      link: z.object({
        type: z.enum(["app", "url"]),
        value: z.string().min(1),
      }).optional(),
      size: z.enum(["normal", "featured"]).default("normal"),
      alpha: z.number().min(0).max(1).optional(),
      placeholder: legacyBool().optional(),
      heroImage: z.string().optional(),
      shadowMode: z.enum(["never", "onFocus", "always"]).optional(),
    }).transform((c) => {
      // Sanitize rather than reject: a validation failure would drop every shelf on boot.
      const out: any = { ...c };
      normalizeCardContent(out);
      const hasContent = out.text !== undefined || out.image !== undefined;
      sanitizeCardLink(out, hasContent);
      return out;
    })
  ).optional(),
  visibility: VisibilitySchema.optional(),
  autoPin: VisibilitySchema.optional(),
  autoCollapse: VisibilitySchema.optional(),
  autoCollapseWhenEmpty: legacyBool().optional(),
}).passthrough();

export type Shelf = z.infer<typeof ShelfSchema>;

export const SettingsSchema = z.object({
  // Never downgraded, so a newer version's fields survive.
  schemaVersion: z.number().int().nonnegative().nullish(),
  // Matches the Python sanitizer and the defaults: off until the user turns it on.
  enabled: z.boolean().default(false),
  hideRecents: z.boolean().default(false),
  recentsReplaceSource: z.boolean().default(false),
  hideHomeTabs: z.boolean().default(false),
  shelfHeroBackground: z.boolean().default(false),
  gameContextMenuEnabled: z.boolean().default(true),
  globalMatchNativeSize: z.boolean().default(false),
  globalHighlightFirst: z.boolean().default(false),
  globalHighlightAll: z.boolean().default(false),
  globalHighlightRandom: z.boolean().optional(),
  globalEnableLogo: z.boolean().optional(),
  globalEnableIcon: z.boolean().optional(),
  globalEnableDescription: z.boolean().optional(),
  globalDescriptionScale: z.number().int().min(100).max(200).nullable().optional(),
  globalDescriptionBelowLogo: z.boolean().optional(),
  globalLogoBelowShelf: z.boolean().optional(),
  globalLogoPosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  globalDescriptionPosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  globalLogoSize: z.number().int().min(50).max(200).nullable().optional(),
  globalLogoTopOffset: z.number().int().min(-50).max(100).nullable().optional(),
  globalFullPageShelf: z.boolean().optional(),
  globalIconVerticalAlign: z.enum(['top', 'center', 'bottom']).nullable().optional(),
  globalShelfTitlePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  globalGameNamePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  globalPlaytimePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  globalDescriptionHeight: z.number().int().min(1).max(3).nullable().optional(),
  globalDescriptionLogoGap: z.number().int().min(-40).max(80).nullable().optional(),
  contextSearchEnabled: z.boolean().nullable().optional(),
  contextSearchKeyboardEnabled: z.boolean().nullable().optional(),
  contextSearchOnEnter: z.boolean().nullable().optional(),
  sideNavEnabled: z.boolean().nullable().optional(),
  globalHideStatusLine: z.boolean().default(false),
  globalHideNewBadge: z.boolean().default(false),
  globalHideDiscountBadge: z.boolean().default(false),
  discountBadgeMode: z.enum(["percent", "price", "both", "percent_price"]).nullable().optional(),
  discountBadgeFocusMode: z.enum(["percent", "price", "both", "percent_price"]).nullable().optional(),
  globalHideCompatIcons: z.boolean().default(false),
  globalHideNonSteamBadge: z.boolean().default(false),
  globalHideShelfTitle: z.boolean().default(false),
  globalHideGameNames: z.boolean().default(false),
  globalHideInstallIndicator: z.boolean().default(false),
  globalHideSeeMore: z.boolean().default(false),
  globalHideRefreshCard: z.boolean().default(false),
  globalDedupeByName: z.boolean().default(false),
  globalHeroEnabled: z.boolean().default(false),
  globalGameInfoAbove: z.boolean().default(false),
  globalFriendsPlayingOverlay: z.boolean().default(false),
  globalFriendsPlayingOverlayRecent: z.boolean().default(false),
  shelves: z.array(ShelfSchema).default([]),
  smartShelvesEnabled: z.boolean().default(false),
  smartShelvesAtBottom: z.boolean().default(false),
  smartShelves: z.array(SmartShelfSchema).default([]),
  smartSurpriseMe: z.boolean().default(false),
  smartSurpriseMeCount: z.number().int().min(0).max(5).default(0),
  savedFilters: z.array(SavedFilterSchema).default([]),
  savedSmartFilters: z.array(SavedSmartFilterSchema).default([]),
  // nullable() is required: the Python sanitizer returns null for unset values.
  updateNotifyEnabled: z.boolean().nullable().optional().transform((v) => v ?? true),
  betaChannelEnabled: z.boolean().optional(),
  verboseLoggingEnabled: z.boolean().optional(),
  devModeEnabled: z.boolean().optional(),
  debugOverlayEnabled: z.boolean().optional(),
  debugOverlayCorner: z.enum(["tl", "tr", "bl", "br"]).nullable().optional(),
  debugOverlayVertical: z.boolean().optional(),
  debugOverlayFps: z.boolean().optional(),
  debugOverlayStats: z.boolean().optional(),
  debugOverlayPerShelf: z.boolean().optional(),
  debugOverlayOutlines: z.boolean().optional(),
  debugOverlayFocus: z.boolean().optional(),
  debugOverlayTransparent: z.boolean().optional(),
  updateNotifyDismissedVersion: z.string().nullable().optional(),
  onlineFeaturesEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  onlineWishlistEnabled: z.boolean().nullable().optional().transform((v) => v ?? true),
  onlinePriceSortEnabled: z.boolean().nullable().optional().transform((v) => v ?? true),
  onlinePrivacyAccepted: z.boolean().nullable().optional().transform((v) => v ?? false),
  onlineMetadataEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  onlineHideOwnedGames: z.boolean().nullable().optional().transform((v) => v ?? false),
  onlineHideOwnedNonSteam: z.boolean().nullable().optional().transform((v) => v ?? false),
  // Off so cloud-streaming stubs don't hide their store and wishlist entries.
  onlineHideOwnedNonSteamCloud: z.boolean().nullable().optional().transform((v) => v ?? false),
  forceCssLoaderThemes: z.boolean().nullable().optional().transform((v) => v ?? false),
  ownQamTabEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  // Device-local, never synced, exported or kept in a profile; a bad value is ignored.
  accountSettings: z.any().optional(),
  showcaseModeEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  showcaseStartAfterSeconds: z.number().int().min(15).max(600).nullable().optional().transform((v) => v ?? 60),
  showcaseDwellSeconds: z.number().int().min(3).max(120).nullable().optional().transform((v) => v ?? 10),
  showcaseRandomize: z.boolean().nullable().optional().transform((v) => v ?? false),
  showcaseStopOnInteraction: z.boolean().nullable().optional().transform((v) => v ?? true),
  showcaseShelfIds: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  showcasePanCards: z.boolean().nullable().optional().transform((v) => v ?? true),
  showcaseCardsPerShelf: z.number().int().min(1).max(20).nullable().optional().transform((v) => v ?? 5),
  showcaseCardDwellSeconds: z.number().int().min(1).max(60).nullable().optional().transform((v) => v ?? 4),
  qamHiddenToggles: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  qamHiddenSections: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  unifiedListEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  allShelvesOrder: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  lightModeEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  advancedModeEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  templateSuggestionsEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  removalSuggestionsEnabled: z.boolean().optional(),
  // Suppresses every network call without touching the user's online toggles.
  offlineModeEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  // Reserved: nothing writes it yet; kept because the public API's settings snapshot exposes it.
  featureToggles: z.record(z.string(), z.boolean()).nullable().optional().transform((v) => v ?? {}),
  activeProfileName: z.string().nullable().optional(),
  // Optional rather than defaulted so it stays absent from existing settings.
  profileTriggersEnabled: z.boolean().optional(),
  // The Default profile has no entry in `profiles`, so its trigger lives here.
  factoryProfileTrigger: z.unknown().optional(),
  autoCollapseEnabled: z.boolean().optional(),
  notificationsDisabled: z.boolean().optional(),
  // Suppressed while global notifications stay on; absent means every area notifies.
  notificationsDisabledAreas: z.array(z.string()).nullish(),
  showcaseSeen: z.boolean().optional(),
  setupWizardSeen: z.boolean().optional(),
  lastSetupApply: z.object({
    packId: z.string(),
    at: z.number(),
    addedShelfIds: z.array(z.string()),
    addedSmartIds: z.array(z.string()),
    prevSettings: z.record(z.string(), z.unknown()),
  }).nullish(),
  // Owned by a neutral host; the plugin never reads or edits the values.
  hubConfig: z.object({
    values: z.record(z.string(), z.unknown()),
    updatedAt: z.record(z.string(), z.number()),
  }).nullish(),
  profiles: z.array(z.object({
    id: z.string(),
    updatedAt: z.number().int().nonnegative().optional(),
    name: z.string(),
    createdAt: z.string(),
    snapshot: z.record(z.string(), z.unknown()),
    hidden: z.boolean().optional(),
    linkShelves: z.boolean().optional(),
    // Stored as `unknown`: the rule editor owns the shape and the sanitizer round-trips it.
    trigger: z.unknown().optional(),
  })).nullable().optional().transform((v) => v ?? []),
  // Only opt-outs are stored; a missing key means enabled.
  integrationsEnabled: z.record(z.string(), z.boolean()).nullable().optional().transform((v) => v ?? {}),
  // Off disables the card-action shortcuts only; navigation shortcuts are unaffected.
  cardActionShortcutsEnabled: z.boolean().default(true),
  buttonBindings: z.object({
    cardHideRemove:  z.string().nullable().optional(),
    cardHighlightToggle: z.string().nullable().optional(),
    cardQuickLaunch: z.string().nullable().optional(),
    navSearch:       z.string().optional(),
    navSideNav:      z.string().optional(),
    navSidecarOpen:  z.string().optional(),
    navSidecarClose: z.string().optional(),
  }).nullable().optional().transform((v) => v ?? {}),
  buttonBindingsDisabled: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  keyboardBindings: z.object({
    cardHideRemove:  z.string().nullable().optional(),
    cardHighlightToggle: z.string().nullable().optional(),
    cardQuickLaunch: z.string().nullable().optional(),
    navSearch:       z.string().nullable().optional(),
    navSideNav:      z.string().nullable().optional(),
    navSidecarOpen:  z.string().nullable().optional(),
    navSidecarClose: z.string().nullable().optional(),
  }).nullable().optional().transform((v) => v ?? {}),
  keyboardBindingsDisabled: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  screensaverShelvesEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  screensaverShelvesIncludeScreenshots: z.boolean().nullable().optional().transform((v) => v ?? false),
  screensaverOnlineScreenshotsEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  // Steam's own value before the override, restored when the feature turns off.
  screensaverIdleBackupAcSec: z.number().nullable().optional().transform((v) => v ?? null),
  screensaverIdleBackupBatterySec: z.number().nullable().optional().transform((v) => v ?? null),
  screensaverStartAfterSeconds: z.number().int().min(15).max(600).nullable().optional().transform((v) => v ?? 60),
  screensaverDwellSeconds: z.number().int().min(3).max(120).nullable().optional().transform((v) => v ?? 8),
  screensaverLogoEnabled: z.boolean().nullable().optional().transform((v) => v ?? true),
  screensaverLogoSize: z.number().int().min(50).max(200).nullable().optional().transform((v) => v ?? 100),
  screensaverLogoPosition: z.enum(['left', 'center', 'right']).nullable().optional().transform((v) => v ?? 'left'),
  screensaverLogoAtTop: z.boolean().nullable().optional().transform((v) => v ?? false),
  screensaverLogoOffset: z.number().int().min(0).max(50).nullable().optional().transform((v) => v ?? 8),
  screensaverLogoOnScreenshots: z.boolean().nullable().optional().transform((v) => v ?? true),
  screensaverShelfBatchSize: z.number().int().min(1).max(20).nullable().optional().transform((v) => v ?? 5),
  screensaverDescriptionEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  screensaverDescriptionAboveLogo: z.boolean().nullable().optional().transform((v) => v ?? false),
  screensaverDescriptionLogoGap: z.number().int().min(-40).max(80).nullable().optional().transform((v) => v ?? 10),
  cloudSyncEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  cloudSyncLastSyncedAt: z.number().nullable().optional().transform((v) => v ?? null),
  // Tombstones keep a stale copy from resurrecting a deleted entity.
  syncTombstones: z.record(z.string(), z.number()).nullish(),
  preferencesUpdatedAt: z.number().nullish(),
}).passthrough();

export type Settings = z.infer<typeof SettingsSchema>;

export interface ButtonBindings {
  cardHideRemove?: string | null;
  cardHighlightToggle?: string | null;
  cardQuickLaunch?: string | null;
  navSearch?: string;
  navSideNav?: string;
  navSidecarOpen?: string;
  navSidecarClose?: string;
}

export interface KeyboardBindings {
  cardHideRemove?: string | null;
  cardHighlightToggle?: string | null;
  cardQuickLaunch?: string | null;
  navSearch?: string | null;
  navSideNav?: string | null;
  navSidecarOpen?: string | null;
  navSidecarClose?: string | null;
}
