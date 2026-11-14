// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ShelfSource } from "../../types";

const stores = vi.hoisted(() => ({ apps: [] as any[], pinned: [] as number[], history: [] as number[], collection: [] as number[] }));

vi.mock("../../steam/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../steam/library")>()),
  getAllAppOverviews: async () => stores.apps,
}));
vi.mock("../../steam/collections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../steam/collections")>()),
  getCollectionApps: async () => stores.collection,
  listCollections: async () => [],
}));
vi.mock("../../runtime/gameLists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../runtime/gameLists")>()),
  pinnedIds: () => stores.pinned,
  historyIds: () => stores.history,
}));

import { resolveShelfAppIds } from "../../steam";
import { applySortToIds } from "../../steam/sorting";

const app = (appid: number, name: string, lastPlayed = 0) => ({ appid, display_name: name, sort_as: name, last_played: lastPlayed });
const pinned: ShelfSource = { type: "builtin", sourceId: "pinned_games" };

beforeEach(() => {
  stores.apps = [app(1, "delta", 300), app(2, "alpha", 100), app(3, "charlie", 400), app(4, "bravo", 200), app(5, "echo", 500)];
  stores.pinned = [2, 4, 1];
  stores.history = [5, 3];
  stores.collection = [1, 2, 3, 4, 5];
});

describe("source order", () => {
  it("keeps the ids as given, and reversed when asked", () => {
    expect(applySortToIds([3, 1, 2], "source_order", stores.apps)).toEqual([3, 1, 2]);
    expect(applySortToIds([3, 1, 2], "source_order", stores.apps, undefined, true)).toEqual([2, 1, 3]);
  });

  it("lists pinned games last pinned first, or first pinned first when reversed", async () => {
    expect(await resolveShelfAppIds(pinned, 10, "source_order")).toEqual([1, 4, 2]);
    expect(await resolveShelfAppIds(pinned, 10, "source_order", undefined, true)).toEqual([2, 4, 1]);
  });

  it("sorts pinned games by any other key", async () => {
    expect(await resolveShelfAppIds(pinned, 10, "alphabetical")).toEqual([2, 4, 1]);
    expect(await resolveShelfAppIds(pinned, 10, "recent")).toEqual([1, 4, 2]);
  });

  it("puts each source in place, each with its own sort, and drops repeats", async () => {
    const shelf: ShelfSource = {
      type: "composite", combine: "union", sources: [
        { ...pinned, sort: "alphabetical" },
        { type: "collection", collectionId: "c", sort: "recent" },
      ],
    } as ShelfSource;
    expect(await resolveShelfAppIds(shelf, 10, "source_order")).toEqual([2, 4, 1, 5, 3]);
  });

  it("gives a source with no sort of its own the order it comes in", async () => {
    const shelf = { type: "composite", combine: "union", sources: [pinned, { type: "builtin", sourceId: "history_source" }] } as ShelfSource;
    expect(await resolveShelfAppIds(shelf, 10, "source_order")).toEqual([1, 4, 2, 5, 3]);
  });

  it("sorts the whole union with any other shelf sort, as before", async () => {
    const shelf = { type: "composite", combine: "union", sources: [{ ...pinned, sort: "recent" }, { type: "builtin", sourceId: "history_source" }] } as ShelfSource;
    expect(await resolveShelfAppIds(shelf, 10, "alphabetical")).toEqual([2, 4, 3, 1, 5]);
  });
});
