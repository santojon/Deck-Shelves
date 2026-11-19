// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveFocusTarget, beginFocusRestoreLoop, clearFocusTarget, hasPendingFocus, getPendingFocusTarget } from "../../core/focusRestore";

function cardWithNavNode(appid: number, shelfId: string) {
  const card = document.createElement("div");
  card.className = "ds-card";
  card.setAttribute("data-appid", String(appid));
  card.setAttribute("data-shelfid", shelfId);
  const ctx = { SetActive: vi.fn(), m_rgGamepadNavigationTrees: [] as any[] };
  const tree = { m_ID: "GamepadUI_Full_Root", m_context: ctx, m_Controller: { m_ActiveContext: null }, m_Root: { m_rgChildren: [] } };
  const node = { m_Tree: tree, m_element: card, BTakeFocus: vi.fn(() => true) };
  const hookWithNode = { memoizedState: { current: node }, next: null };
  (card as any)["__reactFiber$test"] = { memoizedState: { memoizedState: { current: card }, next: hookWithNode }, return: null };
  return { card, node };
}

function mountRow(root: HTMLElement, appid: number, shelfId: string) {
  const row = document.createElement("div");
  row.className = "ds-shelf";
  row.setAttribute("data-shelfid", shelfId);
  const made = cardWithNavNode(appid, shelfId);
  row.appendChild(made.card);
  root.appendChild(row);
  return made;
}

async function flushObservers(): Promise<void> { await vi.advanceTimersByTimeAsync(0); }

describe("focus restore survives a shelf that mounts its cards late", () => {
  let root: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement("div");
    root.className = "deck-shelves-root";
    document.body.appendChild(root);
  });
  afterEach(() => {
    clearFocusTarget();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("a second call for the same target re-arms the live loop instead of starting another", async () => {
    const { node } = mountRow(root, 620, "s3");
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(4000);
    const taken = node.BTakeFocus.mock.calls.length;
    expect(taken).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(node.BTakeFocus.mock.calls.length).toBe(taken);
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(10);
    expect(node.BTakeFocus.mock.calls.length).toBe(taken + 1);
    await vi.advanceTimersByTimeAsync(240);
    expect(node.BTakeFocus.mock.calls.length).toBe(taken + 3);
    expect(hasPendingFocus()).toBe(true);
  });

  it("retakes a card that lands 2 s after the loop started", async () => {
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(2000);
    const { node } = mountRow(root, 620, "s3");
    await flushObservers();
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
  });

  it("keeps the target past the 6 s drop while its card is not on the page, and retakes it when the row mounts", async () => {
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(8000);
    expect(hasPendingFocus()).toBe(true);
    const { node } = mountRow(root, 620, "s3");
    await flushObservers();
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(node.BTakeFocus.mock.calls.length).toBeGreaterThan(1);
  });

  it("a card that is on the page but never confirmed is still dropped at 6 s", async () => {
    mountRow(root, 620, "s3");
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(6100);
    expect(hasPendingFocus()).toBe(false);
  });

  it("a direction press after a restore landed stops the re-takes", async () => {
    const { card, node } = mountRow(root, 620, "s3");
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await flushObservers();
    card.classList.add("gpfocus");
    await flushObservers();
    card.classList.remove("gpfocus");
    const landed = node.BTakeFocus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(400);
    const reTaken = node.BTakeFocus.mock.calls.length;
    expect(reTaken).toBeGreaterThan(landed);
    card.dispatchEvent(new Event("vgp_ondirection", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(node.BTakeFocus.mock.calls.length).toBe(reTaken);
  });

  it("gives up for good once the late window runs out", async () => {
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(30_100);
    expect(hasPendingFocus()).toBe(false);
    const { node } = mountRow(root, 620, "s3");
    await flushObservers();
    await vi.advanceTimersByTimeAsync(1000);
    expect(node.BTakeFocus).not.toHaveBeenCalled();
  });

  it("the final drop of an older loop leaves a newer target alone", async () => {
    mountRow(root, 620, "s3");
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(1000);
    saveFocusTarget(730, "s1");
    await vi.advanceTimersByTimeAsync(5500);
    expect(getPendingFocusTarget()).toEqual({ appid: 730, shelfId: "s1" });
  });

  it("a target saved again after a direction press gets a full window of its own", async () => {
    root.id = "deck-shelves-home-root";
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(2000);
    root.dispatchEvent(new Event("vgp_ondirection", { bubbles: true }));
    expect(hasPendingFocus()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    saveFocusTarget(620, "s3");
    beginFocusRestoreLoop();
    await vi.advanceTimersByTimeAsync(28_000);
    expect(hasPendingFocus()).toBe(true);
  });
});
