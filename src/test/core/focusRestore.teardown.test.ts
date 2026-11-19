// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../runtime/powerGate", () => ({
  getPowerState: () => "active",
  homeRouteCovered: () => false,
  registerPeriodic: () => () => {},
}));

import { beginColdBootFocusGuard, beginFocusRestoreLoop, clearFocusTarget, hasPendingFocus, saveFocusTarget } from "../../core/focusRestore";
import { disposeAll } from "../../runtime/runtimeDisposer";

function mountCard(appid: number, shelfId: string) {
  const card = document.createElement("div");
  card.className = "ds-card";
  card.setAttribute("data-appid", String(appid));
  card.setAttribute("data-shelfid", shelfId);
  document.querySelector(".deck-shelves-root")!.appendChild(card);
  const ctx = { SetActive: vi.fn(), m_rgGamepadNavigationTrees: [] as any[] };
  const tree = { m_ID: "GamepadUI_Full_Root", m_context: ctx, m_Controller: { m_ActiveContext: null }, m_Root: { m_rgChildren: [] } };
  const node = { m_Tree: tree, m_element: card, BTakeFocus: vi.fn(() => true) };
  const hookWithNode = { memoizedState: { current: node }, next: null };
  (card as any)["__reactFiber$test"] = { memoizedState: { memoizedState: { current: card }, next: hookWithNode }, return: null };
  return { card, node };
}

async function expectNoFurtherTake(node: { BTakeFocus: { mock: { calls: unknown[] } } }): Promise<void> {
  const taken = node.BTakeFocus.mock.calls.length;
  disposeAll();
  await vi.advanceTimersByTimeAsync(31_000);
  expect(node.BTakeFocus.mock.calls.length).toBe(taken);
  expect(vi.getTimerCount()).toBe(0);
}

describe("disposing the plugin issues no further focus take", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    root.className = "deck-shelves-root";
    document.body.appendChild(root);
  });
  afterEach(() => {
    clearFocusTarget();
    disposeAll();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("ends a live restore loop and keeps its target for the next start", async () => {
    const { node } = mountCard(620, "s3");
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(300);
    expect(node.BTakeFocus).toHaveBeenCalled();
    await expectNoFurtherTake(node);
    expect(hasPendingFocus()).toBe(true);
  });

  it("ends the re-takes that follow a landed restore", async () => {
    const { card, node } = mountCard(620, "s3");
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(0);
    card.classList.add("gpfocus");
    await vi.advanceTimersByTimeAsync(0);
    card.classList.remove("gpfocus");
    const landed = node.BTakeFocus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(400);
    expect(node.BTakeFocus.mock.calls.length).toBeGreaterThan(landed);
    await expectNoFurtherTake(node);
  });

  it("stands the cold-boot guard down", async () => {
    const { node } = mountCard(620, "s1");
    beginColdBootFocusGuard(["s1"]);
    await vi.advanceTimersByTimeAsync(2600);
    expect(node.BTakeFocus).toHaveBeenCalled();
    await expectNoFurtherTake(node);
  });
});
