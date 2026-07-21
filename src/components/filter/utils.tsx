import i18n from "../../i18n";
import type { FilterItemType, FilterItem } from "../../types";

export const ALL_FILTER_TYPES: FilterItemType[] = [
  "installed",
  "favorites",
  "nonSteam",
  "hidden",
  "updatePending",
  "deckCompatibility",
  "shortcutType",
  "playedWithinDays",
  "playtimeRange",
  "recentlyActive",
  "neglected",
  "nameIncludes",
  "nameRegex",
  "developer",
  "publisher",
  "appIdList",
  "cloudAvailable",
  "controllerSupport",
  "systemCompatibility",
  "remotePlayLocation",
  "friends",
  "friendsPlayingNow",
  "friendsPlayedRecently",
  "storeTag",
  "achievements",
  "collection",
  "merge",
  "appStatus",
  "discount",
  "priceRange",
  "familySharing",
  "vrSupport",
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
];

export const COMPAT_LEVELS = ["verified", "playable", "unsupported", "unknown"] as const;

/* Every filter type is invertible: the evaluator negates uniformly
   (`evaluateFilterItem`: `item.inverted ? !result : result`), so the editor
   exposes the opposite-effect toggle for all types — installed, non-Steam,
   hidden, appId blacklist, merge groups, etc. */
export function canBeInverted(_type: FilterItemType): boolean {
  return true;
}

// Fresh default-params factory per filter type (functions so each call gets its
// own object/array — never a shared mutable reference).
const DEFAULT_PARAMS: Partial<Record<FilterItemType, () => Record<string, any>>> = {
  hidden: () => ({ mode: "exclude" }),
  deckCompatibility: () => ({ levels: ["verified", "playable"] }),
  playedWithinDays: () => ({ days: 30 }),
  playtimeRange: () => ({ minHours: undefined, maxHours: undefined }),
  recentlyActive: () => ({ minMinutes: 1 }),
  neglected: () => ({ days: 30 }),
  nameIncludes: () => ({ text: "" }),
  nameRegex: () => ({ pattern: "" }),
  friends: () => ({ friends: [] }),
  friendsPlayingNow: () => ({}),
  friendsPlayedRecently: () => ({ days: 14 }),
  storeTag: () => ({ tags: [] }),
  achievements: () => ({}),
  collection: () => ({ collectionId: "" }),
  developer: () => ({ developers: [] }),
  publisher: () => ({ publishers: [] }),
  appIdList: () => ({ appIds: [] }),
  cloudAvailable: () => ({}),
  controllerSupport: () => ({ min: 1 }),
  remotePlayLocation: () => ({ mode: "remote-only" }),
  merge: () => ({ mode: "and", items: [] }),
  shortcutType: () => ({ kinds: ["game"] }),
  appStatus: () => ({ groups: ["downloading", "queued"] }),
  discount: () => ({ minDiscount: 10, maxDiscount: 100 }),
  priceRange: () => ({ minPrice: undefined, maxPrice: undefined }),
  genres: () => ({ genres: [] }),
  categories: () => ({ categories: [] }),
  franchise: () => ({ franchise: "" }),
  multiplayerType: () => ({ kind: "any" }),
  dlcOwned: () => ({ minCount: 1 }),
  launchCount: () => ({ min: 0, max: undefined }),
  avgSessionMinutes: () => ({ min: 0, max: undefined }),
  recentlyAbandoned: () => ({ minDaysAgo: 7, maxDaysAgo: 60 }),
  playedOnce: () => ({ maxMinutes: 60 }),
  achievementPercentRange: () => ({ min: 0, max: 100 }),
  storageDevice: () => ({ device: "ssd" }),
  installedSizeRange: () => ({ minMB: 0, maxMB: undefined }),
  executableType: () => ({ ext: "" }),
  launchOptionTags: () => ({ tags: [] }),
  customTags: () => ({ tags: [] }),
  parserCategories: () => ({ tags: [] }),
};

export function defaultParams(type: FilterItemType): Record<string, any> {
  return DEFAULT_PARAMS[type]?.() ?? {};
}

const nonEmptyArray = (v: any): boolean => Array.isArray(v) && v.length > 0;

function isValidRegex(pattern: any): boolean {
  const pat = String(pattern ?? "");
  if (!pat) return false;
  try { new RegExp(pat); return true; } catch { return false; }
}

// Per-type param validators. Types with no entry (installed / favorites /
// nonSteam / updatePending / isNew / cloudAvailable / controllerSupport /
// playtimeRange / friendsPlayingNow / achievements) are always valid.
const PARAM_VALIDATORS: Partial<Record<FilterItem["type"], (p: any) => boolean>> = {
  hidden: (p) => !!p.mode,
  deckCompatibility: (p) => nonEmptyArray(p.levels),
  playedWithinDays: (p) => Number(p.days ?? 0) > 0,
  nameIncludes: (p) => String(p.text ?? "").length > 0,
  nameRegex: (p) => isValidRegex(p.pattern),
  friends: (p) => nonEmptyArray(p.friends),
  friendsPlayedRecently: (p) => Number(p.days ?? 0) > 0,
  storeTag: (p) => nonEmptyArray(p.tags),
  collection: (p) => Boolean(p.collectionId),
  developer: (p) => nonEmptyArray(p.developers),
  publisher: (p) => nonEmptyArray(p.publishers),
  appIdList: (p) => nonEmptyArray(p.appIds),
  merge: (p) => nonEmptyArray(p.items),
  shortcutType: (p) => nonEmptyArray(p.kinds),
  appStatus: (p) => nonEmptyArray(p.groups),
  discount: (p) => Number(p.minDiscount ?? 0) >= 0 && Number(p.minDiscount ?? 0) <= 100,
};

export function isValidParams(item: FilterItem): boolean {
  const validator = PARAM_VALIDATORS[item.type];
  return validator ? validator(item.params ?? {}) : true;
}

export function getTypeLabel(type: FilterItemType): string {
  const t = i18n.t.bind(i18n);
  const map: Record<FilterItemType, string> = {
    installed: t("filter_type_installed"),
    favorites: t("filter_type_favorites"),
    nonSteam: t("filter_type_non_steam"),
    hidden: t("filter_type_hidden"),
    updatePending: t("filter_type_update_pending"),
    isNew: t("filter_type_is_new"),
    deckCompatibility: t("filter_type_deck_compatibility"),
    playedWithinDays: t("filter_type_played_within_days"),
    playtimeRange: t("filter_type_playtime_range"),
    recentlyActive: t("filter_type_recently_active"),
    neglected: t("filter_type_neglected"),
    nameIncludes: t("filter_type_name_includes"),
    nameRegex: t("filter_type_name_regex"),
    friends: t("filter_type_friends"),
    friendsPlayingNow: t("filter_type_friends_playing_now"),
    friendsPlayedRecently: t("filter_type_friends_played_recently"),
    storeTag: t("filter_type_store_tag"),
    achievements: t("filter_type_achievements"),
    collection: t("filter_type_collection"),
    developer: t("filter_type_developer"),
    publisher: t("filter_type_publisher"),
    appIdList: t("filter_type_app_id_list"),
    cloudAvailable: t("filter_type_cloud_available"),
    controllerSupport: t("filter_type_controller_support"),
    systemCompatibility: t("filter_type_system_compatibility"),
    remotePlayLocation: t("filter_type_remote_play"),
    merge: t("filter_type_merge"),
    shortcutType: t("filter_type_shortcut_type"),
    appStatus: t("filter_type_app_status"),
    discount: t("filter_type_discount"),
    priceRange: t("filter_type_price_range"),
    familySharing: t("filter_type_family_sharing"),
    vrSupport: t("filter_type_vr_support"),
    soundtrackOwned: t("filter_type_soundtrack_owned"),
    neverCompleted: t("filter_type_never_completed"),
    installedNeverPlayed: t("filter_type_installed_never_played"),
    compatDataQuality: t("filter_type_compat_data_quality"),
    emuDeckSystem: "EmuDeck",
    retroDeckSystem: "RetroDECK",
    heroicLauncher: "Heroic",
    lutrisApp: "Lutris",
    chiakiApp: "Chiaki",
    moonlightApp: "Moonlight",
    hiddenLauncherShortcuts: t("filter_type_hidden_launcher_shortcuts"),
    genres: t("filter_type_genres"),
    categories: t("filter_type_categories"),
    franchise: t("filter_type_franchise"),
    multiplayerType: t("filter_type_multiplayer_type"),
    dlcOwned: t("filter_type_dlc_owned"),
    launchCount: t("filter_type_launch_count"),
    avgSessionMinutes: t("filter_type_avg_session"),
    recentlyAbandoned: t("filter_type_recently_abandoned"),
    playedOnce: t("filter_type_played_once"),
    achievementPercentRange: t("filter_type_achievement_percent"),
    storageDevice: t("filter_type_storage_device"),
    installedSizeRange: t("filter_type_installed_size"),
    executableType: t("filter_type_executable_type"),
    launchOptionTags: t("filter_type_launch_option_tags"),
    customTags: t("filter_type_custom_tags"),
    parserCategories: t("filter_type_parser_categories"),
  };
  return map[type] ?? type;
}

export function isOnlineFilterType(type: FilterItemType): boolean {
  return type === "discount" || type === "priceRange" || type === "friendsPlayingNow" || type === "friendsPlayedRecently";
}

export function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* Icons moved to the shared `src/components/icons.tsx` module so other
   surfaces (QAM section headers, edit modal tabs, About) consume the same
   stroke-style set. Re-exported here to keep existing call sites working
   without churn — they import `CheckIcon` / `XIcon` / `ChevronIcon` /
   `TrashIcon` from this filter-utils module. */
export { CheckIcon, XIcon, ChevronIcon, TrashIcon } from '../icons';

export default {};
