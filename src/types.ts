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

/* saved smart shelf templates. Mirrors SavedFilter but
   captures every knob a smart shelf carries (mode + smartParams +
   optional refinements). Stored at settings level; readable via
   `window.deckShelves.api.getSavedSmartFilters()` so external plugins
   can reuse them. */
export const SavedSmartFilterSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  mode: z.string().min(1).max(64),
  smartParams: z.record(z.string(), z.number()).optional(),
  filterGroup: FilterGroupSchema.optional(),
  sort: z.union([z.string(), z.array(z.string())]).optional(),
  sortReverse: z.union([z.boolean(), z.array(z.boolean())]).optional(),
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
});
export type SavedSmartFilter = z.infer<typeof SavedSmartFilterSchema>;

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
  sortReverse: z.union([z.boolean(), z.array(z.boolean())]).optional(),
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

export const SmartShelfSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(64),
  mode: SmartShelfModeSchema,
  enabled: z.boolean().default(true),
  hidden: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).optional(),
  /* Optional user overrides — apply on top of the mode's built-in behavior.
     `sort` overrides the mode's default ordering (supports the same values as
     regular shelves, including "manual" + `manualOrder` / `manualBaseSort`).
     `filterGroup` narrows the mode's candidate pool with additional filters. */
  sort: z.union([
    z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual", "price_low", "discount_high", "original_price_high"]),
    z.string(),
    z.array(z.union([
      z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual", "price_low", "discount_high", "original_price_high"]),
      z.string(),
    ])),
  ]).optional(),
  // When true, reverse the sort result (asc/desc toggle). Ignored for
  // `manual` and `random`. Default false. Array form is per-key reverse
  // aligned with the `sort` array; see FilterSchema.sortReverse.
  sortReverse: z.union([z.boolean(), z.array(z.boolean())]).optional(),
  manualOrder: z.array(z.number().int()).optional(),
  /* Base sort applied to the rows NOT covered by `manualOrder` when
     sort === "manual". Accepts a single key OR a multi-key chain so the
     user can have e.g. recent + alphabetical tiebreaker as the base
     order under a manual override. */
  manualBaseSort: z.union([
    z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random"]),
    z.string(),
    z.array(z.union([
      z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random"]),
      z.string(),
    ])),
  ]).optional(),
  // Reverse flag for the manual base sort. Mirrors `sortReverse`: boolean
  // applies uniformly, `boolean[]` aligned with the multi-key chain.
  manualBaseSortReverse: z.union([z.boolean(), z.array(z.boolean())]).optional(),
  filterGroup: FilterGroupSchema.optional(),
  // Visual overrides — mirrored from `ShelfSchema` so smart shelves can
  // share the regular-shelf visual customization surface.
  matchNativeSize: z.boolean().optional(),
  highlightFirst: z.boolean().optional(),
  highlightAll: z.boolean().optional(),
  highlightedAppIds: z.array(z.number().int()).optional(),
  highlightRandom: z.boolean().optional(),
  enableLogo: z.boolean().optional(),
  enableIcon: z.boolean().optional(),
  enableDescription: z.boolean().optional(),
  descriptionBelowLogo: z.boolean().optional(),
  logoBelowShelf: z.boolean().optional(),
  logoPosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  descriptionPosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  logoSize: z.number().int().min(50).max(200).nullable().optional(),
  logoTopOffset: z.number().int().min(-50).max(100).nullable().optional(),
  fullPageShelf: z.boolean().optional(),
  iconVerticalAlign: z.enum(['top', 'center', 'bottom']).nullable().optional(),
  shelfTitlePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  gameNamePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  playtimePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  descriptionHeight: z.number().int().min(1).max(3).nullable().optional(),
  descriptionLogoGap: z.number().int().min(-40).max(80).nullable().optional(),
  hideStatusLine: z.boolean().optional(),
  hideNewBadge: z.boolean().optional(),
  hideDiscountBadge: z.boolean().optional(),
  hideCompatIcons: z.boolean().optional(),
  hideNonSteamBadge: z.boolean().optional(),
  hideShelfTitle: z.boolean().optional(),
  hideGameNames: z.boolean().optional(),
  hideInstallIndicator: z.boolean().optional(),
  hideSeeMore: z.boolean().optional(),
  hideRefreshCard: z.boolean().optional(),
  // Per-shelf hero opt-in (same semantics as the regular Shelf flag).
  heroEnabled: z.boolean().optional(),
  // Per-shelf: render the focused game's info (name, playtime, …) above the
  // cards in a full-page layout. Decoupled from any theme — pure opt-in.
  gameInfoAbove: z.boolean().optional(),
  // Per-shelf: overlay friend avatar(s) + "N friends playing" on cards where a
  // Steam friend is in the game. `Recent` widens to the 14-day lookback.
  friendsPlayingOverlay: z.boolean().optional(),
  friendsPlayingOverlayRecent: z.boolean().optional(),
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
});
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
  | { type: "smart"; mode: SmartShelfMode }
  | { type: "wishlist"; childFilter?: FilterGroup; excludeOwned?: boolean; excludeOwnedNonSteam?: boolean; hideOwnedNonSteamCloud?: boolean }
  | { type: "store"; childFilter?: FilterGroup; excludeOwned?: boolean; excludeOwnedNonSteam?: boolean; hideOwnedNonSteamCloud?: boolean }
  | { type: "composite"; combine: "union" | "intersection"; sources: ShelfSource[]; childFilter?: FilterGroup };

export const ShelfSourceSchema: z.ZodType<ShelfSource> = z.lazy(() => z.union([
  z.object({ type: z.literal("collection"), collectionId: z.string(), childFilter: FilterGroupSchema.optional() }),
  z.object({ type: z.literal("tab"), tab: z.string().min(1), childFilter: FilterGroupSchema.optional() }),
  z.object({ type: z.literal("filter"), filter: FilterSchema.default({}) }),
  z.object({ type: z.literal("external"), sourceId: z.string().min(1) }),
  z.object({ type: z.literal("smart"), mode: SmartShelfModeSchema }),
  z.object({ type: z.literal("wishlist"), childFilter: FilterGroupSchema.optional(), excludeOwned: z.boolean().optional(), excludeOwnedNonSteam: z.boolean().optional(), hideOwnedNonSteamCloud: z.boolean().optional() }),
  z.object({ type: z.literal("store"), childFilter: FilterGroupSchema.optional(), excludeOwned: z.boolean().optional(), excludeOwnedNonSteam: z.boolean().optional(), hideOwnedNonSteamCloud: z.boolean().optional() }),
  z.object({ type: z.literal("composite"), combine: z.enum(["union", "intersection"]), sources: z.array(ShelfSourceSchema), childFilter: FilterGroupSchema.optional() }),
]) as unknown as z.ZodType<ShelfSource>);
export type ShelfFilter = z.infer<typeof FilterSchema>;

export const ShelfSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  hidden: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
  sort: z.union([
    z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual", "price_low", "discount_high", "original_price_high"]),
    z.string(),
    z.array(z.union([
      z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual", "price_low", "discount_high", "original_price_high"]),
      z.string(),
    ])),
  ]).optional(),
  // When true, reverse the sort result (asc/desc toggle). Ignored for
  // `manual` and `random`. Default false. Array form is per-key reverse
  // aligned with the `sort` array; see FilterSchema.sortReverse.
  sortReverse: z.union([z.boolean(), z.array(z.boolean())]).optional(),
  manualOrder: z.array(z.number().int()).optional(),
  // Base sort used to order items NOT covered by `manualOrder` when `sort === "manual"`.
  /* Defaults to "alphabetical" when absent; must not be "manual" itself.
     Base sort applied to the rows NOT covered by `manualOrder` when
     sort === "manual". Accepts a single key OR a multi-key chain so the
     user can have e.g. recent + alphabetical tiebreaker as the base
     order under a manual override. */
  manualBaseSort: z.union([
    z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random"]),
    z.string(),
    z.array(z.union([
      z.enum(["alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random"]),
      z.string(),
    ])),
  ]).optional(),
  // Reverse flag for the manual base sort. Mirrors `sortReverse`: boolean
  // applies uniformly, `boolean[]` aligned with the multi-key chain.
  manualBaseSortReverse: z.union([z.boolean(), z.array(z.boolean())]).optional(),
  matchNativeSize: z.boolean().default(false),
  highlightFirst: z.boolean().default(false),
  highlightAll: z.boolean().default(false),
  highlightedAppIds: z.array(z.number().int()).optional(),
  highlightRandom: z.boolean().optional(),
  enableLogo: z.boolean().optional(),
  enableIcon: z.boolean().optional(),
  enableDescription: z.boolean().optional(),
  descriptionBelowLogo: z.boolean().optional(),
  logoBelowShelf: z.boolean().optional(),
  logoPosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  descriptionPosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  logoSize: z.number().int().min(50).max(200).nullable().optional(),
  logoTopOffset: z.number().int().min(-50).max(100).nullable().optional(),
  fullPageShelf: z.boolean().optional(),
  iconVerticalAlign: z.enum(['top', 'center', 'bottom']).nullable().optional(),
  shelfTitlePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  gameNamePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  playtimePosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  descriptionHeight: z.number().int().min(1).max(3).nullable().optional(),
  descriptionLogoGap: z.number().int().min(-40).max(80).nullable().optional(),
  hideStatusLine: z.boolean().default(false),
  hideNewBadge: z.boolean().default(false),
  hideDiscountBadge: z.boolean().default(false),
  hideCompatIcons: z.boolean().default(false),
  hideNonSteamBadge: z.boolean().default(false),
  hideShelfTitle: z.boolean().default(false),
  hideGameNames: z.boolean().default(false),
  hideInstallIndicator: z.boolean().default(false),
  hideSeeMore: z.boolean().default(false),
  hideRefreshCard: z.boolean().default(false),
  /* Per-shelf "Enable hero art" toggle. When true, focusing any card in this
     shelf paints the hero image (same overlay used by the global
     `shelfHeroBackground`) tied to the focused appid. Independent of
     `hideRecents` — a regular shelf below the native recents row can opt in. */
  heroEnabled: z.boolean().optional(),
  // Per-shelf: render the focused game's info (name, playtime, …) above the
  // cards in a full-page layout. Decoupled from any theme — pure opt-in.
  gameInfoAbove: z.boolean().optional(),
  // Per-shelf: overlay friend avatar(s) + "N friends playing" on cards where a
  // Steam friend is in the game. `Recent` widens to the 14-day lookback.
  friendsPlayingOverlay: z.boolean().optional(),
  friendsPlayingOverlayRecent: z.boolean().optional(),
  dedupeByExactName: z.boolean().optional(),
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
      placeholder: z.boolean().optional(),
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
      if (typeof out.text === "string" && out.text.length === 0) out.text = undefined;
      if (typeof out.image === "string" && out.image.length === 0) out.image = undefined;
      if (typeof out.heroImage === "string" && out.heroImage.length === 0) out.heroImage = undefined;
      if (out.text !== undefined && out.image !== undefined) out.text = undefined;
      const hasContent = out.text !== undefined || out.image !== undefined;
      if (out.link) {
        if (!hasContent) {
          out.link = undefined;
        } else if (out.link.type === "url") {
          const raw = String(out.link.value ?? "").trim();
          const url = /^https?:\/\//i.test(raw) ? raw : (raw ? `https://${raw}` : "");
          try { if (url) new URL(url); else throw new Error(); }
          catch { out.link = undefined; }
        }
      }
      return out;
    })
  ).optional(),
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
  globalHighlightRandom: z.boolean().optional(),
  globalEnableLogo: z.boolean().optional(),
  globalEnableIcon: z.boolean().optional(),
  globalEnableDescription: z.boolean().optional(),
  globalDescriptionBelowLogo: z.boolean().optional(),
  globalLogoBelowShelf: z.boolean().optional(),
  globalLogoPosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  globalDescriptionPosition: z.enum(['left', 'center', 'right']).nullable().optional(),
  globalLogoSize: z.number().int().min(50).max(200).nullable().optional(),
  globalLogoTopOffset: z.number().int().min(-50).max(100).nullable().optional(),
  globalFullPageShelf: z.boolean().optional(),
  settingsPageEnabled: z.boolean().optional(),
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
  featureToggles: z.record(z.string(), z.boolean()).nullable().optional().transform((v) => v ?? {}),
  activeProfileName: z.string().nullable().optional(),
  profiles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    snapshot: z.record(z.string(), z.unknown()),
    // Hidden profiles stay in the list (crossed-out eye) but are omitted
    // from the quick-select dropdown.
    hidden: z.boolean().optional(),
    // VisibilityRule predicate that auto-
    /* applies the profile when its predicate becomes true (battery
       low, plugged in, external display, performance threshold, etc.).
       Schema accepts the field; the resolver lands with the
       visibility-rules v2 pass. Stored as `unknown` because the rule
       shape belongs to that work — sanitizer round-trips it verbatim. */
    trigger: z.unknown().optional(),
  })).nullable().optional().transform((v) => v ?? []),
  // Integrations detail panel per-row toggle. Keys are
  /* integration ids (descriptor `id` fields registered through the
     public Plugin API); value `false` opts the user out of seeing
     that integration's contributions at runtime. Default behaviour
     is "enabled" — entries are only persisted when the user flips
     one off. */
  integrationsEnabled: z.record(z.string(), z.boolean()).nullable().optional().transform((v) => v ?? {}),
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
});

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
