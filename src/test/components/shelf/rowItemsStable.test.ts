import { describe, it, expect } from "vitest";
import { stabilizeRowItems } from "../../../components/shelf/rowItemsStable";
import type { DeckRowItem } from "../../../components/shelf/types";

function item(id: number, extra: Partial<DeckRowItem> = {}): DeckRowItem {
  return { id, appid: id, name: `Game ${id}`, isInstalled: true, onActivate: () => {}, onMenuButton: () => {}, ...extra };
}

describe("stabilizeRowItems — identity survives a rebuild with equal data", () => {
  it("returns the previous array when every item is data-equal in the same order", () => {
    const prev = [item(1), item(2), item(3)];
    const next = [item(1), item(2), item(3)];
    const out = stabilizeRowItems(prev, next);
    expect(out).toBe(prev);
  });

  it("reuses unchanged objects and keeps changed ones fresh", () => {
    const prev = [item(1), item(2)];
    const next = [item(1), item(2, { isInstalled: false })];
    const out = stabilizeRowItems(prev, next);
    expect(out).not.toBe(prev);
    expect(out[0]).toBe(prev[0]);
    expect(out[1]).not.toBe(prev[1]);
    expect(out[1].isInstalled).toBe(false);
  });

  it("ignores closures but compares nested data", () => {
    const prev = [item(5, { synthetic: { size: "featured" } } as any)];
    const sameData = [item(5, { synthetic: { size: "featured" } } as any)];
    expect(stabilizeRowItems(prev, sameData)).toBe(prev);
    const nested = [item(5, { synthetic: { size: "normal" } } as any)];
    expect(stabilizeRowItems(prev, nested)[0]).not.toBe(prev[0]);
  });

  it("a reorder or a length change yields a new array but still reuses equal objects", () => {
    const prev = [item(1), item(2), item(3)];
    const out = stabilizeRowItems(prev, [item(3), item(1)]);
    expect(out).not.toBe(prev);
    expect(out[0]).toBe(prev[2]);
    expect(out[1]).toBe(prev[0]);
  });

  it("keeps the previous empty array for an empty rebuild", () => {
    const prev: DeckRowItem[] = [];
    expect(stabilizeRowItems(prev, [])).toBe(prev);
    expect(stabilizeRowItems([item(1)], []).length).toBe(0);
  });
});
