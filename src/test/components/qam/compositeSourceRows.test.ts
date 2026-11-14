import { describe, expect, it } from "vitest";
import {
  buildChildTypeOptions,
  builtinValueIds,
  smartValueIds,
  withChildValue,
  childSourceValue,
  normalizeChildSourceType,
} from "../../../components/qam/modals/editShelf/compositeSourceUtils";
import { buildInitialShelfState } from "../../../components/qam/modals/editShelf/buildInitialState";
import { SMART_MODE_OPTIONS } from "../../../components/qam/modals/editShelf/constants";
import { RETIRED_SMART_MODES } from "../../../steam/smartShelves";
import { ShelfSourceSchema } from "../../../types";

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
});
