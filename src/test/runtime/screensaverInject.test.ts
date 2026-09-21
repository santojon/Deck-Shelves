import { describe, expect, it, vi } from "vitest";
import type { Settings, Shelf } from "../../types";

// resolveShelfAppIds is keyed by the shelf id passed in — lets each mocked
// shelf return its own distinct app-id list without inspecting the source.
const SHELF_IDS: Record<string, number[]> = {
  a: [1, 2, 3, 4, 5],
  b: [11, 12, 13, 14, 15],
  c: [21, 22, 23, 24, 25],
};

vi.mock("../../steam", () => ({
  resolveShelfAppIds: vi.fn(async (_source: unknown, _limit: number, _sort: unknown, shelfId: string) =>
    SHELF_IDS[shelfId] ?? []),
}));
vi.mock("../../runtime/recentsReplace", () => ({ activeFirstShelf: () => null }));

import { buildScreensaverPool } from "../../runtime/screensaverInject";

function makeShelf(id: string): Shelf {
  return { id, title: id, enabled: true, hidden: false, limit: 20, source: { type: "builtin", id: "installed" } } as unknown as Shelf;
}

function makeSettings(shelfIds: string[]): Settings {
  return { shelves: shelfIds.map(makeShelf), screensaverShelvesEnabled: true } as unknown as Settings;
}

// The bug this locks in: a sequential fill-until-cap let an early shelf
// starve every later shelf out of the pool whenever its own resolved count
// approached the cap. Round-robin (one app per shelf per round) must give
// every shelf real representation instead.
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
    // Round 0: all 5 of shelf a's apps, then all 5 of b's, then c's.
    expect(appIds).toEqual([1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25]);
  });

  it("respects a configured smaller batch size", async () => {
    const settings = { ...makeSettings(["a", "b", "c"]), screensaverShelfBatchSize: 2 } as Settings;
    const pool = await buildScreensaverPool(settings);
    const appIds = pool.filter((i) => i.type === "app").map((i) => (i as { appid: number }).appid);
    // Round 0: first 2 of each shelf; round 1: next 2 of each; round 2: last 1 of each.
    expect(appIds.slice(0, 6)).toEqual([1, 2, 11, 12, 21, 22]);
    expect(appIds.slice(6, 9)).toEqual([3, 4, 13]);
  });
});
