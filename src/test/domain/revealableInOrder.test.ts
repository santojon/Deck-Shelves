import { describe, it, expect } from "vitest";
import { revealableInOrder } from "../../domain/shelfOrder";

describe("revealableInOrder — progressive reveal in final order", () => {
  it("returns the leading run of rendered shelves and stops at the first gap", () => {
    expect(revealableInOrder(["a", "b", "c", "d"], new Set(["a", "b", "d"]))).toEqual(["a", "b"]);
  });

  it("reveals nothing while the first shelf in order has not rendered, even if later ones have", () => {
    expect(revealableInOrder(["a", "b", "c"], new Set(["b", "c"]))).toEqual([]);
  });

  it("reveals everything once every shelf in order has rendered", () => {
    expect(revealableInOrder(["a", "b"], new Set(["b", "a"]))).toEqual(["a", "b"]);
  });

  it("skips a shelf that resolved to nothing instead of waiting on it", () => {
    expect(revealableInOrder(["a", "b", "c"], new Set(["a", "c"]), new Set(["a", "b", "c"]))).toEqual(["a", "c"]);
  });

  it("still waits on an unrendered shelf that has not resolved yet", () => {
    expect(revealableInOrder(["a", "b", "c"], new Set(["a", "c"]), new Set(["a", "c"]))).toEqual(["a"]);
  });

  it("handles an empty order", () => {
    expect(revealableInOrder([], new Set(["a"]))).toEqual([]);
  });
});
