// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  subscribeFocusedCard,
  getFocusedCard,
  __resetFocusedCardTrackerForTest,
} from "../../runtime/focusedCardTracker";
import * as focusRestore from "../../core/focusRestore";

function cardEl(): HTMLElement {
  const card = document.createElement("div");
  card.className = "ds-card";
  const child = document.createElement("span");
  card.appendChild(child);
  document.body.appendChild(card);
  return child; // the "focused" element is a descendant, like a real card's inner focus target
}

describe("focusedCardTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetFocusedCardTrackerForTest();
  });

  afterEach(() => {
    __resetFocusedCardTrackerForTest();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("starts the shared poll on first subscriber and notifies on a focus change", () => {
    const focusTarget = cardEl();
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(focusTarget);
    const seen: (HTMLElement | null)[] = [];
    subscribeFocusedCard((card) => seen.push(card));
    vi.advanceTimersByTime(150);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.classList.contains("ds-card")).toBe(true);
  });

  it("does not notify again while focus stays on the same card", () => {
    const focusTarget = cardEl();
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(focusTarget);
    const seen: (HTMLElement | null)[] = [];
    subscribeFocusedCard((card) => seen.push(card));
    vi.advanceTimersByTime(150 * 5);
    expect(seen).toHaveLength(1);
  });

  it("stops the poll once the last subscriber unsubscribes", () => {
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(null);
    const unsub = subscribeFocusedCard(() => {});
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unsub();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the poll alive while at least one subscriber remains", () => {
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(null);
    const unsubA = subscribeFocusedCard(() => {});
    subscribeFocusedCard(() => {});
    unsubA();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it("getFocusedCard() reflects the last resolved card between ticks", () => {
    const focusTarget = cardEl();
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(focusTarget);
    subscribeFocusedCard(() => {});
    vi.advanceTimersByTime(150);
    expect(getFocusedCard()).not.toBeNull();
  });

  it("resolves null when focus is outside any .ds-card", () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(outside);
    const seen: (HTMLElement | null)[] = [];
    subscribeFocusedCard((card) => seen.push(card));
    vi.advanceTimersByTime(150);
    expect(seen).toEqual([]);
    expect(getFocusedCard()).toBeNull();
  });

  it("isolates a throwing listener — other listeners still get notified", () => {
    const focusTarget = cardEl();
    vi.spyOn(focusRestore, "getLastFocusedElement").mockReturnValue(focusTarget);
    const seen: (HTMLElement | null)[] = [];
    subscribeFocusedCard(() => { throw new Error("boom"); });
    subscribeFocusedCard((card) => seen.push(card));
    expect(() => vi.advanceTimersByTime(150)).not.toThrow();
    expect(seen).toHaveLength(1);
  });
});
