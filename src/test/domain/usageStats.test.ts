import { describe, it, expect } from "vitest";
import {
  emptyUsage,
  bumpShelfView,
  bumpCardLaunch,
  bumpFeature,
  pruneUsage,
  summarizeUsage,
  usageDateKey,
  usageDateKeyDaysAgo,
  dailyTotals,
} from "../../domain/usageStats";

describe("usageStats", () => {
  it("bumps are immutable and accumulate", () => {
    const u0 = emptyUsage();
    const u1 = bumpShelfView(u0, "2026-06-01", "s_a");
    const u2 = bumpShelfView(u1, "2026-06-01", "s_a", 2);
    expect(u0.days).toEqual({}); // original untouched
    expect(u2.days["2026-06-01"].shelfViews.s_a).toBe(3);
  });

  it("ignores non-positive / invalid counts", () => {
    let u = emptyUsage();
    u = bumpCardLaunch(u, "2026-06-01", "game", 0);
    u = bumpCardLaunch(u, "2026-06-01", "game", -5);
    u = bumpCardLaunch(u, "2026-06-01", "", 1);
    u = bumpCardLaunch(u, "2026-06-01", "game", NaN);
    expect(u.days).toEqual({});
  });

  it("tracks three buckets independently", () => {
    let u = emptyUsage();
    u = bumpShelfView(u, "2026-06-01", "s_a");
    u = bumpCardLaunch(u, "2026-06-01", "nonsteam");
    u = bumpFeature(u, "2026-06-01", "hero");
    const d = u.days["2026-06-01"];
    expect(d.shelfViews).toEqual({ s_a: 1 });
    expect(d.cardLaunches).toEqual({ nonsteam: 1 });
    expect(d.featureUse).toEqual({ hero: 1 });
  });

  it("prunes to the most recent capDays", () => {
    let u = emptyUsage();
    for (let i = 1; i <= 10; i++) u = bumpShelfView(u, `2026-06-${String(i).padStart(2, "0")}`, "s_a");
    u = pruneUsage(u, 3);
    expect(Object.keys(u.days).sort()).toEqual(["2026-06-08", "2026-06-09", "2026-06-10"]);
  });

  it("summarizes across days with an optional since-window", () => {
    let u = emptyUsage();
    u = bumpShelfView(u, "2026-06-01", "s_a", 2);
    u = bumpShelfView(u, "2026-06-05", "s_a", 3);
    u = bumpShelfView(u, "2026-06-05", "s_b", 1);
    u = bumpCardLaunch(u, "2026-06-05", "game", 4);

    const all = summarizeUsage(u);
    expect(all.shelfViews).toEqual({ s_a: 5, s_b: 1 });
    expect(all.totalShelfViews).toBe(6);
    expect(all.totalCardLaunches).toBe(4);
    expect(all.totalDays).toBe(2);

    const recent = summarizeUsage(u, "2026-06-03");
    expect(recent.shelfViews).toEqual({ s_a: 3, s_b: 1 });
    expect(recent.totalDays).toBe(1);
  });

  it("builds a continuous daily series with gaps zero-filled", () => {
    const now = new Date(2026, 5, 15, 12).getTime(); // 2026-06-15
    let u = emptyUsage();
    u = bumpCardLaunch(u, "2026-06-15", "game", 4);
    u = bumpShelfView(u, "2026-06-13", "s_a", 2);
    const series = dailyTotals(u, now, 3); // 06-13, 06-14, 06-15
    expect(series.map((p) => p.date)).toEqual(["2026-06-13", "2026-06-14", "2026-06-15"]);
    expect(series.map((p) => p.launches)).toEqual([0, 0, 4]);
    expect(series.map((p) => p.views)).toEqual([2, 0, 0]);
    expect(series.map((p) => p.features)).toEqual([0, 0, 0]);
  });

  it("date keys are local ISO and day math is stable", () => {
    const ms = new Date(2026, 5, 15, 10, 30).getTime(); // local 2026-06-15
    expect(usageDateKey(ms)).toBe("2026-06-15");
    expect(usageDateKeyDaysAgo(ms, 7)).toBe("2026-06-08");
  });
});
