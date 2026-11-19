// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ShelfSource } from "../../types";

const stores = vi.hoisted(() => ({ apps: [] as any[] }));

vi.mock("../../steam/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../steam/library")>()),
  getAllAppOverviews: async () => stores.apps,
}));

import { resolveShelfAppIds } from "../../steam";

const app = (appid: number, name: string, extra: Record<string, unknown> = {}) => ({ appid, display_name: name, sort_as: name, installed: true, ...extra });
const withConditions = (sort: string | string[], sortReverse?: boolean): ShelfSource =>
  ({ type: "filter", filter: { sort, ...(sortReverse ? { sortReverse } : {}), filterGroup: { mode: "and", items: [{ type: "installed" }] } } }) as unknown as ShelfSource;
const sortOnly = (sort: string, sortReverse?: boolean): ShelfSource =>
  ({ type: "filter", filter: { sort, ...(sortReverse ? { sortReverse } : {}) } }) as unknown as ShelfSource;

beforeEach(() => {
  stores.apps = [
    app(1, "charlie", { deck_compatibility_category: 3, controller_support: 0, display_status: 2, last_played: 100 }),
    app(2, "alpha", { deck_compatibility_category: 1, controller_support: 2, display_status: 3, last_played: 300 }),
    app(3, "bravo", { deck_compatibility_category: 2, controller_support: 1, display_status: 1, last_played: 200 }),
  ];
});

describe("a filter shelf sorted by one key", () => {
  it("orders by Deck compatibility, not by name", async () => {
    expect(await resolveShelfAppIds(withConditions("deck_compat"), 10)).toEqual([1, 3, 2]);
    expect(await resolveShelfAppIds(sortOnly("deck_compat"), 10)).toEqual([1, 3, 2]);
  });

  it("orders by controller support and by app status", async () => {
    expect(await resolveShelfAppIds(withConditions("controller_support"), 10)).toEqual([2, 3, 1]);
    expect(await resolveShelfAppIds(withConditions("app_status"), 10)).toEqual([3, 1, 2]);
  });

  it("gives the same order as the same key in a list of keys", async () => {
    for (const key of ["deck_compat", "controller_support", "app_status"]) {
      expect(await resolveShelfAppIds(withConditions(key), 10)).toEqual(await resolveShelfAppIds(withConditions([key]), 10));
    }
  });

  it("reverses when asked", async () => {
    expect(await resolveShelfAppIds(withConditions("deck_compat", true), 10)).toEqual([2, 3, 1]);
    expect(await resolveShelfAppIds(sortOnly("deck_compat", true), 10)).toEqual([2, 3, 1]);
  });

  it("keeps the order of the keys it always handled", async () => {
    expect(await resolveShelfAppIds(withConditions("recent"), 10)).toEqual([2, 3, 1]);
    expect(await resolveShelfAppIds(withConditions("alphabetical"), 10)).toEqual([2, 3, 1]);
    expect(await resolveShelfAppIds(sortOnly("recent"), 10)).toEqual([2, 3, 1]);
  });
});
