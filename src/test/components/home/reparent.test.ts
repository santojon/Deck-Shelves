// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { reparentNavTreeNodes } from "../../../components/home/navPatches/reparent";

type Node = { m_element: HTMLElement; m_rgChildren: Node[]; m_Parent: Node | null; m_Tree: unknown; GetLayout: () => number };
const tree = { m_ID: "GamepadUI_Full_Root" } as any;
function node(el: HTMLElement, layout = 0, parent: Node | null = null): Node {
  const n: Node = { m_element: el, m_rgChildren: [], m_Parent: parent, m_Tree: tree, GetLayout: () => layout };
  if (parent) parent.m_rgChildren.push(n);
  return n;
}
function fiberNode(el: HTMLElement, n: Node): void {
  (el as any)["__reactFiber$test"] = { memoizedState: { memoizedState: { current: n }, next: null }, return: null };
}

describe("reparentNavTreeNodes on a root the tree walk cannot reach", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

  it("finds the wrapper's node on its fiber and hangs it between the recents and the tabs", () => {
    const scroller = document.createElement("div");
    const recents = document.createElement("div"); const mount = document.createElement("div"); const tabs = document.createElement("div");
    mount.id = "deck-shelves-home-root";
    const wrapper = document.createElement("div"); wrapper.className = "deck-shelves-root"; mount.appendChild(wrapper);
    scroller.append(recents, mount, tabs); document.body.appendChild(scroller);

    const rootNode = node(document.body, 1);
    const scrollerNode = node(scroller, 1, rootNode);
    const recentsNode = node(recents, 0, scrollerNode);
    const tabsNode = node(tabs, 1, scrollerNode);
    // The wrapper's node exists, points at a parent that does not list it.
    const stray = node(document.createElement("div"), 0, rootNode);
    const wrapperNode: Node = { m_element: wrapper, m_rgChildren: [], m_Parent: stray, m_Tree: tree, GetLayout: () => 1 };
    fiberNode(wrapper, wrapperNode);
    tree.m_Root = rootNode;
    vi.stubGlobal("FocusNavController", { m_ActiveContext: { m_rgGamepadNavigationTrees: [tree] } });

    expect(reparentNavTreeNodes(mount)).toBe(1);
    expect(scrollerNode.m_rgChildren).toEqual([recentsNode, wrapperNode, tabsNode]);
    expect(wrapperNode.m_Parent).toBe(scrollerNode);
    // Settled: a second pass changes nothing.
    expect(reparentNavTreeNodes(mount)).toBe(0);
    expect(scrollerNode.m_rgChildren).toEqual([recentsNode, wrapperNode, tabsNode]);
  });
});
