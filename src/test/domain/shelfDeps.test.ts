import { describe, it, expect } from "vitest";
import { shelfDependencies, depsIntersect } from "../../domain/shelfDeps";

describe("shelfDependencies — what a shelf's result depends on", () => {
  it("local filter shelves depend on overviews only", () => {
    const d = shelfDependencies({ type: "filter", filter: { installed: true } });
    expect(d).toEqual(new Set(["overviews"]));
    expect(depsIntersect(d, ["friends"])).toBe(false);
    expect(depsIntersect(d, ["overviews"])).toBe(true);
  });

  it("time-window filters and recent/playtime sorts add time and session", () => {
    expect(shelfDependencies({ type: "filter", filter: { playedWithinDays: 7 } })).toEqual(new Set(["overviews", "time"]));
    expect(shelfDependencies({ type: "collection", collectionId: "c1" }, "recent")).toEqual(new Set(["session", "collections", "overviews"]));
  });

  it("friends smart shelves depend on friends; other smart modes on time and session", () => {
    expect(shelfDependencies({ type: "smart", mode: "friends_playing" })).toEqual(new Set(["overviews", "time", "session", "friends"]));
    expect(shelfDependencies({ type: "smart", mode: "spare_time" })).toEqual(new Set(["overviews", "time", "session"]));
  });

  it("online shelves depend on the online cache, plus overviews only when they hide owned games", () => {
    expect(shelfDependencies({ type: "wishlist" })).toEqual(new Set(["online"]));
    expect(shelfDependencies({ type: "store", excludeOwned: true })).toEqual(new Set(["online", "overviews"]));
  });

  it("composite shelves union their children; any unknown child means everything", () => {
    const d = shelfDependencies({ type: "composite", combine: "union", sources: [{ type: "wishlist" }, { type: "filter", filter: {} }] });
    expect(d).toEqual(new Set(["online", "overviews"]));
    expect(shelfDependencies({ type: "composite", combine: "union", sources: [{ type: "external", sourceId: "x" }] })).toBe("all");
  });

  it("unknown or plugin-provided sources depend on everything, and an untagged signal reaches every shelf", () => {
    expect(shelfDependencies({ type: "external", sourceId: "p" })).toBe("all");
    expect(shelfDependencies(null)).toBe("all");
    expect(depsIntersect(new Set(["online"]), undefined)).toBe(true);
    expect(depsIntersect(new Set(["online"]), [])).toBe(true);
    expect(depsIntersect("all", ["friends"])).toBe(true);
  });
});
