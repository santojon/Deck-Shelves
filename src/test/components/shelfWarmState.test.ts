import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getShelfWarmEntry, setShelfWarmEntry, clearShelfWarmEntry, allShelvesWarm, __resetShelfWarmStateForTest,
} from "../../components/shelf/shelfWarmState";

function entry(ids: number[]) {
  return {
    appIds: ids,
    sourceIds: ids,
    items: new Map(ids.map((id) => [id, { appid: id, name: `Game ${id}` }])),
    storeNames: new Map<number, string>(),
    resolvedTotal: ids.length,
  };
}

describe("shelfWarmState", () => {
  beforeEach(() => __resetShelfWarmStateForTest());
  afterEach(() => vi.useRealTimers());

  it("returns null for an unknown shelf", () => {
    expect(getShelfWarmEntry("nope")).toBeNull();
  });

  it("round-trips the last resolved state by shelf id (references, not copies)", () => {
    const e = entry([1, 2, 3]);
    setShelfWarmEntry("s1", e);
    const got = getShelfWarmEntry("s1");
    expect(got?.appIds).toBe(e.appIds);
    expect(got?.items).toBe(e.items);
    expect(got?.resolvedTotal).toBe(3);
  });

  it("a later write for the same shelf replaces the earlier one", () => {
    setShelfWarmEntry("s1", entry([1]));
    setShelfWarmEntry("s1", entry([7, 8]));
    expect(getShelfWarmEntry("s1")?.appIds).toEqual([7, 8]);
  });

  it("expires after the warm TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
    setShelfWarmEntry("s1", entry([1]));
    vi.setSystemTime(new Date("2026-10-09T10:29:00Z"));
    expect(getShelfWarmEntry("s1")).not.toBeNull();
    vi.setSystemTime(new Date("2026-10-09T10:31:00Z"));
    expect(getShelfWarmEntry("s1")).toBeNull();
  });

  it("clearShelfWarmEntry drops one shelf only", () => {
    setShelfWarmEntry("a", entry([1]));
    setShelfWarmEntry("b", entry([2]));
    clearShelfWarmEntry("a");
    expect(getShelfWarmEntry("a")).toBeNull();
    expect(getShelfWarmEntry("b")).not.toBeNull();
  });

  it("allShelvesWarm is true only when every listed shelf is warm", () => {
    expect(allShelvesWarm([])).toBe(false);
    setShelfWarmEntry("a", entry([1]));
    expect(allShelvesWarm(["a"])).toBe(true);
    expect(allShelvesWarm(["a", "b"])).toBe(false);
    setShelfWarmEntry("b", entry([2]));
    expect(allShelvesWarm(["a", "b"])).toBe(true);
  });
});
