// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FilterGroup, ShelfSource } from "../../types";

/* Tab and collection shelves must mirror the native library: a Steam-hidden
   game never shows up on them, whichever path produced the ids (the overview
   list, the tab store, a collection or the TabMaster filter fallback). The
   Hidden tab and a child filter asking for hidden games are the two
   exceptions; filter shelves keep their own `hidden` item semantics. */

const stores = vi.hoisted(() => ({
  apps: [] as any[],
  tabStoreIds: [] as number[],
  collectionIds: [] as number[],
  tabMasterTabs: [] as any[],
}));

vi.mock("../../steam/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../steam/library")>()),
  getAllAppOverviews: async () => stores.apps,
}));
vi.mock("../../steam/libraryTabs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../steam/libraryTabs")>()),
  getTabAppIdsFromStore: async () => stores.tabStoreIds,
  listLibraryTabs: async () => [],
  findTabMasterContextValue: () => null,
}));
vi.mock("../../steam/collections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../steam/collections")>()),
  getCollectionApps: async () => stores.collectionIds,
  listCollections: async () => [],
}));
vi.mock("../../integrations/tabmaster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../integrations/tabmaster")>()),
  getTabsFromSettingsFile: async () => stores.tabMasterTabs,
}));

import { resolveShelfAppIds } from "../../steam";

function app(appid: number, extra: Record<string, unknown> = {}) {
  return { appid, display_name: `App ${appid}`, ...extra };
}

const tab = (name: string, childFilter?: FilterGroup): ShelfSource =>
  ({ type: "tab", tab: name, ...(childFilter ? { childFilter } : {}) }) as ShelfSource;

const HIDDEN_ONLY: FilterGroup = { mode: "and", items: [{ type: "hidden", inverted: false, params: { mode: "only" } }] };

beforeEach(() => {
  stores.apps = [
    app(1, { installed: true, is_favorite: true, last_played: 300 }),
    app(2, { installed: true, is_favorite: true, is_hidden: true, last_played: 400 }),
    app(3, { installed: true, last_played: 100 }),
    app(4, { is_non_steam: true, is_hidden: true }),
    app(5, { is_non_steam: true }),
  ];
  stores.tabStoreIds = [];
  stores.collectionIds = [];
  stores.tabMasterTabs = [];
});

describe("Steam-hidden games on tab shelves", () => {
  it.each([
    ["all", [1, 3, 5]],
    ["installed", [1, 3]],
    ["favorites", [1]],
    ["nonsteam", [5]],
    ["recent", [1, 3, 5]],
  ])("the %s tab leaves hidden games out", async (name, expected) => {
    const ids = await resolveShelfAppIds(tab(name), 20);
    expect(ids).toEqual(expected);
  });

  it("the Hidden tab keeps showing them", async () => {
    expect(await resolveShelfAppIds(tab("hidden"), 20)).toEqual([2, 4]);
  });

  it("a child filter asking for hidden games only wins over the exclusion", async () => {
    expect(await resolveShelfAppIds(tab("all", HIDDEN_ONLY), 20)).toEqual([2, 4]);
  });

  it("an inverted hidden:exclude child filter reads as hidden only too", async () => {
    const inverted: FilterGroup = { mode: "and", items: [{ type: "hidden", inverted: true, params: { mode: "exclude" } }] };
    expect(await resolveShelfAppIds(tab("all", inverted), 20)).toEqual([2, 4]);
  });

  it("a hidden:exclude child filter changes nothing", async () => {
    const exclude: FilterGroup = { mode: "and", items: [{ type: "hidden", inverted: false, params: { mode: "exclude" } }] };
    expect(await resolveShelfAppIds(tab("all", exclude), 20)).toEqual([1, 3, 5]);
  });

  it("ids read from the tab store are filtered too, and the shelf stays full", async () => {
    stores.tabStoreIds = [2, 1, 3];
    expect(await resolveShelfAppIds(tab("my_tab"), 2)).toEqual([1, 3]);
  });

  it("the TabMaster filter fallback for a tab id leaves them out as well", async () => {
    // Neither the fiber container nor the tab store knows this id, so the
    // resolver rebuilds the tab from TabMaster's own filters (a filter resolve).
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    stores.tabMasterTabs = [{ id: uuid, title: "Installed", position: 0, filtersMode: "and", filters: [{ type: "installed", inverted: false, params: {} }] }];
    const ids = await resolveShelfAppIds(tab(uuid), 20);
    expect(ids).toEqual(expect.arrayContaining([1, 3]));
    expect(ids).not.toContain(2);
  });
});

describe("Steam-hidden games on collection shelves", () => {
  const collection = (childFilter?: FilterGroup): ShelfSource =>
    ({ type: "collection", collectionId: "backlog", ...(childFilter ? { childFilter } : {}) }) as ShelfSource;

  it("a collection leaves hidden games out and the shelf stays full", async () => {
    stores.collectionIds = [2, 1, 3];
    expect(await resolveShelfAppIds(collection(), 2)).toEqual([1, 3]);
  });

  it("reports the See-more total without the hidden games", async () => {
    stores.collectionIds = [2, 1, 3];
    let total = -1;
    const ids = await resolveShelfAppIds(collection(), 2, undefined, undefined, undefined, { onResolveTotal: (n) => { total = n; } });
    expect(ids).toEqual([1, 3]);
    expect(total).toBe(2);
  });

  it("a collection with a hidden-only child filter shows only the hidden games", async () => {
    stores.collectionIds = [2, 1, 3];
    expect(await resolveShelfAppIds(collection(HIDDEN_ONLY), 20)).toEqual([2]);
  });
});

describe("filter shelves are untouched", () => {
  it("a filter group without a hidden item still sees hidden games", async () => {
    const source = { type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "installed", params: {} }] } } } as unknown as ShelfSource;
    const ids = await resolveShelfAppIds(source, 20);
    expect(ids).toContain(2);
    expect(ids).toContain(1);
  });
});

describe("a game hidden during the session", () => {
  afterEach(() => { delete (globalThis as any).collectionStore; });

  it("is left out on the collection store's word alone, before the overview flag catches up", async () => {
    (globalThis as any).collectionStore = { BIsHidden: (id: number) => id === 3 };
    expect(await resolveShelfAppIds(tab("all"), 20)).toEqual([1, 5]);
    expect(await resolveShelfAppIds(tab("hidden"), 20)).toEqual([2, 3, 4]);
  });
});
