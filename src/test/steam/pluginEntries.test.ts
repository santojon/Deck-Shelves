// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterItemTypeSchema, type FilterItem, type ShelfSource } from "../../types";

const stores = vi.hoisted(() => ({ apps: [] as any[] }));

vi.mock("../../steam/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../steam/library")>()),
  getAllAppOverviews: async () => stores.apps,
}));

import { resolveShelfAppIds } from "../../steam";
import { applySortToIds } from "../../steam/sorting";
import { evaluateFilterItem } from "../../steam/filterEval";
import { RETIRED_SMART_MODES } from "../../steam/smartShelves";
import { makeApi, registerInternalFilterType, registerInternalSmartShelfSource, registerInternalSortOption } from "../../core/pluginApi";
import { SMART_MODE_OPTIONS, SORT_OPTIONS } from "../../components/qam/modals/editShelf/constants";

const api = makeApi();
const offs: Array<() => void> = [];

const app = (appid: number, name: string, extra: Record<string, unknown> = {}) =>
  ({ appid, display_name: name, sort_as: name, installed: true, ...extra });
const withConditions = (sort: string | string[], sortReverse?: boolean, items: unknown[] = [{ type: "installed" }]): ShelfSource =>
  ({ type: "filter", filter: { sort, ...(sortReverse ? { sortReverse } : {}), filterGroup: { mode: "and", items } } }) as unknown as ShelfSource;
const sortOnly = (sort: string, sortReverse?: boolean): ShelfSource =>
  ({ type: "filter", filter: { sort, ...(sortReverse ? { sortReverse } : {}) } }) as unknown as ShelfSource;

// The plugin's order: 3, 1, 2, and 4 left out.
const pluginOrder = (ids: ReadonlyArray<number>) => [3, 1, 2].filter((id) => ids.includes(id));

beforeEach(() => {
  stores.apps = [
    app(1, "charlie", { last_played: 100, playtime_forever: 50 }),
    app(2, "alpha", { last_played: 300, playtime_forever: 50 }),
    app(3, "bravo", { last_played: 200, playtime_forever: 10 }),
    app(4, "delta", { last_played: 400, playtime_forever: 10 }),
  ];
});

afterEach(() => {
  for (const off of offs.splice(0)) off();
});

describe("a plugin sort", () => {
  beforeEach(() => {
    offs.push(api.registerSortOption({ id: "acme.order", displayName: "Acme", sort: (ids) => pluginOrder(ids) }));
  });

  it("orders a filter shelf sorted by it alone, with and without conditions, and reversed when asked", async () => {
    expect(await resolveShelfAppIds(withConditions("acme.order"), 10)).toEqual([3, 1, 2, 4]);
    expect(await resolveShelfAppIds(sortOnly("acme.order"), 10)).toEqual([3, 1, 2, 4]);
    expect(await resolveShelfAppIds(withConditions("acme.order", true), 10)).toEqual([4, 2, 1, 3]);
  });

  it("orders before the next key inside a chain", () => {
    expect(applySortToIds([1, 2, 3, 4], ["acme.order", "alphabetical"], stores.apps)).toEqual([3, 1, 2, 4]);
  });

  it("breaks ties after a built-in key inside a chain", () => {
    expect(applySortToIds([1, 2, 3, 4], ["playtime", "acme.order"], stores.apps)).toEqual([1, 2, 3, 4]);
  });

  it("reverses inside a chain when asked", () => {
    expect(applySortToIds([1, 2, 3, 4], ["acme.order", "alphabetical"], stores.apps, undefined, [true, false])).toEqual([4, 2, 1, 3]);
  });

  it("keeps name order inside a chain when it throws", () => {
    offs.push(api.registerSortOption({ id: "acme.broken", displayName: "Broken", sort: () => { throw new Error("broken"); } }));
    expect(applySortToIds([1, 2, 3, 4], ["acme.broken", "recent"], stores.apps)).toEqual([2, 3, 1, 4]);
  });
});

describe("a plugin condition", () => {
  it("keeps only the games it accepts on a filter shelf, and the others when it is negated", async () => {
    offs.push(api.registerFilterType({ id: "acme.short", displayName: "Short", evaluate: (meta) => (meta.playtimeMinutes ?? 0) < 20 }));
    const only = [{ type: "acme.short", params: {} }];
    const negated = [{ type: "acme.short", inverted: true, params: {} }];
    expect(await resolveShelfAppIds(withConditions("alphabetical", false, only), 10)).toEqual([3, 4]);
    expect(await resolveShelfAppIds(withConditions("alphabetical", false, negated), 10)).toEqual([2, 1]);
  });
});

describe("built-in entries in the registry", () => {
  it("never order a built-in sort key but manual as a single key through the registry", async () => {
    const keys = SORT_OPTIONS.map((o) => o.value as string);
    const calls: string[] = [];
    for (const key of keys) {
      offs.push(registerInternalSortOption({ id: key, displayName: key, sort: (ids) => { calls.push(key); return ids.slice(); } }));
    }
    for (const key of keys) applySortToIds([1, 2, 3, 4], key, stores.apps, "s");
    expect(calls).toEqual(["manual"]);
    calls.length = 0;
    for (const a of keys) for (const b of keys) applySortToIds([1, 2, 3, 4], [a, b], stores.apps, "s");
    for (const key of keys) await resolveShelfAppIds(sortOnly(key), 10, undefined, "s");
    expect(calls).toEqual([]);
  });

  it("never evaluate a built-in condition through the registry", () => {
    const calls: string[] = [];
    for (const type of FilterItemTypeSchema.options) {
      offs.push(registerInternalFilterType({ id: type, displayName: type, evaluate: () => { calls.push(type); return true; } }));
    }
    for (const type of FilterItemTypeSchema.options) {
      try { evaluateFilterItem({ type, params: {} } as FilterItem, stores.apps[0]); } catch {}
    }
    expect(calls).toEqual([]);
  });

  it("never resolve a built-in smart mode through the registry, and none of them is retired", async () => {
    const modes = [...SMART_MODE_OPTIONS, "custom"];
    const calls: string[] = [];
    for (const mode of modes) {
      offs.push(registerInternalSmartShelfSource({ id: mode, displayName: mode, resolve: async () => { calls.push(mode); return []; } }));
    }
    for (const mode of modes) {
      try { await resolveShelfAppIds({ type: "smart", mode } as ShelfSource, 10, undefined, `s-${mode}`); } catch {}
    }
    expect(calls).toEqual([]);
    expect(modes.filter((m) => RETIRED_SMART_MODES.has(m))).toEqual([]);
  });
});
