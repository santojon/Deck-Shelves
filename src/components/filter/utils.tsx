import i18n from "../../i18n";
import type { FilterItemType, FilterItem } from "../../types";

export const ALL_FILTER_TYPES: FilterItemType[] = [
  "installed",
  "favorites",
  "nonSteam",
  "hidden",
  "updatePending",
  "deckCompatibility",
  "playedWithinDays",
  "playtimeRange",
  "nameIncludes",
  "nameRegex",
  "developer",
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
  "playedWithinDays",
  "playtimeRange",
  "nameIncludes",
  "nameRegex",
  "developer",
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
    case "merge": return { mode: "and", items: [] };
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
    case "merge":
      return Array.isArray(p.items) && p.items.length > 0;
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
    merge: t("filter_type_merge"),
  };
  return map[type] ?? type;
}

export function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3, flexShrink: 0 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f44336" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3, flexShrink: 0 }}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: "transform 0.2s ease-in-out", transform: open ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M10 10v6" /><path d="M14 10v6" /><path d="M6 6l1 14h10l1-14" />
  </svg>
);

export default {};
