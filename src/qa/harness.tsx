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
const stressFixture = __DEV__ && typeof __QA_STRESS_FIXTURE__ !== "undefined" && __QA_STRESS_FIXTURE__;
// A fresh install as the first-run flow sees it, exercising tour → wizard end to end.
const freshInstall = __DEV__ && typeof __QA_FRESH_INSTALL__ !== "undefined" && __QA_FRESH_INSTALL__;
let freshSeeded = false;

// Once the seed is applied, the store ignores untagged payloads so backend refreshes can't undo the session.
export function qaSeedActive(): boolean {
  return freshInstall && freshSeeded;
}

// Far above any real release so it always compares as newer.
const QA_FAKE_LATEST_VERSION = "99.0.0";
const QA_FAKE_RELEASE_URL = "https://github.com/santojon/Deck-Shelves/releases/tag/v99.0.0";

// True when any QA flag is active. The store blocks real backend writes on it,
// since fixture data must never reach the settings file.
export const qaOverrideActive = __DEV__ && (
  firstRun || qamError || shelfError || allShelvesHide || allShelvesShow || allShelvesHideTabs || allShelvesShowTabs
  || !!forceTabMaster || !!forceUnifiDeck || !!forceNonSteamBadges || smartShelvesFixture || savedFiltersFixture
  || forceHidden || surpriseMe || forceCrash || forceReplaceFailed || updateAvailable || stressFixture || freshInstall
);

if (qaOverrideActive) {
  console.warn("[Deck Shelves QA] active flags:", {
    firstRun, qamError, shelfError,
    allShelvesHide, allShelvesShow, allShelvesHideTabs, allShelvesShowTabs,
    forceTabMaster, forceUnifiDeck, forceNonSteamBadges,
    smartShelvesFixture, savedFiltersFixture, forceHidden, surpriseMe, forceCrash, forceReplaceFailed,
    updateAvailable, stressFixture, freshInstall,
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

function qaStressFixture(): { shelves: Shelf[]; smartShelves: SmartShelf[] } {
  // Each shelf mixes a different source and display flags to hit different render branches.
  const base = { enabled: true, hidden: false, limit: 50 };

  const shelves: Shelf[] = [
    { ...base, id: "qa_st_01", title: "Stress 01 — Recent / highlight first / native size",
      source: { type: "filter", filter: { sort: "recent" } },
      matchNativeSize: true, highlightFirst: true },
    { ...base, id: "qa_st_02", title: "Stress 02 — Playtime / highlight all",
      source: { type: "filter", filter: { sort: "playtime" } },
      highlightAll: true },
    { ...base, id: "qa_st_03", title: "Stress 03 — Alpha desc / hide status+badge",
      source: { type: "filter", filter: { sort: "alphabetical" } },
      sortReverse: true, hideStatusLine: true, hideNewBadge: true },
    { ...base, id: "qa_st_04", title: "Stress 04 — Review score / hide compat",
      source: { type: "filter", filter: { sort: "review_score" } },
      hideCompatIcons: true },
    { ...base, id: "qa_st_05", title: "Stress 05 — Recently added / hide badges",
      source: { type: "filter", filter: { sort: "added" } },
      hideNonSteamBadge: true, hideInstallIndicator: true },
    { ...base, id: "qa_st_06", title: "Stress 06 — Release date / hide shelf title",
      source: { type: "filter", filter: { sort: "release_date" } },
      hideShelfTitle: true },
    { ...base, id: "qa_st_07", title: "Stress 07 — Installed / native size / hide see more",
      source: { type: "tab", tab: "installed" },
      matchNativeSize: true, hideSeeMore: true },
    { ...base, id: "qa_st_08", title: "Stress 08 — Favorites / highlight first / no names",
      source: { type: "collection", collectionId: "favorite" },
      highlightFirst: true, hideGameNames: true },
    { ...base, id: "qa_st_09", title: "Stress 09 — Deck verified / hero art",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "deckCompatibility", inverted: false, params: { levels: ["verified"] } }] }, sort: "alphabetical" } },
      heroEnabled: true } as any,
    { ...base, id: "qa_st_10", title: "Stress 10 — Random / hide refresh",
      source: { type: "filter", filter: { sort: "random" } },
      hideRefreshCard: true },
    { ...base, id: "qa_st_11", title: "Stress 11 — Valve games / native size / all highlight",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "developer", inverted: false, params: { developer: "Valve" } }] }, sort: "playtime" } },
      matchNativeSize: true, highlightAll: true },
    { ...base, id: "qa_st_12", title: "Stress 12 — Full controller support",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "controllerSupport", inverted: false, params: { min: 2 } }] }, sort: "alphabetical" } },
      hideStatusLine: true, hideNewBadge: true, hideCompatIcons: true, hideNonSteamBadge: true, hideInstallIndicator: true },
    { ...base, id: "qa_st_13", title: "Stress 13 — Wishlist / highlight first",
      source: { type: "wishlist" },
      highlightFirst: true },
    { ...base, id: "qa_st_14", title: "Stress 14 — Wishlist on sale / native size",
      source: { type: "wishlist", childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 1, maxDiscount: 99 } }] } },
      matchNativeSize: true },
    { ...base, id: "qa_st_15", title: "Stress 15 — Store / hide status+badge",
      source: { type: "store" },
      hideStatusLine: true, hideNewBadge: true },
    { ...base, id: "qa_st_16", title: "Stress 16 — Free now / hero art",
      source: { type: "store", childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 100, maxDiscount: 100 } }] } },
      heroEnabled: true } as any,
    { ...base, id: "qa_st_17", title: "Stress 17 — Composite union / highlight first",
      source: { type: "composite", combine: "union", sources: [
        { type: "tab", tab: "installed" },
        { type: "tab", tab: "favorites" },
      ] } as any,
      highlightFirst: true } as any,
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
    { ...base, id: "qa_st_19", title: "Stress 19 — Multi-key sort",
      source: { type: "filter", filter: { sort: ["recent", "alphabetical"], sortReverse: [false, false] } as any },
      sort: ["recent", "alphabetical"] as any,
      sortReverse: [false, false] as any } as any,
    { ...base, id: "qa_st_20", title: "Stress 20 — Logo overlay enabled",
      source: { type: "tab", tab: "installed" },
      enableLogo: true, enableDescription: true,
      logoPosition: "left", descriptionPosition: "left",
      logoSize: 100, logoTopOffset: 20,
      descriptionHeight: 2, descriptionLogoGap: 8,
      descriptionBelowLogo: true } as any,
    { ...base, id: "qa_st_21", title: "Stress 21 — Logo explicitly off",
      source: { type: "tab", tab: "favorites" },
      enableLogo: false, enableIcon: false, enableDescription: false } as any,
    { ...base, id: "qa_st_22", title: "Stress 22 — Full-page + hero",
      source: { type: "collection", collectionId: "favorite" },
      fullPageShelf: true, heroEnabled: true } as any,
    { ...base, id: "qa_st_23", title: "Stress 23 — Per-card highlights",
      source: { type: "filter", filter: { sort: "playtime" } },
      highlightedAppIds: [220, 440, 570, 730, 4000] } as any,
    { ...base, id: "qa_st_24", title: "Stress 24 — Dedupe + hidden ids",
      source: { type: "filter", filter: { sort: "alphabetical" } },
      dedupeByExactName: true,
      hiddenAppIds: [220, 440] } as any,
    { ...base, id: "qa_st_25", title: "Stress 25 — Composite intersection",
      source: { type: "composite", combine: "intersection", sources: [
        { type: "tab", tab: "installed" },
        { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "deckCompatibility", inverted: false, params: { levels: ["verified"] } }] } } },
      ] } as any } as any,
    { ...base, id: "qa_st_26", title: "Stress 26 — Random + hero + hide refresh",
      source: { type: "filter", filter: { sort: "random" } },
      heroEnabled: true, hideRefreshCard: true } as any,
    { ...base, id: "qa_st_27", title: "Stress 27 — Manual / desc base / dedupe",
      source: { type: "tab", tab: "installed" },
      sort: "manual" as any,
      manualBaseSort: "playtime",
      manualBaseSortReverse: true,
      manualOrder: [],
      dedupeByExactName: true } as any,
    { ...base, id: "qa_st_28", title: "Stress 28 — Composite wishlist+store on sale",
      source: { type: "composite", combine: "union", sources: [
        { type: "wishlist", childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 50, maxDiscount: 100 } }] } },
        { type: "store", childFilter: { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 100, maxDiscount: 100 } }] } },
      ] } as any,
      sort: ["discount_high", "original_price_high"] as any,
      sortReverse: [false, false] as any } as any,
    { ...base, id: "qa_st_29", title: "Stress 29 — Friends playing",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "friendsPlayingNow", inverted: false, params: {} }] }, sort: "alphabetical" } } } as any,
    { ...base, id: "qa_st_30", title: "Stress 30 — App id whitelist",
      source: { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "appIdList", inverted: false, params: { appIds: [220, 440, 570, 730, 4000, 8930, 105600, 209650, 213610] } }] }, sort: "alphabetical" } } } as any,
  ];

  const smartShelves: SmartShelf[] = [
    { id: "qa_ssm_01", title: "Stress Smart 01 — Quick play",      mode: "quick_play",      enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_02", title: "Stress Smart 02 — On deck",         mode: "on_deck",         enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_03", title: "Stress Smart 03 — Best unplayed",   mode: "best_unplayed",   enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_04", title: "Stress Smart 04 — Interrupted",     mode: "interrupted",     enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_05", title: "Stress Smart 05 — Daily pick",      mode: "daily_pick",      enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_06", title: "Stress Smart 06 — Random pick",     mode: "random_pick",     enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_07", title: "Stress Smart 07 — Backlog rescue",  mode: "backlog_rescue",  enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_08", title: "Stress Smart 08 — Forgotten gems",  mode: "forgotten_gems",  enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_09", title: "Stress Smart 09 — Weekly rotation", mode: "weekly_rotation", enabled: true, hidden: false, limit: 50 },
    { id: "qa_ssm_10", title: "Stress Smart 10 — Hidden gems",     mode: "hidden_gems",     enabled: true, hidden: false, limit: 50,
      smartParams: { reviewFloor: 80, maxPlaytimeMinutes: 60 } as any },
    { id: "qa_ssm_11", title: "Stress Smart 11 — Travel mode",     mode: "travel_mode",     enabled: true, hidden: false, limit: 50,
      smartParams: { offlineOnly: true } as any },
    { id: "qa_ssm_12", title: "Stress Smart 12 — Monthly spotlight", mode: "monthly_spotlight", enabled: true, hidden: false, limit: 50,
      smartParams: { rotationDays: 30 } as any },
    { id: "qa_ssm_13", title: "Stress Smart 13 — Low battery",     mode: "low_battery_mode", enabled: true, hidden: false, limit: 50,
      smartParams: { batteryBelow: 20 } as any },
    { id: "qa_ssm_14", title: "Stress Smart 14 — Almost finished", mode: "almost_finished", enabled: true, hidden: false, limit: 50,
      smartParams: { minCompletionPercent: 80 } as any },
    { id: "qa_ssm_15", title: "Stress Smart 15 — Quick play (weekends)", mode: "quick_play", enabled: true, hidden: false, limit: 50,
      visibleHours: [{ start: 9, end: 23, days: [0, 6] }] as any },
    { id: "qa_ssm_16", title: "Stress Smart 16 — Roulette (5min refresh)", mode: "roulette", enabled: true, hidden: false, limit: 50,
      refreshIntervalMinutes: 5 },
    { id: "qa_ssm_17", title: "Stress Smart 17 — Custom (verified + recent)", mode: "custom" as any, enabled: true, hidden: false, limit: 50,
      filterGroup: { mode: "and", items: [
        { type: "deckCompatibility", inverted: false, params: { levels: ["verified", "playable"] } },
        { type: "playedWithinDays", inverted: false, params: { days: 30 } },
      ] },
      sort: "recent" } as any,
  ];

  return { shelves, smartShelves };
}

export function applyQASettingsOverride(s: Settings): Settings {
  const wantsHomeOverride = allShelvesHide || allShelvesShow || allShelvesHideTabs || allShelvesShowTabs || forceHidden;
  const wantsSmartOverride = smartShelvesFixture || surpriseMe;
  const wantsFiltersOverride = savedFiltersFixture;
  if (!wantsHomeOverride && !wantsSmartOverride && !wantsFiltersOverride && !stressFixture && !freshInstall) return s;

  // Tagged so cache readers refuse a leftover QA payload on a later non-QA boot.
  const tag = <T extends object>(o: T): T => ({ ...o, __dsQaOverride: true }) as T;

  // A seed, not a standing override: only the session's first payload is replaced,
  // since re-forcing on every notify would undo what the session did.
  if (freshInstall) {
    if (freshSeeded && (s as any).__dsQaOverride === true) return s;
    freshSeeded = true;
    // Master toggle off like a real first run (that is what shows the welcome banner).
    return tag({ ...s, enabled: false, shelves: [], smartShelves: [], showcaseSeen: false, setupWizardSeen: false, lastSetupApply: null } as Settings);
  }
  if (stressFixture) {
    const f = qaStressFixture();
    return tag({ ...s, enabled: true, smartShelvesEnabled: true, onlineFeaturesEnabled: true, shelves: f.shelves, smartShelves: f.smartShelves });
  }

  return tag({
    ...s,
    enabled: true,
    hideRecents: allShelvesHide ? true : (allShelvesShow ? false : s.hideRecents),
    hideHomeTabs: allShelvesHideTabs ? true : (allShelvesShowTabs ? false : s.hideHomeTabs),
    shelves: wantsHomeOverride ? qaAllShelvesFixture() : s.shelves,
    smartShelves: wantsSmartOverride ? qaSmartShelvesFixture() : s.smartShelves,
    smartShelvesEnabled: wantsSmartOverride ? true : s.smartShelvesEnabled,
    smartSurpriseMe: surpriseMe ? true : s.smartSurpriseMe,
    savedFilters: wantsFiltersOverride ? qaSavedFiltersFixture() : s.savedFilters,
  });
}

export function qaForcedUpdateResult(): { hasUpdate: boolean; latestVersion: string | null; releaseUrl: string | null } | null {
  if (!updateAvailable) return null;
  return { hasUpdate: true, latestVersion: QA_FAKE_LATEST_VERSION, releaseUrl: QA_FAKE_RELEASE_URL };
}

// The build pretends the Recents replacement failed, so the Quick Access panel shows its banner.
export function isReplaceFailedForced(): boolean {
  return forceReplaceFailed;
}

export function wrapQAMSettings<P extends { controller: any }>(Component: React.ComponentType<P>): React.ComponentType<P> {
  if (!firstRun && !qamError) return Component;
  return function QAMSettingsQA(props: P) {
    if (qamError) throw new Error("QA: forced QAM render error");
    const c: any = props.controller;
    const patched = { ...c, shelves: [], settings: c?.settings ? { ...c.settings, enabled: false } : c?.settings };
    return <Component {...props} controller={patched} />;
  };
}

export function wrapHomeShelves<P extends object>(Component: React.ComponentType<P>): React.ComponentType<P> {
  if (!shelfError && !forceCrash) return Component;
  return function HomeShelvesQA(_props: P) {
    throw new Error(forceCrash ? "QA: forced home crash" : "QA: forced shelf render error");
  };
}
