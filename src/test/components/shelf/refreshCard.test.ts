import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../core/shelfRefresh", () => ({ triggerShelfRefresh: vi.fn() }));
vi.mock("../../../core/shelfActions", () => ({ clearOnlineShelfCache: vi.fn() }));
vi.mock("../../../steam/smartShelves", () => ({ invalidateSmartShelfCache: vi.fn() }));
// The random-sort cache stays real so the reshuffle below is the real one;
// the wrapper only records the calls.
vi.mock("../../../steam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../steam")>();
  return { ...actual, invalidateRandomSortCache: vi.fn(actual.invalidateRandomSortCache) };
});

import { buildRefreshRowItem } from "../../../components/shelf/shelfViewHelpers";
import { applySortToIds, invalidateRandomSortCache, type AppOverview } from "../../../steam";
import { invalidateSmartShelfCache } from "../../../steam/smartShelves";
import { clearOnlineShelfCache } from "../../../core/shelfActions";
import { triggerShelfRefresh } from "../../../core/shelfRefresh";
import type { Shelf } from "../../../types";

// The random order lives in localStorage, which this environment lacks.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

const t = (key: string) => key;
const ids = [1, 2, 3, 4, 5];
const apps = ids.map((appid) => ({ appid, display_name: `Game ${appid}` })) as unknown as AppOverview[];

function shelfOf(id: string, source: Record<string, unknown>): Shelf {
  return { id, title: id, enabled: true, source, sort: "random" } as unknown as Shelf;
}

// A fixed Math.random yields one deterministic permutation per value.
function resolveWithRandom(shelfId: string, random: number): number[] {
  vi.spyOn(Math, "random").mockReturnValue(random);
  return applySortToIds(ids, "random", apps, shelfId);
}

function activateRefresh(shelf: Shelf, isOnlineShelf: boolean): void {
  buildRefreshRowItem({ shelf, isOnlineShelf, t }).onActivate!();
}

describe("refresh card — manual refresh", () => {
  beforeEach(() => { store.clear(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("smart shelf with random sort: each refresh gives a new order", () => {
    const shelf = shelfOf("s1", { type: "smart", mode: "random_pick" });

    const first = resolveWithRandom("s1", 0);
    // Without a refresh the order comes from the cache, whatever Math.random says.
    expect(resolveWithRandom("s1", 0.999)).toEqual(first);

    activateRefresh(shelf, false);
    const second = resolveWithRandom("s1", 0.999);
    expect(second).not.toEqual(first);

    activateRefresh(shelf, false);
    const third = resolveWithRandom("s1", 0.5);
    expect(third).not.toEqual(second);

    expect(vi.mocked(invalidateSmartShelfCache).mock.calls).toEqual([["s1"], ["s1"]]);
    expect(vi.mocked(invalidateRandomSortCache).mock.calls).toEqual([["s1"], ["s1"]]);
    expect(clearOnlineShelfCache).not.toHaveBeenCalled();
    expect(triggerShelfRefresh).toHaveBeenCalledTimes(2);
    expect(triggerShelfRefresh).toHaveBeenLastCalledWith({ manual: true, shelfId: "s1" });
  });

  it("clears only the refreshed shelf's order", () => {
    const other = resolveWithRandom("s2", 0);
    activateRefresh(shelfOf("s1", { type: "smart", mode: "random_pick" }), false);
    expect(resolveWithRandom("s2", 0.999)).toEqual(other);
  });

  it("online shelf: clears the online cache and the random order", () => {
    activateRefresh(shelfOf("w1", { type: "wishlist" }), true);
    expect(clearOnlineShelfCache).toHaveBeenCalledTimes(1);
    expect(invalidateRandomSortCache).toHaveBeenCalledWith("w1");
    expect(invalidateSmartShelfCache).not.toHaveBeenCalled();
    expect(triggerShelfRefresh).toHaveBeenCalledWith({ manual: true, shelfId: "w1" });
  });

  it("regular shelf: still clears only the random order", () => {
    activateRefresh(shelfOf("r1", { type: "all" }), false);
    expect(invalidateRandomSortCache).toHaveBeenCalledWith("r1");
    expect(clearOnlineShelfCache).not.toHaveBeenCalled();
    expect(invalidateSmartShelfCache).not.toHaveBeenCalled();
  });
});
