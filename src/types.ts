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
  "friends",
  "friendsPlayingNow",
  "friendsPlayedRecently",
  "storeTag",
  "achievements",
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
  "familySharing",
  // Filter v3 — param-free predicates (evaluators in steam/v3Extensions.ts).
  "vrSupport",
  "demo",
  "comingSoon",
  "soundtrackOwned",
  "neverCompleted",
  "installedNeverPlayed",
  "compatDataQuality",
  "emuDeckSystem",
  "retroDeckSystem",
  "heroicLauncher",
  "lutrisApp",
  "chiakiApp",
  "moonlightApp",
  "hiddenLauncherShortcuts",
  // Filter v3 — parameterized predicates (editors in FilterItemOptions.tsx).
  "reviewScore",
  "releaseDate",
  "genres",
  "categories",
  "franchise",
  "multiplayerType",
  "dlcOwned",
  "launchCount",
  "avgSessionMinutes",
  "recentlyAbandoned",
  "playedOnce",
  "achievementPercentRange",
  "storageDevice",
  "installedSizeRange",
  "executableType",
  "launchOptionTags",
  "customTags",
  "parserCategories",
  // Filter v3 — composites: combine other filter items (nested editor).
  "weightedFilter",
  "priorityFilter",
  "exclusionGroup",
]);
export type FilterItemType = z.infer<typeof FilterItemTypeSchema>;

// Early imports stored boolean flags as 0/1; read them as booleans so the
// whole document doesn't fail validation over a legacy filter item.
const legacyFlag = (v: unknown) => (v === 1 ? true : v === 0 ? false : v);
// A stored boolean that also reads the legacy 0/1 encoding.
const legacyBool = () => z.preprocess(legacyFlag, z.boolean());

export const FilterItemSchema = z.object({
  type: FilterItemTypeSchema,
  inverted: z.preprocess(legacyFlag, z.boolean().optional()),
  params: z.record(z.string(), z.any()).optional(),
});
export type FilterItem = z.infer<typeof FilterItemSchema>;

export const FilterGroupSchema = z.object({
  mode: z.enum(["and", "or"]).default("and"),
  items: z.array(FilterItemSchema).default([]),
});
export type FilterGroup = z.infer<typeof FilterGroupSchema>;

// --- Visibility Rules v2 ---
/* A predicate tree generalising the legacy `visibleHours`/`visibleDaysOfWeek`
   windows: each rule is one condition, combined per `mode` ('any'=OR, 'all'=AND).
   Ships time/day kinds; device kinds slot into the same union later. The schema
   is permissive (`kind` + passthrough) so a newer build's rule round-trips through
   an older sanitizer. Legacy fields still apply when `visibility` is absent. */
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
  // Per-entity sync clock (ms). Stamped centrally on edit; drives the
  // per-id last-writer-wins merge across devices. See settingsMerge.ts.
  updatedAt: z.number().int().nonnegative().optional(),
});
export type SavedFilter = z.infer<typeof SavedFilterSchema>;

/* saved smart shelf templates. Mirrors SavedFilter but
   captures every knob a smart shelf carries (mode + smartParams +
   optional refinements). Stored at settings level; readable via
   `window.deckShelves.api.getSavedSmartFilters()` so external plugins
   can reuse them. */
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
  // Same shape as SmartShelf.visibleHours so a saved entry round-trips
  // cleanly through apply / save without lossy conversion. Array of
  // { start, end, days? } ranges; OR-combined; days optional per range.
  visibleHours: z.array(z.object({
    start: z.number().int().min(0).max(23),
    end: z.number().int().min(0).max(23),
    days: z.array(z.number().int().min(0).max(6)).optional(),
  })).optional(),
  visibleDaysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  // Round-trips the Visibility Rules v2 tree (same shape as SmartShelf.visibility).
  visibility: VisibilitySchema.optional(),
});
export type SavedSmartFilter = z.infer<typeof SavedSmartFilterSchema>;

// --- Legacy flat filter schema (kept for backwards compatibility) ---

export const FilterSchema = z.object({
  // Legacy fields
  favorites: legacyBool().optional(),
  hidden: z.union([legacyBool(), z.literal("only")]).optional(),
  nonSteam: legacyBool().optional(),
  installed: legacyBool().optional(),
  playedWithinDays: z.number().int().positive().optional(),
  nameIncludes: z.string().optional(),
  nameRegex: z.string().optional(),
  deckCompatibility: z.array(z.enum(["verified", "playable", "unsupported", "unknown"])).optional(),
  /* Allow known sort enums but accept unknown strings for forward compatibility.
     String OR array-of-strings: when array, sorts apply as primary, secondary,
     tertiary keys (stable chain via right-to-left iteration in
     `applySortToIds`). Single-key shelves keep writing the string form for
     back-compat with older readers. */
  sort: z.union([
    z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score"]),
    z.string(),
    z.array(z.union([
      z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score"]),
      z.string(),
    ])),
  ]).optional(),
  /* When true, reverse the sort result. Ignored for `manual` and `random`
     (re-orderings would be meaningless). Default false.
     Boolean OR array-of-booleans: per-key reverse aligned with the sort
     array. When sort is a string and sortReverse is an array (or vice versa),
     the union is treated as if the missing axis were repeated for every key. */
  sortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  minPlaytimeMinutes: z.number().int().min(0).optional(),
  maxPlaytimeMinutes: z.number().int().min(0).optional(),
  updatePending: legacyBool().optional(),
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
  "soundtracks",
  "videos",
  "demos",
  "cloud_games",
  // v2 heuristic templates (see src/steam/heuristics.ts).
  "backlog_rescue",
  "forgotten_gems",
  "weekly_rotation",
  // v2 heuristic templates — second wave (composes existing AppOverview
  // signals: playtime, last_played, deck_compatibility_category, size_on_disk,
  // review_percentage, rt_purchased_time). No new backend signals needed.
  "short_battery",
  "long_session_night",
  "travel_mode",
  "hidden_gems",
  "never_touched_classics",
  "recent_hidden_installs",
  "monthly_spotlight",
  "seasonal_rotation",
  /* Battery-aware template: only resolves to its candidate pool when the
     device is actually on battery below the threshold. When battery is OK
     / charging / unknown, the resolver returns the same candidates as
     short_battery (Deck-friendly + small) so the shelf isn't empty. */
  "low_battery_mode",
  // Achievement-aware: nearly-complete achievement progress per app.
  // Best-effort against SteamClient.Apps appDetails; returns empty when
  // achievement data isn't reachable.
  "almost_finished",
  // store_categories-aware: local multi-player / co-op / party. Best-effort
  // against SteamClient.Apps.RegisterForAppDetails(.vecCategories); returns
  // empty when category data isn't reachable.
  "couch_gaming",
  "coop_ready",
  "party_games",
  /* Online-gated runtime template: reads Steam friends presence via
     `friendStore.allFriends`. Returns empty when onlineFeaturesEnabled is
     off (reuses the existing master toggle — no new toggle needed since
     friends presence is conceptually network-sourced). */
  "friends_playing",
  "custom",
]);
export type SmartShelfMode = z.infer<typeof SmartShelfModeSchema>;

/* Sort keys shared by regular and smart shelves: a single key, a free-form
   key (external sort providers) or a multi-key chain with the same members. */
const SORT_KEYS = ["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual", "price_low", "discount_high", "original_price_high"] as const;
const ShelfSortSchema = z.union([
  z.enum(SORT_KEYS),
  z.string(),
  z.array(z.union([z.enum(SORT_KEYS), z.string()])),
]);
// Base order under a manual override: the same keys minus "manual" itself and the store sorts.
const MANUAL_BASE_SORT_KEYS = ["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random"] as const;
const ManualBaseSortSchema = z.union([
  z.enum(MANUAL_BASE_SORT_KEYS),
  z.string(),
  z.array(z.union([z.enum(MANUAL_BASE_SORT_KEYS), z.string()])),
]);

type LegacyBool = ReturnType<typeof legacyBool>;
type VisualFlag<D extends boolean> = D extends true ? z.ZodDefault<LegacyBool> : z.ZodOptional<LegacyBool>;

/* The visual customization surface both shelf kinds share, built once: the
   regular shelf defaults its boolean flags to false, the smart shelf leaves them
   optional (`defaulted`). Same fields, same order, so persisted key order is unchanged. */
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
  /* Optional user overrides — apply on top of the mode's built-in behavior.
     `sort` overrides the mode's default ordering (supports the same values as
     regular shelves, including "manual" + `manualOrder` / `manualBaseSort`).
     `filterGroup` narrows the mode's candidate pool with additional filters. */
  sort: ShelfSortSchema.optional(),
  // When true, reverse the sort result (asc/desc toggle). Ignored for
  // `manual` and `random`. Default false. Array form is per-key reverse
  // aligned with the `sort` array; see FilterSchema.sortReverse.
  sortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  manualOrder: z.array(z.number().int()).optional(),
  /* Base sort applied to the rows NOT covered by `manualOrder` when
     sort === "manual". Accepts a single key OR a multi-key chain so the
     user can have e.g. recent + alphabetical tiebreaker as the base
     order under a manual override. */
  manualBaseSort: ManualBaseSortSchema.optional(),
  // Reverse flag for the manual base sort. Mirrors `sortReverse`: boolean
  // applies uniformly, `boolean[]` aligned with the multi-key chain.
  manualBaseSortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  filterGroup: FilterGroupSchema.optional(),
  // Visual overrides — the regular-shelf customization surface, shared (see shelfVisualFields).
  ...shelfVisualFields(false),
  // Per-shelf hero opt-in (same semantics as the regular Shelf flag).
  heroEnabled: legacyBool().optional(),
  // Per-shelf: render the focused game's info (name, playtime, …) above the
  // cards in a full-page layout. Decoupled from any theme — pure opt-in.
  gameInfoAbove: legacyBool().optional(),
  // Per-shelf: overlay friend avatar(s) + "N friends playing" on cards where a
  // Steam friend is in the game. `Recent` widens to the 14-day lookback.
  friendsPlayingOverlay: legacyBool().optional(),
  friendsPlayingOverlayRecent: legacyBool().optional(),
  dedupeByExactName: legacyBool().optional(),
  hiddenAppIds: z.array(z.number().int()).optional(),
  // Optional refresh cadence in minutes. When unset the resolver uses its
  // default 60-minute TTL; otherwise the cached result is reused for
  // `refreshIntervalMinutes * 60 * 1000` ms. Capped at 30 days.
  refreshIntervalMinutes: z.number().int().min(1).max(43200).optional(),
  // Per-mode tuning knobs for the heuristic resolvers. Keys are mode-specific
  // (see `SMART_PARAM_META` in `src/steam/smartParams.ts`); values are
  // numbers. Missing entries fall back to the resolver's hardcoded defaults.
  smartParams: z.record(z.string(), z.number()).optional(),
  // Source mixing for smart shelves: when populated, the resolver evaluates
  // each `compositeModes` entry independently (each shares the parent's
  /* `smartParams`) and merges the results per `compositeCombine`. The
     primary `mode` is treated as the first item of the composite so older
     clients that don't read these fields keep getting the single-mode
     behaviour. Mirrors regular `ShelfSource = "composite"` semantics so
     both shelf kinds expose the same mental model. */
  compositeModes: z.array(SmartShelfModeSchema).max(5).optional(),
  compositeCombine: z.enum(["union", "intersection"]).optional(),
  // Optional visibility windows. When non-empty, the shelf only appears
  /* when the current local time falls inside ANY of the ranges (OR across
     the array). Each range has `start`/`end` hours in `[0, 23]`. Empty
     array = no window restriction (same as `undefined`). For backwards
     compatibility the sanitizer also accepts a single `{ start, end }`
     object and migrates it to a one-element array. */
  visibleHours: z.array(z.object({
    start: z.number().int().min(0).max(23),
    end: z.number().int().min(0).max(23),
    days: z.array(z.number().int().min(0).max(6)).optional(),
  })).optional(),
  // Optional restriction to specific weekdays. 0 = Sunday … 6 = Saturday.
  // Empty array is treated as "no restriction" (same as undefined). Duplicates
  // are stripped by the sanitizer.
  visibleDaysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  // Visibility Rules v2 — a predicate tree that supersedes visibleHours /
  // visibleDaysOfWeek when present with rules; the legacy fields still apply
  // when this is absent (see `evalVisibility` in steam/smartShelves.ts).
  visibility: VisibilitySchema.optional(),
  autoPin: VisibilitySchema.optional(),
  autoCollapse: VisibilitySchema.optional(),
  autoCollapseWhenEmpty: legacyBool().optional(),
}).passthrough();
export type SmartShelf = z.infer<typeof SmartShelfSchema>;

// `composite` is recursive (a composite source contains other sources,
// which themselves can be composite). Zod requires `z.lazy()` to break
// the self-reference at definition time. Because Zod can't infer the
/* type through a lazy schema, the type is declared explicitly first and
   the schema is constrained with `ZodType<ShelfSource>`. Depth is
   bounded at resolve time (`MAX_COMPOSITE_DEPTH` in `steam/index.ts`);
   the schema accepts arbitrary nesting so power users editing JSON can
   go deeper than the editor exposes. */
export type ShelfSource =
  | { type: "collection"; collectionId: string; childFilter?: FilterGroup }
  | { type: "tab"; tab: string; childFilter?: FilterGroup }
  | { type: "filter"; filter: ShelfFilter }
  | { type: "external"; sourceId: string }
  | { type: "builtin"; sourceId: string }
  | { type: "smart"; mode: SmartShelfMode }
  | { type: "wishlist"; childFilter?: FilterGroup; excludeOwned?: boolean; excludeOwnedNonSteam?: boolean; hideOwnedNonSteamCloud?: boolean }
  | { type: "store"; childFilter?: FilterGroup; excludeOwned?: boolean; excludeOwnedNonSteam?: boolean; hideOwnedNonSteamCloud?: boolean }
  | { type: "composite"; combine: "union" | "intersection"; sources: ShelfSource[]; childFilter?: FilterGroup };

export const ShelfSourceSchema: z.ZodType<ShelfSource> = z.lazy(() => z.union([
  z.object({ type: z.literal("collection"), collectionId: z.string(), childFilter: FilterGroupSchema.optional() }),
  z.object({ type: z.literal("tab"), tab: z.string().min(1), childFilter: FilterGroupSchema.optional() }),
  z.object({ type: z.literal("filter"), filter: FilterSchema.default({}) }),
  z.object({ type: z.literal("external"), sourceId: z.string().min(1) }),
  z.object({ type: z.literal("builtin"), sourceId: z.string().min(1) }),
  z.object({ type: z.literal("smart"), mode: SmartShelfModeSchema }),
  z.object({ type: z.literal("wishlist"), childFilter: FilterGroupSchema.optional(), excludeOwned: legacyBool().optional(), excludeOwnedNonSteam: legacyBool().optional(), hideOwnedNonSteamCloud: legacyBool().optional() }),
  z.object({ type: z.literal("store"), childFilter: FilterGroupSchema.optional(), excludeOwned: legacyBool().optional(), excludeOwnedNonSteam: legacyBool().optional(), hideOwnedNonSteamCloud: legacyBool().optional() }),
  z.object({ type: z.literal("composite"), combine: z.enum(["union", "intersection"]), sources: z.array(ShelfSourceSchema), childFilter: FilterGroupSchema.optional() }),
]) as unknown as z.ZodType<ShelfSource>);
export type ShelfFilter = z.infer<typeof FilterSchema>;

// Empty content strings → undefined; when both text and image are set, image
// wins (text dropped). Mutates the synthetic-card draft in place.
function normalizeCardContent(out: any): void {
  if (typeof out.text === "string" && out.text.length === 0) out.text = undefined;
  if (typeof out.image === "string" && out.image.length === 0) out.image = undefined;
  if (typeof out.heroImage === "string" && out.heroImage.length === 0) out.heroImage = undefined;
  if (out.text !== undefined && out.image !== undefined) out.text = undefined;
}

// Drop a decoration card's link when it has no content, and for URL links
// normalise/validate the target (adding https://), dropping an invalid one.
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
  // When true, reverse the sort result (asc/desc toggle). Ignored for
  // `manual` and `random`. Default false. Array form is per-key reverse
  // aligned with the `sort` array; see FilterSchema.sortReverse.
  sortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  manualOrder: z.array(z.number().int()).optional(),
  // Base sort used to order items NOT covered by `manualOrder` when `sort === "manual"`.
  /* Defaults to "alphabetical" when absent; must not be "manual" itself.
     Base sort applied to the rows NOT covered by `manualOrder` when
     sort === "manual". Accepts a single key OR a multi-key chain so the
     user can have e.g. recent + alphabetical tiebreaker as the base
     order under a manual override. */
  manualBaseSort: ManualBaseSortSchema.optional(),
  // Reverse flag for the manual base sort. Mirrors `sortReverse`: boolean
  // applies uniformly, `boolean[]` aligned with the multi-key chain.
  manualBaseSortReverse: z.union([legacyBool(), z.array(legacyBool())]).optional(),
  ...shelfVisualFields(true),
  /* Per-shelf "Enable hero art" toggle. When true, focusing any card in this
     shelf paints the hero image (same overlay used by the global
     `shelfHeroBackground`) tied to the focused appid. Independent of
     `hideRecents` — a regular shelf below the native recents row can opt in. */
  heroEnabled: legacyBool().optional(),
  // Per-shelf: render the focused game's info (name, playtime, …) above the
  // cards in a full-page layout. Decoupled from any theme — pure opt-in.
  gameInfoAbove: legacyBool().optional(),
  // Per-shelf: overlay friend avatar(s) + "N friends playing" on cards where a
  // Steam friend is in the game. `Recent` widens to the 14-day lookback.
  friendsPlayingOverlay: legacyBool().optional(),
  friendsPlayingOverlayRecent: legacyBool().optional(),
  dedupeByExactName: legacyBool().optional(),
  hiddenAppIds: z.array(z.number().int()).optional(),
  source: ShelfSourceSchema,
  // Decoration/gap cards pinned at fixed slots; rules in superRefine.
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
      /* Decoration hero — when set, the synthetic card behaves as a
         hero source: while focused, this image fills the per-shelf
         hero background (same path PerShelfHero uses for game cards).
         No effect when empty or when the shelf has hero off. */
      heroImage: z.string().optional(),
      /* Shadow render mode for focusable (linked) decoration cards.
         "never" (default) keeps the prior `.ds-card--synthetic-noshadow`
         behaviour; "always" paints the card-frame drop shadow in every
         state; "onFocus" only paints it while the card is focused.
         Non-focusable cards always render with no shadow regardless. */
      shadowMode: z.enum(["never", "onFocus", "always"]).optional(),
    }).transform((c) => {
      // Sanitise rather than reject — failing validation nuked shelves
      // on boot. Empty strings → undefined; text+image → image wins;
      // link without text/image or with invalid URL → drop link.
      const out: any = { ...c };
      normalizeCardContent(out);
      const hasContent = out.text !== undefined || out.image !== undefined;
      sanitizeCardLink(out, hasContent);
      return out;
    })
  ).optional(),
  // Visibility Rules v2 — per-shelf predicate tree (see evalVisibility). Regular
  // shelves gain visibility windows here; absent = always visible (unchanged).
  visibility: VisibilitySchema.optional(),
  // Auto-pin: when this predicate matches, the shelf floats to the top of the
  // home (reverts when it clears). Same tree shape as visibility.
  autoPin: VisibilitySchema.optional(),
  // Auto-collapse: when this predicate matches (or, with autoCollapseWhenEmpty,
  // when the shelf resolves to 0 games), the shelf renders collapsed to its
  // header. Gated by the global `autoCollapseEnabled` toggle.
  autoCollapse: VisibilitySchema.optional(),
  autoCollapseWhenEmpty: legacyBool().optional(),
}).passthrough();

export type Shelf = z.infer<typeof ShelfSchema>;

export const SettingsSchema = z.object({
  // Document schema version (§4B). Stamped by migrate(); older versions never
  // downgrade it, so a newer version's higher-schema fields are preserved.
  schemaVersion: z.number().int().nonnegative().nullish(),
  /* `false` matches the Python sanitizer + `domain/defaults.ts` — the
     plugin ships disabled until the user turns it on. Was `true` here,
     diverging from both: a document reaching `.parse()` without an
     `enabled` key (partial import, cross-host document) would silently
     auto-enable on the frontend while staying disabled on the backend. */
  enabled: z.boolean().default(false),
  hideRecents: z.boolean().default(false),
  recentsReplaceSource: z.boolean().default(false),
  hideHomeTabs: z.boolean().default(false),
  shelfHeroBackground: z.boolean().default(false),
  // Gates the "Shelf" group (sort/management/display/visual/decoration/
  // compose-with) in each game's native right-click context menu.
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
  globalHideCompatIcons: z.boolean().default(false),
  globalHideNonSteamBadge: z.boolean().default(false),
  globalHideShelfTitle: z.boolean().default(false),
  globalHideGameNames: z.boolean().default(false),
  globalHideInstallIndicator: z.boolean().default(false),
  globalHideSeeMore: z.boolean().default(false),
  globalHideRefreshCard: z.boolean().default(false),
  globalDedupeByName: z.boolean().default(false),
  globalHeroEnabled: z.boolean().default(false),
  // Global default for "show game info above the cards" (per-shelf can override).
  globalGameInfoAbove: z.boolean().default(false),
  // Global default for the "friends playing" card overlay (per-shelf can
  // override); `Recent` widens it to the 14-day lookback.
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
  /* `nullable()` is mandatory: the Python sanitizer in `main.py` returns `null`
     for these when the user hasn't set them, and Zod's `optional()` alone
     rejects null — which previously failed `safeParse` on the entire Settings
     object and silently reset every shelf to defaults on the next load. */
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
  // When TRUE, cloud-play non-Steam entries count as owned (their store
  // matches are hidden). Default FALSE so cloud-streaming catalogue stubs
  // (e.g. Xbox Cloud Gaming) don't hide their store/wishlist promotions.
  onlineHideOwnedNonSteamCloud: z.boolean().nullable().optional().transform((v) => v ?? false),
  forceCssLoaderThemes: z.boolean().nullable().optional().transform((v) => v ?? false),
  /* The plugin's own Quick Access tab under the plugin loader alone (opt-in,
     experimental, per device). Has no effect when a neutral host shows its own
     Deck Shelves tab (runtime/ownQamTab.ts). */
  ownQamTabEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  /* Settings per Steam account (domain/accountBuckets.ts): which account the top
     level belongs to and the other accounts' own fields. Device-local, never
     synced, exported or kept in a profile. Read leniently: a bad value is ignored. */
  accountSettings: z.any().optional(),
  /* Showcase / Dynamic Idle Mode — cycles attention through the user's own
     shelves during Home inactivity; any real interaction stops it instantly.
     Off by default. Empty `showcaseShelfIds` means every currently-visible
     shelf participates (no picker UI yet — MVP scope). */
  showcaseModeEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  showcaseStartAfterSeconds: z.number().int().min(15).max(600).nullable().optional().transform((v) => v ?? 60),
  showcaseDwellSeconds: z.number().int().min(3).max(120).nullable().optional().transform((v) => v ?? 10),
  showcaseRandomize: z.boolean().nullable().optional().transform((v) => v ?? false),
  showcaseStopOnInteraction: z.boolean().nullable().optional().transform((v) => v ?? true),
  showcaseShelfIds: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  /* Within-shelf panning: when on, the cycle also walks across a shelf's cards
     before advancing, instead of only landing on each shelf's first card. On
     by default. `showcaseCardsPerShelf` caps cards visited per shelf;
     `showcaseCardDwellSeconds` is the shorter per-card dwell. */
  showcasePanCards: z.boolean().nullable().optional().transform((v) => v ?? true),
  showcaseCardsPerShelf: z.number().int().min(1).max(20).nullable().optional().transform((v) => v ?? 5),
  showcaseCardDwellSeconds: z.number().int().min(1).max(60).nullable().optional().transform((v) => v ?? 4),
  // Sidecar "Configurações" — keys de toggles e ids de seções que o
  // usuário escolheu ocultar do painel principal do QAM. Não desliga a
  // funcionalidade, só remove o controle da listagem do QAM.
  qamHiddenToggles: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  qamHiddenSections: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  /* merges regular + smart
     shelves into a single ordered list. Off by default; the order
     array is preserved across mode flips so toggling back doesn't
     wipe it. Render path stays split until PR2. */
  unifiedListEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  allShelvesOrder: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  /* usage profiles. A profile is a settings snapshot the
     user can save, apply, duplicate, delete. `activeProfileName`
     tracks which one (if any) is currently applied so QAM and
     Settings stay in sync. `lightModeEnabled` and `featureToggles`
     are the other surface fields. */
  lightModeEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  // Advanced mode: mutually exclusive with light. Shows Integrations +
  // Advanced tools tabs always; light hides those + shortcuts + statistics.
  advancedModeEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  // Opt-in: surface stats-derived suggestions in the create-shelf template modal.
  templateSuggestionsEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  removalSuggestionsEnabled: z.boolean().optional(),
  /* Offline mode: when ON, suppresses every network call regardless of
     other settings (update check, CDN asset fallbacks, online filters /
     sources / wishlist / price). User toggles remain untouched so
     turning offline off restores their previous online behaviour. */
  offlineModeEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  // Reserved: nothing writes it yet; kept because the public API's settings snapshot exposes it.
  featureToggles: z.record(z.string(), z.boolean()).nullable().optional().transform((v) => v ?? {}),
  activeProfileName: z.string().nullable().optional(),
  /* Master opt-in for Visibility Rules v2 profile triggers. Off by default
     (absent == off): auto-applying a profile mutates global settings, so it
     must be enabled explicitly. Optional (not defaulted) to stay absent from
     existing settings blobs; consumers treat undefined as off. */
  profileTriggersEnabled: z.boolean().optional(),
  /* Trigger predicate for the synthetic "Default" (factory) profile — it has
     no entry in `profiles`, so its auto-apply condition lives here. Same tree
     shape as a profile `trigger`; sanitizer round-trips it. */
  factoryProfileTrigger: z.unknown().optional(),
  autoCollapseEnabled: z.boolean().optional(),
  notificationsDisabled: z.boolean().optional(),
  // Per-area notification opt-outs (e.g. "shelves", "profiles", "filters",
  // "triggers"); an area listed here is suppressed while global notifications
  // are still on. Absent = every area notifies.
  notificationsDisabledAreas: z.array(z.string()).nullish(),
  // Set once the first-run feature showcase has been seen/dismissed; the
  // AboutPage "replay" button clears it back so the tour can be shown again.
  showcaseSeen: z.boolean().optional(),
  // Setup wizard (setup packs / recipes): seen flag + the last apply, kept so
  // the wizard can offer a one-step revert of exactly what it added/changed.
  setupWizardSeen: z.boolean().optional(),
  lastSetupApply: z.object({
    packId: z.string(),
    at: z.number(),
    addedShelfIds: z.array(z.string()),
    addedSmartIds: z.array(z.string()),
    prevSettings: z.record(z.string(), z.unknown()),
  }).nullish(),
  // Opaque entity a neutral host stores to carry its OWN config across the
  // user's devices on the plugin's sync (per-key last-writer-wins by
  // `updatedAt`). The plugin never reads or edits the values.
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
    // Hidden profiles stay in the list (crossed-out eye) but are omitted
    // from the quick-select dropdown.
    hidden: z.boolean().optional(),
    // Applying a linked profile also applies its shelves (otherwise the
    // current shelves are kept).
    linkShelves: z.boolean().optional(),
    // VisibilityRule predicate that auto-
    /* applies the profile when its predicate becomes true (battery
       low, plugged in, external display, performance threshold, etc.).
       Evaluated by runtime/profileTriggers.ts. Stored as `unknown` because
       the rule shape belongs to the rule editor — the sanitizer round-trips
       it verbatim. */
    trigger: z.unknown().optional(),
  })).nullable().optional().transform((v) => v ?? []),
  // Integrations detail panel per-row toggle. Keys are
  /* integration ids (descriptor `id` fields registered through the
     public Plugin API); value `false` opts the user out of seeing
     that integration's contributions at runtime. Default behaviour
     is "enabled" — entries are only persisted when the user flips
     one off. */
  integrationsEnabled: z.record(z.string(), z.boolean()).nullable().optional().transform((v) => v ?? {}),
  /* Master switch for the card-action shortcuts (cardHideRemove/
     cardHighlightToggle/cardQuickLaunch, gamepad and keyboard alike) below —
     off means resolveBindings()/resolveKeyboardBindings() return null for
     those three regardless of the individual combo/disabled-list state.
     Navigation shortcuts (navSearch/navSideNav/navSidecar*) are unaffected. */
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
  /* Keyboard equivalent of buttonBindings — an independent, optional
     second trigger per action (either input fires the same action).
     Every field is nullable since, unlike gamepad bindings, none has
     a default. */
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
  /* Deck Shelves' own idle screensaver (native recents + shelf games,
     optionally shelves-only and/or including screenshots), replacing
     Steam's native one while active. Experimental — defaults off. */
  screensaverShelvesEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  screensaverShelvesIncludeScreenshots: z.boolean().nullable().optional().transform((v) => v ?? false),
  // Store screenshots for apps already in the screensaver's pool, fetched
  // online — separate from the local-capture toggle above. Requires
  // `onlineFeaturesEnabled` too (see src/runtime/screensaverInject.ts).
  screensaverOnlineScreenshotsEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  /* Steam's own idle-screensaver timeout (seconds), cached here right
     before we override it so it can be restored exactly when the
     feature is turned off. null = not currently overridden. */
  screensaverIdleBackupAcSec: z.number().nullable().optional().transform((v) => v ?? null),
  screensaverIdleBackupBatterySec: z.number().nullable().optional().transform((v) => v ?? null),
  // Own idle/dwell timing — independent of Steam's cached value above.
  screensaverStartAfterSeconds: z.number().int().min(15).max(600).nullable().optional().transform((v) => v ?? 60),
  screensaverDwellSeconds: z.number().int().min(3).max(120).nullable().optional().transform((v) => v ?? 8),
  screensaverLogoEnabled: z.boolean().nullable().optional().transform((v) => v ?? true),
  screensaverLogoSize: z.number().int().min(50).max(200).nullable().optional().transform((v) => v ?? 100),
  screensaverLogoPosition: z.enum(['left', 'center', 'right']).nullable().optional().transform((v) => v ?? 'left'),
  screensaverLogoAtTop: z.boolean().nullable().optional().transform((v) => v ?? false),
  screensaverLogoOffset: z.number().int().min(0).max(50).nullable().optional().transform((v) => v ?? 8),
  screensaverLogoOnScreenshots: z.boolean().nullable().optional().transform((v) => v ?? true),
  // How many apps to draw per shelf per round-robin round before moving to
  // the next shelf (then screenshots, if enabled) — see buildScreensaverPool.
  screensaverShelfBatchSize: z.number().int().min(1).max(20).nullable().optional().transform((v) => v ?? 5),
  // Description overlay, positioned above/below the logo — mirrors the
  // home's globalEnableDescription / globalDescriptionBelowLogo / gap.
  screensaverDescriptionEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  screensaverDescriptionAboveLogo: z.boolean().nullable().optional().transform((v) => v ?? false),
  screensaverDescriptionLogoGap: z.number().int().min(-40).max(80).nullable().optional().transform((v) => v ?? 10),
  cloudSyncEnabled: z.boolean().nullable().optional().transform((v) => v ?? false),
  // Timestamp of the last cloud snapshot this device pushed or applied —
  // internal LWW bookkeeping, never synced itself (see cloudSync.ts).
  cloudSyncLastSyncedAt: z.number().nullable().optional().transform((v) => v ?? null),
  /* Cross-device sync bookkeeping (synced). `syncTombstones` maps a deleted
     entity id → deletion time (ms) so a delete propagates and a stale copy
     can't resurrect it; pruned by TTL. `preferencesUpdatedAt` is the LWW clock
     for the scalar/global toggle bag (the non-list settings). */
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
