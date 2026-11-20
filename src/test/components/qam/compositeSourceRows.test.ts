import { describe, expect, it } from "vitest";
import {
  buildChildTypeOptions,
  builtinValueIds,
  smartValueIds,
  withChildValue,
  childSourceValue,
  normalizeChildSourceType,
  orderingChildOf,
  placedPrefix,
} from "../../../components/qam/modals/editShelf/compositeSourceUtils";
import { buildInitialShelfState } from "../../../components/qam/modals/editShelf/buildInitialState";
import { FOLLOW_SHELF_SORT, SMART_MODE_OPTIONS } from "../../../components/qam/modals/editShelf/constants";
import { isManualSourceOrder, nextSourceSort, sourceSortOptions } from "../../../components/qam/modals/editShelf/SourceSortField";
import { applySourceManualOrder } from "../../../steam/sorting";
import { RETIRED_SMART_MODES } from "../../../steam/smartShelves";
import { ShelfSourceSchema } from "../../../types";
import { buildAllSourceTypes } from "../../../components/qam/modals/editShelf/shelfFormState";
import { makeApi } from "../../../core/pluginApi";

const labels = { collection: "c", tab: "t", filter: "f", external: "e", builtin: "b", smart: "s", wishlistLabel: "w", storeLabel: "st" };
const state = (over: Record<string, unknown> = {}) => ({
  sourceType: "builtin", builtinSourceId: "pinned_games", tab: "", collectionId: "", externalSourceId: "", additionalSources: [], ...over,
}) as any;
const opts = (s: any) => ({ state: s, collectionOptions: [], tabOptions: [], externalOptions: [], onlineEnabled: false, labels });

describe("composite source rows", () => {
  it("offer built-in lists and smart modes as extra sources", () => {
    const types = buildChildTypeOptions(opts(state()), -1).map((o) => o.data);
    expect(types).toEqual(expect.arrayContaining(["builtin", "smart"]));
  });

  it("do not offer a built-in list or smart mode already in use", () => {
    const s = state({ additionalSources: [{ type: "smart", mode: "recently_played" }] });
    expect(builtinValueIds(s, -1)).not.toContain("pinned_games");
    expect(smartValueIds(s, -1)).not.toContain("recently_played");
    expect(smartValueIds(s, 0)).toContain("recently_played");
  });

  it("keep the source's own sort when its value changes", () => {
    const row = { type: "builtin", sourceId: "pinned_games", sort: "recent", sortReverse: true };
    expect(withChildValue(row, "builtin", "history_source")).toEqual({ ...row, sourceId: "history_source" });
    expect(childSourceValue({ type: "smart", mode: "hidden_gems" }, normalizeChildSourceType("smart"))).toBe("hidden_gems");
  });

  it("offer only live smart modes", () => {
    expect(SMART_MODE_OPTIONS.filter((m) => RETIRED_SMART_MODES.has(m))).toEqual([]);
    expect(SMART_MODE_OPTIONS).toContain("hidden_gems");
  });

  it("load a built-in shelf with no saved sort as source order, and a composite's first source with its own sort", () => {
    const ctx = { mode: "edit" as const, collections: [], platformTabs: [], externalSources: [] };
    const builtin = buildInitialShelfState({ ...ctx, shelf: { id: "a", title: "A", enabled: true, limit: 10, source: { type: "builtin", sourceId: "pinned_games" } } as any });
    expect(builtin.sort).toBe("source_order");
    const composite = buildInitialShelfState({ ...ctx, shelf: { id: "b", title: "B", enabled: true, limit: 10, sort: "source_order", source: {
      type: "composite", combine: "union", sources: [{ type: "builtin", sourceId: "pinned_games", sort: "recent" }, { type: "smart", mode: "recently_played" }],
    } } as any });
    expect(composite.primaryOrder).toEqual({ sort: "recent", sortReverse: undefined });
    expect(composite.additionalSources).toEqual([{ type: "smart", mode: "recently_played" }]);
  });

  it("survive a settings load with each source's own sort", () => {
    const parsed = ShelfSourceSchema.parse({ type: "composite", combine: "union", sources: [
      { type: "builtin", sourceId: "pinned_games", sort: "alphabetical", sortReverse: true },
      { type: "wishlist", sort: "discount_high" },
    ] }) as any;
    expect(parsed.sources[0]).toMatchObject({ sort: "alphabetical", sortReverse: true });
    expect(parsed.sources[1]).toMatchObject({ sort: "discount_high" });
  });

  it("load and keep each source's own game limit", () => {
    const ctx = { mode: "edit" as const, collections: [], platformTabs: [], externalSources: [] };
    const source = { type: "composite", combine: "union", sources: [
      { type: "builtin", sourceId: "pinned_games", limit: 5 },
      { type: "smart", mode: "recently_played", sort: "recent", limit: 3 },
    ] };
    const state = buildInitialShelfState({ ...ctx, shelf: { id: "c", title: "C", enabled: true, limit: 10, sort: "alphabetical", source } as any });
    expect(state.primaryOrder).toEqual({ limit: 5 });
    expect(state.additionalSources).toEqual([{ type: "smart", mode: "recently_played", sort: "recent", limit: 3 }]);
    const parsed = ShelfSourceSchema.parse(source) as any;
    expect(parsed.sources.map((s: any) => s.limit)).toEqual([5, 3]);
  });

  it("offer a plugin smart source as an extra source and count it among the smart modes", () => {
    const off = makeApi().registerSmartShelfSource({ id: "acme.mode", displayName: "Acme", resolve: async () => [] });
    try {
      expect(smartValueIds(state(), -1)).toEqual([...SMART_MODE_OPTIONS, "acme.mode"]);
      const allBuiltIn = state({ additionalSources: SMART_MODE_OPTIONS.map((mode) => ({ type: "smart", mode })) });
      expect(smartValueIds(allBuiltIn, -1)).toEqual(["acme.mode"]);
      expect(buildChildTypeOptions(opts(allBuiltIn), -1).map((o) => o.data)).toContain("smart");
    } finally {
      off();
    }
  });

  it("keep the External source type on offer for a shelf saved with a plugin source while the plugin is away", () => {
    expect(buildAllSourceTypes([], false, "external")).toContain("external");
    expect(buildAllSourceTypes([], false, "builtin")).not.toContain("external");
    expect(buildAllSourceTypes([{ id: "acme.source" }], false, "builtin")).toContain("external");
  });

  it("save no sort for the choice an unset source already makes: its own order under Source order, the shelf's under any other", () => {
    expect(nextSourceSort("source_order", false)).toBeUndefined();
    expect(nextSourceSort(FOLLOW_SHELF_SORT, true)).toBeUndefined();
    expect(nextSourceSort("source_order", true)).toBe("source_order");
    expect(nextSourceSort(["recent", "alphabetical"], true)).toEqual(["recent", "alphabetical"]);
  });
});

describe("sort choices for a source of a multi-source shelf", () => {
  it("offer a plugin sort, and without a plugin equal the built-in list", () => {
    const builtIn = sourceSortOptions("collection", false);
    const off = makeApi().registerSortOption({ id: "acme.order", displayName: "Acme order", sort: (ids) => ids.slice() });
    try {
      expect(sourceSortOptions("collection", false)).toEqual([...builtIn, { data: "acme.order", label: "Acme order" }]);
    } finally {
      off();
    }
    expect(sourceSortOptions("collection", false)).toEqual(builtIn);
  });
});

describe("a source ordered by hand in the editor", () => {
  it("offers Manual as a source's sort", () => {
    expect(sourceSortOptions("collection", false).map((o) => o.data)).toContain("manual");
    expect(isManualSourceOrder({ sort: "manual" })).toBe(true);
    expect(isManualSourceOrder({ sort: ["manual"] })).toBe(true);
    expect(isManualSourceOrder({ sort: "recent" })).toBe(false);
    expect(isManualSourceOrder(undefined)).toBe(false);
  });

  it("shows the row's source only while it is sorted by hand; -1 is the first source", () => {
    const composite = { type: "composite", combine: "union", sources: [{ type: "tab", tab: "installed", sort: "manual" }, { type: "collection", collectionId: "c", sort: "recent" }] };
    expect(orderingChildOf(composite, -1)).toBe(composite.sources[0]);
    expect(orderingChildOf(composite, 0)).toBeUndefined();
    expect(orderingChildOf(composite, null)).toBeUndefined();
    expect(orderingChildOf({ type: "tab", tab: "installed", sort: "manual" }, -1)).toBeUndefined();
  });

  it("stores only the run up to the last moved game, and that run rebuilds the same order", () => {
    const base = [10, 20, 30, 40, 50];
    expect(placedPrefix(base.slice(), base)).toEqual([]);
    const moves = [[40, 10, 20, 30, 50], [20, 10, 30, 40, 50], [10, 20, 30, 50, 40], [50, 40, 30, 20, 10]];
    for (const next of moves) {
      const placed = placedPrefix(next, base);
      expect(applySourceManualOrder(base, placed)).toEqual(next);
    }
    expect(placedPrefix([40, 10, 20, 30, 50], base)).toEqual([40, 10, 20, 30]);
  });
});
