/* Pure shelf/card statistics derivations for the Statistics tab. No I/O — the
   resolver-cache reads (localStorage) and the app-overview lookup are injected
   as callbacks, so these stay side-effect free and unit-testable. Defensive
   against malformed settings: missing / non-array fields, sources without a
   type, and deeply / cyclically nested composites (depth-capped). */

const MAX_SOURCE_DEPTH = 8; // composite-nesting guard, mirrors the resolver cap

export interface CompositionSlice { key: string; label: string; value: number }

export type ResolvedCount = (shelfId: string) => number | null;
export type ResolvedIds = (shelfId: string) => number[] | null;
export type IsNonSteam = (appId: number) => boolean;

function asArray(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function allShelves(settings: any): any[] {
  return [...asArray(settings?.shelves), ...asArray(settings?.smartShelves)];
}

/* Online (store / wishlist) source types anywhere in a shelf's source tree.
   Online sources are often nested inside a composite (e.g. "wishlist ∩ discount"
   + "store ∩ discount"), so a top-level check misses them — recurse, capped. */
export function onlineSourceTypes(source: any, depth = 0): string[] {
  if (!source || depth > MAX_SOURCE_DEPTH) return [];
  if (source.type === "store" || source.type === "wishlist") return [source.type];
  if (source.type === "composite" && Array.isArray(source.sources)) {
    return source.sources.flatMap((c: any) => onlineSourceTypes(c, depth + 1));
  }
  return [];
}

// Shelf count by kind — regular shelves vs smart shelves.
export function shelfTypeBreakdown(settings: any): Record<string, number> {
  return { normal: asArray(settings?.shelves).length, smart: asArray(settings?.smartShelves).length };
}

// Count a source by its type; a composite also counts each of its children in
// their own subtype (recursively, depth-capped) so nested sources surface.
function countSource(src: any, out: Record<string, number>, depth: number): void {
  if (!src || typeof src.type !== "string" || depth > MAX_SOURCE_DEPTH) return;
  out[src.type] = (out[src.type] ?? 0) + 1;
  if (src.type === "composite" && Array.isArray(src.sources)) {
    for (const child of src.sources) countSource(child, out, depth + 1);
  }
}

export function shelfSourceBreakdown(settings: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sh of asArray(settings?.shelves)) countSource(sh?.source, out, 0);
  const smart = asArray(settings?.smartShelves).length;
  if (smart > 0) out.smart = (out.smart ?? 0) + smart;
  return out;
}

/* Card-type composition from the cards in the user's shelves (not launches), so
   store / wishlist cards count by presence. Online cards are attributed via the
   source tree (composites split their resolved count across the online types
   they hold); the rest are game / non-Steam via `isNonSteam`. */
// eslint-disable-next-line complexity
export function cardTypeComposition(settings: any, resolvedIds: ResolvedIds, isNonSteam: IsNonSteam): Record<string, number> {
  const out: Record<string, number> = { game: 0, nonsteam: 0, store: 0, wishlist: 0 };
  for (const sh of allShelves(settings)) {
    const ids = resolvedIds(sh?.id);
    if (!ids || !ids.length) continue;
    const online = Array.from(new Set(onlineSourceTypes(sh?.source)));
    if (online.length > 0) {
      ids.forEach((_, i) => { out[online[i % online.length]]++; });
      continue;
    }
    for (const id of ids) {
      if (isNonSteam(id)) out.nonsteam++; else out.game++;
    }
  }
  return out;
}

/* Card-composition snapshot by display state: normal (regular game cards),
   featured (highlights), decorative (synthetic cards) and hidden. Normal /
   featured use the injected resolved per-shelf card count. */
// eslint-disable-next-line complexity
export function cardComposition(settings: any, resolvedCount: ResolvedCount): CompositionSlice[] {
  let normal = 0, featured = 0, decorative = 0, hidden = 0;
  for (const sh of allShelves(settings)) {
    decorative += asArray(sh?.syntheticCards).length;
    hidden += asArray(sh?.hiddenAppIds).length;
    const count = resolvedCount(sh?.id);
    const highlighted = asArray(sh?.highlightedAppIds).length;
    const fav = sh?.highlightAll
      ? (count ?? highlighted)
      : Math.min(highlighted, count ?? Number.MAX_SAFE_INTEGER) + (sh?.highlightFirst ? 1 : 0);
    featured += fav;
    if (count != null) normal += Math.max(0, count - fav);
  }
  return [
    { key: "normal", label: "normal", value: normal },
    { key: "featured", label: "featured", value: featured },
    { key: "decorative", label: "decorative", value: decorative },
    { key: "hidden", label: "hidden", value: hidden },
  ].filter((r) => r.value > 0);
}
