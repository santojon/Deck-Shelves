import { describe, it, expect } from "vitest";
import {
  onlineSourceTypes,
  shelfTypeBreakdown,
  shelfSourceBreakdown,
  cardTypeComposition,
  cardComposition,
} from "../../domain/shelfStats";

// A deeply-nested composite, used for the depth-cap / no-stack-overflow checks.
function deepComposite(depth: number): any {
  let src: any = { type: "wishlist" };
  for (let i = 0; i < depth; i++) src = { type: "composite", combine: "union", sources: [src] };
  return src;
}

describe("shelfStats — shelfTypeBreakdown", () => {
  it("counts regular vs smart shelves", () => {
    const s = { shelves: [{}, {}, {}], smartShelves: [{}, {}] };
    expect(shelfTypeBreakdown(s)).toEqual({ normal: 3, smart: 2 });
  });
  it("is defensive against missing / non-array fields", () => {
    expect(shelfTypeBreakdown(null)).toEqual({ normal: 0, smart: 0 });
    expect(shelfTypeBreakdown({})).toEqual({ normal: 0, smart: 0 });
    expect(shelfTypeBreakdown({ shelves: "nope", smartShelves: 5 })).toEqual({ normal: 0, smart: 0 });
  });
});

describe("shelfStats — onlineSourceTypes", () => {
  it("detects a direct store / wishlist source", () => {
    expect(onlineSourceTypes({ type: "store" })).toEqual(["store"]);
    expect(onlineSourceTypes({ type: "wishlist" })).toEqual(["wishlist"]);
  });
  it("recurses into composite children", () => {
    const src = { type: "composite", sources: [{ type: "wishlist" }, { type: "store" }, { type: "filter" }] };
    expect(onlineSourceTypes(src)).toEqual(["wishlist", "store"]);
  });
  it("returns none for offline / missing sources", () => {
    expect(onlineSourceTypes({ type: "filter" })).toEqual([]);
    expect(onlineSourceTypes(null)).toEqual([]);
    expect(onlineSourceTypes({ type: "composite", sources: "bad" })).toEqual([]);
  });
  it("stops at the depth cap without throwing", () => {
    expect(() => onlineSourceTypes(deepComposite(50))).not.toThrow();
    expect(onlineSourceTypes(deepComposite(50))).toEqual([]); // wishlist sits below the cap
  });
});

describe("shelfStats — shelfSourceBreakdown", () => {
  it("counts each source type and recurses composites into subtypes", () => {
    const s = {
      shelves: [
        { source: { type: "filter" } },
        { source: { type: "composite", sources: [{ type: "wishlist" }, { type: "store" }] } },
        { source: { type: "composite", sources: [{ type: "collection" }, { type: "collection" }] } },
      ],
      smartShelves: [{}, {}],
    };
    expect(shelfSourceBreakdown(s)).toEqual({
      filter: 1, composite: 2, wishlist: 1, store: 1, collection: 2, smart: 2,
    });
  });
  it("ignores malformed sources without a string type", () => {
    const s = { shelves: [{ source: null }, { source: {} }, { source: { type: 5 } }, { source: { type: "tab" } }] };
    expect(shelfSourceBreakdown(s)).toEqual({ tab: 1 });
  });
  it("handles a deeply nested composite without overflowing", () => {
    expect(() => shelfSourceBreakdown({ shelves: [{ source: deepComposite(40) }] })).not.toThrow();
  });
});

describe("shelfStats — cardTypeComposition", () => {
  const allSteam = () => false;
  it("classifies regular-shelf cards as game / non-Steam via the overview", () => {
    const s = { shelves: [{ id: "a", source: { type: "filter" } }] };
    const ids = () => [1, 2, 3];
    const nonSteam = (id: number) => id === 2;
    expect(cardTypeComposition(s, ids, nonSteam)).toEqual({ game: 2, nonsteam: 1, store: 0, wishlist: 0 });
  });
  it("attributes store / wishlist shelves by source type (presence, not launches)", () => {
    const s = { shelves: [{ id: "w", source: { type: "wishlist" } }, { id: "s", source: { type: "store" } }] };
    const ids = (sid: string) => (sid === "w" ? [10, 11] : [20, 21, 22]);
    expect(cardTypeComposition(s, ids, allSteam)).toEqual({ game: 0, nonsteam: 0, store: 3, wishlist: 2 });
  });
  it("splits a composite's resolved cards across its online types", () => {
    const s = { shelves: [{ id: "c", source: { type: "composite", sources: [{ type: "wishlist" }, { type: "store" }] } }] };
    const ids = () => [1, 2, 3, 4]; // 4 cards → 2 wishlist + 2 store
    expect(cardTypeComposition(s, ids, allSteam)).toEqual({ game: 0, nonsteam: 0, store: 2, wishlist: 2 });
  });
  it("skips shelves with no resolver cache or empty ids", () => {
    const s = { shelves: [{ id: "a", source: { type: "filter" } }, { id: "b", source: { type: "filter" } }] };
    const ids = (sid: string) => (sid === "a" ? null : []);
    expect(cardTypeComposition(s, ids, allSteam)).toEqual({ game: 0, nonsteam: 0, store: 0, wishlist: 0 });
  });
});

describe("shelfStats — cardComposition", () => {
  it("derives normal / featured / decorative / hidden", () => {
    const s = {
      shelves: [{
        id: "a",
        highlightedAppIds: [1, 2],
        hiddenAppIds: [9],
        syntheticCards: [{}, {}, {}],
      }],
    };
    const count = () => 10; // 10 resolved → 2 featured, 8 normal
    const out = Object.fromEntries(cardComposition(s, count).map((r) => [r.key, r.value]));
    expect(out).toEqual({ normal: 8, featured: 2, decorative: 3, hidden: 1 });
  });
  it("treats highlightAll as every resolved card featured (0 normal)", () => {
    const s = { shelves: [{ id: "a", highlightAll: true }] };
    const out = Object.fromEntries(cardComposition(s, () => 6).map((r) => [r.key, r.value]));
    expect(out.featured).toBe(6);
    expect(out.normal ?? 0).toBe(0);
  });
  it("counts decorative / hidden from config even without a resolver cache", () => {
    const s = { shelves: [{ id: "a", syntheticCards: [{}], hiddenAppIds: [1, 2] }] };
    const out = Object.fromEntries(cardComposition(s, () => null).map((r) => [r.key, r.value]));
    expect(out).toEqual({ decorative: 1, hidden: 2 });
  });
  it("drops zero-value slices and survives malformed shelves", () => {
    expect(cardComposition({ shelves: [{ id: "a" }] }, () => null)).toEqual([]);
    expect(() => cardComposition({ shelves: [null, { id: "b", syntheticCards: "x" }] }, () => null)).not.toThrow();
  });
});
