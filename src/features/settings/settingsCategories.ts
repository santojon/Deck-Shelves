import type { Settings } from "../../types";

export interface SettingsCategory {
  id: string;
  labelKey: string;
  keys: ReadonlyArray<string>;
}

// Every top-level Settings field must belong to exactly one category, or it never exports.
export const SETTINGS_CATEGORIES: ReadonlyArray<SettingsCategory> = [
  { id: "shelves",          labelKey: "settings_category_shelves",          keys: ["shelves", "allShelvesOrder"] },
  { id: "smart",            labelKey: "settings_category_smart",            keys: ["smartShelves", "smartShelvesEnabled", "smartShelvesAtBottom", "smartSurpriseMe", "smartSurpriseMeCount"] },
  { id: "saved_filters",    labelKey: "settings_category_saved_filters",    keys: ["savedFilters", "savedSmartFilters"] },
  { id: "profiles",         labelKey: "settings_category_profiles",         keys: ["profiles", "activeProfileName", "profileTriggersEnabled", "factoryProfileTrigger"] },
  { id: "button_bindings",  labelKey: "settings_category_button_bindings",  keys: ["buttonBindings", "buttonBindingsDisabled", "keyboardBindings", "keyboardBindingsDisabled", "cardActionShortcutsEnabled"] },
  { id: "integrations",     labelKey: "settings_category_integrations",     keys: ["integrationsEnabled", "featureToggles"] },
  { id: "visual_global",    labelKey: "settings_category_visual_global",    keys: [
    "globalMatchNativeSize", "globalHighlightFirst", "globalHighlightAll", "globalHighlightRandom",
    "globalHideStatusLine", "globalHideNewBadge", "globalHideDiscountBadge", "discountBadgeMode", "discountBadgeFocusMode", "globalHideCompatIcons",
    "globalHideNonSteamBadge", "globalHideShelfTitle", "globalHideGameNames", "globalHideInstallIndicator",
    "globalHideSeeMore", "globalHideRefreshCard", "globalDedupeByName", "globalHeroEnabled",
    "globalEnableLogo", "globalEnableIcon", "globalEnableDescription", "globalDescriptionBelowLogo",
    "globalLogoPosition", "globalDescriptionPosition", "globalLogoSize", "globalLogoTopOffset",
    "globalFullPageShelf", "globalIconVerticalAlign", "globalShelfTitlePosition", "globalGameNamePosition",
    "globalPlaytimePosition", "globalDescriptionHeight", "globalDescriptionScale", "globalLogoBelowShelf",
    "globalDescriptionLogoGap", "globalGameInfoAbove", "globalFriendsPlayingOverlay", "globalFriendsPlayingOverlayRecent",
  ] },
  { id: "online",           labelKey: "settings_category_online",           keys: [
    "onlineFeaturesEnabled", "onlineWishlistEnabled", "onlinePriceSortEnabled", "onlinePrivacyAccepted",
    "onlineHideOwnedGames", "onlineHideOwnedNonSteam", "onlineHideOwnedNonSteamCloud", "onlineMetadataEnabled",
  ] },
  { id: "behaviour",        labelKey: "settings_category_behaviour",        keys: [
    "enabled", "hideRecents", "recentsReplaceSource", "hideHomeTabs", "shelfHeroBackground",
    "forceCssLoaderThemes", "lightModeEnabled", "offlineModeEnabled", "updateNotifyEnabled", "sideNavEnabled",
    "betaChannelEnabled", "updateNotifyDismissedVersion",
    "contextSearchEnabled", "contextSearchKeyboardEnabled", "contextSearchOnEnter",
    "gameContextMenuEnabled", "ownQamTabEnabled", "advancedModeEnabled",
    "templateSuggestionsEnabled", "removalSuggestionsEnabled", "autoCollapseEnabled",
    "notificationsDisabled", "notificationsDisabledAreas", "showcaseSeen", "setupWizardSeen", "lastSetupApply", "hubConfig",
    "cloudSyncEnabled", "cloudSyncLastSyncedAt",
    "schemaVersion", "syncTombstones", "preferencesUpdatedAt",
  ] },
  { id: "qam_visibility",   labelKey: "settings_category_qam_visibility",   keys: ["qamHiddenToggles", "qamHiddenSections", "unifiedListEnabled"] },
  { id: "showcase",         labelKey: "settings_category_showcase",         keys: [
    "showcaseModeEnabled", "showcaseStartAfterSeconds", "showcaseDwellSeconds", "showcaseRandomize",
    "showcaseStopOnInteraction", "showcaseShelfIds", "showcasePanCards", "showcaseCardsPerShelf",
    "showcaseCardDwellSeconds",
  ] },
  { id: "screensaver",      labelKey: "settings_category_screensaver",      keys: [
    "screensaverShelvesEnabled", "screensaverShelvesIncludeScreenshots", "screensaverOnlineScreenshotsEnabled",
    "screensaverIdleBackupAcSec", "screensaverIdleBackupBatterySec", "screensaverStartAfterSeconds",
    "screensaverDwellSeconds", "screensaverLogoEnabled", "screensaverLogoSize", "screensaverLogoPosition",
    "screensaverLogoAtTop", "screensaverLogoOffset", "screensaverLogoOnScreenshots", "screensaverShelfBatchSize",
    "screensaverDescriptionEnabled", "screensaverDescriptionAboveLogo", "screensaverDescriptionLogoGap",
  ] },
  { id: "developer",        labelKey: "settings_category_developer",        keys: [
    "verboseLoggingEnabled", "devModeEnabled", "debugOverlayEnabled", "debugOverlayCorner",
    "debugOverlayVertical", "debugOverlayFps", "debugOverlayStats", "debugOverlayPerShelf",
    "debugOverlayOutlines", "debugOverlayFocus", "debugOverlayTransparent",
  ] },
];

export const NOT_EXPORTED_FIELDS: ReadonlyArray<string> = ["accountSettings"];

const CATEGORY_BY_ID: Readonly<Record<string, SettingsCategory>> = Object.freeze(
  Object.fromEntries(SETTINGS_CATEGORIES.map((c) => [c.id, c])),
);

export const ALL_CATEGORY_IDS: ReadonlyArray<string> = SETTINGS_CATEGORIES.map((c) => c.id);

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

const EXPORT_FORMAT = "deck-shelves-settings";
const EXPORT_FORMAT_VERSION = 1;

export function buildExportPayload(
  state: Record<string, unknown>,
  scope: ReadonlyArray<string>,
  opts: { appVersion: string; schemaVersion: number },
): Record<string, unknown> {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    appVersion: opts.appVersion,
    schemaVersion: opts.schemaVersion,
    createdAt: new Date().toISOString(),
    scope: [...scope],
    state,
  };
}

export function unwrapPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const root = (payload as any).state && typeof (payload as any).state === "object"
    ? (payload as any).state
    : payload;
  return root as Record<string, unknown>;
}
