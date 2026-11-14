import type { FilterGroup, FilterItem, Settings, ShelfSource, SmartShelfMode } from "../types";

/* Ids retired in 3.4.2 that have an exact equivalent are rewritten here when the
   settings load, so a saved shelf keeps working. Ids without an equivalent stay as
   saved: the shelf is unavailable until it is edited (steam/availability.ts).
   Every function returns its input object when it has nothing to rewrite. */

type Loose = Record<string, any>;

// Sort keys and the key they duplicated; `flip` reverses the direction.
const SORT_ALIASES: Record<string, { key: string; flip?: boolean }> = {
  newest_purchased: { key: "added" },
  largest_install: { key: "size_on_disk" },
  smallest_install: { key: "size_on_disk", flip: true },
  rediscovered_recently: { key: "recent" },
  most_ignored: { key: "recent", flip: true },
};

const MODE_ALIASES: Record<string, { mode: SmartShelfMode; params?: Record<string, number> }> = {
  long_session_night: { mode: "long_session" },
  never_touched_classics: { mode: "forgotten" },
  monthly_spotlight: { mode: "weekly_rotation", params: { rotateEveryDays: 30 } },
  seasonal_rotation: { mode: "weekly_rotation", params: { rotateEveryDays: 90 } },
};

// Built-in sources and the filter that produces the same games.
const BUILTIN_ALIASES: Record<string, FilterGroup> = {
  dlc_source: { mode: "and", items: [{ type: "shortcutType", inverted: false, params: { kinds: ["dlc"] } }] },
  soundtrack_source: { mode: "and", items: [{ type: "shortcutType", inverted: false, params: { kinds: ["soundtrack"] } }] },
  controller_specific_source: { mode: "and", items: [{ type: "controllerSupport", inverted: false, params: { min: 2 } }] },
};

function reverseAt(reverse: unknown, i: number): boolean {
  return Array.isArray(reverse) ? !!reverse[i] : !!reverse;
}

// `sort` and `sortReverse` under `sortKey`/`reverseKey`, rewritten when a key is an alias.
function migrateSortFields(obj: Loose, sortKey: string, reverseKey: string): Loose {
  const sort = obj[sortKey];
  const keys: unknown[] = Array.isArray(sort) ? sort : [sort];
  if (!keys.some((k) => typeof k === "string" && k in SORT_ALIASES)) return obj;
  const reverse = obj[reverseKey];
  const nextKeys = keys.map((k) => (typeof k === "string" && SORT_ALIASES[k] ? SORT_ALIASES[k].key : k));
  const nextReverse = keys.map((k, i) => {
    const alias = typeof k === "string" ? SORT_ALIASES[k] : undefined;
    return alias?.flip ? !reverseAt(reverse, i) : reverseAt(reverse, i);
  });
  const out = { ...obj };
  if (Array.isArray(sort)) { out[sortKey] = nextKeys; out[reverseKey] = nextReverse; }
  else { out[sortKey] = nextKeys[0]; out[reverseKey] = nextReverse[0]; }
  return out;
}

function cond(type: string, params: Loose): FilterItem {
  return { type, inverted: false, params };
}

function mergeOf(item: FilterItem, mode: "and" | "or", items: FilterItem[]): FilterItem {
  return { type: "merge", inverted: !!item.inverted, params: { mode, items } };
}

// One rewrite per retired condition type that has an equivalent.
const ITEM_REWRITES: Record<string, (item: FilterItem, p: Loose) => FilterItem> = {
  demo: (item) => ({ ...item, type: "shortcutType", params: { kinds: ["demo"] } }),
  installedNeverPlayed: (item) => mergeOf(item, "and", [cond("installed", {}), cond("playtimeRange", { maxHours: 0 })]),
  recentlyAbandoned: (item, p) => mergeOf(item, "and", [
    cond("neglected", { days: Number(p.minDaysAgo ?? 7) }),
    cond("playedWithinDays", { days: Number(p.maxDaysAgo ?? 60) }),
  ]),
  compatDataQuality: (item) => ({ ...item, type: "deckCompatibility", params: { levels: ["verified", "playable", "unsupported"] } }),
  hiddenLauncherShortcuts: (item) => mergeOf(item, "and", [cond("nonSteam", {}), cond("hidden", { mode: "only" })]),
};

// A rewrite, or the same item with the conditions inside it (merge, composites) rewritten.
function migrateItem(item: FilterItem): FilterItem {
  const p: Loose = item.params ?? {};
  const rewrite = ITEM_REWRITES[item.type];
  if (rewrite) return rewrite(item, p);
  const key = Array.isArray(p.items) ? "items" : Array.isArray(p.children) ? "children" : null;
  if (!key) return item;
  const inner = migrateItems(p[key] as FilterItem[]);
  return inner === p[key] ? item : { ...item, params: { ...p, [key]: inner } };
}

function migrateItems(items: FilterItem[]): FilterItem[] {
  let changed = false;
  const next = items.map((it) => {
    const out = it && typeof it === "object" ? migrateItem(it) : it;
    if (out !== it) changed = true;
    return out;
  });
  return changed ? next : items;
}

function migrateGroup<T>(group: T): T {
  const g = group as Loose | undefined;
  if (!g || !Array.isArray(g.items)) return group;
  const items = migrateItems(g.items as FilterItem[]);
  return (items === g.items ? group : { ...g, items }) as T;
}

// Returns `obj` itself unless one of the fields changed.
function patch(obj: Loose, fields: Loose): Loose {
  const changed = Object.keys(fields).some((k) => fields[k] !== obj[k]);
  return changed ? { ...obj, ...fields } : obj;
}

function migrateFilterSource(src: Loose): Loose {
  if (!src.filter || typeof src.filter !== "object") return src;
  let filter = patch(src.filter, { filterGroup: migrateGroup(src.filter.filterGroup) });
  filter = migrateSortFields(filter, "sort", "sortReverse");
  return patch(src, { filter });
}

function migrateModes(modes: unknown): unknown {
  if (!Array.isArray(modes)) return modes;
  const next = modes.map((m: string) => MODE_ALIASES[m]?.mode ?? m);
  return next.some((m, i) => m !== modes[i]) ? next : modes;
}

function migrateSmartSource(src: Loose): Loose {
  return patch(src, { filterGroup: migrateGroup(src.filterGroup), compositeModes: migrateModes(src.compositeModes) });
}

function migrateCompositeSource(src: Loose): Loose {
  if (!Array.isArray(src.sources)) return src;
  const sources = src.sources.map(migrateSource);
  return sources.some((s, i) => s !== src.sources[i]) ? { ...src, sources } : src;
}

function migrateBuiltinSource(src: Loose): Loose {
  const group = BUILTIN_ALIASES[String(src.sourceId)];
  return group ? { type: "filter", filter: { filterGroup: group } } : src;
}

const SOURCE_REWRITES: Record<string, (src: Loose) => Loose> = {
  filter: migrateFilterSource,
  smart: migrateSmartSource,
  composite: migrateCompositeSource,
  builtin: migrateBuiltinSource,
};

function migrateSource(source: unknown): unknown {
  const src = source as Loose | undefined;
  if (!src || typeof src !== "object") return source;
  const withChild = patch(src, { childFilter: migrateGroup(src.childFilter) });
  const rewrite = SOURCE_REWRITES[String(src.type)];
  return rewrite ? rewrite(withChild) : withChild;
}

function migrateShelf(shelf: Loose): Loose {
  let out = migrateSortFields(shelf, "sort", "sortReverse");
  out = migrateSortFields(out, "manualBaseSort", "manualBaseSortReverse");
  const source = migrateSource(shelf.source) as Loose;
  if (source === shelf.source) return out;
  // A built-in source that became a filter keeps its order inside the filter.
  const carriesOrder = shelf.source?.type === "builtin" && source.type === "filter" && out.sort;
  return { ...out, source: carriesOrder ? { ...source, filter: { ...source.filter, sort: out.sort, sortReverse: out.sortReverse } } : source };
}

function migrateSmartShelf(shelf: Loose): Loose {
  let out = migrateSortFields(shelf, "sort", "sortReverse");
  out = migrateSortFields(out, "manualBaseSort", "manualBaseSortReverse");
  out = patch(out, { filterGroup: migrateGroup(out.filterGroup), compositeModes: migrateModes(out.compositeModes) });
  const alias = MODE_ALIASES[String(out.mode)];
  if (!alias) return out;
  const smartParams = alias.params ? { ...alias.params, ...(out.smartParams ?? {}) } : out.smartParams;
  return { ...out, mode: alias.mode, ...(alias.params ? { smartParams } : {}) };
}

function migrateSavedFilter(saved: Loose): Loose {
  return patch(saved, { group: migrateGroup(saved.group) });
}

function migrateList<T extends Loose>(list: unknown, one: (x: T) => T): unknown {
  if (!Array.isArray(list)) return list;
  const next = list.map((x) => (x && typeof x === "object" ? one(x as T) : x));
  return next.some((x, i) => x !== list[i]) ? next : list;
}

function migrateDocument(doc: Loose): Loose {
  return patch(doc, {
    shelves: migrateList(doc.shelves, migrateShelf),
    smartShelves: migrateList(doc.smartShelves, migrateSmartShelf),
    savedFilters: migrateList(doc.savedFilters, migrateSavedFilter),
    savedSmartFilters: migrateList(doc.savedSmartFilters, migrateSmartShelf),
  });
}

function migrateProfile(profile: Loose): Loose {
  const snapshot = profile.snapshot && typeof profile.snapshot === "object" ? migrateDocument(profile.snapshot) : profile.snapshot;
  return patch(profile, { snapshot });
}

/** The settings with every retired id that has an equivalent rewritten; the same object when none was found. */
export function migrateRetiredIds(settings: Settings): Settings {
  const doc = settings as unknown as Loose;
  const out = patch(migrateDocument(doc), { profiles: migrateList(doc.profiles, migrateProfile) });
  return out as unknown as Settings;
}

/** The equivalent of one shelf source, for callers that build a source from saved data. */
export function migrateRetiredSource(source: ShelfSource): ShelfSource {
  return migrateSource(source) as ShelfSource;
}
