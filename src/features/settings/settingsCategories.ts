import type { Settings } from "../../types";

export interface SettingsCategory {
  id: string;
  labelKey: string;
  /** Top-level Settings keys this category owns. Used to slice / merge /
   *  reset that subset without touching unrelated fields. */
  keys: ReadonlyArray<string>;
}

// Categories the Export / Import / Reset modals expose as user-selectable
// toggles. Order here is the order shown in the UI.
export const SETTINGS_CATEGORIES: ReadonlyArray<SettingsCategory> = [
  { id: "shelves",          labelKey: "settings_category_shelves",          keys: ["shelves", "allShelvesOrder"] },
  { id: "smart",            labelKey: "settings_category_smart",            keys: ["smartShelves", "smartShelvesEnabled", "smartShelvesAtBottom", "smartSurpriseMe", "smartSurpriseMeCount"] },
  { id: "saved_filters",    labelKey: "settings_category_saved_filters",    keys: ["savedFilters", "savedSmartFilters"] },
  { id: "profiles",         labelKey: "settings_category_profiles",         keys: ["profiles", "activeProfileName"] },
  { id: "button_bindings",  labelKey: "settings_category_button_bindings",  keys: ["buttonBindings", "buttonBindingsDisabled"] },
  { id: "integrations",     labelKey: "settings_category_integrations",     keys: ["integrationsEnabled", "featureToggles"] },
  { id: "visual_global",    labelKey: "settings_category_visual_global",    keys: [
    "globalMatchNativeSize", "globalHighlightFirst", "globalHighlightAll", "globalHighlightRandom",
    "globalHideStatusLine", "globalHideNewBadge", "globalHideDiscountBadge", "globalHideCompatIcons",
    "globalHideNonSteamBadge", "globalHideShelfTitle", "globalHideGameNames", "globalHideInstallIndicator",
    "globalHideSeeMore", "globalHideRefreshCard", "globalDedupeByName", "globalHeroEnabled",
    "globalEnableLogo", "globalEnableIcon", "globalEnableDescription", "globalDescriptionBelowLogo",
    "globalLogoPosition", "globalDescriptionPosition", "globalLogoSize", "globalLogoTopOffset",
    "globalFullPageShelf", "globalIconVerticalAlign", "globalShelfTitlePosition", "globalGameNamePosition",
    "globalPlaytimePosition", "globalDescriptionHeight",
  ] },
  { id: "online",           labelKey: "settings_category_online",           keys: [
    "onlineFeaturesEnabled", "onlineWishlistEnabled", "onlinePriceSortEnabled", "onlinePrivacyAccepted",
    "onlineHideOwnedGames", "onlineHideOwnedNonSteam", "onlineHideOwnedNonSteamCloud",
  ] },
  { id: "behaviour",        labelKey: "settings_category_behaviour",        keys: [
    "enabled", "hideRecents", "recentsReplaceSource", "hideHomeTabs", "shelfHeroBackground",
    "forceCssLoaderThemes", "lightModeEnabled", "offlineModeEnabled", "updateNotifyEnabled", "sideNavEnabled",
    "contextSearchEnabled", "contextSearchKeyboardEnabled", "contextSearchOnEnter",
  ] },
  { id: "qam_visibility",   labelKey: "settings_category_qam_visibility",   keys: ["qamHiddenToggles", "qamHiddenSections", "unifiedListEnabled"] },
];

export type CategoryId = (typeof SETTINGS_CATEGORIES)[number]["id"];

const CATEGORY_BY_ID: Readonly<Record<string, SettingsCategory>> = Object.freeze(
  Object.fromEntries(SETTINGS_CATEGORIES.map((c) => [c.id, c])),
);

/** All category ids — handy default when the caller wants "everything". */
export const ALL_CATEGORY_IDS: ReadonlyArray<string> = SETTINGS_CATEGORIES.map((c) => c.id);

/** Returns a sliced object containing only the selected categories' keys. */
export function pickCategoriesFromSettings(s: Settings | null, selected: ReadonlyArray<string> | Set<string>): Record<string, unknown> {
  if (!s) return {};
  const sel = selected instanceof Set ? selected : new Set(selected);
  const out: Record<string, unknown> = {};
  for (const id of sel) {
    const cat = CATEGORY_BY_ID[id];
    if (!cat) continue;
    for (const k of cat.keys) {
      if (k in (s as any)) out[k] = (s as any)[k];
    }
  }
  return out;
}

/** Merges the selected categories from `imported` into `current`. Unselected
 *  categories keep `current`'s values. Unknown / unselected keys in
 *  `imported` are dropped. */
export function mergeCategoriesIntoSettings(current: Settings, imported: Record<string, unknown>, selected: ReadonlyArray<string> | Set<string>): Settings {
  const sel = selected instanceof Set ? selected : new Set(selected);
  const out: any = { ...current };
  for (const id of sel) {
    const cat = CATEGORY_BY_ID[id];
    if (!cat) continue;
    for (const k of cat.keys) {
      if (k in imported) out[k] = (imported as any)[k];
    }
  }
  return out as Settings;
}

/** Replaces the selected categories in `current` with their values from
 *  `defaults`. Unselected categories stay untouched. */
export function resetCategoriesInSettings(current: Settings, selected: ReadonlyArray<string> | Set<string>, defaults: Settings): Settings {
  const sel = selected instanceof Set ? selected : new Set(selected);
  const out: any = { ...current };
  for (const id of sel) {
    const cat = CATEGORY_BY_ID[id];
    if (!cat) continue;
    for (const k of cat.keys) {
      if (k in (defaults as any)) out[k] = (defaults as any)[k];
      else delete out[k];
    }
  }
  return out as Settings;
}

/** Detects which categories are populated in an imported payload. A
 *  category is "present" when at least one of its keys exists in the
 *  payload (regardless of value). Accepts both the bare-object shape
 *  (`{ key: value, ... }`) and the legacy wrapper (`{ state: {...} }`). */
export function detectCategoriesInPayload(payload: unknown): Set<string> {
  const present = new Set<string>();
  if (!payload || typeof payload !== "object") return present;
  const root = (payload as any).state && typeof (payload as any).state === "object"
    ? (payload as any).state
    : payload;
  for (const cat of SETTINGS_CATEGORIES) {
    for (const k of cat.keys) {
      if (k in root) { present.add(cat.id); break; }
    }
  }
  return present;
}

/** Normalises a payload that may wrap settings under `state`. Returns
 *  the raw key/value map used by `mergeCategoriesIntoSettings`. */
export function unwrapPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const root = (payload as any).state && typeof (payload as any).state === "object"
    ? (payload as any).state
    : payload;
  return root as Record<string, unknown>;
}
