// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SHORTCUT = 1073741824;

let categories: Record<number, number[]> = {};
let withoutMethod = new Set<number>();
let throwing = new Set<number>();
let smart: typeof import("../../steam/smartShelves");

function overviewFor(id: number) {
  if (withoutMethod.has(id)) return { appid: id };
  if (throwing.has(id)) return { appid: id, BHasStoreCategory: () => { throw new Error("patched lookup failed"); } };
  if (!(id in categories)) return null;
  return { appid: id, BHasStoreCategory: (c: number) => categories[id].includes(c) };
}

beforeEach(async () => {
  vi.resetModules();
  categories = {};
  withoutMethod = new Set();
  throwing = new Set();
  vi.stubGlobal("appStore", { GetAppOverviewByAppID: overviewFor });
  smart = await import("../../steam/smartShelves");
  smart.invalidateSmartShelfCache();
});

afterEach(() => vi.unstubAllGlobals());

const shortcut = (appid: number, extra: Record<string, unknown> = {}) =>
  ({ appid, app_type: SHORTCUT, is_non_steam: true, installed: true, deck_compatibility_category: 0, ...extra }) as any;
const steamGame = (appid: number, extra: Record<string, unknown> = {}) =>
  ({ appid, app_type: 1, is_non_steam: false, deck_compatibility_category: 3, ...extra }) as any;

const MODES = [
  { mode: "couch_gaming", inMode: 39, outOfMode: 9 },
  { mode: "party_games", inMode: 37, outOfMode: 39 },
  { mode: "coop_ready", inMode: 38, outOfMode: 24 },
] as const;

describe.each(MODES)("$mode with non-Steam shortcuts", ({ mode, inMode, outOfMode }) => {
  const resolve = (apps: any[], limit = 10, params?: Record<string, number>, shelfId?: string) =>
    smart.resolveSmartShelf(mode, apps, limit, params, undefined, shelfId);

  it("lists a Steam game and a shortcut that both have the category", () => {
    categories = { 1: [inMode], 2: [inMode] };
    expect(resolve([steamGame(1, { last_played: 200 }), shortcut(2, { last_played: 100 })])).toEqual([1, 2]);
  });

  it("recognises a shortcut by its flag or by its app type alone", () => {
    categories = { 1: [inMode], 2: [inMode], 3: [inMode] };
    const apps = [
      shortcut(1, { last_played: 300 }),
      { appid: 2, is_non_steam: true, last_played: 200 },
      { appid: 3, app_type: SHORTCUT, last_played: 100 },
    ] as any[];
    expect(resolve(apps)).toEqual([1, 2, 3]);
  });

  it("leaves out a shortcut whose categories do not match the mode", () => {
    categories = { 1: [inMode], 2: [outOfMode], 3: [] };
    expect(resolve([shortcut(1), shortcut(2), shortcut(3)])).toEqual([1]);
  });

  it("leaves out a shortcut with no client record or no category lookup, without failing", () => {
    categories = { 1: [inMode] };
    withoutMethod = new Set([3]);
    expect(resolve([shortcut(1), shortcut(2), shortcut(3)])).toEqual([1]);
  });

  it("leaves out only the game whose category lookup throws", () => {
    categories = { 1: [inMode], 3: [inMode] };
    throwing = new Set([2]);
    expect(resolve([shortcut(1, { last_played: 300 }), shortcut(2, { last_played: 200 }), steamGame(3, { last_played: 100 })])).toEqual([1, 3]);
  });

  it("still leaves out a Steam game with no client record", () => {
    categories = { 1: [inMode] };
    withoutMethod = new Set([3]);
    expect(resolve([shortcut(1), steamGame(2), steamGame(3)])).toEqual([1]);
  });

  it("keeps Steam tools, applications, DLC, videos and soundtracks out even when they report the category", () => {
    categories = { 1: [inMode], 2: [inMode], 3: [inMode], 4: [inMode], 5: [inMode], 6: [inMode] };
    const others = [2, 4, 32, 2048, 8192].map((type, i) => steamGame(i + 2, { app_type: type }));
    expect(resolve([shortcut(1), ...others])).toEqual([1]);
  });

  it("applies the device threshold to shortcuts, which report no compatibility", () => {
    categories = { 1: [inMode], 2: [inMode] };
    const apps = [shortcut(1), steamGame(2, { deck_compatibility_category: 1 })];
    expect(resolve(apps)).toEqual([1, 2]);
    smart.invalidateSmartShelfCache();
    expect(resolve(apps, 10, { minDeckLevel: 1 })).toEqual([2]);
    smart.invalidateSmartShelfCache();
    expect(resolve(apps, 10, { minDeckLevel: 2 })).toEqual([]);
  });

  it("orders by last played across both sources and stops at the limit", () => {
    categories = { 1: [inMode], 2: [inMode], 3: [inMode], 4: [inMode] };
    const apps = [
      steamGame(1, { last_played: 100 }),
      shortcut(2, { last_played: 400 }),
      steamGame(3, { last_played: 300 }),
      shortcut(4),
    ];
    expect(resolve(apps, 3)).toEqual([2, 3, 1]);
  });

  it("lists a shortcut once when it matches several of the mode's categories", () => {
    categories = { 1: [24, 37, 39, 9, 38, 48] };
    expect(resolve([shortcut(1)])).toEqual([1]);
  });

  it("picks up a shortcut's new category after the shelf's cache is cleared", () => {
    categories = { 1: [] };
    const apps = [shortcut(1)];
    expect(resolve(apps, 10, undefined, "s1")).toEqual([]);
    categories = { 1: [inMode] };
    expect(resolve(apps, 10, undefined, "s1")).toEqual([]);
    smart.invalidateSmartShelfCache("s1");
    expect(resolve(apps, 10, undefined, "s1")).toEqual([1]);
  });
});
