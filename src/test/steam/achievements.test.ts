// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The client's own achievement list per app: `result` 1 with the list, 2 for an app without achievements.
function client(lists: Record<string, Array<{ bAchieved: boolean }>>) {
  const calls: string[] = [];
  return {
    calls,
    Apps: {
      GetMyAchievementsForApp: async (appid: string) => {
        calls.push(appid);
        const list = lists[appid];
        return list ? { result: 1, data: { rgAchievements: list } } : { result: 2, message: "no achievements" };
      },
    },
  };
}

const unlocked = (n: number, total: number) => Array.from({ length: total }, (_, i) => ({ bAchieved: i < n }));
const played = (appid: number, lastPlayed = 1000) => ({ appid, playtime_forever: 60, last_played: lastPlayed }) as any;

let mod: typeof import("../../steam/achievements");
let steam: ReturnType<typeof client>;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  steam = client({ "10": unlocked(26, 56), "20": unlocked(0, 12) });
  vi.stubGlobal("SteamClient", steam);
  mod = await import("../../steam/achievements");
});

afterEach(() => vi.unstubAllGlobals());

describe("achievements", () => {
  it("knows nothing before a load, then the counts and the percentage of what was loaded", async () => {
    expect(mod.achievementsOf(10)).toBeUndefined();
    await mod.loadAchievements([played(10), played(20), played(30)]);
    expect(mod.achievementsOf(10)).toEqual({ achieved: 26, total: 56 });
    expect(mod.achievementPercent(10)).toBeCloseTo(46.43, 1);
    expect(mod.achievementPercent(20)).toBe(0);
    expect(mod.achievementsOf(30)).toEqual({ achieved: 0, total: 0 });
    expect(mod.achievementPercent(30)).toBeUndefined();
  });

  it("loads only played Steam games, once each, and again for a game played since", async () => {
    const apps = [
      played(10),
      { appid: 2, playtime_forever: 0 },
      { appid: 3, playtime_forever: 10, is_non_steam: true },
      { appid: 4, playtime_forever: 10, app_type: 2 },
      played(10),
    ] as any[];
    await mod.loadAchievements(apps);
    await mod.loadAchievements(apps);
    expect(steam.calls).toEqual(["10"]);
    await mod.loadAchievements([played(10, Math.floor(Date.now() / 1000) + 60)]);
    expect(steam.calls).toEqual(["10", "10"]);
  });

  it("keeps the counts in local storage for the next session", async () => {
    await mod.loadAchievements([played(10)]);
    vi.resetModules();
    const next = await import("../../steam/achievements");
    expect(next.achievementsOf(10)).toEqual({ achieved: 26, total: 56 });
    await next.loadAchievements([played(10)]);
    expect(steam.calls).toEqual(["10"]);
  });

  it("treats a client without the call, or one that throws, as no achievements", async () => {
    vi.stubGlobal("SteamClient", { Apps: { GetMyAchievementsForApp: async () => { throw new Error("offline"); } } });
    await mod.loadAchievements([played(10)]);
    expect(mod.achievementsOf(10)).toEqual({ achieved: 0, total: 0 });
    vi.stubGlobal("SteamClient", {});
    await mod.loadAchievements([played(99)]);
    expect(mod.achievementsOf(99)).toEqual({ achieved: 0, total: 0 });
  });
});
