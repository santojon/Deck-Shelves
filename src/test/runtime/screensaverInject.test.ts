import { describe, expect, it, vi } from "vitest";
import type { Settings, Shelf } from "../../types";

const SHELF_IDS: Record<string, number[]> = {
  a: [1, 2, 3, 4, 5],
  b: [11, 12, 13, 14, 15],
  c: [21, 22, 23, 24, 25],
  s1: Array.from({ length: 20 }, (_, i) => 1000 + i),
  s2: Array.from({ length: 20 }, (_, i) => 2000 + i),
  s3: Array.from({ length: 20 }, (_, i) => 3000 + i),
  s4: Array.from({ length: 20 }, (_, i) => 4000 + i),
};

vi.mock("../../steam", () => ({
  resolveShelfAppIds: vi.fn(async (_source: unknown, _limit: number, _sort: unknown, shelfId: string) =>
    SHELF_IDS[shelfId] ?? []),
}));
vi.mock("../../runtime/recentsReplace", () => ({ activeFirstShelf: () => null }));

const getStoreScreenshots = vi.fn(async (appids: number[]) => {
  const out = new Map<number, string[]>();
  for (const id of appids) out.set(id, [`https://cdn.example/${id}/1.jpg`, `https://cdn.example/${id}/2.jpg`, `https://cdn.example/${id}/3.jpg`]);
  return out;
});
vi.mock("../../core/onlineStore", () => ({ getStoreScreenshots: (appids: number[]) => getStoreScreenshots(appids) }));

import { buildScreensaverPool } from "../../runtime/screensaverInject";

function makeShelf(id: string): Shelf {
  return { id, title: id, enabled: true, hidden: false, limit: 20, source: { type: "builtin", id: "installed" } } as unknown as Shelf;
}

function makeSettings(shelfIds: string[]): Settings {
  return { shelves: shelfIds.map(makeShelf), screensaverShelvesEnabled: true } as unknown as Settings;
}

describe("buildScreensaverPool — shelf round-robin", () => {
  it("draws from every shelf, not just the first one", async () => {
    const pool = await buildScreensaverPool(makeSettings(["a", "b", "c"]));
    const appIds = pool.filter((i) => i.type === "app").map((i) => (i as { appid: number }).appid);
    expect(appIds).toContain(1);
    expect(appIds).toContain(11);
    expect(appIds).toContain(21);
  });

  it("interleaves in round-robin order, not shelf-by-shelf (default batch size 5)", async () => {
    const pool = await buildScreensaverPool(makeSettings(["a", "b", "c"]));
    const appIds = pool.filter((i) => i.type === "app").map((i) => (i as { appid: number }).appid);
    expect(appIds).toEqual([1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25]);
  });

  it("respects a configured smaller batch size", async () => {
    const settings = { ...makeSettings(["a", "b", "c"]), screensaverShelfBatchSize: 2 } as Settings;
    const pool = await buildScreensaverPool(settings);
    const appIds = pool.filter((i) => i.type === "app").map((i) => (i as { appid: number }).appid);
    expect(appIds.slice(0, 6)).toEqual([1, 2, 11, 12, 21, 22]);
    expect(appIds.slice(6, 9)).toEqual([3, 4, 13]);
  });

  it("lets every shelf reach its own configured limit when several are enabled", async () => {
    const pool = await buildScreensaverPool(makeSettings(["s1", "s2", "s3", "s4"]));
    const appIds = pool.filter((i) => i.type === "app").map((i) => (i as { appid: number }).appid);
    for (const base of [1000, 2000, 3000, 4000]) {
      const shelfCount = appIds.filter((id) => id >= base && id < base + 20).length;
      expect(shelfCount).toBe(20);
    }
  });
});

describe("buildScreensaverPool — online screenshots (opt-in)", () => {
  it("does not fetch when the toggle is off", async () => {
    getStoreScreenshots.mockClear();
    const settings = { ...makeSettings(["a"]), onlineFeaturesEnabled: true, screensaverOnlineScreenshotsEnabled: false } as Settings;
    await buildScreensaverPool(settings);
    expect(getStoreScreenshots).not.toHaveBeenCalled();
  });

  it("does not fetch when online features are off, even if the toggle is on", async () => {
    getStoreScreenshots.mockClear();
    const settings = { ...makeSettings(["a"]), onlineFeaturesEnabled: false, screensaverOnlineScreenshotsEnabled: true } as Settings;
    await buildScreensaverPool(settings);
    expect(getStoreScreenshots).not.toHaveBeenCalled();
  });

  it("fetches store screenshots for pool apps and caps at 2 per app", async () => {
    getStoreScreenshots.mockClear();
    const settings = { ...makeSettings(["a"]), onlineFeaturesEnabled: true, screensaverOnlineScreenshotsEnabled: true } as Settings;
    const pool = await buildScreensaverPool(settings);
    expect(getStoreScreenshots).toHaveBeenCalledWith([1, 2, 3, 4, 5]);
    const shots = pool.filter((i) => i.type === "screenshot") as { type: "screenshot"; url: string; appid: number }[];
    const forApp1 = shots.filter((s) => s.appid === 1);
    expect(forApp1.length).toBe(2);
  });
});
