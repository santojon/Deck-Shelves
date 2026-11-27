// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stores = vi.hoisted(() => ({ apps: [] as any[] }));

vi.mock("../../../steam/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../steam/library")>()),
  getAllAppOverviews: async () => stores.apps,
}));

import { resolveShelfAppIds } from "../../../steam";
import { ShelfSourceSchema, type ShelfSource } from "../../../types";
import { makeApi } from "../../../core/pluginApi";
import { createDefaultShelf } from "../../../domain/defaults";
import { buildInitialShelfState } from "../../../components/qam/modals/editShelf/buildInitialState";
import { buildAllSourceTypes, computeSourceTypeState } from "../../../components/qam/modals/editShelf/shelfFormState";
import { assembleFinalSource, buildPrimarySource, shelfSortForPatch } from "../../../components/qam/modals/editShelf/saveHelpers";
import { buildChildTypeOptions, smartValueIds } from "../../../components/qam/modals/editShelf/compositeSourceUtils";
import { SMART_MODE_OPTIONS } from "../../../components/qam/modals/editShelf/constants";

const api = makeApi();
const offs: Array<() => void> = [];
const app = (appid: number, name: string) => ({ appid, display_name: name, sort_as: name, installed: true });
const ctx = { collections: [{ id: "c1" }], platformTabs: [{ id: "all" }], externalSources: [] };
const deps = { collectionOptions: [{ data: "c1", label: "Faves", title: "Faves" }], tabOptions: [], tabTextLabels: new Map(), externalOptions: [], t: (k: string) => k };
const savedShelf = (source: Record<string, unknown>, over: Record<string, unknown> = {}): any => ({ id: "s", title: "S", enabled: true, limit: 10, source, ...over });
const finalSource = (state: any) => assembleFinalSource(buildPrimarySource({ state }), state);

beforeEach(() => {
  stores.apps = [app(1, "charlie"), app(2, "alpha"), app(3, "bravo"), app(4, "delta")];
  offs.push(api.registerSmartShelfSource({ id: "acme.picks", displayName: "Acme picks", resolve: async () => [3, 1, 2, 4] }));
  offs.push(api.registerSmartShelfSource({ id: "acme.more", displayName: "Acme more", resolve: async () => [4, 2] }));
});

afterEach(() => {
  for (const off of offs.splice(0)) off();
});

describe("a smart mode as a regular shelf's own source", () => {
  it("is offered as the source type, next to the built-in lists", () => {
    expect(buildAllSourceTypes([], false)).toEqual(expect.arrayContaining(["builtin", "smart"]));
  });

  it("loads from a saved shelf, in its own order when no sort was saved", () => {
    const state = buildInitialShelfState({ ...ctx, mode: "edit", shelf: savedShelf({ type: "smart", mode: "hidden_gems" }) });
    expect([state.sourceType, state.smartMode, state.sort]).toEqual(["smart", "hidden_gems", "source_order"]);
    const sorted = buildInitialShelfState({ ...ctx, mode: "edit", shelf: savedShelf({ type: "smart", mode: "acme.picks" }, { sort: "recent" }) });
    expect([sorted.smartMode, sorted.sort]).toEqual(["acme.picks", "recent"]);
  });

  it("loads as the first source of a multi-source shelf, with its own order", () => {
    const shelf = savedShelf({ type: "composite", combine: "union", sources: [{ type: "smart", mode: "acme.picks", limit: 2 }, { type: "collection", collectionId: "c1" }] });
    const state = buildInitialShelfState({ ...ctx, mode: "edit", shelf });
    expect([state.sourceType, state.smartMode]).toEqual(["smart", "acme.picks"]);
    expect(state.primaryOrder).toEqual({ limit: 2 });
    expect(finalSource(state)).toEqual(shelf.source);
  });

  it("starts on the first mode in its own order when picked for a new shelf, and saves that source", () => {
    const created = buildInitialShelfState({ ...ctx, mode: "create", shelf: createDefaultShelf("c1") });
    const state = computeSourceTypeState(created, "smart", deps);
    expect([state.sourceType, state.smartMode, state.sort]).toEqual(["smart", SMART_MODE_OPTIONS[0], "source_order"]);
    expect(finalSource(state)).toEqual({ type: "smart", mode: SMART_MODE_OPTIONS[0] });
    expect(shelfSortForPatch(state)).toBe("source_order");
    expect(shelfSortForPatch({ ...state, sort: "alphabetical" })).toBe("alphabetical");
    const picked = { ...state, smartMode: "acme.picks" };
    expect(finalSource(picked)).toEqual({ type: "smart", mode: "acme.picks" });
  });

  it("keeps a sort placed by hand, and leaves for another source type", () => {
    const created = buildInitialShelfState({ ...ctx, mode: "create", shelf: createDefaultShelf("c1") });
    expect(computeSourceTypeState({ ...created, sort: "manual" }, "smart", deps).sort).toBe("manual");
    const smart = computeSourceTypeState(created, "smart", deps);
    const back = computeSourceTypeState(smart, "collection", deps);
    expect(back.sourceType).toBe("collection");
    expect(finalSource(back)).toEqual({ type: "collection", collectionId: "c1" });
  });

  it("is not offered again as an extra source of the same shelf", () => {
    const state = { sourceType: "smart", smartMode: "acme.picks", builtinSourceId: "", tab: "", collectionId: "", externalSourceId: "", additionalSources: [] } as any;
    expect(smartValueIds(state, -1)).not.toContain("acme.picks");
    expect(smartValueIds(state, -1)).toContain("acme.more");
    const labels = { collection: "c", tab: "t", filter: "f", external: "e", builtin: "b", smart: "s", wishlistLabel: "w", storeLabel: "st" };
    expect(buildChildTypeOptions({ state, collectionOptions: [], tabOptions: [], externalOptions: [], onlineEnabled: false, labels }, -1).map((o) => o.data)).toContain("smart");
  });

  it("survives a settings load", () => {
    expect(ShelfSourceSchema.parse({ type: "smart", mode: "acme.picks" })).toEqual({ type: "smart", mode: "acme.picks" });
  });

  it("resolves with the shelf's sort and limit", async () => {
    const source = { type: "smart", mode: "acme.picks" } as ShelfSource;
    expect(await resolveShelfAppIds(source, 2, "source_order", "sp-a")).toEqual([3, 1]);
    expect(await resolveShelfAppIds(source, 3, "alphabetical", "sp-b")).toEqual([2, 3, 1]);
    expect(await resolveShelfAppIds(source, 3, "alphabetical", "sp-c", true)).toEqual([4, 1, 3]);
  });

  it("resolves first of several sources with its own limit", async () => {
    const source = { type: "composite", combine: "union", sources: [{ type: "smart", mode: "acme.picks", limit: 2 }, { type: "smart", mode: "acme.more" }] } as ShelfSource;
    expect(await resolveShelfAppIds(source, 10, "source_order", "sp-d")).toEqual([3, 1, 4, 2]);
  });
});
