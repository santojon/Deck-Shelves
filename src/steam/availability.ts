import type { FilterGroup, ShelfSource } from "../types";
import { hasExternalSmartSource } from "../core/pluginApi";
import { unsupportedFilterType } from "./filterEval";
import { isSupportedSortKey } from "./sorting";
import { RETIRED_SMART_MODES, INTERNAL_SMART_MODES } from "./smartShelves";
import { SOURCE_V3_RESOLVERS } from "./v3Extensions";

/* Why a shelf cannot resolve: a condition, sort key, built-in source or smart mode
   that nothing evaluates any more (retired, or a plugin's that is not loaded). The
   whole query is refused rather than evaluated without the missing piece, so a
   shelf never widens to the library or orders by a key it does not have. */

type Loose = ShelfSource & Record<string, any>;

function unsupportedSort(sort: unknown): string | null {
  const keys = Array.isArray(sort) ? sort : sort ? [sort] : [];
  for (const key of keys) if (typeof key === "string" && key && !isSupportedSortKey(key)) return `sort ${key}`;
  return null;
}

function unsupportedCondition(group: unknown): string | null {
  const type = unsupportedFilterType(group as FilterGroup | undefined);
  return type ? `condition ${type}` : null;
}

function unsupportedSmartMode(mode: unknown): string | null {
  const id = String(mode ?? "");
  const live = !id || id === "custom" || (INTERNAL_SMART_MODES.has(id) && !RETIRED_SMART_MODES.has(id)) || hasExternalSmartSource(id);
  return live ? null : `smart mode ${id}`;
}

// The checks per source type; each returns the first thing it cannot run.
const SOURCE_CHECKS: Record<string, (source: Loose) => string | null> = {
  filter: (s) => unsupportedCondition(s.filter?.filterGroup) ?? unsupportedSort(s.filter?.sort),
  builtin: (s) => (String(s.sourceId) in SOURCE_V3_RESOLVERS ? null : `source ${s.sourceId}`),
  smart: (s) => {
    const modes = [s.mode, ...(Array.isArray(s.compositeModes) ? s.compositeModes : [])];
    return modes.map(unsupportedSmartMode).find(Boolean) ?? unsupportedCondition(s.filterGroup);
  },
  composite: (s) => (Array.isArray(s.sources) ? s.sources.map((sub: Loose) => unsupportedInSource(sub)).find(Boolean) ?? null : null),
};

function unsupportedInSource(source: Loose): string | null {
  const child = unsupportedCondition(source.childFilter);
  if (child) return child;
  return SOURCE_CHECKS[String(source.type)]?.(source) ?? null;
}

/** Null when every part of the query can run; otherwise what cannot. */
export function unavailableReason(source: ShelfSource, sort?: string | string[]): string | null {
  return unsupportedSort(sort) ?? unsupportedInSource(source as Loose);
}
