// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FilterGroup, FilterItem, ShelfSource } from "../../types";

type Meta = { genres: string[]; categories: string[]; vrSupported: boolean };
type Price = { price: number; originalPrice: number; discount: number; currency: string; isFree: boolean; unpriced?: boolean };

const data = vi.hoisted(() => ({
  apps: [] as any[],
  wishlist: [] as number[],
  store: [] as number[],
  catalog: new Map<number, Meta>(),
  prices: new Map<number, Price>(),
  catalogFails: false,
  catalogCalls: [] as number[][],
  logs: [] as Array<[string, unknown]>,
  priceCalls: [] as number[][],
  settings: {} as Record<string, unknown>,
}));

vi.mock("../../runtime/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../runtime/logger")>()),
  logInfo: (_scope: string, message: string, context?: unknown) => { data.logs.push([message, context]); },
}));

vi.mock("../../steam/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../steam/library")>()),
  getAllAppOverviews: async () => data.apps,
}));
vi.mock("../../store/settingsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../store/settingsStore")>()),
  getCurrentSettings: () => data.settings,
}));
vi.mock("../../core/onlineStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../core/onlineStore")>()),
  getWishlistIds: async () => data.wishlist,
  getWishlistEmptyReason: () => null,
  getStoreGameIds: async () => data.store,
  getPriceMap: async (ids: number[]) => {
    data.priceCalls.push(ids);
    return new Map(ids.filter((id) => data.prices.has(id)).map((id) => [id, data.prices.get(id)!]));
  },
  getCachedCatalogMeta: (id: number) => data.catalog.get(id) ?? null,
  getCatalogMetaMap: async (ids: number[]) => {
    data.catalogCalls.push(ids);
    if (data.catalogFails) throw new Error("network down");
    return new Map(ids.filter((id) => data.catalog.has(id)).map((id) => [id, data.catalog.get(id)!]));
  },
}));

import { resolveShelfAppIds, invalidateOnlineResolveCache } from "../../steam";
import { buildInitialShelfState } from "../../components/qam/modals/editShelf/buildInitialState";
import { assembleFinalSource, buildPrimarySource } from "../../components/qam/modals/editShelf/saveHelpers";
import { withoutSourceRow } from "../../components/qam/modals/editShelf/removeSource";
import { POST_FILTER_TYPES, applyCompositePostFilter, unsupportedPostFilterType } from "../../steam/compositePostFilter";
import { unavailableReason } from "../../steam/availability";

const LOCAL = "Shared/Split Screen";
const meta = (categories: string[], genres: string[] = []): Meta => ({ categories, genres, vrSupported: false });
const localCoop: FilterItem = { type: "categories", inverted: false, params: { categories: [LOCAL] } };
const indie: FilterItem = { type: "genres", inverted: false, params: { genres: ["Indie"] } };
const bigDiscount: FilterItem = { type: "discount", inverted: false, params: { minDiscount: 30 } };
const and = (...items: FilterItem[]): FilterGroup => ({ mode: "and", items });
const or = (...items: FilterItem[]): FilterGroup => ({ mode: "or", items });
const not = (item: FilterItem): FilterItem => ({ ...item, inverted: true });

const price = (cents: number, discount = 0): Price => ({ price: cents, originalPrice: cents, discount, currency: "USD", isFree: false });
const unpriced: Price = { price: 0, originalPrice: 0, discount: 0, currency: "USD", isFree: true, unpriced: true };

function seedPrices(entries: Record<number, Price>): void {
  data.prices = new Map(Object.entries(entries).map(([id, p]) => [Number(id), p]));
  const cache: Record<number, { ts: number; data: Price }> = {};
  for (const [id, p] of data.prices) cache[id] = { ts: Date.now(), data: p };
  localStorage.setItem("ds-price-cache-v1", JSON.stringify(cache));
}

function composite(over: Record<string, unknown> = {}, wishlist: object = {}, store: object = {}): ShelfSource {
  return { type: "composite", combine: "union", sources: [{ type: "wishlist", ...wishlist }, { type: "store", ...store }], ...over } as ShelfSource;
}

const resolve = (source: ShelfSource, limit = 50, sort?: string) => resolveShelfAppIds(source, limit, sort);

beforeEach(() => {
  invalidateOnlineResolveCache();
  localStorage.clear();
  data.apps = [{ appid: 900, display_name: "Elsewhere" }];
  data.wishlist = [1, 2, 3];
  data.store = [3, 4, 5];
  data.catalog = new Map([
    [1, meta(["Single-player"], ["Action"])],
    [2, meta([LOCAL], ["Indie"])],
    [3, meta([LOCAL], ["Action"])],
    [4, meta([LOCAL, "Single-player"], ["Indie"])],
    [5, meta(["Single-player"], ["Indie"])],
  ]);
  data.prices = new Map();
  data.catalogFails = false;
  data.catalogCalls = [];
  data.logs = [];
  data.priceCalls = [];
  data.settings = { onlineFeaturesEnabled: true, onlineWishlistEnabled: true };
});

describe("a multi-source shelf with a filter on the combined result", () => {
  it("joins both sources as before when no level has a filter", async () => {
    expect(await resolve(composite())).toEqual([1, 3, 2, 4, 5]);
  });

  it("keeps only the joined games that match the combined-result filter", async () => {
    expect(await resolve(composite({ postFilter: and(localCoop) }))).toEqual([3, 2, 4]);
  });

  it("a filter on the wishlist alone leaves the store unfiltered", async () => {
    expect(await resolve(composite({}, { childFilter: and(localCoop) }))).toEqual([2, 3, 4, 5]);
  });

  it("a filter on the store alone leaves the wishlist unfiltered", async () => {
    expect(await resolve(composite({}, {}, { childFilter: and(indie) }))).toEqual([1, 4, 2, 5, 3]);
  });

  it("filters each source before the join and the joined result after it", async () => {
    data.wishlist = [1, 2, 3, 6];
    data.store = [4, 5, 7, 8];
    data.catalog.set(6, meta([LOCAL], ["Indie"]));
    data.catalog.set(7, meta(["Single-player"], ["Action"]));
    data.catalog.set(8, meta([LOCAL], ["Action"]));
    seedPrices({ 4: price(1000, 10), 5: price(1000, 50), 7: price(1000, 40), 8: price(1000, 60) });
    const source = composite({ postFilter: and(localCoop) }, { childFilter: and(indie) }, { childFilter: and(bigDiscount) });
    expect(await resolve(composite({}, { childFilter: and(indie) }, { childFilter: and(bigDiscount) }))).toEqual([2, 5, 6, 7, 8]);
    expect(await resolve(source)).toEqual([2, 6, 8]);
  });

  it("lists a game found in both sources once", async () => {
    data.wishlist = [3, 1];
    data.store = [5, 3];
    expect(await resolve(composite({ postFilter: and(localCoop) }))).toEqual([3]);
  });

  it("an intersection keeps only the shared games that match", async () => {
    data.wishlist = [1, 2, 3, 4];
    data.store = [3, 4, 5, 1];
    data.catalog.set(3, meta(["Single-player"]));
    expect(await resolve(composite({ combine: "intersection" }))).toEqual([1, 3, 4]);
    expect(await resolve(composite({ combine: "intersection", postFilter: and(localCoop) }))).toEqual([4]);
  });

  it("an AND group needs every condition and an OR group any of them", async () => {
    expect(await resolve(composite({ postFilter: and(localCoop, indie) }))).toEqual([2, 4]);
    expect(await resolve(composite({ postFilter: or(localCoop, indie) }))).toEqual([3, 2, 4, 5]);
  });

  it("a negated condition never matches a game whose data is missing", async () => {
    data.catalog.delete(5);
    expect(await resolve(composite({ postFilter: and(not(localCoop)) }))).toEqual([1]);
  });

  it("a negated multiplayer or VR condition never matches a game with no local or catalog data", async () => {
    data.catalog.delete(5);
    const coop: FilterItem = { type: "multiplayerType", params: { kind: "coop" } };
    const vr: FilterItem = { type: "vrSupport", params: {} };
    expect(await resolve(composite({ postFilter: and(not(coop)) }))).toEqual([1, 3, 2, 4]);
    expect(await resolve(composite({ postFilter: and(not(vr)) }))).toEqual([1, 3, 2, 4]);
  });

  describe("with games in the library", () => {
    const localCategories: Record<number, number[]> = { 10: [9], 11: [31], 12: [2] };
    beforeEach(() => {
      (globalThis as any).appStore = {
        GetAppOverviewByAppID: (id: number) => (localCategories[id] ? { appid: id, BHasStoreCategory: (cat: number) => localCategories[id].includes(cat) } : null),
      };
    });
    afterEach(() => { delete (globalThis as any).appStore; });

    it("reads an owned game's multiplayer and VR data from the library when the catalog has none", async () => {
      data.apps = [10, 11, 12].map((appid) => ({ appid, display_name: `Owned ${appid}` }));
      data.store = [3, 4, 10, 11, 12];
      data.catalog.set(4, meta(["Online Co-op"]));
      const coop: FilterItem = { type: "multiplayerType", params: { kind: "coop" } };
      const vr: FilterItem = { type: "vrSupport", params: {} };
      expect(await resolve(composite({ postFilter: and(coop) }))).toEqual([4, 10]);
      expect(await resolve(composite({ postFilter: and(vr) }))).toEqual([11]);
      expect(await resolve(composite({ postFilter: and(not(vr)) }))).toEqual([1, 3, 2, 4, 10, 12]);
      expect(data.catalogCalls.flat()).not.toContain(10);
    });
  });

  it("filters a game outside the library by its catalog data and leaves it out without any", async () => {
    data.apps = [{ appid: 3, display_name: "Owned" }];
    data.catalog.delete(2);
    expect(await resolve(composite({ postFilter: and(localCoop) }))).toEqual([3, 4]);
  });

  it("leaves every game out when the catalog cannot be reached and nothing is cached", async () => {
    data.catalog = new Map();
    data.catalogFails = true;
    expect(await resolve(composite({ postFilter: and(localCoop) }))).toEqual([]);
    expect(await resolve(composite({ postFilter: and(not(localCoop)) }))).toEqual([]);
  });

  it("an OR group still matches on a known condition when another one has no data", async () => {
    data.wishlist = [2, 9];
    data.store = [5];
    seedPrices({ 5: price(1000, 50) });
    expect(await resolve(composite({ postFilter: or(localCoop, bigDiscount) }))).toEqual([2, 5]);
  });

  it("reads prices and discounts that are known and leaves out games without a price", async () => {
    data.wishlist = [1, 2];
    data.store = [3, 4];
    seedPrices({ 1: price(1999, 50), 2: price(999, 10), 3: unpriced });
    expect(await resolve(composite({ postFilter: and(bigDiscount) }))).toEqual([1]);
    expect(await resolve(composite({ postFilter: and(not(bigDiscount)) }))).toEqual([3, 2]);
    expect(await resolve(composite({ postFilter: and({ type: "priceRange", params: { maxPrice: 15 } }) }))).toEqual([2]);
  });

  it("never matches a price condition when the price cache cannot be read", async () => {
    data.wishlist = [1, 2];
    data.store = [3];
    data.prices = new Map([[1, price(1000, 5)], [2, price(1000, 0)], [3, price(1000, 0)]]);
    expect(await resolve(composite({ postFilter: and(bigDiscount) }))).toEqual([]);
    expect(await resolve(composite({ postFilter: and({ type: "priceRange", params: { maxPrice: 5 } }) }))).toEqual([]);
  });

  it("reads the prices it was given rather than an older copy in the cache", async () => {
    data.wishlist = [1, 2];
    data.store = [];
    seedPrices({ 1: price(1000, 50), 2: price(1000, 50) });
    data.prices.set(2, price(1000, 10));
    expect(await resolve(composite({ postFilter: and(bigDiscount) }))).toEqual([1]);
    expect(await resolve(composite({ postFilter: and(not(bigDiscount)) }))).toEqual([2]);
  });

  it("leaves every game out of a price condition when no price is known at all", async () => {
    expect(await resolve(composite({ postFilter: and(bigDiscount) }))).toEqual([]);
    expect(await resolve(composite({ postFilter: and({ type: "priceRange", params: { maxPrice: 1000 } }) }))).toEqual([]);
  });

  it("reads the conditions inside a group like the ones at the top", async () => {
    data.catalog.delete(5);
    const nested: FilterItem = { type: "merge", params: { mode: "or", items: [localCoop, indie] } };
    expect(await resolve(composite({ postFilter: and(nested) }))).toEqual([3, 2, 4]);
  });

  it("a negated condition inside a group never matches a game whose data is missing", async () => {
    data.catalog.delete(5);
    const nested: FilterItem = { type: "merge", params: { mode: "and", items: [not(localCoop)] } };
    expect(await resolve(composite({ postFilter: and(nested) }))).toEqual([1]);
  });

  it("fetches catalog data for the joined games when the condition sits inside a group", async () => {
    const nested: FilterItem = { type: "merge", params: { mode: "or", items: [localCoop] } };
    await resolve(composite({ postFilter: and(nested) }));
    expect(data.catalogCalls).toEqual([[1, 3, 2, 4, 5]]);
  });

  it("reads the known prices for a price condition inside a group", async () => {
    data.wishlist = [1];
    data.store = [2];
    seedPrices({ 1: price(1999, 50), 2: price(999, 10) });
    const nested: FilterItem = { type: "merge", params: { mode: "and", items: [bigDiscount] } };
    expect(await resolve(composite({ postFilter: and(nested) }))).toEqual([1]);
  });

  it("an unknown condition or one the combined result cannot read empties the shelf instead of widening it", async () => {
    expect(await resolve(composite({ postFilter: and({ type: "notACondition", params: {} }) }))).toEqual([]);
    expect(await resolve(composite({ postFilter: and({ type: "installed", params: {} }) }))).toEqual([]);
    expect(await resolve(composite({ postFilter: or(localCoop, { type: "favorites", params: {} }) }))).toEqual([]);
  });

  it("does not read a franchise condition, so the shelf is empty rather than matching games with no details", async () => {
    const franchise: FilterItem = { type: "franchise", params: { franchise: "Mario" } };
    expect(unavailableReason(composite({ postFilter: and(not(franchise)) }))).toBe("combined-result condition franchise");
    expect(await resolve(composite({ postFilter: and(not(franchise)) }))).toEqual([]);
    expect(POST_FILTER_TYPES).not.toContain("franchise");
  });

  it("sorts and limits after the combined-result filter", async () => {
    data.apps = [[1, "a"], [2, "f"], [3, "b"], [4, "c"], [5, "e"], [6, "d"]].map(([appid, name]) => ({ appid, display_name: name, sort_as: name }));
    data.wishlist = [1, 2, 3];
    data.store = [4, 5, 6];
    data.catalog.set(6, meta([LOCAL]));
    data.catalog.set(5, meta([LOCAL]));
    data.catalog.set(3, meta(["Single-player"]));
    data.catalog.set(4, meta(["Single-player"]));
    expect(await resolve(composite(), 2, "alphabetical")).toEqual([1, 3]);
    expect(await resolve(composite({ postFilter: and(localCoop) }), 2, "alphabetical")).toEqual([6, 5]);
  });
});

describe("a filter on the combined result behind many games that do not match", () => {
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

  beforeEach(() => {
    data.wishlist = [];
    data.catalog = new Map();
  });

  it("still fills the shelf with the matching games further down a source", async () => {
    data.store = range(1001, 1500);
    for (const id of data.store) data.catalog.set(id, meta(id > 1450 ? [LOCAL] : ["Single-player"]));
    expect(await resolve(composite({ postFilter: and(localCoop) }), 10)).toEqual(range(1451, 1460));
  });

  it("reads each source only up to the existing cap", async () => {
    data.store = range(1, 2000);
    for (const id of data.store) data.catalog.set(id, meta(["Single-player"]));
    expect(await resolve(composite({ postFilter: and(localCoop) }), 10)).toEqual([]);
    expect(data.catalogCalls.at(-1)?.length).toBe(900);
  });
});

describe("a multi-source shelf saved with the old shared filter", () => {
  const ctx = { mode: "edit" as const, collections: [], platformTabs: [], externalSources: [] };
  function loadAndSave(source: ShelfSource): ShelfSource {
    const state = buildInitialShelfState({ ...ctx, shelf: { id: "s", title: "S", enabled: true, limit: 10, source } as any });
    const childFilter = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined;
    return assembleFinalSource(buildPrimarySource({ state, childFilter }), state);
  }

  beforeEach(() => {
    data.wishlist = [1, 2, 3, 5];
  });

  it.each([
    ["with no filter on its sources", composite({ childFilter: and(localCoop) })],
    ["with a filter of its own on a source", composite({ childFilter: and(localCoop) }, { childFilter: and(indie) })],
    ["with an OR group", composite({ childFilter: or(localCoop, indie) })],
  ])("gives the same games after a load and a save %s", async (_name, source) => {
    const before = await resolve(source);
    invalidateOnlineResolveCache();
    expect(await resolve(loadAndSave(source))).toEqual(before);
  });

  it.each([
    ["with no filter on the wishlist", {}, [2, 3]],
    ["with an AND filter on the wishlist", { childFilter: and(indie) }, [2]],
    ["with an OR filter on the wishlist", { childFilter: or(indie) }, [2, 3, 5]],
  ])("keeps the wishlist's games when the store is removed %s", async (_name, wishlist, games) => {
    data.store = [];
    const source = composite({ childFilter: and(localCoop) }, wishlist);
    const state = buildInitialShelfState({ ...ctx, shelf: { id: "s", title: "S", enabled: true, limit: 10, source } as any });
    const left = withoutSourceRow(state, 0);
    const childFilter = left.childFilterGroup.items.length > 0 ? left.childFilterGroup : undefined;
    const saved = assembleFinalSource(buildPrimarySource({ state: left, childFilter }), left);
    expect(await resolve(source)).toEqual(games);
    invalidateOnlineResolveCache();
    expect(saved.type).toBe("wishlist");
    expect(await resolve(saved)).toEqual(games);
  });

  it("keeps a collection's own filter as it was when the store is removed", () => {
    const source = { type: "composite", combine: "union", childFilter: and(localCoop), sources: [{ type: "collection", collectionId: "c1", childFilter: and(indie) }, { type: "store" }] } as ShelfSource;
    const state = buildInitialShelfState({ ...ctx, collections: [{ id: "c1" }], shelf: { id: "s", title: "S", enabled: true, limit: 10, source } as any });
    const left = withoutSourceRow(state, 0);
    const childFilter = left.childFilterGroup.items.length > 0 ? left.childFilterGroup : undefined;
    expect(assembleFinalSource(buildPrimarySource({ state: left, childFilter }), left)).toEqual({ type: "collection", collectionId: "c1", childFilter: and(indie) });
  });

  it("does not bring the old shared filter back when a store is added again after removing it", () => {
    const state = buildInitialShelfState({ ...ctx, shelf: { id: "s", title: "S", enabled: true, limit: 10, source: composite({ childFilter: and(localCoop) }) } as any });
    const left = withoutSourceRow(state, 0);
    const again = { ...left, additionalSources: [{ type: "store" }] } as typeof left;
    const childFilter = again.childFilterGroup.items.length > 0 ? again.childFilterGroup : undefined;
    const saved = assembleFinalSource(buildPrimarySource({ state: again, childFilter }), again);
    expect(saved.type).toBe("composite");
    expect(saved).not.toHaveProperty("childFilter");
  });
});

describe("games left out of the combined result for missing data", () => {
  const missingLogs = () => data.logs.filter(([message]) => message.includes("missing data"));

  it("are counted once per resolve, in the log and for the caller", async () => {
    data.catalog.delete(1);
    data.catalog.delete(5);
    const counts: number[] = [];
    const ids = await resolveShelfAppIds(composite({ postFilter: and(localCoop) }), 50, undefined, "s", undefined, { onMissingData: (n) => counts.push(n) });
    expect(ids).toEqual([3, 2, 4]);
    expect(counts).toEqual([2]);
    expect(missingLogs()).toEqual([["combined-result filter left out games with missing data", { missing: 2, of: 5 }]]);
  });

  it("are not reported when every game has its data", async () => {
    const counts: number[] = [];
    await resolveShelfAppIds(composite({ postFilter: and(localCoop) }), 50, undefined, "s", undefined, { onMissingData: (n) => counts.push(n) });
    expect(counts).toEqual([]);
    expect(missingLogs()).toEqual([]);
  });
});

describe("the combined-result filter while the plugin stays offline", () => {
  it.each([
    ["online features are off", { onlineFeaturesEnabled: false }],
    ["offline mode is on", { onlineFeaturesEnabled: true, offlineModeEnabled: true }],
  ])("fetches nothing and reads only cached data when %s", async (_name, settings) => {
    data.settings = settings;
    seedPrices({ 1: price(1999, 50) });
    data.prices.set(2, price(999, 60));
    expect(await applyCompositePostFilter([1, 2, 3, 4, 5], and(localCoop), [])).toEqual([2, 3, 4]);
    expect(await applyCompositePostFilter([1, 2, 3], and(bigDiscount), [])).toEqual([1]);
    expect(data.catalogCalls).toEqual([]);
    expect(data.priceCalls).toEqual([]);
  });
});

describe("the combined-result filter step", () => {
  it("returns the very same list when there is no filter", async () => {
    const ids = [5, 4, 3];
    expect(await applyCompositePostFilter(ids, undefined, [])).toBe(ids);
    expect(await applyCompositePostFilter(ids, and(), [])).toBe(ids);
  });

  it("keeps the order and leaves the input as it was", async () => {
    const ids = [4, 1, 3, 2, 5];
    expect(await applyCompositePostFilter(ids, and(localCoop), [])).toEqual([4, 3, 2]);
    expect(ids).toEqual([4, 1, 3, 2, 5]);
  });

  it("marks the shelf unavailable for a condition it cannot read, and accepts the ones it offers", () => {
    expect(unavailableReason(composite({ postFilter: and({ type: "installed" }) }))).toBe("combined-result condition installed");
    expect(unavailableReason(composite({ postFilter: and({ type: "merge", params: { items: [{ type: "favorites" }] } }) }))).toBe("combined-result condition favorites");
    expect(unavailableReason(composite({ postFilter: and(localCoop) }))).toBeNull();
    expect(unsupportedPostFilterType(and(...POST_FILTER_TYPES.map((type) => ({ type }))))).toBeNull();
  });
});
