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

// Stable fake version surfaced by the update notifier when `qa:update-available`
// is set. Picked far above any real release so semver compare always reports
// "newer" without depending on `pkg.version`.
const QA_FAKE_LATEST_VERSION = "99.0.0";
const QA_FAKE_RELEASE_URL = "https://github.com/santojon/Deck-Shelves/releases/tag/v99.0.0";

if (firstRun || qamError || shelfError || allShelvesHide || allShelvesShow || allShelvesHideTabs || allShelvesShowTabs || forceTabMaster || forceUnifiDeck || forceNonSteamBadges || smartShelvesFixture || savedFiltersFixture || forceHidden || surpriseMe || forceCrash || forceReplaceFailed || updateAvailable || updateDismissed || updateOffline || collectionEmpty || collectionInverted) {
  // eslint-disable-next-line no-console
  console.warn("[Deck Shelves QA] active flags:", {
    firstRun, qamError, shelfError,
    allShelvesHide, allShelvesShow, allShelvesHideTabs, allShelvesShowTabs,
    forceTabMaster, forceUnifiDeck, forceNonSteamBadges,
    smartShelvesFixture, savedFiltersFixture, forceHidden, surpriseMe, forceCrash, forceReplaceFailed,
    updateAvailable, updateDismissed, updateOffline, collectionEmpty, collectionInverted,
  });
}

function qaAllShelvesFixture(): Shelf[] {
  const base = { enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, highlightAll: false, hideStatusLine: false, hideNewBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false, hideRefreshCard: false };
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
  const base = { enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, highlightAll: false, hideStatusLine: false, hideNewBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false, hideRefreshCard: false };
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
  const base = { enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, highlightAll: false, hideStatusLine: false, hideNewBadge: false, hideCompatIcons: false, hideNonSteamBadge: false, hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false, hideSeeMore: false, hideRefreshCard: false };
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
  ) return s;
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
