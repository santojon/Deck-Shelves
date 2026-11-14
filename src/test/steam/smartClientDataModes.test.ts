// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/* The smart modes that read the client's records: the store categories (couch, co-op, party)
   and the achievement counts (almost finished). */

const CATEGORIES: Record<number, number[]> = { 1: [39], 2: [9], 3: [24, 37], 4: [] };

let smart: typeof import("../../steam/smartShelves");

const unlocked = (n: number, total: number) => Array.from({ length: total }, (_, i) => ({ bAchieved: i < n }));

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("appStore", { GetAppOverviewByAppID: (id: number) => (id in CATEGORIES ? { appid: id, BHasStoreCategory: (c: number) => CATEGORIES[id].includes(c) } : null) });
  const lists: Record<string, Array<{ bAchieved: boolean }>> = { "1": unlocked(8, 10), "2": unlocked(10, 10), "3": unlocked(2, 10) };
  vi.stubGlobal("SteamClient", { Apps: { GetMyAchievementsForApp: async (id: string) => (lists[id] ? { result: 1, data: { rgAchievements: lists[id] } } : { result: 2 }) } });
  smart = await import("../../steam/smartShelves");
  smart.invalidateSmartShelfCache();
});

afterEach(() => vi.unstubAllGlobals());

const NOW = Math.floor(Date.now() / 1000);
const apps = [
  { appid: 1, playtime_forever: 60, last_played: NOW - 10, deck_compatibility_category: 3 },
  { appid: 2, playtime_forever: 60, last_played: NOW - 20, deck_compatibility_category: 3 },
  { appid: 3, playtime_forever: 60, last_played: NOW - 30, deck_compatibility_category: 1 },
  { appid: 4, playtime_forever: 0, last_played: 0 },
  { appid: 5, playtime_forever: 60, is_non_steam: true },
] as any[];

describe("category modes", () => {
  it("pick the games with the mode's store categories, last played first, under the device threshold", () => {
    expect(smart.resolveSmartShelf("coop_ready", apps, 10)).toEqual([1, 2]);
    expect(smart.resolveSmartShelf("couch_gaming", apps, 10)).toEqual([1, 3]);
    expect(smart.resolveSmartShelf("party_games", apps, 10)).toEqual([3]);
    expect(smart.resolveSmartShelf("couch_gaming", apps, 10, { minDeckLevel: 2 })).toEqual([1]);
  });

  it("find nothing without the client's records", () => {
    vi.stubGlobal("appStore", undefined);
    expect(smart.resolveSmartShelf("coop_ready", apps, 10)).toEqual([]);
  });
});

describe("almost_finished", () => {
  it("needs the counts loaded first, then ranks played games past the threshold and short of 100%", async () => {
    expect(smart.resolveSmartShelf("almost_finished", apps, 10)).toEqual([]);
    smart.invalidateSmartShelfCache();
    await smart.prepareSmartModes(["almost_finished"], apps);
    expect(smart.resolveSmartShelf("almost_finished", apps, 10)).toEqual([1]);
    smart.invalidateSmartShelfCache();
    expect(smart.resolveSmartShelf("almost_finished", apps, 10, { minAchievementPct: 10 })).toEqual([1, 3]);
  });
});
