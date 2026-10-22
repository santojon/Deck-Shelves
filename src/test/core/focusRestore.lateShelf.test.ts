// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveFocusTarget, beginFocusRestoreLoop, clearFocusTarget, hasPendingFocus } from "../../core/focusRestore";

/* The restore target: a card on a lower shelf that mounts its row (and the
   card inside it) only after the Home rebuilt, like a virtualized shelf on a
   slow return from a game page. */
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

// Mutation observers deliver on a microtask; the fake clock does not block that.
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
    // The retake window is over: no more ticks.
    await vi.advanceTimersByTimeAsync(1000);
    expect(node.BTakeFocus.mock.calls.length).toBe(taken);
    // A new window on the same loop: one tick at once, then every 120 ms — not two loops' worth.
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
    // The re-issue window runs again for the late card.
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
});
