import React from "react";
import type { Settings, Shelf } from "../types";

const firstRun = __DEV__ && typeof __QA_FIRST_RUN__ !== "undefined" && __QA_FIRST_RUN__;
const qamError = __DEV__ && typeof __QA_QAM_ERROR__ !== "undefined" && __QA_QAM_ERROR__;
const shelfError = __DEV__ && typeof __QA_SHELF_ERROR__ !== "undefined" && __QA_SHELF_ERROR__;
const allShelvesHide = __DEV__ && typeof __QA_ALL_SHELVES_HIDE_RECENTS__ !== "undefined" && __QA_ALL_SHELVES_HIDE_RECENTS__;
const allShelvesShow = __DEV__ && typeof __QA_ALL_SHELVES_SHOW_RECENTS__ !== "undefined" && __QA_ALL_SHELVES_SHOW_RECENTS__;
const forceTabMaster = __DEV__ && typeof __QA_FORCE_TABMASTER__ !== "undefined" ? __QA_FORCE_TABMASTER__ : "";
const forceUnifiDeck = __DEV__ && typeof __QA_FORCE_UNIFIDECK__ !== "undefined" ? __QA_FORCE_UNIFIDECK__ : "";
const forceNonSteamBadges = __DEV__ && typeof __QA_FORCE_NONSTEAMBADGES__ !== "undefined" ? __QA_FORCE_NONSTEAMBADGES__ : "";

if (firstRun || qamError || shelfError || allShelvesHide || allShelvesShow || forceTabMaster || forceUnifiDeck || forceNonSteamBadges) {
  // eslint-disable-next-line no-console
  console.warn("[Deck Shelves QA] active flags:", { firstRun, qamError, shelfError, allShelvesHide, allShelvesShow, forceTabMaster, forceUnifiDeck, forceNonSteamBadges });
}

function qaAllShelvesFixture(): Shelf[] {
  const base = { enabled: true, hidden: false, limit: 20, matchNativeSize: false, highlightFirst: false, hideStatusLine: false, hideNewBadge: false, hideCompatIcons: false, hideNonSteamBadge: false };
  return [
    { ...base, id: "qa_update_pending", title: "QA: Update pending", source: { type: "filter", filter: { updatePending: true, sort: "alphabetical" } } },
    { ...base, id: "qa_recents", title: "QA: Recents", source: { type: "filter", filter: { sort: "recent" } } },
    { ...base, id: "qa_installed_lib", title: "QA: Library installed", source: { type: "tab", tab: "installed" } },
    { ...base, id: "qa_favorites", title: "QA: Favorites", source: { type: "collection", collectionId: "favorite" } },
    { ...base, id: "qa_installed_meta", title: "QA: Installed by metacritic", source: { type: "filter", filter: { installed: true, sort: "metacritic" } } },
    { ...base, id: "qa_fromsoft", title: "QA: FromSoftware by release", source: { type: "filter", filter: { sort: "release_date", filterGroup: { mode: "and", items: [{ type: "developer", params: { developer: "FromSoftware" } }] } } } },
  ];
}

export function applyQASettingsOverride(s: Settings): Settings {
  if (!allShelvesHide && !allShelvesShow) return s;
  return {
    ...s,
    enabled: true,
    hideRecents: allShelvesHide ? true : false,
    shelves: qaAllShelvesFixture(),
  };
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
  if (!shelfError) return Component;
  return function HomeShelvesQA(_props: P) {
    throw new Error("QA: forced shelf render error");
  };
}
