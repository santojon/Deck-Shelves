// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { focusElement } from "../../core/focusRestore";

/* Builds a DS card element whose React fiber carries Steam's nav node the way
   a mounted Focusable does: a ref hook whose `current` has `m_Tree`. */
function cardWithNavNode(opts: { activeCtx: any; homeInActive?: boolean }) {
  const card = document.createElement("div");
  card.className = "ds-card";
  document.body.appendChild(card);
  const ctx = { SetActive: vi.fn(), m_rgGamepadNavigationTrees: [] as any[] };
  const ctrl = { m_ActiveContext: opts.activeCtx };
  const tree = { m_ID: "GamepadUI_Full_Root", m_context: ctx, m_Controller: ctrl, m_Root: { m_rgChildren: [] } };
  const node = { m_Tree: tree, m_element: card, BTakeFocus: vi.fn(() => true) };
  const hookWithNode = { memoizedState: { current: node }, next: null };
  const hookRef = { memoizedState: { current: card }, next: hookWithNode };
  (card as any)["__reactFiber$test"] = { memoizedState: hookRef, return: null };
  return { card, ctx, ctrl, node };
}

function contextWithHome(): any {
  const root = document.createElement("div");
  root.className = "deck-shelves-root";
  return { m_rgGamepadNavigationTrees: [{ m_Root: { m_element: root, m_rgChildren: [] } }] };
}

describe("focusRestore — nav node from the element's own fiber", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("takes focus through the fiber node and activates its context when none is active", () => {
    const { card, ctx, node } = cardWithNavNode({ activeCtx: null });
    expect(focusElement(card)).toBe(true);
    expect(ctx.SetActive).toHaveBeenCalledWith(true);
    expect(node.BTakeFocus).toHaveBeenCalledWith(2);
  });

  it("activates its context when the active one is a copy that cannot reach the Home", () => {
    const copy = { m_rgGamepadNavigationTrees: [{ m_Root: { m_element: document.createElement("div"), m_rgChildren: [] } }] };
    const { card, ctx } = cardWithNavNode({ activeCtx: copy });
    focusElement(card);
    expect(ctx.SetActive).toHaveBeenCalledWith(true);
  });

  it("leaves a live context alone when it already reaches the Home (QAM / modal owns input)", () => {
    const { card, ctx, node } = cardWithNavNode({ activeCtx: contextWithHome() });
    focusElement(card);
    expect(ctx.SetActive).not.toHaveBeenCalled();
    expect(node.BTakeFocus).toHaveBeenCalled();
  });

  it("releases a native text field holding DOM focus before taking focus", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    const { card } = cardWithNavNode({ activeCtx: null });
    focusElement(card);
    expect(document.activeElement).not.toBe(input);
  });
});
