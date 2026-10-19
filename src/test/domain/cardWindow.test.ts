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

  it("keeps the on-screen cards mounted after several highlighted (wide) cards", () => {
    const slotW = 146, wideSlotW = 430 + 12, overscan = 9;
    const isWide = (i: number) => i < 6;
    // Scrolled to the 6th highlighted card (index 5); a flat slot width unmounts it.
    const scrollLeft = 5 * wideSlotW;
    const flat = computeCardWindow({ scrollLeft, viewportW: 1280, slotW, count: 40, overscan });
    expect(flat.start).toBeGreaterThan(5);
    const w = computeCardWindow({ scrollLeft, viewportW: 1280, slotW, count: 40, overscan, wideSlotW, isWide });
    expect(w.start).toBe(0);
    expect(w.end).toBeGreaterThanOrEqual(10 + overscan);
  });

  it("walks to the right index past the wide cards and handles a short row", () => {
    const slotW = 146, wideSlotW = 442;
    const isWide = (i: number) => i < 6;
    const past = 6 * wideSlotW + 20 * slotW;
    const w = computeCardWindow({ scrollLeft: past, viewportW: 1280, slotW, count: 60, overscan: 9, wideSlotW, isWide });
    expect(w.start).toBe(26 - 9);
    expect(w.end).toBe(26 + 10 + 9);
    expect(computeCardWindow({ scrollLeft: 0, viewportW: 1280, slotW, count: 3, overscan: 9, wideSlotW, isWide }))
      .toEqual({ start: 0, end: 3 });
  });

  it("sameWindow compares bounds only", () => {
    expect(sameWindow({ start: 1, end: 5 }, { start: 1, end: 5 })).toBe(true);
    expect(sameWindow({ start: 1, end: 5 }, { start: 1, end: 6 })).toBe(false);
    expect(sameWindow(null, { start: 0, end: 0 })).toBe(false);
  });
});
