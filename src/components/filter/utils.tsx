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
  "nameIncludes",
  "nameRegex",
  "developer",
  "publisher",
  "appIdList",
  "cloudAvailable",
  "controllerSupport",
  "friends",
  "storeTag",
  "achievements",
  "collection",
  "merge",
];

export const COMPAT_LEVELS = ["verified", "playable", "unsupported", "unknown"] as const;

const INVERTIBLE_SET = new Set<FilterItemType>([
  "favorites",
  "deckCompatibility",
  "shortcutType",
  "playedWithinDays",
  "playtimeRange",
  "nameIncludes",
  "nameRegex",
  "developer",
  "publisher",
  "cloudAvailable",
  "controllerSupport",
]);

export function canBeInverted(type: FilterItemType): boolean {
  return INVERTIBLE_SET.has(type);
}

export function defaultParams(type: FilterItemType): Record<string, any> {
  switch (type) {
    case "hidden": return { mode: "exclude" };
    case "deckCompatibility": return { levels: ["verified", "playable"] };
    case "playedWithinDays": return { days: 30 };
    case "playtimeRange": return { minHours: undefined, maxHours: undefined };
    case "nameIncludes": return { text: "" };
    case "nameRegex": return { pattern: "" };
    case "friends": return { friends: [] };
    case "storeTag": return { tags: [] };
    case "achievements": return {};
    case "collection": return { collectionId: "" };
    case "developer": return { developers: [] };
    case "publisher": return { publishers: [] };
    case "appIdList": return { appIds: [] };
    case "cloudAvailable": return {};
    case "controllerSupport": return { min: 1 };
    case "merge": return { mode: "and", items: [] };
    case "shortcutType": return { kinds: ["game"] };
    default: return {};
  }
}

export function isValidParams(item: FilterItem): boolean {
  const p = item.params ?? {};
  switch (item.type) {
    case "installed":
    case "favorites":
    case "nonSteam":
    case "updatePending":
    case "isNew":
    case "cloudAvailable":
    case "controllerSupport":
      return true;
    case "hidden":
      return !!p.mode;
    case "deckCompatibility":
      return Array.isArray(p.levels) && p.levels.length > 0;
    case "playedWithinDays":
      return Number(p.days ?? 0) > 0;
    case "playtimeRange":
      return true;
    case "nameIncludes":
      return String(p.text ?? "").length > 0;
    case "nameRegex": {
      const pat = String(p.pattern ?? "");
      if (!pat) return false;
      try { new RegExp(pat); return true; } catch { return false; }
    }
    case "friends":
      return Array.isArray(p.friends) && p.friends.length > 0;
    case "storeTag":
      return Array.isArray(p.tags) && p.tags.length > 0;
    case "achievements":
      return true;
    case "collection":
      return Boolean(p.collectionId);
    case "developer":
      return Array.isArray(p.developers) && p.developers.length > 0;
    case "publisher":
      return Array.isArray(p.publishers) && p.publishers.length > 0;
    case "appIdList":
      return Array.isArray(p.appIds) && p.appIds.length > 0;
    case "merge":
      return Array.isArray(p.items) && p.items.length > 0;
    case "shortcutType":
      return Array.isArray(p.kinds) && p.kinds.length > 0;
    default:
      return true;
  }
}

export function getTypeLabel(type: FilterItemType): string {
  const t = i18n.t.bind(i18n);
  const map: Record<FilterItemType, string> = {
    installed: t("filter_type_installed"),
    favorites: t("filter_type_favorites"),
    nonSteam: t("filter_type_nonSteam"),
    hidden: t("filter_type_hidden"),
    updatePending: t("filter_type_updatePending"),
    isNew: t("filter_type_isNew"),
    deckCompatibility: t("filter_type_deckCompatibility"),
    playedWithinDays: t("filter_type_playedWithinDays"),
    playtimeRange: t("filter_type_playtimeRange"),
    nameIncludes: t("filter_type_nameIncludes"),
    nameRegex: t("filter_type_nameRegex"),
    friends: t("filter_type_friends"),
    storeTag: t("filter_type_storeTag"),
    achievements: t("filter_type_achievements"),
    collection: t("filter_type_collection"),
    developer: t("filter_type_developer"),
    publisher: t("filter_type_publisher"),
    appIdList: t("filter_type_appIdList"),
    cloudAvailable: t("filter_type_cloudAvailable"),
    controllerSupport: t("filter_type_controllerSupport"),
    merge: t("filter_type_merge"),
    shortcutType: t("filter_type_shortcutType"),
  };
  return map[type] ?? type;
}

export function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Icons moved to the shared `src/components/icons.tsx` module so other
// surfaces (QAM section headers, edit modal tabs, About) consume the same
// stroke-style set. Re-exported here to keep existing call sites working
// without churn — they import `CheckIcon` / `XIcon` / `ChevronIcon` /
// `TrashIcon` from this filter-utils module.
export { CheckIcon, XIcon, ChevronIcon, TrashIcon } from '../icons';

export default {};
