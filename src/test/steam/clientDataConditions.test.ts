// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/* The conditions and sorts that read the client's own records: store tags by name or id,
   the friends' libraries, the achievement counts, Family Sharing and the dynamic collections. */

const TAG_NAMES: Record<number, string> = { 1: "RPG", 2: "Gráficos Pixelados", 3: "Casual" };

function overview(appid: number, extra: Record<string, unknown> = {}) {
  return { appid, GetStoreTags: () => new Set<number>(), BIsBorrowed: () => false, ...extra };
}

const apps = {
  10: overview(10, { GetStoreTags: () => new Set([1, 2]) }),
  20: overview(20, { GetStoreTags: () => new Set([3]), BIsBorrowed: () => true }),
  30: overview(30),
};

let v3: typeof import("../../steam/v3Extensions");
let achievements: typeof import("../../steam/achievements");
let friendsOwned: typeof import("../../steam/friendsOwned");

const unlocked = (n: number, total: number) => Array.from({ length: total }, (_, i) => ({ bAchieved: i < n }));

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("appStore", {
    GetAppOverviewByAppID: (id: number) => (apps as any)[id] ?? null,
    GetLocalizationForStoreTag: (id: number) => TAG_NAMES[id],
  });
  vi.stubGlobal("SteamClient", { Apps: { GetMyAchievementsForApp: async (id: string) => id === "10" ? { result: 1, data: { rgAchievements: unlocked(40, 50) } } : id === "20" ? { result: 1, data: { rgAchievements: unlocked(50, 50) } } : { result: 2 } } });
  vi.stubGlobal("friendStore", { allFriends: [{ accountid: 1 }, { accountid: 2 }], FetchOwnedGames: async (id: number) => ({ setApps: new Set(id === 1 ? [10, 20] : [10]) }) });
  v3 = await import("../../steam/v3Extensions");
  achievements = await import("../../steam/achievements");
  friendsOwned = await import("../../steam/friendsOwned");
});

afterEach(() => vi.unstubAllGlobals());

const app = (appid: number) => ({ appid, display_name: `App ${appid}` }) as any;
const played = (appid: number) => ({ appid, playtime_forever: 60, last_played: 1 }) as any;
const evaluate = (type: string, params: Record<string, unknown>, appid: number) => v3.FILTER_V3_EVALUATORS[type]({ type, params }, app(appid));

describe("storeTag", () => {
  it("matches a tag by its name in the client's language, accents and case aside, or by its id", () => {
    expect(evaluate("storeTag", { tags: ["rpg"] }, 10)).toBe(true);
    expect(evaluate("storeTag", { tags: ["graficos pixelados"] }, 10)).toBe(true);
    expect(evaluate("storeTag", { tags: ["3"] }, 20)).toBe(true);
    expect(evaluate("storeTag", { tags: ["RPG"] }, 20)).toBe(false);
    expect(evaluate("storeTag", { tags: ["RPG"] }, 30)).toBe(false);
    expect(evaluate("storeTag", { tags: ["RPG"] }, 99)).toBe(false);
  });

  it("constrains nothing without tags to look for", () => {
    expect(evaluate("storeTag", { tags: [] }, 30)).toBe(true);
    expect(evaluate("storeTag", {}, 99)).toBe(true);
  });
});

describe("storeCategory and purchaseDate", () => {
  it("matches any or all of the category ids the client records, and nothing without a record", () => {
    (apps as any)[40] = overview(40, { BHasStoreCategory: (id: number) => [2, 23].includes(id) });
    expect(evaluate("storeCategory", { ids: [23] }, 40)).toBe(true);
    expect(evaluate("storeCategory", { ids: [23, 28], mode: "any" }, 40)).toBe(true);
    expect(evaluate("storeCategory", { ids: [23, 28], mode: "all" }, 40)).toBe(false);
    expect(evaluate("storeCategory", { ids: [2, 23], mode: "all" }, 40)).toBe(true);
    expect(evaluate("storeCategory", { ids: [] }, 40)).toBe(true);
    expect(evaluate("storeCategory", { ids: [2] }, 99)).toBe(false);
  });

  it("compares the purchase date, and tells an unknown one", () => {
    const bought = { appid: 50, rt_purchased_time: 1_600_000_000 } as any;
    const never = { appid: 51 } as any;
    const run = (params: Record<string, unknown>, a: any) => v3.FILTER_V3_EVALUATORS.purchaseDate({ type: "purchaseDate", params }, a);
    expect(run({ op: "after", ts: 1_500_000_000 }, bought)).toBe(true);
    expect(run({ op: "before", ts: 1_500_000_000 }, bought)).toBe(false);
    expect(run({ op: "after", ts: 1_500_000_000 }, never)).toBe(false);
    expect(run({ op: "unknown" }, never)).toBe(true);
    expect(run({ op: "unknown" }, bought)).toBe(false);
    expect(run({ op: "after", ts: 0 }, never)).toBe(true);
    expect(v3.FILTER_V3_EVALUATORS.releaseDate({ type: "releaseDate", params: { op: "unknown" } }, never)).toBe(true);
  });

  it("store tags with mode all need every wanted tag", () => {
    expect(evaluate("storeTag", { tags: ["rpg", "casual"], mode: "any" }, 10)).toBe(true);
    expect(evaluate("storeTag", { tags: ["rpg", "casual"], mode: "all" }, 10)).toBe(false);
    expect(evaluate("storeTag", { tags: ["rpg", "2"], mode: "all" }, 10)).toBe(true);
  });
});

describe("friends", () => {
  it("counts the friends owning the game once their libraries are loaded, overall or among given friends", async () => {
    expect(evaluate("friends", { min: 1 }, 10)).toBe(false);
    await friendsOwned.loadFriendsOwned();
    expect(evaluate("friends", { min: 1 }, 10)).toBe(true);
    expect(evaluate("friends", { min: 2 }, 10)).toBe(true);
    expect(evaluate("friends", { min: 2 }, 20)).toBe(false);
    expect(evaluate("friends", { min: 1, friends: [2] }, 20)).toBe(false);
    expect(evaluate("friends", { min: 1, friends: [1] }, 20)).toBe(true);
    expect(evaluate("friends", {}, 30)).toBe(false);
  });

  it("sorts by how many friends own the game and by friend activity", async () => {
    await friendsOwned.loadFriendsOwned();
    const order = [app(30), app(20), app(10)].sort(v3.SORT_V3_COMPARATORS.most_friends_owning).map((a) => a.appid);
    expect(order).toEqual([10, 20, 30]);
    const trending = [app(30), app(20), app(10)].sort(v3.SORT_V3_COMPARATORS.trending_among_friends).map((a) => a.appid);
    expect(trending).toEqual([10, 20, 30]);
  });
});

describe("achievements", () => {
  it("reads the unlocked count and the percentage once loaded; a game without achievements never matches", async () => {
    expect(evaluate("achievements", { min: 1 }, 10)).toBe(false);
    await achievements.loadAchievements([played(10), played(20), played(30)]);
    expect(evaluate("achievements", { min: 1 }, 10)).toBe(true);
    expect(evaluate("achievements", { min: 41 }, 10)).toBe(false);
    expect(evaluate("achievements", { min: 1, max: 45 }, 20)).toBe(false);
    expect(evaluate("achievements", { min: 1 }, 30)).toBe(false);
    expect(evaluate("achievementPercentRange", { min: 70, max: 90 }, 10)).toBe(true);
    expect(evaluate("achievementPercentRange", { min: 90, max: 100 }, 10)).toBe(false);
    expect(evaluate("achievementPercentRange", { min: 0, max: 100 }, 30)).toBe(false);
    expect(evaluate("neverCompleted", {}, 10)).toBe(true);
    expect(evaluate("neverCompleted", {}, 20)).toBe(false);
    expect(evaluate("neverCompleted", {}, 30)).toBe(false);
  });

  it("sorts by completion, highest first, and by distance to 100% with finished games last", async () => {
    await achievements.loadAchievements([played(10), played(20), played(30)]);
    const byPct = [app(30), app(10), app(20)].sort(v3.SORT_V3_COMPARATORS.completion_percent).map((a) => a.appid);
    expect(byPct).toEqual([20, 10, 30]);
    const closest = [app(30), app(20), app(10)].sort(v3.SORT_V3_COMPARATORS.closest_to_completion).map((a) => a.appid);
    expect(closest[0]).toBe(10);
  });
});

describe("familySharing", () => {
  it("matches the games the client marks as borrowed, and sorts them first", () => {
    expect(evaluate("familySharing", {}, 20)).toBe(true);
    expect(evaluate("familySharing", {}, 10)).toBe(false);
    expect(evaluate("familySharing", {}, 99)).toBe(false);
    expect([app(10), app(20)].sort(v3.SORT_V3_COMPARATORS.family_shared_games).map((a) => a.appid)).toEqual([20, 10]);
  });
});

describe("dynamic_collections", () => {
  it("resolves to the games of every dynamic collection the client stores", () => {
    const dynamic = { id: "uc-1", bIsDynamic: true, allApps: [{ appid: 10 }, { appid: 30 }] };
    const fixed = { id: "uc-2", bIsDynamic: false, allApps: [{ appid: 20 }] };
    vi.stubGlobal("collectionStore", { m_mapCollectionsFromStorage: new Map([["uc-1", dynamic], ["uc-2", fixed]]) });
    const all = [app(10), app(20), app(30)];
    expect(v3.SOURCE_V3_RESOLVERS.dynamic_collections(all).map((a) => a.appid)).toEqual([10, 30]);
  });
});
