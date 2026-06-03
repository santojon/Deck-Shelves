import React from "react";
import type { Settings, Shelf, SmartShelf, SavedFilter } from "../types";

const firstRun = __DEV__ && typeof __QA_FIRST_RUN__ !== "undefined" && __QA_FIRST_RUN__;
const qamError = __DEV__ && typeof __QA_QAM_ERROR__ !== "undefined" && __QA_QAM_ERROR__;
const shelfError = __DEV__ && typeof __QA_SHELF_ERROR__ !== "undefined" && __QA_SHELF_ERROR__;
const allShelvesHide = __DEV__ && typeof __QA_ALL_SHELVES_HIDE_RECENTS__ !== "undefined" && __QA_ALL_SHELVES_HIDE_RECENTS__;
const allShelvesShow = __DEV__ && typeof __QA_ALL_SHELVES_SHOW_RECENTS__ !== "undefined" && __QA_ALL_SHELVES_SHOW_RECENTS__;
const allShelvesHideTabs = __DEV__ && typeof __QA_ALL_SHELVES_HIDE_HOME_TABS__ !== "undefined" && __QA_ALL_SHELVES_HIDE_HOME_TABS__;
const allShelvesShowTabs = __DEV__ && typeof __QA_ALL_SHELVES_SHOW_HOME_TABS__ !== "undefined" && __QA_ALL_SHELVES_SHOW_HOME_TABS__;
const forceTabMaster = __DEV__ && typeof __QA_FORCE_TABMASTER__ !== "undefined" ? __QA_FORCE_TABMASTER__ : "";
const forceUnifiDeck = __DEV__ && typeof __QA_FORCE_UNIFIDECK__ !== "undefined" ? __QA_FORCE_UNIFIDECK__ : "";
const forceNonSteamBadges = __DEV__ && typeof __QA_FORCE_NONSTEAMBADGES__ !== "undefined" ? __QA_FORCE_NONSTEAMBADGES__ : "";
const smartShelvesFixture = __DEV__ && typeof __QA_SMART_SHELVES_FIXTURE__ !== "undefined" && __QA_SMART_SHELVES_FIXTURE__;
const savedFiltersFixture = __DEV__ && typeof __QA_SAVED_FILTERS_FIXTURE__ !== "undefined" && __QA_SAVED_FILTERS_FIXTURE__;
const forceHidden = __DEV__ && typeof __QA_FORCE_HIDDEN_SHELF__ !== "undefined" && __QA_FORCE_HIDDEN_SHELF__;
const surpriseMe = __DEV__ && typeof __QA_SMART_SURPRISE_ME__ !== "undefined" && __QA_SMART_SURPRISE_ME__;
const forceCrash = __DEV__ && typeof __QA_FORCE_HOME_CRASH__ !== "undefined" && __QA_FORCE_HOME_CRASH__;
const forceReplaceFailed = __DEV__ && typeof __QA_FORCE_REPLACE_FAILED__ !== "undefined" && __QA_FORCE_REPLACE_FAILED__;
const updateAvailable = __DEV__ && typeof __QA_UPDATE_AVAILABLE__ !== "undefined" && __QA_UPDATE_AVAILABLE__;
const updateDismissed = __DEV__ && typeof __QA_UPDATE_DISMISSED__ !== "undefined" && __QA_UPDATE_DISMISSED__;
const updateOffline = __DEV__ && typeof __QA_UPDATE_OFFLINE__ !== "undefined" && __QA_UPDATE_OFFLINE__;
const collectionEmpty = __DEV__ && typeof __QA_COLLECTION_EMPTY__ !== "undefined" && __QA_COLLECTION_EMPTY__;
const collectionInverted = __DEV__ && typeof __QA_COLLECTION_INVERTED__ !== "undefined" && __QA_COLLECTION_INVERTED__;
const sourcesFixture = __DEV__ && typeof __QA_SOURCES_FIXTURE__ !== "undefined" && __QA_SOURCES_FIXTURE__;
const templatesFixture = __DEV__ && typeof __QA_TEMPLATES_FIXTURE__ !== "undefined" && __QA_TEMPLATES_FIXTURE__;
const stressFixture = __DEV__ && typeof __QA_STRESS_FIXTURE__ !== "undefined" && __QA_STRESS_FIXTURE__;

// Stable fake version surfaced by the update notifier when `qa:update-available`
// is set. Picked far above any real release so semver compare always reports
// "newer" without depending on `pkg.version`.
const QA_FAKE_LATEST_VERSION = "99.0.0";
const QA_FAKE_RELEASE_URL = "https://github.com/santojon/Deck-Shelves/releases/tag/v99.0.0";

if (firstRun || qamError || shelfError || allShelvesHide || allShelvesShow || allShelvesHideTabs || allShelvesShowTabs || forceTabMaster || forceUnifiDeck || forceNonSteamBadges || smartShelvesFixture || savedFiltersFixture || forceHidden || surpriseMe || forceCrash || forceReplaceFailed || updateAvailable || updateDismissed || updateOffline || collectionEmpty || collectionInverted || sourcesFixture || templatesFixture) {
  // eslint-disable-next-line no-console
  console.warn("[Deck Shelves QA] active flags:", {
    firstRun, qamError, shelfError,
    allShelvesHide, allShelvesShow, allShelvesHideTabs, allShelvesShowTabs,
    forceTabMaster, forceUnifiDeck, forceNonSteamBadges,
    smartShelvesFixture, savedFiltersFixture, forceHidden, surpriseMe, forceCrash, forceReplaceFailed,
    updateAvailable, updateDismissed, updateOffline, collectionEmpty, collectionInverted,
    sourcesFixture, templatesFixture, stressFixture,
  });
}

function qaAllShelvesFixture(): Shelf[] {
  const base = { enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, highlightAll: false, hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false, hideRefreshCard: false };
  return [
    { ...base, id: "qa_update_pending", title: "QA: Update pending", source: { type: "filter", filter: { updatePending: true, sort: "alphabetical" } } },
    { ...base, id: "qa_recents", title: "QA: Recents", source: { type: "filter", filter: { sort: "recent" } } },
    { ...base, id: "qa_installed_lib", title: "QA: Library installed", source: { type: "tab", tab: "installed" } },
    { ...base, id: "qa_favorites", title: "QA: Favorites", source: { type: "collection", collectionId: "favorite" } },
    { ...base, id: "qa_installed_meta", title: "QA: Installed by metacritic", source: { type: "filter", filter: { installed: true, sort: "metacritic" } } },
    { ...base, id: "qa_fromsoft", title: "QA: FromSoftware by release", source: { type: "filter", filter: { sort: "release_date", filterGroup: { mode: "and", items: [{ type: "developer", params: { developer: "FromSoftware" } }] } } } },
    ...(forceHidden ? [{ ...base, id: "qa_hidden", title: "QA: Hidden", hidden: true, source: { type: "filter" as const, filter: { sort: "alphabetical" } } }] : []),
  ];
}

/**
 * Bazzite #55 repro fixture — a filter shelf whose collection-filter points
 * at a non-existent collection. Pre-fix this leaked the entire library; with
 * the fix in place the shelf renders empty (and thus is hidden by the
 * `!appIds.length` guard in `Shelf.tsx`). Useful as a regression smoke test.
 */
function qaCollectionEmptyFixture(): Shelf[] {
  const base = { enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, highlightAll: false, hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false, hideRefreshCard: false };
  return [
    { ...base, id: "qa_collection_missing", title: "QA: Collection (missing) — should be empty",
      source: { type: "filter", filter: { sort: "alphabetical", filterGroup: { mode: "and", items: [
        { type: "collection", inverted: false, params: { collectionId: "qa-nonexistent-collection-xyz" } },
      ] } } } },
    { ...base, id: "qa_collection_empty_recents", title: "QA: Recents (control)",
      source: { type: "filter", filter: { sort: "recent" } } },
  ];
}

/**
 * Bazzite #56 demo fixture — same library minus one collection. Two shelves
 * side by side: the in-collection set and its complement. Useful to visually
 * confirm the inverted-collection toggle is working.
 */
function qaCollectionInvertedFixture(): Shelf[] {
  const base = { enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, highlightAll: false, hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false, hideRefreshCard: false };
  return [
    { ...base, id: "qa_collection_in", title: "QA: In Favorites",
      source: { type: "filter", filter: { sort: "alphabetical", filterGroup: { mode: "and", items: [
        { type: "installed", inverted: false, params: {} },
        { type: "collection", inverted: false, params: { collectionId: "favorite" } },
      ] } } } },
    { ...base, id: "qa_collection_out", title: "QA: Installed but NOT in Favorites",
      source: { type: "filter", filter: { sort: "alphabetical", filterGroup: { mode: "and", items: [
        { type: "installed", inverted: false, params: {} },
        { type: "collection", inverted: true, params: { collectionId: "favorite" } },
      ] } } } },
  ];
}

function qaSmartShelvesFixture(): SmartShelf[] {
  return [
    { id: "qa_quick", title: "QA: Quick play", mode: "quick_play", enabled: true, hidden: false },
    { id: "qa_random", title: "QA: Roulette", mode: "random_pick", enabled: true, hidden: false },
    { id: "qa_recent", title: "QA: Recently played", mode: "recently_played", enabled: true, hidden: false },
    { id: "qa_spare", title: "QA: Spare time", mode: "spare_time", enabled: true, hidden: false, visibleHours: [{ start: 0, end: 23 }] },
  ];
}

function qaSavedFiltersFixture(): SavedFilter[] {
  return [
    { id: "qa_couch_coop", name: "QA: Couch co-op", group: { mode: "and", items: [{ type: "controllerSupport", params: { min: 1 } }, { type: "installed" }] } },
    { id: "qa_quick_play", name: "QA: Quick play", group: { mode: "and", items: [{ type: "playtimeRange", params: { maxMinutes: 120 } }] } },
  ] as SavedFilter[];
}

// ─── Fixture: stress — 12 regular + 6 smart, limit=50, varied display/visual ─
function qaStressFixture(): { shelves: Shelf[]; smartShelves: SmartShelf[] } {
  // Each shelf deliberately mixes a different source + display/visual flag
  // combination so the render path exercises different code branches under load.
  const base = { enabled: true, hidden: false, limit: 50 };

  const shelves: Shelf[] = [
    // 1 — recent, highlightFirst, matchNativeSize
    { ...base, id: "qa_st_01", title: "Stress 01 — Recent / highlight first / native size",
      source: { type: "filter", filter: { sort: "recent" } },
      matchNativeSize: true, highlightFirst: true },
    // 2 — playtime, highlightAll
    { ...base, id: "qa_st_02", title: "Stress 02 — Playtime / highlight all",
      source: { type: "filter", filter: { sort: "playtime" } },
      highlightAll: true },
    // 3 — alphabetical desc, hide status + new badge
    { ...base, id: "qa_st_03", title: "Stress 03 — Alpha desc / hide status+badge",
      source: { type: "filter", filter: { sort: "alphabetical" } },
      sortReverse: true, hideStatusLine: true, hideNewBadge: true },
    // 4 — review score, hide compat icons
    { ...base, id: "qa_st_04", title: "Stress 04 — Review score / hide compat",
      source: { type: "filter", filter: { sort: "review_score" } },
      hideCompatIcons: true },
    // 5 — added, hide non-steam badge + install indicator
    { ...base, id: "qa_st_05", title: "Stress 05 — Recently added / hide badges",
      source: { type: "filter", filter: { sort: "added" } },
      hideNonSteamBadge: true, hideInstallIndicator: true },
    // 6 — release date, hide shelf title
    { ...base, id: "qa_st_06", title: "Stress 06 — Release date / hide shelf title",
      source: { type: "filter", filter: { sort: "release_date" } },
      hideShelfTitle: true },
    // 7 — installed, matchNativeSize + hide see more
    { ...base, id: "qa_st_07", title: "Stress 07 — Installed / native size / hide see more",
      source: { type: "tab", tab: "installed" },
      matchNativeSize: true, hideSeeMore: true },
    // 8 — favorites collection, highlightFirst + hide game names
    { ...base, id: "qa_st_08", title: "Stress 08 — Favorites / highlight first / no names",
      source: { type: "collection", collectionId: "favorite" },
      highlightFirst: true, hideGameNames: true },
    // 9 — deck verified, hero enabled
    { ...base, id: "qa_st_09", title: "Stress 09 — Deck verified / hero art",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "deckCompatibility", inverted: false, params: { levels: ["verified"] } }] }, sort: "alphabetical" } },
      heroEnabled: true } as any,
    // 10 — random, hide refresh card
    { ...base, id: "qa_st_10", title: "Stress 10 — Random / hide refresh",
      source: { type: "filter", filter: { sort: "random" } },
      hideRefreshCard: true },
    // 11 — developer filter, matchNativeSize + highlightAll
    { ...base, id: "qa_st_11", title: "Stress 11 — Valve games / native size / all highlight",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "developer", inverted: false, params: { developer: "Valve" } }] }, sort: "playtime" } },
      matchNativeSize: true, highlightAll: true },
    // 12 — controller full support, all display flags off
    { ...base, id: "qa_st_12", title: "Stress 12 — Full controller support",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "controllerSupport", inverted: false, params: { min: 2 } }] }, sort: "alphabetical" } },
      hideStatusLine: true, hideNewBadge: true, hideCompatIcons: true, hideNonSteamBadge: true, hideInstallIndicator: true },
    // 13 — wishlist, highlightFirst
    { ...base, id: "qa_st_13", title: "Stress 13 — Wishlist / highlight first",
      source: { type: "wishlist" },
      highlightFirst: true },
    // 14 — wishlist on sale, matchNativeSize
    { ...base, id: "qa_st_14", title: "Stress 14 — Wishlist on sale / native size",
      source: { type: "wishlist", childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 1, maxDiscount: 99 } }] } },
      matchNativeSize: true },
    // 15 — store, hide status + badge
    { ...base, id: "qa_st_15", title: "Stress 15 — Store / hide status+badge",
      source: { type: "store" },
      hideStatusLine: true, hideNewBadge: true },
    // 16 — free now (store 100% off), heroEnabled
    { ...base, id: "qa_st_16", title: "Stress 16 — Free now / hero art",
      source: { type: "store", childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 100, maxDiscount: 100 } }] } },
      heroEnabled: true } as any,
    // 17 — composite source (union: installed + favorites), highlightFirst
    { ...base, id: "qa_st_17", title: "Stress 17 — Composite union / highlight first",
      source: { type: "composite", combine: "union", sources: [
        { type: "tab", tab: "installed" },
        { type: "tab", tab: "favorites" },
      ] } as any,
      highlightFirst: true } as any,
    // 18 — multi-key sort + manual sort with decoration cards
    { ...base, id: "qa_st_18", title: "Stress 18 — Decorated row / manual sort",
      source: { type: "tab", tab: "installed" },
      sort: "manual" as any,
      manualBaseSort: "alphabetical",
      manualOrder: [],
      syntheticCards: [
        { position: 0, size: "normal" }, // pure gap
        { position: 3, size: "normal", text: "Stress Section", placeholder: true },
        { position: 8, size: "featured", text: "Stress Link", link: { type: "url", value: "https://store.steampowered.com" } },
      ] as any } as any,
    // 19 — multi-key sort (recent + alphabetical tiebreaker)
    { ...base, id: "qa_st_19", title: "Stress 19 — Multi-key sort",
      source: { type: "filter", filter: { sort: ["recent", "alphabetical"], sortReverse: [false, false] } as any },
      sort: ["recent", "alphabetical"] as any,
      sortReverse: [false, false] as any } as any,
  ];

  const smartShelves: SmartShelf[] = [
    { id: "qa_ssm_01", title: "Stress Smart 01 — Quick play",      mode: "quick_play",      enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_02", title: "Stress Smart 02 — On deck",         mode: "on_deck",         enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_03", title: "Stress Smart 03 — Best unplayed",   mode: "best_unplayed",   enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_04", title: "Stress Smart 04 — Interrupted",     mode: "interrupted",     enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_05", title: "Stress Smart 05 — Daily pick",      mode: "daily_pick",      enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_06", title: "Stress Smart 06 — Random pick",     mode: "random_pick",     enabled: true, hidden: false, limit: 50 },
    // 2.4.0 — heuristic templates exercise the new primitives under load
    { id: "qa_ssm_07", title: "Stress Smart 07 — Backlog rescue",  mode: "backlog_rescue",  enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_08", title: "Stress Smart 08 — Forgotten gems",  mode: "forgotten_gems",  enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_09", title: "Stress Smart 09 — Weekly rotation", mode: "weekly_rotation", enabled: true, hidden: false, limit: 50 },
  ];

  return { shelves, smartShelves };
}

// ─── Fixture: all source types + sort options + filter combinations ──────────
function qaSourcesFixture(): { shelves: Shelf[]; smartShelves: SmartShelf[] } {
  const b = { enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, highlightAll: false, hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false, hideRefreshCard: false };

  const shelves: Shelf[] = [
    // ── Tab sources ──────────────────────────────────────────────────────
    { ...b, id: "qa_tab_installed",  title: "QA: Tab / Installed",   source: { type: "tab", tab: "installed" } },
    { ...b, id: "qa_tab_favorites",  title: "QA: Tab / Favorites",   source: { type: "tab", tab: "favorites" } },
    { ...b, id: "qa_tab_hidden",     title: "QA: Tab / Hidden",      source: { type: "tab", tab: "hidden" } },
    { ...b, id: "qa_tab_nonsteam",   title: "QA: Tab / Non-Steam",   source: { type: "tab", tab: "nonsteam" } },
    // ── Collection source ────────────────────────────────────────────────
    { ...b, id: "qa_coll_fav",       title: "QA: Collection / Favorites",              source: { type: "collection", collectionId: "favorite" } },
    { ...b, id: "qa_coll_child",     title: "QA: Collection / Favorites + childFilter (installed)",
      source: { type: "collection", collectionId: "favorite", childFilter: { mode: "and", items: [{ type: "installed", inverted: false, params: {} }] } } },
    // ── Filter / sorts ───────────────────────────────────────────────────
    { ...b, id: "qa_sort_alpha",     title: "QA: Sort / Alphabetical",   source: { type: "filter", filter: { sort: "alphabetical" } } },
    { ...b, id: "qa_sort_alpha_rev", title: "QA: Sort / Alpha (desc)",   source: { type: "filter", filter: { sort: "alphabetical" } }, sortReverse: true },
    { ...b, id: "qa_sort_recent",    title: "QA: Sort / Recent",         source: { type: "filter", filter: { sort: "recent" } } },
    { ...b, id: "qa_sort_playtime",  title: "QA: Sort / Playtime",       source: { type: "filter", filter: { sort: "playtime" } } },
    { ...b, id: "qa_sort_release",   title: "QA: Sort / Release date",   source: { type: "filter", filter: { sort: "release_date" } } },
    { ...b, id: "qa_sort_size",      title: "QA: Sort / Size on disk",   source: { type: "filter", filter: { sort: "size_on_disk", installed: true } } },
    { ...b, id: "qa_sort_meta",      title: "QA: Sort / Metacritic",     source: { type: "filter", filter: { sort: "metacritic" } } },
    { ...b, id: "qa_sort_review",    title: "QA: Sort / Review score",   source: { type: "filter", filter: { sort: "review_score" } } },
    { ...b, id: "qa_sort_added",     title: "QA: Sort / Recently added", source: { type: "filter", filter: { sort: "added" } } },
    { ...b, id: "qa_sort_random",    title: "QA: Sort / Random",         source: { type: "filter", filter: { sort: "random" } } },
    // ── Filter / flat fields ─────────────────────────────────────────────
    { ...b, id: "qa_flat_installed", title: "QA: Filter / Installed",    source: { type: "filter", filter: { installed: true, sort: "alphabetical" } } },
    { ...b, id: "qa_flat_nonsteam",  title: "QA: Filter / Non-Steam",    source: { type: "filter", filter: { nonSteam: true, sort: "alphabetical" } } },
    { ...b, id: "qa_flat_update",    title: "QA: Filter / Update pending",source: { type: "filter", filter: { installed: true, updatePending: true, sort: "alphabetical" } } },
    { ...b, id: "qa_flat_hidden",    title: "QA: Filter / Hidden only",  source: { type: "filter", filter: { hidden: "only", sort: "alphabetical" } } },
    { ...b, id: "qa_flat_playtime",  title: "QA: Filter / Playtime ≥ 3h",source: { type: "filter", filter: { installed: true, minPlaytimeMinutes: 180, sort: "playtime" } } },
    // ── Filter / filterGroup items ───────────────────────────────────────
    { ...b, id: "qa_fg_favorites",   title: "QA: FG / Favorites",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "favorites", inverted: false, params: {} }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_isnew",       title: "QA: FG / Is new",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "isNew", inverted: false, params: {} }] }, sort: "added" } } },
    { ...b, id: "qa_fg_cloud",       title: "QA: FG / Cloud save",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "cloudAvailable", inverted: false, params: {} }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_verified",    title: "QA: FG / Deck Verified",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "deckCompatibility", inverted: false, params: { levels: ["verified"] } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_playable",    title: "QA: FG / Deck Playable+",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "deckCompatibility", inverted: false, params: { levels: ["verified", "playable"] } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_ctrl_full",   title: "QA: FG / Controller (full)",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "controllerSupport", inverted: false, params: { min: 2 } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_appstatus",   title: "QA: FG / App status (running/downloading)",
      source: { type: "filter", filter: { filterGroup: { mode: "or", items: [{ type: "appStatus", inverted: false, params: { statuses: ["running", "downloading"] } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_played7d",    title: "QA: FG / Played within 7d",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "playedWithinDays", inverted: false, params: { days: 7 } }] }, sort: "recent" } } },
    { ...b, id: "qa_fg_playtime_rng",title: "QA: FG / Playtime 1–5h",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "playtimeRange", inverted: false, params: { minMinutes: 60, maxMinutes: 300 } }] }, sort: "playtime" } } },
    { ...b, id: "qa_fg_achievements", title: "QA: FG / Achievements (has any)",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "achievements", inverted: false, params: { min: 1 } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_developer",   title: "QA: FG / Developer",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "developer", inverted: false, params: { developer: "Valve" } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_publisher",   title: "QA: FG / Publisher",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "publisher", inverted: false, params: { publisher: "Valve" } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_nametag",     title: "QA: FG / Name includes",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "nameIncludes", inverted: false, params: { value: "Portal" } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_storetag",    title: "QA: FG / Store tag (Indie)",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "storeTag", inverted: false, params: { tags: ["492"] } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_shortcut",    title: "QA: FG / Shortcut type",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "shortcutType", inverted: false, params: { shortcutType: "all" } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_coll_inv",    title: "QA: FG / Collection inverted",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "collection", inverted: true, params: { collectionId: "favorite" } }, { type: "installed", inverted: false, params: {} }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_fg_merge",       title: "QA: FG / Merge (OR installed+nonsteam)",
      source: { type: "filter", filter: { filterGroup: { mode: "or", items: [{ type: "installed", inverted: false, params: {} }, { type: "nonSteam", inverted: false, params: {} }] }, sort: "alphabetical" } } },
    // ── Online sources ────────────────────────────────────────────────────
    { ...b, id: "qa_wishlist",       title: "QA: Wishlist",            source: { type: "wishlist" } },
    { ...b, id: "qa_wishlist_sale",  title: "QA: Wishlist on sale",
      source: { type: "wishlist", childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 1, maxDiscount: 99 } }] } } },
    { ...b, id: "qa_store",          title: "QA: Store",               source: { type: "store" } },
    { ...b, id: "qa_store_free",     title: "QA: Store / Free now",
      source: { type: "store", childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 100, maxDiscount: 100 } }] } } },
  ];

  const smartShelves: SmartShelf[] = [
    { id: "qa_sm_quick",     title: "QA: Smart / Quick play",       mode: "quick_play",      enabled: true, hidden: false },
    { id: "qa_sm_notstart",  title: "QA: Smart / Not started",      mode: "not_started",     enabled: true, hidden: false },
    { id: "qa_sm_deck",      title: "QA: Smart / Deck picks",       mode: "deck_picks",      enabled: true, hidden: false },
    { id: "qa_sm_redis",     title: "QA: Smart / Rediscover",       mode: "rediscover",      enabled: true, hidden: false },
    { id: "qa_sm_bestun",    title: "QA: Smart / Best unplayed",    mode: "best_unplayed",   enabled: true, hidden: false },
    { id: "qa_sm_inter",     title: "QA: Smart / Interrupted",      mode: "interrupted",     enabled: true, hidden: false },
    { id: "qa_sm_tod",       title: "QA: Smart / Time of day",      mode: "time_of_day",     enabled: true, hidden: false },
    { id: "qa_sm_daily",     title: "QA: Smart / Daily pick",       mode: "daily_pick",      enabled: true, hidden: false },
    { id: "qa_sm_ondeck",    title: "QA: Smart / On deck",          mode: "on_deck",         enabled: true, hidden: false },
    { id: "qa_sm_recent",    title: "QA: Smart / Recently played",  mode: "recently_played", enabled: true, hidden: false },
    { id: "qa_sm_long",      title: "QA: Smart / Long session",     mode: "long_session",    enabled: true, hidden: false },
    { id: "qa_sm_nonsteam",  title: "QA: Smart / Non-Steam",        mode: "non_steam",       enabled: true, hidden: false },
    { id: "qa_sm_random",    title: "QA: Smart / Random pick",      mode: "random_pick",     enabled: true, hidden: false },
    { id: "qa_sm_forgot",    title: "QA: Smart / Forgotten",        mode: "forgotten",       enabled: true, hidden: false },
    { id: "qa_sm_spare",     title: "QA: Smart / Spare time",       mode: "spare_time",      enabled: true, hidden: false },
    { id: "qa_sm_custom",    title: "QA: Smart / Custom (default)", mode: "custom",          enabled: true, hidden: false },
  ];

  return { shelves, smartShelves };
}

// ─── Fixture: one shelf per template (regular + online + smart) ───────────────
function qaTemplatesFixture(): { shelves: Shelf[]; smartShelves: SmartShelf[] } {
  const b = { enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, highlightAll: false, hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false, hideRefreshCard: false };

  const shelves: Shelf[] = [
    // ── Regular templates ────────────────────────────────────────────────
    { ...b, id: "qa_tpl_fav",      title: "Tpl: Favorites",          source: { type: "tab", tab: "favorites" } },
    { ...b, id: "qa_tpl_recent",   title: "Tpl: Recent",             source: { type: "filter", filter: { sort: "recent" } } },
    { ...b, id: "qa_tpl_inst",     title: "Tpl: Installed",          source: { type: "tab", tab: "installed" } },
    { ...b, id: "qa_tpl_mplay",    title: "Tpl: Most played",        source: { type: "filter", filter: { sort: "playtime" } } },
    { ...b, id: "qa_tpl_added",    title: "Tpl: Recently added",     source: { type: "filter", filter: { sort: "added" } } },
    { ...b, id: "qa_tpl_update",   title: "Tpl: Awaiting update",    source: { type: "filter", filter: { installed: true, updatePending: true, sort: "alphabetical" } } },
    { ...b, id: "qa_tpl_nonst",    title: "Tpl: Non-Steam",          source: { type: "filter", filter: { nonSteam: true, sort: "recent" } } },
    { ...b, id: "qa_tpl_longsess", title: "Tpl: Long session",       source: { type: "filter", filter: { installed: true, minPlaytimeMinutes: 180, sort: "playtime" } } },
    { ...b, id: "qa_tpl_cloud",    title: "Tpl: Steam Cloud",        source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "cloudAvailable", inverted: false, params: {} }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_tpl_verified", title: "Tpl: Deck Verified",      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "deckCompatibility", inverted: false, params: { levels: ["verified"] } }] }, sort: "alphabetical" } } },
    { ...b, id: "qa_tpl_review",   title: "Tpl: Top reviewed",       source: { type: "filter", filter: { sort: "review_score" } } },
    // ── Online templates ─────────────────────────────────────────────────
    { ...b, id: "qa_tpl_wish",     title: "Tpl: Wishlist",           source: { type: "wishlist" } },
    { ...b, id: "qa_tpl_wish_sale",title: "Tpl: Wishlist on sale",   source: { type: "wishlist", childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 1, maxDiscount: 99 } }] } } },
    { ...b, id: "qa_tpl_freewish", title: "Tpl: Free wishlist",      source: { type: "wishlist", childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 100, maxDiscount: 100 } }] } } },
    { ...b, id: "qa_tpl_freenow",  title: "Tpl: Free now",           source: { type: "store",    childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 100, maxDiscount: 100 } }] } } },
    // ── 2.4.0 surfaces: multi-source, multi-key sort, decoration cards ──
    {
      ...b,
      id: "qa_tpl_composite_union",
      title: "Tpl: Composite (union)",
      source: { type: "composite", combine: "union", sources: [
        { type: "tab", tab: "installed" },
        { type: "tab", tab: "favorites" },
      ] } as any,
    },
    {
      ...b,
      id: "qa_tpl_composite_intersect",
      title: "Tpl: Composite (intersection)",
      source: { type: "composite", combine: "intersection", sources: [
        { type: "tab", tab: "installed" },
        { type: "filter", filter: { sort: "alphabetical" } as any },
      ] } as any,
    },
    {
      ...b,
      id: "qa_tpl_multikey",
      title: "Tpl: Multi-key sort",
      source: { type: "filter", filter: { sort: ["recent", "alphabetical"], sortReverse: [false, false] } as any },
      sort: ["recent", "alphabetical"] as any,
      sortReverse: [false, false] as any,
    },
    {
      ...b,
      id: "qa_tpl_decorated",
      title: "Tpl: Decorated row",
      source: { type: "tab", tab: "installed" },
      sort: "manual" as any,
      manualBaseSort: "alphabetical",
      manualOrder: [],
      // Three shapes side-by-side: pure gap, text label, focusable URL with text.
      syntheticCards: [
        { position: 0, size: "normal" },
        { position: 2, size: "normal", text: "Section A", placeholder: true },
        { position: 4, size: "featured", text: "Open Steam", link: { type: "url", value: "https://store.steampowered.com" } },
      ] as any,
    },
    {
      ...b,
      id: "qa_tpl_decorated_image",
      title: "Tpl: Decorated row (image)",
      source: { type: "tab", tab: "installed" },
      sort: "manual" as any,
      manualBaseSort: "alphabetical",
      manualOrder: [],
      syntheticCards: [
        { position: 1, size: "normal", image: "https://cdn.akamai.steamstatic.com/steam/apps/220/header.jpg", link: { type: "url", value: "https://store.steampowered.com/app/220" } },
      ] as any,
    },
  ];

  const smartShelves: SmartShelf[] = [
    { id: "qa_tsm_daily",   title: "Tpl: Daily pick",       mode: "daily_pick",      enabled: true, hidden: false },
    { id: "qa_tsm_deck",    title: "Tpl: Deck picks",       mode: "deck_picks",      enabled: true, hidden: false },
    { id: "qa_tsm_ondeck",  title: "Tpl: On deck",          mode: "on_deck",         enabled: true, hidden: false },
    { id: "qa_tsm_recent",  title: "Tpl: Recently played",  mode: "recently_played", enabled: true, hidden: false },
    { id: "qa_tsm_long",    title: "Tpl: Long session",     mode: "long_session",    enabled: true, hidden: false },
    { id: "qa_tsm_random",  title: "Tpl: Random pick",      mode: "random_pick",     enabled: true, hidden: false },
    { id: "qa_tsm_notst",   title: "Tpl: Not started",      mode: "not_started",     enabled: true, hidden: false },
    { id: "qa_tsm_bestun",  title: "Tpl: Best unplayed",    mode: "best_unplayed",   enabled: true, hidden: false },
    { id: "qa_tsm_quick",   title: "Tpl: Quick play",       mode: "quick_play",      enabled: true, hidden: false },
    { id: "qa_tsm_inter",   title: "Tpl: Interrupted",      mode: "interrupted",     enabled: true, hidden: false },
    { id: "qa_tsm_nonst",   title: "Tpl: Non-Steam",        mode: "non_steam",       enabled: true, hidden: false },
    { id: "qa_tsm_spare",   title: "Tpl: Spare time",       mode: "spare_time",      enabled: true, hidden: false },
    { id: "qa_tsm_tod",     title: "Tpl: Time of day",      mode: "time_of_day",     enabled: true, hidden: false },
    { id: "qa_tsm_redis",   title: "Tpl: Rediscover",       mode: "rediscover",      enabled: true, hidden: false },
    { id: "qa_tsm_forgot",  title: "Tpl: Forgotten",        mode: "forgotten",       enabled: true, hidden: false },
    // ── 2.4.0 new smart templates ────────────────────────────────────
    { id: "qa_tsm_backlog", title: "Tpl: Backlog rescue",   mode: "backlog_rescue",  enabled: true, hidden: false },
    { id: "qa_tsm_gems",    title: "Tpl: Forgotten gems",   mode: "forgotten_gems",  enabled: true, hidden: false },
    { id: "qa_tsm_weekly",  title: "Tpl: Weekly rotation",  mode: "weekly_rotation", enabled: true, hidden: false },
    { id: "qa_tsm_sound",   title: "Tpl: Soundtracks",      mode: "soundtracks",     enabled: true, hidden: false },
    { id: "qa_tsm_videos",  title: "Tpl: Videos",           mode: "videos",          enabled: true, hidden: false },
    { id: "qa_tsm_demos",   title: "Tpl: Demos",            mode: "demos",           enabled: true, hidden: false },
    { id: "qa_tsm_cloud",   title: "Tpl: Cloud games",      mode: "cloud_games",     enabled: true, hidden: false },
  ];

  return { shelves, smartShelves };
}

export function applyQASettingsOverride(s: Settings): Settings {
  const wantsHomeOverride = allShelvesHide || allShelvesShow || allShelvesHideTabs || allShelvesShowTabs || forceHidden;
  const wantsSmartOverride = smartShelvesFixture || surpriseMe;
  const wantsFiltersOverride = savedFiltersFixture;
  const wantsCollectionEmpty = collectionEmpty;
  const wantsCollectionInverted = collectionInverted;
  const wantsUpdateDismissed = updateDismissed;
  if (
    !wantsHomeOverride && !wantsSmartOverride && !wantsFiltersOverride
    && !wantsCollectionEmpty && !wantsCollectionInverted && !wantsUpdateDismissed
    && !sourcesFixture && !templatesFixture && !stressFixture
  ) return s;

  // Sources / templates / stress fixtures are exclusive with each other and
  // with the existing collection-fixture overrides — only one set wins.
  if (stressFixture) {
    const f = qaStressFixture();
    return { ...s, enabled: true, smartShelvesEnabled: true, onlineFeaturesEnabled: true, shelves: f.shelves, smartShelves: f.smartShelves };
  }
  if (sourcesFixture) {
    const f = qaSourcesFixture();
    return { ...s, enabled: true, smartShelvesEnabled: true, shelves: f.shelves, smartShelves: f.smartShelves };
  }
  if (templatesFixture) {
    const f = qaTemplatesFixture();
    return { ...s, enabled: true, smartShelvesEnabled: true, onlineFeaturesEnabled: true, shelves: f.shelves, smartShelves: f.smartShelves };
  }

  // Collection-fixture overrides are exclusive — only one shelf set wins,
  // matching the existing single-fixture-source contract.
  let shelves = s.shelves;
  if (wantsHomeOverride) shelves = qaAllShelvesFixture();
  else if (wantsCollectionEmpty) shelves = qaCollectionEmptyFixture();
  else if (wantsCollectionInverted) shelves = qaCollectionInvertedFixture();
  return {
    ...s,
    enabled: true,
    hideRecents: allShelvesHide ? true : (allShelvesShow ? false : s.hideRecents),
    hideHomeTabs: allShelvesHideTabs ? true : (allShelvesShowTabs ? false : s.hideHomeTabs),
    shelves,
    smartShelves: wantsSmartOverride ? qaSmartShelvesFixture() : s.smartShelves,
    smartShelvesEnabled: wantsSmartOverride ? true : s.smartShelvesEnabled,
    smartSurpriseMe: surpriseMe ? true : s.smartSurpriseMe,
    savedFilters: wantsFiltersOverride ? qaSavedFiltersFixture() : s.savedFilters,
    // When `qa:update-dismissed` is set, also pre-populate the dismissed
    // version so the banner stays hidden in spite of `qa:update-available`.
    updateNotifyDismissedVersion: wantsUpdateDismissed ? QA_FAKE_LATEST_VERSION : s.updateNotifyDismissedVersion,
  };
}

/**
 * Returns a fake `UpdateCheckResult`-shaped payload when `qa:update-available`
 * is on, so the QAM banner renders without any network round trip. Returns
 * `null` otherwise — `checkForUpdate` falls through to its real flow.
 */
export function qaForcedUpdateResult(): { hasUpdate: boolean; latestVersion: string | null; releaseUrl: string | null } | null {
  if (!updateAvailable) return null;
  return { hasUpdate: true, latestVersion: QA_FAKE_LATEST_VERSION, releaseUrl: QA_FAKE_RELEASE_URL };
}

/**
 * Returns `true` when `qa:update-offline` is set so the connectivity helper
 * can short-circuit `isOnline()` without touching the network. Lets QA
 * verify offline gating without unplugging the Deck.
 */
export function isQAUpdateOffline(): boolean {
  return updateOffline;
}

export function wrapQAMSettings<P extends { controller: any }>(Component: React.ComponentType<P>): React.ComponentType<P> {
  if (!firstRun && !qamError) return Component;
  return function QAMSettingsQA(props: P) {
    if (qamError) throw new Error("QA: forced QAM render error");
    const c: any = props.controller;
    const patched = {
      ...c,
      shelves: [],
      settings: c?.settings ? { ...c.settings, enabled: false } : c?.settings,
    };
    return <Component {...props} controller={patched} />;
  };
}

export function wrapHomeShelves<P extends object>(Component: React.ComponentType<P>): React.ComponentType<P> {
  if (!shelfError && !forceCrash) return Component;
  return function HomeShelvesQA(_props: P) {
    throw new Error(forceCrash ? "QA: forced home crash" : "QA: forced shelf render error");
  };
}

/** Returns `true` when the current build should pretend the recents-replace
 *  kill-switch fired, surfacing the `RecentsReplaceErrorBanner` in the QAM. */
export function isReplaceFailedForced(): boolean {
  return !!forceReplaceFailed;
}
