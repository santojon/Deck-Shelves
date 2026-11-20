import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveSmartShelf, invalidateSmartShelfCache } from "../../steam/smartShelves";

const SHORTCUT = 1073741824;
const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

const shortcut = (appid: number, extra: Record<string, unknown> = {}) =>
  ({ appid, app_type: SHORTCUT, is_non_steam: true, installed: true, deck_compatibility_category: 0, ...extra }) as any;
const steamGame = (appid: number, extra: Record<string, unknown> = {}) =>
  ({ appid, app_type: 1, is_non_steam: false, installed: true, deck_compatibility_category: 3, ...extra }) as any;
const tool = (appid: number, extra: Record<string, unknown> = {}) => steamGame(appid, { app_type: 4, ...extra });

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

beforeEach(() => invalidateSmartShelfCache());

describe("rotation and random modes with non-Steam shortcuts", () => {
  it("random_pick draws from shortcuts as well as Steam games, never from tools or soundtracks", () => {
    const apps = [steamGame(1), shortcut(2), tool(3), steamGame(4, { app_type: 8192 })];
    expect(sorted(resolveSmartShelf("random_pick", apps, 10))).toEqual([1, 2]);
  });

  it("daily_pick takes a shortcut that is installed or has playtime, and not one with neither", () => {
    const apps = [
      steamGame(1),
      shortcut(2),
      shortcut(3, { installed: false, playtime_forever: 30 }),
      shortcut(4, { installed: false, playtime_forever: 0 }),
      shortcut(5, { installed: undefined }),
      tool(6),
    ];
    expect(sorted(resolveSmartShelf("daily_pick", apps, 10))).toEqual([1, 2, 3]);
  });

  it("weekly_rotation rotates installed shortcuts in with Steam games", () => {
    const apps = [steamGame(1), shortcut(2), steamGame(3, { installed: false }), tool(4)];
    expect(sorted(resolveSmartShelf("weekly_rotation", apps, 10, undefined, undefined, "wr"))).toEqual([1, 2]);
  });

  it("weekly_rotation leaves out a shortcut without an installed flag, and one below the device threshold", () => {
    const apps = [shortcut(1), shortcut(2, { installed: false }), shortcut(3, { installed: undefined }), steamGame(4, { deck_compatibility_category: 2 })];
    expect(sorted(resolveSmartShelf("weekly_rotation", apps, 10, undefined, undefined, "wr1"))).toEqual([1, 4]);
    expect(sorted(resolveSmartShelf("weekly_rotation", apps, 10, { minDeckLevel: 1 }, undefined, "wr2"))).toEqual([4]);
  });
});

describe("play history modes with non-Steam shortcuts", () => {
  it("recently_played lists a shortcut played inside the window, newest first", () => {
    const apps = [
      steamGame(1, { last_played: NOW - 3 * DAY }),
      shortcut(2, { last_played: NOW - DAY }),
      shortcut(3, { last_played: NOW - 60 * DAY }),
      tool(4, { last_played: NOW }),
    ];
    expect(resolveSmartShelf("recently_played", apps, 10)).toEqual([2, 1]);
  });

  it("recently_played does not read a shortcut with no last-played time as recent", () => {
    const apps = [shortcut(1, { last_played: NOW - DAY }), shortcut(2, { last_played: 0 }), shortcut(3)];
    expect(resolveSmartShelf("recently_played", apps, 10, { daysAgo: 365 })).toEqual([1]);
  });

  it("long_session lists an installed shortcut past the playtime threshold", () => {
    const apps = [
      shortcut(1, { playtime_forever: 300 }),
      shortcut(2, { playtime_forever: 100 }),
      shortcut(3, { playtime_forever: 300, installed: false }),
      steamGame(4, { playtime_forever: 200 }),
      tool(5, { playtime_forever: 900 }),
    ];
    expect(resolveSmartShelf("long_session", apps, 10)).toEqual([1, 4]);
  });

  it("long_session does not count a shortcut with no playtime, even with the threshold at zero", () => {
    const apps = [shortcut(1, { playtime_forever: 5 }), shortcut(2, { playtime_forever: 0 }), shortcut(3)];
    expect(resolveSmartShelf("long_session", apps, 10, { minPlaytimeMinutes: 0 })).toEqual([1]);
  });

  it("backlog_rescue brings back a stale installed shortcut and skips a fresh one", () => {
    const apps = [
      shortcut(1, { playtime_forever: 120, last_played: NOW - 60 * DAY }),
      shortcut(2, { playtime_forever: 120, last_played: NOW - 5 * DAY }),
      shortcut(3, { playtime_forever: 10, last_played: NOW - 60 * DAY }),
      tool(4, { playtime_forever: 120, last_played: NOW - 60 * DAY }),
    ];
    expect(resolveSmartShelf("backlog_rescue", apps, 10, undefined, undefined, "br1")).toEqual([1]);
  });

  it("backlog_rescue needs a real last-played time for a shortcut, even with no playtime minimum", () => {
    const apps = [
      shortcut(1, { last_played: NOW - 60 * DAY }),
      shortcut(2, { playtime_forever: 120, last_played: 0 }),
      shortcut(3),
    ];
    expect(resolveSmartShelf("backlog_rescue", apps, 10, { minPlaytimeMinutes: 0 }, undefined, "br2")).toEqual([1]);
  });

  it("rediscover lists a long-idle shortcut once the device threshold allows it", () => {
    const apps = [
      shortcut(1, { playtime_forever: 120, last_played: NOW - 300 * DAY }),
      shortcut(2, { playtime_forever: 120, last_played: NOW - 10 * DAY }),
      tool(3, { playtime_forever: 120, last_played: NOW - 300 * DAY, deck_compatibility_category: 0 }),
    ];
    expect(resolveSmartShelf("rediscover", apps, 10)).toEqual([]);
    invalidateSmartShelfCache();
    expect(resolveSmartShelf("rediscover", apps, 10, { minDeckLevel: 0 })).toEqual([1]);
  });

  it("rediscover does not read a shortcut with no history as idle", () => {
    const apps = [shortcut(1, { playtime_forever: 5, last_played: NOW - 300 * DAY }), shortcut(2, { playtime_forever: 0, last_played: 0 }), shortcut(3)];
    expect(resolveSmartShelf("rediscover", apps, 10, { minDeckLevel: 0, minPlaytimeMinutes: 0 })).toEqual([1]);
  });
});

describe("compatibility modes with non-Steam shortcuts", () => {
  it("on_deck keeps shortcuts out at its default threshold and takes installed ones when it is lowered", () => {
    const apps = [steamGame(1), shortcut(2), shortcut(3, { installed: false }), shortcut(4, { installed: undefined }), tool(5)];
    expect(resolveSmartShelf("on_deck", apps, 10)).toEqual([1]);
    invalidateSmartShelfCache();
    expect(resolveSmartShelf("on_deck", apps, 10, { minDeckLevel: 0 })).toEqual([1, 2]);
  });

  it("deck_picks keeps shortcuts out at its default threshold and takes them when it is lowered", () => {
    const apps = [steamGame(1, { last_played: 100 }), shortcut(2, { last_played: 200 }), tool(3, { deck_compatibility_category: 3 })];
    expect(resolveSmartShelf("deck_picks", apps, 10)).toEqual([1]);
    invalidateSmartShelfCache();
    expect(resolveSmartShelf("deck_picks", apps, 10, { minDeckLevel: 0 })).toEqual([2, 1]);
  });
});

describe("time_of_day with non-Steam shortcuts", () => {
  afterEach(() => vi.useRealTimers());

  const at = (hour: number) => vi.setSystemTime(new Date(2026, 10, 18, hour, 0, 0));

  it("follows each window's rule: shortcuts stay out of the morning window and join the others", () => {
    vi.useFakeTimers();
    const now = () => Math.floor(Date.now() / 1000);
    at(9);
    const apps = [shortcut(1, { playtime_forever: 60, last_played: now() - 300 * DAY })];
    const params = { minDeckLevel: 0, minPlaytimeMinutes: 30 };
    expect(resolveSmartShelf("time_of_day", apps, 10, params)).toEqual([]);
    invalidateSmartShelfCache();
    at(14);
    expect(resolveSmartShelf("time_of_day", apps, 10, params)).toEqual([1]);
    invalidateSmartShelfCache();
    at(21);
    expect(resolveSmartShelf("time_of_day", apps, 10, params)).toEqual([1]);
  });
});
