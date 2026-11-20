import { type AppOverview, appIdOf } from "./appOverview";
import type { FilterGroup, FilterItem, FilterItemType } from "../types";
import { type FilterEvalContext, evaluateFilterItem, flattenItems } from "./filterEval";
import { isOnlineEnabledForSettings, prefetchCatalogFilterData } from "./resolveShared";
import { hasStoreCategory } from "./v3Extensions";
import { getCachedCatalogMeta } from "../core/onlineStore";
import { logInfo } from "../runtime/logger";

// Games outside the library have these too, so they can be read on a joined result.
export const POST_FILTER_TYPES: readonly FilterItemType[] = ["multiplayerType", "categories", "genres", "vrSupport", "discount", "priceRange"];

const READABLE_TYPES: ReadonlySet<string> = new Set([...POST_FILTER_TYPES, "merge", "weightedFilter", "priorityFilter", "exclusionGroup"]);

const PRICE_TYPES: ReadonlySet<string> = new Set(["discount", "priceRange"]);

type Prices = NonNullable<FilterEvalContext["prices"]>;

const NO_PRICES: Prices = new Map();

const hasCatalog = (id: number) => getCachedCatalogMeta(id) !== null;
const hasPrice = (id: number, prices: Prices | undefined) => prices?.has(id) === true;
const hasStoreCategories = (id: number) => hasStoreCategory(id, []) !== null || hasCatalog(id);

const HAS_DATA: Record<string, (id: number, prices: Prices | undefined) => boolean> = {
  discount: hasPrice,
  priceRange: hasPrice,
  genres: hasCatalog,
  categories: hasCatalog,
  vrSupport: hasStoreCategories,
  multiplayerType: hasStoreCategories,
};

export function unsupportedPostFilterType(group: FilterGroup | null | undefined): string | null {
  const bad = flattenItems(group?.items).find((item) => !READABLE_TYPES.has(String(item.type ?? "")));
  return bad ? String(bad.type ?? "") || "(empty)" : null;
}

// Missing data is unknown, never a match, and never turned into one by a negation.
function itemState(item: FilterItem, id: number, ctx: FilterEvalContext): boolean | null {
  const known = flattenItems([item]).every((inner) => HAS_DATA[inner.type]?.(id, ctx.prices) ?? true);
  return known ? evaluateFilterItem(item, { appid: id } as AppOverview, ctx) : null;
}

function groupState(group: FilterGroup, id: number, ctx: FilterEvalContext): boolean | null {
  const states = group.items.map((item) => itemState(item, id, ctx));
  const decisive = group.mode === "or";
  if (states.includes(decisive)) return decisive;
  return states.includes(null) ? null : !decisive;
}

async function onlineAllowed(): Promise<boolean> {
  try {
    const { getCurrentSettings } = await import("../store/settingsStore");
    return isOnlineEnabledForSettings(getCurrentSettings());
  } catch { return false; }
}

async function loadPrices(ids: number[], online: boolean): Promise<Prices> {
  try {
    const { getPriceMap, getCachedPriceMap } = await import("../core/onlineStore");
    return online ? await getPriceMap(ids) : getCachedPriceMap(ids);
  } catch { return new Map(); }
}

// Order is kept and the input is left as it is; a game is kept only when the group is known to match.
export async function applyCompositePostFilter(ids: number[], group: FilterGroup | null | undefined, all: AppOverview[], onMissingData?: (count: number) => void): Promise<number[]> {
  if (!group || !Array.isArray(group.items) || group.items.length === 0) return ids;
  if (unsupportedPostFilterType(group)) return [];
  const items = flattenItems(group.items);
  const online = await onlineAllowed();
  const prices = items.some((item) => PRICE_TYPES.has(item.type)) ? await loadPrices(ids, online) : undefined;
  const byId = new Map(all.map((a) => [appIdOf(a), a] as const));
  if (online) await prefetchCatalogFilterData(items, ids, byId).catch(() => {});
  const ctx: FilterEvalContext = { collectionAppIds: new Map(), prices: prices ?? NO_PRICES };
  const states = ids.map((id) => groupState(group, id, ctx));
  const missing = states.filter((state) => state === null).length;
  if (missing > 0) {
    logInfo("STEAM", "combined-result filter left out games with missing data", { missing, of: ids.length });
    onMissingData?.(missing);
  }
  return ids.filter((_, i) => states[i] === true);
}
