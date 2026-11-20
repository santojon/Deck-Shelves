import { describe, expect, it } from "vitest";
import { buildInitialShelfState } from "../../../components/qam/modals/editShelf/buildInitialState";
import { assembleFinalSource, buildPrimarySource } from "../../../components/qam/modals/editShelf/saveHelpers";
import type { EditableShelfState } from "../../../components/qam/modals/editShelf/types";
import { ShelfSourceSchema, type FilterGroup } from "../../../types";

const ctx = { mode: "edit" as const, collections: [], platformTabs: [], externalSources: [] };
const shelfOf = (source: unknown) => ({ id: "s", title: "S", enabled: true, limit: 10, sort: "alphabetical", source }) as any;
const load = (source: unknown) => buildInitialShelfState({ ...ctx, shelf: shelfOf(source) });

const discount: FilterGroup = { mode: "and", items: [{ type: "discount", inverted: false, params: { minDiscount: 30 } }] };
const indie: FilterGroup = { mode: "and", items: [{ type: "genres", inverted: false, params: { genres: ["Indie"] } }] };
const localCoop: FilterGroup = { mode: "or", items: [{ type: "categories", inverted: false, params: { categories: ["Shared/Split Screen"] } }] };
const empty: FilterGroup = { mode: "and", items: [] };

const threeLevels = {
  type: "composite",
  combine: "union",
  sources: [{ type: "wishlist", childFilter: indie }, { type: "store", childFilter: discount }],
  postFilter: localCoop,
};

function save(state: EditableShelfState): any {
  const childFilter = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined;
  return assembleFinalSource(buildPrimarySource({ state, childFilter }), state);
}

const reopen = (state: EditableShelfState) => load(ShelfSourceSchema.parse(save(state)));

describe("filter on the combined result of a multi-source shelf", () => {
  it("survives a settings load on a multi-source shelf", () => {
    const parsed = ShelfSourceSchema.parse(threeLevels) as any;
    expect(parsed.postFilter).toEqual(localCoop);
    expect(parsed.sources[0].childFilter).toEqual(indie);
    expect(parsed.sources[1].childFilter).toEqual(discount);
  });

  it("is not part of a single source", () => {
    const parsed = ShelfSourceSchema.parse({ type: "store", childFilter: discount, postFilter: localCoop }) as any;
    expect(parsed.postFilter).toBeUndefined();
    expect(parsed.childFilter).toEqual(discount);
  });

  it("loads into its own group, apart from the first source's filter", () => {
    const state = load(threeLevels);
    expect(state.postFilterGroup).toEqual(localCoop);
    expect(state.childFilterGroup).toEqual(indie);
    expect((state.additionalSources[0] as any).childFilter).toEqual(discount);
  });

  it("starts as an empty AND group when the shelf has none", () => {
    expect(load({ type: "composite", combine: "union", sources: [{ type: "wishlist" }, { type: "store" }] }).postFilterGroup).toEqual(empty);
    expect(load({ type: "store", childFilter: discount }).postFilterGroup).toEqual(empty);
  });

  it("never takes the old shared filter of the shelf, nor copies it onto the sources", () => {
    const state = load({ type: "composite", combine: "union", sources: [{ type: "wishlist" }, { type: "store" }], childFilter: discount });
    expect(state.postFilterGroup).toEqual(empty);
    expect(state.childFilterGroup).toEqual(empty);
    expect(state.additionalSources).toEqual([{ type: "store" }]);
  });
});

describe("saving the three filter levels", () => {
  it("writes the combined-result filter on the multi-source shelf only when it has conditions", () => {
    const state = load(threeLevels);
    expect(save(state).postFilter).toEqual(localCoop);
    expect("postFilter" in save({ ...state, postFilterGroup: empty })).toBe(false);
    const single = { ...state, additionalSources: [] };
    expect(save(single).type).toBe("wishlist");
    expect("postFilter" in save(single)).toBe(false);
  });

  it("keeps all three levels through save and reopen", () => {
    const again = reopen(load(threeLevels));
    expect(again.childFilterGroup).toEqual(indie);
    expect((again.additionalSources[0] as any).childFilter).toEqual(discount);
    expect(again.postFilterGroup).toEqual(localCoop);
  });

  it("keeps all three levels when the title, sort, limit or join changes", () => {
    const state = load(threeLevels);
    const edits: Partial<EditableShelfState>[] = [
      { title: "Couch" }, { sort: "discount_high" }, { limit: 3 }, { compositeCombine: "intersection" },
    ];
    for (const edit of edits) {
      const again = reopen({ ...state, ...edit });
      expect(again.childFilterGroup).toEqual(indie);
      expect((again.additionalSources[0] as any).childFilter).toEqual(discount);
      expect(again.postFilterGroup).toEqual(localCoop);
    }
    expect(reopen({ ...state, compositeCombine: "intersection" }).compositeCombine).toBe("intersection");
  });

  it("clearing one level leaves the other two", () => {
    const state = load(threeLevels);
    const noFirst = reopen({ ...state, childFilterGroup: empty });
    expect(noFirst.childFilterGroup).toEqual(empty);
    expect((noFirst.additionalSources[0] as any).childFilter).toEqual(discount);
    expect(noFirst.postFilterGroup).toEqual(localCoop);

    const noSecond = reopen({ ...state, additionalSources: [{ type: "store" } as any] });
    expect(noSecond.childFilterGroup).toEqual(indie);
    expect((noSecond.additionalSources[0] as any).childFilter).toBeUndefined();
    expect(noSecond.postFilterGroup).toEqual(localCoop);

    const noCombined = reopen({ ...state, postFilterGroup: empty });
    expect(noCombined.childFilterGroup).toEqual(indie);
    expect((noCombined.additionalSources[0] as any).childFilter).toEqual(discount);
    expect(noCombined.postFilterGroup).toEqual(empty);
  });
});

describe("a multi-source shelf saved with the old shared filter", () => {
  const legacy = (sources: unknown[], childFilter: FilterGroup) => ({ type: "composite", combine: "union", sources, childFilter });
  const orGroup: FilterGroup = { mode: "or", items: [...discount.items, ...indie.items] };
  const cases = [
    ["with no filter on its sources", legacy([{ type: "wishlist" }, { type: "store" }], discount)],
    ["with a filter of its own on a source", legacy([{ type: "wishlist", childFilter: indie }, { type: "store" }], discount)],
    ["with an OR group", legacy([{ type: "wishlist" }, { type: "store" }], orGroup)],
  ] as const;

  it.each(cases)("is saved back unchanged %s", (_name, source) => {
    expect(save(load(source))).toEqual(source);
    expect(save(load(ShelfSourceSchema.parse(source)))).toEqual(ShelfSourceSchema.parse(source));
  });

  it("is saved back unchanged when the title or limit changes", () => {
    const source = cases[1][1];
    expect(save({ ...load(source), title: "Other", limit: 4 })).toEqual(source);
  });
});

describe("a multi-source shelf with no filters", () => {
  it("is saved back as it was", () => {
    const source = { type: "composite", combine: "intersection", sources: [{ type: "wishlist" }, { type: "store" }] };
    expect(save(load(source))).toEqual(source);
  });
});
