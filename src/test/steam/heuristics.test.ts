import { describe, expect, it } from "vitest";
import { weightedRank, multiFactorRank, timeDecayScore, applyCooldown, rotateWindow } from "../../steam/heuristics";

// heuristic primitives. Pure helpers; cooldown carries a
// per-shelf LRU but the test scopes shelfKeys per case so entries
// never collide between assertions.

const ovr = (appid: number, fields: Record<string, any> = {}): any => ({ appid, ...fields });

describe("weightedRank", () => {
  it("ranks by sum of signal * weight, desc", () => {
    const apps = [ovr(1, { score: 10, deck: 3 }), ovr(2, { score: 5, deck: 3 }), ovr(3, { score: 8, deck: 0 })];
    const ranked = weightedRank(
      apps,
      [{ key: "score", get: (a: any) => a.score }, { key: "deck", get: (a: any) => a.deck }],
      { score: 1, deck: 100 },
    );
    expect(ranked.map((a) => a.appid)).toEqual([1, 2, 3]);
  });

  it("treats NaN / undefined signals as zero", () => {
    const apps = [ovr(1, { x: NaN }), ovr(2, { x: 5 })];
    const ranked = weightedRank(apps, [{ key: "x", get: (a: any) => a.x }], { x: 1 });
    expect(ranked.map((a) => a.appid)).toEqual([2, 1]);
  });
});

describe("multiFactorRank", () => {
  it("primary signal dominates, secondary breaks ties", () => {
    const apps = [
      ovr(1, { p: 10, s: 10 }),
      ovr(2, { p: 20, s: 1 }),
      ovr(3, { p: 20, s: 5 }),
    ];
    const ranked = multiFactorRank(apps, [
      { get: (a: any) => a.p },
      { get: (a: any) => a.s },
    ]);
    expect(ranked.map((a) => a.appid)).toEqual([3, 2, 1]);
  });
});

describe("timeDecayScore", () => {
  it("returns baseWeight for events with no timestamp", () => {
    expect(timeDecayScore(0, 30, 0.25)).toBe(0.25);
  });

  it("decays by half over one half-life", () => {
    const halfLifeDays = 7;
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    const score = timeDecayScore(sevenDaysAgo, halfLifeDays);
    expect(score).toBeCloseTo(0.5, 2);
  });
});

describe("applyCooldown", () => {
  it("skips items surfaced within the cooldown window", () => {
    const apps = [ovr(1), ovr(2), ovr(3), ovr(4)];
    const key = "test-cool-1";
    const first = applyCooldown(apps, key, 7, 2).map((a) => a.appid);
    const second = applyCooldown(apps, key, 7, 2).map((a) => a.appid);
    expect(first).toEqual([1, 2]);
    expect(second).toEqual([3, 4]);
  });

  it("disables cooldown when days <= 0", () => {
    const apps = [ovr(1), ovr(2)];
    const key = "test-cool-2";
    expect(applyCooldown(apps, key, 0, 2).map((a) => a.appid)).toEqual([1, 2]);
    expect(applyCooldown(apps, key, 0, 2).map((a) => a.appid)).toEqual([1, 2]);
  });
});

describe("rotateWindow", () => {
  it("returns a stable slice within the rotation window", () => {
    const apps = Array.from({ length: 10 }, (_, i) => ovr(i + 1));
    const key = "rot-stable";
    const a = rotateWindow(apps, key, 7, 3).map((x) => x.appid);
    const b = rotateWindow(apps, key, 7, 3).map((x) => x.appid);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });

  it("two shelfKeys do not show the same slice on the same day", () => {
    const apps = Array.from({ length: 30 }, (_, i) => ovr(i + 1));
    const a = rotateWindow(apps, "rot-shelf-A", 7, 5).map((x) => x.appid).join(",");
    const b = rotateWindow(apps, "rot-shelf-B", 7, 5).map((x) => x.appid).join(",");
    expect(a).not.toEqual(b);
  });
});
