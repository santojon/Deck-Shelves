import { describe, it, expect } from "vitest";
import { computeCardWindow, sameWindow } from "../../domain/cardWindow";

describe("computeCardWindow — visible span plus overscan", () => {
  it("starts at the row head with the visible cards plus overscan", () => {
    expect(computeCardWindow({ scrollLeft: 0, viewportW: 1280, slotW: 146, count: 50, overscan: 6 }))
      .toEqual({ start: 0, end: 16 });
  });

  it("follows the scroll offset and keeps overscan on both sides", () => {
    const w = computeCardWindow({ scrollLeft: 146 * 20, viewportW: 1280, slotW: 146, count: 50, overscan: 6 });
    expect(w).toEqual({ start: 14, end: 36 });
  });

  it("clamps to the row bounds and mounts everything for short rows", () => {
    expect(computeCardWindow({ scrollLeft: 5000, viewportW: 800, slotW: 146, count: 10, overscan: 6 }))
      .toEqual({ start: 3, end: 10 });
    expect(computeCardWindow({ scrollLeft: 0, viewportW: 800, slotW: 146, count: 8, overscan: 6 }))
      .toEqual({ start: 0, end: 8 });
    expect(computeCardWindow({ scrollLeft: 0, viewportW: 800, slotW: 146, count: 0, overscan: 6 }))
      .toEqual({ start: 0, end: 0 });
  });

  it("widens to include an anchor index with its own overscan", () => {
    const w = computeCardWindow({ scrollLeft: 0, viewportW: 800, slotW: 146, count: 60, overscan: 4, anchor: 40 });
    expect(w.start).toBe(0);
    expect(w.end).toBe(45);
    const back = computeCardWindow({ scrollLeft: 146 * 50, viewportW: 800, slotW: 146, count: 60, overscan: 4, anchor: 2 });
    expect(back.start).toBe(0);
    expect(back.end).toBe(60);
  });

  it("ignores an out-of-range anchor and survives a zero slot width", () => {
    expect(computeCardWindow({ scrollLeft: 0, viewportW: 800, slotW: 0, count: 5, overscan: 2, anchor: 99 }))
      .toEqual({ start: 0, end: 5 });
  });

  it("sameWindow compares bounds only", () => {
    expect(sameWindow({ start: 1, end: 5 }, { start: 1, end: 5 })).toBe(true);
    expect(sameWindow({ start: 1, end: 5 }, { start: 1, end: 6 })).toBe(false);
    expect(sameWindow(null, { start: 0, end: 0 })).toBe(false);
  });
});
