import type { AppOverview } from "./steam";
import {
  deckCompatToLabel,
  getDeckCompatCategory,
  hasTagData,
  isInstalled,
  isNonSteam,
} from "./steam";
import type {
  FilterMode,
  ShelfFilter,
  ShelfTabType,
  TagsFilter,
  TimePlayedFilter,
} from "../types";

function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function daysToSeconds(days: number): number {
  return Math.floor(days * 24 * 60 * 60);
}

function normalize(s?: string): string {
  return (s ?? "").trim().toLowerCase();
}

export function matchesTab(ov: AppOverview, tab: ShelfTabType): boolean {
  switch (tab) {
    case "installed":
      return isInstalled(ov);
    case "favorites":
      return !!ov.is_favorite;
    case "hidden":
      return !!ov.is_hidden;
    case "recently_played":
      return (ov.last_played_time ?? 0) > 0;
    case "not_played":
      return (ov.playtime_forever ?? 0) === 0;
    case "non_steam":
      return isNonSteam(ov);
    default:
      return false;
  }
}

export interface FilterEvalContext {
  /** map collectionId -> appids */
  collections?: Record<string, number[]>;
}

function evalTags(ov: AppOverview, f: TagsFilter): boolean {
  if (!f.tags.length) return true;
  const tags = hasTagData(ov) ? (ov as any).store_tags ?? (ov as any).tags : undefined;
  const present = new Set<string>((tags ?? []).map(normalize));
  const wanted = f.tags.map(normalize).filter(Boolean);

  if (f.mode === "any") return wanted.some((t) => present.has(t));
  return wanted.every((t) => present.has(t));
}

function cmpMinutes(value: number, f: TimePlayedFilter): boolean {
  const m = Math.max(0, f.minutes ?? 0);
  switch (f.comparator) {
    case ">":
      return value > m;
    case ">=":
      return value >= m;
    case "<":
      return value < m;
    case "<=":
      return value <= m;
    default:
      return true;
  }
}

function matchesSingleFilter(
  ov: AppOverview,
  filter: ShelfFilter,
  ctx: FilterEvalContext
): boolean {
  if (!filter.enabled) return true;

  switch (filter.type) {
    case "collection": {
      const ids = ctx.collections?.[filter.collectionId] ?? [];
      return ids.includes(ov.appid);
    }
    case "installed":
      return isInstalled(ov) === filter.installed;
    case "regex": {
      const hay = ov.display_name ?? ov.sort_as ?? "";
      try {
        const re = new RegExp(filter.pattern, filter.flags ?? "i");
        return re.test(hay);
      } catch {
        return false;
      }
    }
    case "tags":
      // If Steam doesn't expose tags in this build, we do not attempt to guess.
      // This keeps behavior consistent with "reflect native".
      return hasTagData(ov) ? evalTags(ov, filter) : false;
    case "whitelist":
      return filter.appids.includes(ov.appid);
    case "blacklist":
      return !filter.appids.includes(ov.appid);
    case "platform":
      return filter.platform === "non_steam" ? isNonSteam(ov) : !isNonSteam(ov);
    case "deck_compat": {
      const label = deckCompatToLabel(getDeckCompatCategory(ov));
      return filter.statuses.includes(label);
    }
    case "time_played":
      return cmpMinutes(ov.playtime_forever ?? 0, filter);
    case "last_played": {
      const last = ov.last_played_time ?? 0;
      const cutoff = nowUnixSeconds() - daysToSeconds(Math.max(0, filter.days ?? 0));
      if (filter.comparator === "within_days") return last > 0 && last >= cutoff;
      return last <= 0 || last < cutoff;
    }
    default:
      return true;
  }
}

export function matchesFilters(
  ov: AppOverview,
  mode: FilterMode,
  filters: ShelfFilter[],
  ctx: FilterEvalContext
): boolean {
  const enabled = filters.filter((f) => f.enabled);
  if (!enabled.length) return true;

  if (mode === "any") {
    return enabled.some((f) => matchesSingleFilter(ov, f, ctx));
  }

  return enabled.every((f) => matchesSingleFilter(ov, f, ctx));
}

export function sortDefault(a: AppOverview, b: AppOverview): number {
  // Prefer most recently played, then name.
  const la = a.last_played_time ?? 0;
  const lb = b.last_played_time ?? 0;
  if (la !== lb) return lb - la;
  const na = normalize(a.display_name ?? a.sort_as);
  const nb = normalize(b.display_name ?? b.sort_as);
  return na.localeCompare(nb);
}
