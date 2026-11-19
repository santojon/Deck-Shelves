// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ state: "active" as string }));
vi.mock("../../runtime/powerGate", () => ({
  getPowerState: () => gate.state,
  homeRouteCovered: () => false,
  registerPeriodic: () => () => {},
}));

import { beginColdBootFocusGuard, clearFocusTarget, saveFocusTarget } from "../../core/focusRestore";

function shelfCard(shelfId: string, focused = false) {
  const card = document.createElement("div");
  card.className = focused ? "ds-card gpfocus" : "ds-card";
  card.setAttribute("data-shelfid", shelfId);
  document.body.appendChild(card);
  const ctx = { SetActive: vi.fn(), m_rgGamepadNavigationTrees: [] as any[] };
  const tree = { m_ID: "GamepadUI_Full_Root", m_context: ctx, m_Controller: { m_ActiveContext: null }, m_Root: { m_rgChildren: [] } };
  const node = { m_Tree: tree, m_element: card, BTakeFocus: vi.fn(() => true) };
  const hookWithNode = { memoizedState: { current: node }, next: null };
  (card as any)["__reactFiber$test"] = { memoizedState: { memoizedState: { current: card }, next: hookWithNode }, return: null };
  return { card, node };
}

function nativeRow(holds: boolean, hasCard: boolean) {
  return { holdsFocus: vi.fn(() => holds), focusFirst: vi.fn(() => hasCard) };
}

describe("cold-boot focus guard", () => {
  beforeEach(() => { vi.useFakeTimers(); gate.state = "active"; });
  afterEach(() => { clearFocusTarget(); vi.useRealTimers(); document.body.innerHTML = ""; });

  it("keeps polling while the Home is active", async () => {
    beginColdBootFocusGuard(["s1"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stands down, with no timer left, once a game holds the Home", async () => {
    beginColdBootFocusGuard(["s1"]);
    await vi.advanceTimersByTimeAsync(400);
    gate.state = "in-game";
    await vi.advanceTimersByTimeAsync(400);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a direction press stands the cold-boot guard down", async () => {
    beginColdBootFocusGuard(["s1"]);
    await vi.advanceTimersByTimeAsync(400);
    expect(vi.getTimerCount()).toBe(1);
    document.body.dispatchEvent(new Event("vgp_ondirection", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("claims the first shelf's card when nothing has focus and Steam's row is hidden", async () => {
    const { node } = shelfCard("s1");
    beginColdBootFocusGuard(["s1"]);
    await vi.advanceTimersByTimeAsync(2600);
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
  });

  it("claims Steam's row above the shelves, not the next shelf, when nothing has focus", async () => {
    const { node } = shelfCard("s2");
    const row = nativeRow(false, true);
    beginColdBootFocusGuard(["s2"], row);
    await vi.advanceTimersByTimeAsync(2600);
    expect(row.focusFirst).toHaveBeenCalled();
    expect(node.BTakeFocus).not.toHaveBeenCalled();
  });

  it("leaves focus alone while Steam's row above the shelves holds it", async () => {
    const { node } = shelfCard("s2");
    const row = nativeRow(true, true);
    beginColdBootFocusGuard(["s2"], row);
    await vi.advanceTimersByTimeAsync(3000);
    expect(row.focusFirst).not.toHaveBeenCalled();
    expect(node.BTakeFocus).not.toHaveBeenCalled();
  });

  it("walks focus back from a shelf card to Steam's row above the shelves", async () => {
    shelfCard("s2", true);
    const row = nativeRow(false, true);
    beginColdBootFocusGuard(["s2"], row);
    await vi.advanceTimersByTimeAsync(400);
    expect(row.focusFirst).toHaveBeenCalled();
  });

  it("stops once a target is saved", async () => {
    const { card } = shelfCard("s2");
    card.setAttribute("data-appid", "620");
    const row = nativeRow(false, true);
    beginColdBootFocusGuard(["s2"], row);
    await vi.advanceTimersByTimeAsync(400);
    card.classList.add("gpfocus");
    saveFocusTarget(620, "s2");
    await vi.advanceTimersByTimeAsync(200);
    expect(row.focusFirst).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to the first shelf's card when Steam's row has no card", async () => {
    const { node } = shelfCard("s2");
    const row = nativeRow(false, false);
    beginColdBootFocusGuard(["s2"], row);
    await vi.advanceTimersByTimeAsync(2600);
    expect(row.focusFirst).toHaveBeenCalled();
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
  });
});
