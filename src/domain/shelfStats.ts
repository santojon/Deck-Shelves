const MAX_SOURCE_DEPTH = 8;

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

export function onlineSourceTypes(source: any, depth = 0): string[] {
  if (!source || depth > MAX_SOURCE_DEPTH) return [];
  if (source.type === "store" || source.type === "wishlist") return [source.type];
  if (source.type === "composite" && Array.isArray(source.sources)) {
    return source.sources.flatMap((c: any) => onlineSourceTypes(c, depth + 1));
  }
  return [];
}

export function shelfTypeBreakdown(settings: any): Record<string, number> {
  return { normal: asArray(settings?.shelves).length, smart: asArray(settings?.smartShelves).length };
}

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

function featuredCount(sh: any, count: number | null): number {
  const highlighted = asArray(sh?.highlightedAppIds).length;
  if (sh?.highlightAll) return count ?? highlighted;
  return Math.min(highlighted, count ?? Number.MAX_SAFE_INTEGER) + (sh?.highlightFirst ? 1 : 0);
}

export function cardComposition(settings: any, resolvedCount: ResolvedCount): CompositionSlice[] {
  let normal = 0, featured = 0, decorative = 0, hidden = 0;
  for (const sh of allShelves(settings)) {
    decorative += asArray(sh?.syntheticCards).length;
    hidden += asArray(sh?.hiddenAppIds).length;
    const count = resolvedCount(sh?.id);
    const fav = featuredCount(sh, count);
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
