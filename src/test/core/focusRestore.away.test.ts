// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ state: "active" as string, task: null as any }));
vi.mock("../../runtime/powerGate", () => ({
  getPowerState: () => gate.state,
  homeRouteCovered: () => gate.state === "home-hidden",
  registerPeriodic: (_name: string, task: unknown) => { gate.task = task; return () => {}; },
}));

import { beginFocusRestoreLoop, clearFocusTarget, getPendingFocusTarget, hasPendingFocus, saveFocusTarget, saveFocusTargetFromFocusedCard, startFocusFirstPoll } from "../../core/focusRestore";

function mountCard(root: HTMLElement, appid: number, shelfId: string) {
  const card = document.createElement("div");
  card.className = "ds-card";
  card.setAttribute("data-appid", String(appid));
  card.setAttribute("data-shelfid", shelfId);
  const ctx = { SetActive: vi.fn(), m_rgGamepadNavigationTrees: [] as any[] };
  const tree = { m_ID: "GamepadUI_Full_Root", m_context: ctx, m_Controller: { m_ActiveContext: null }, m_Root: { m_rgChildren: [] } };
  const node = { m_Tree: tree, m_element: card, BTakeFocus: vi.fn(() => true) };
  const hookWithNode = { memoizedState: { current: node }, next: null };
  (card as any)["__reactFiber$test"] = { memoizedState: { memoizedState: { current: card }, next: hookWithNode }, return: null };
  root.appendChild(card);
  return { card, node };
}

describe("focus restore while a game or another page holds the Home", () => {
  let root: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    gate.state = "active";
    root = document.createElement("div");
    root.className = "deck-shelves-root";
    document.body.appendChild(root);
  });
  afterEach(() => {
    clearFocusTarget();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("keeps the card a game was opened from and focuses it on the return", async () => {
    const { node } = mountCard(root, 620, "s2");
    saveFocusTarget(620, "s2");
    beginFocusRestoreLoop();
    gate.state = "home-hidden";
    await vi.advanceTimersByTimeAsync(40_000);
    expect(hasPendingFocus()).toBe(true);
    expect(node.BTakeFocus).not.toHaveBeenCalled();
    gate.state = "active";
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(200);
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
  });

  it("keeps the target while the Home is out of the page, and takes the card once the shelves mount again", async () => {
    saveFocusTarget(620, "s2");
    beginFocusRestoreLoop();
    gate.state = "in-game";
    await vi.advanceTimersByTimeAsync(40_000);
    expect(hasPendingFocus()).toBe(true);
    gate.state = "active";
    const { node } = mountCard(root, 620, "s2");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(200);
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
  });

  it("still drops a target that never lands while the Home is on screen", async () => {
    saveFocusTarget(620, "s2");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(30_100);
    expect(hasPendingFocus()).toBe(false);
  });

  it("on the return, tries the card left for a game even while Steam's row holds the focus", () => {
    const tryFocus = vi.fn(() => false);
    const stop = startFocusFirstPoll(tryFocus, () => true);
    saveFocusTarget(620, "s2");
    gate.task.onResume();
    expect(tryFocus).toHaveBeenCalledTimes(1);
    clearFocusTarget();
    gate.task.onResume();
    expect(tryFocus).toHaveBeenCalledTimes(1);
    stop();
  });

  it("keeps the return hook when the first focus landed at once, as it does on a replaced recents row", async () => {
    const tryFocus = vi.fn(() => true);
    const stop = startFocusFirstPoll(tryFocus, () => true, true);
    gate.task.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(tryFocus).not.toHaveBeenCalled();
    saveFocusTarget(620, "s2");
    gate.task.onResume();
    expect(tryFocus).toHaveBeenCalledTimes(1);
    stop();
  });

  it("leaving from Steam's row drops a target left over from an earlier trip", () => {
    mountCard(root, 620, "s2");
    saveFocusTarget(620, "s2");
    vi.advanceTimersByTime(2000);
    const tile = document.createElement("button");
    document.body.appendChild(tile);
    tile.focus();
    saveFocusTargetFromFocusedCard();
    expect(hasPendingFocus()).toBe(false);
  });

  it("keeps the target a card saved for this very leave", () => {
    mountCard(root, 620, "s2");
    saveFocusTarget(620, "s2");
    const tile = document.createElement("button");
    document.body.appendChild(tile);
    tile.focus();
    saveFocusTargetFromFocusedCard();
    expect(getPendingFocusTarget()).toEqual({ appid: 620, shelfId: "s2" });
  });

  it("an older target gives way to the plugin card holding focus now", () => {
    mountCard(root, 620, "s2");
    saveFocusTarget(620, "s2");
    vi.advanceTimersByTime(2000);
    const { card } = mountCard(root, 730, "s4");
    card.tabIndex = 0;
    card.focus();
    saveFocusTargetFromFocusedCard();
    expect(getPendingFocusTarget()).toEqual({ appid: 730, shelfId: "s4" });
  });
});
