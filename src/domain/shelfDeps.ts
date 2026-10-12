/* Which data a shelf's result depends on. A refresh signal names the data
   that changed (see shelfRefresh) and a shelf only re-resolves when the two
   intersect — a friends poll no longer re-runs every local shelf. Unknown
   shapes (plugin sources) depend on everything, and the periodic untagged
   poll still reaches all shelves, so the worst case is today's behaviour. */
export type DepKind = "overviews" | "collections" | "friends" | "online" | "time" | "session";
export type ShelfDeps = Set<DepKind> | "all";

const TIME_FILTER_KEYS = ["playedWithinDays", "addedWithinDays", "releasedWithinDays", "notPlayedForDays", "lastPlayedWithinDays"];

function filterTouchesTime(filter: any): boolean {
  if (!filter || typeof filter !== "object") return false;
  for (const k of TIME_FILTER_KEYS) if (filter[k] !== undefined && filter[k] !== null) return true;
  const groups = Array.isArray(filter.groups) ? filter.groups : Array.isArray(filter.filters) ? filter.filters : [];
  return groups.some((g: any) => filterTouchesTime(g));
}

function filterTouchesFriends(filter: any): boolean {
  if (!filter || typeof filter !== "object") return false;
  if (filter.friendsPlaying !== undefined || filter.friends !== undefined) return true;
  const groups = Array.isArray(filter.groups) ? filter.groups : Array.isArray(filter.filters) ? filter.filters : [];
  return groups.some((g: any) => filterTouchesFriends(g));
}

function addFilterDeps(out: Set<DepKind>, filter: any): void {
  if (filterTouchesTime(filter)) out.add("time");
  if (filterTouchesFriends(filter)) out.add("friends");
}

export function shelfDependencies(source: any, sort?: string | string[] | null): ShelfDeps {
  const out = new Set<DepKind>();
  const sorts = Array.isArray(sort) ? sort : sort ? [sort] : [];
  if (sorts.some((s) => s === "recent" || s === "playtime")) out.add("session");
  if (!collectSourceDeps(source, out)) return "all";
  return out;
}

function addSmartDeps(source: any, out: Set<DepKind>): void {
  out.add("overviews"); out.add("time"); out.add("session");
  if (String(source.mode ?? "").includes("friend")) out.add("friends");
}

function addOnlineDeps(source: any, out: Set<DepKind>): void {
  out.add("online");
  if (source.excludeOwned || source.excludeOwnedNonSteam || source.hideOwnedNonSteamCloud) out.add("overviews");
  addFilterDeps(out, source.childFilter);
}

const SOURCE_DEPS: Record<string, (source: any, out: Set<DepKind>) => boolean> = {
  collection: (s, out) => { out.add("collections"); out.add("overviews"); addFilterDeps(out, s.childFilter); return true; },
  tab: (s, out) => { out.add("collections"); out.add("overviews"); addFilterDeps(out, s.childFilter); return true; },
  filter: (s, out) => { out.add("overviews"); addFilterDeps(out, s.filter); return true; },
  smart: (s, out) => { addSmartDeps(s, out); return true; },
  wishlist: (s, out) => { addOnlineDeps(s, out); return true; },
  store: (s, out) => { addOnlineDeps(s, out); return true; },
  composite: (s, out) => {
    const children = Array.isArray(s.sources) ? s.sources : [];
    addFilterDeps(out, s.childFilter);
    return children.every((c: any) => collectSourceDeps(c, out));
  },
};

// Returns false when the source shape is unknown (→ depend on everything).
function collectSourceDeps(source: any, out: Set<DepKind>): boolean {
  if (!source || typeof source !== "object") return false;
  const handler = SOURCE_DEPS[String(source.type)];
  return handler ? handler(source, out) : false;
}

export function depsIntersect(shelf: ShelfDeps, changed: readonly DepKind[] | undefined): boolean {
  if (shelf === "all" || !changed || changed.length === 0) return true;
  return changed.some((d) => shelf.has(d));
}
