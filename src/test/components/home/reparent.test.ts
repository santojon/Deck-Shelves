// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { reparentNavTreeNodes, releaseDetachedNavNodes } from "../../../components/home/navPatches/reparent";

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

describe("releaseDetachedNavNodes when the Home leaves the document", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  function setup(focusInside: boolean) {
    const mount = document.createElement("div");
    const wrapper = document.createElement("div"); wrapper.className = "deck-shelves-root"; mount.appendChild(wrapper);
    const card = document.createElement("div"); wrapper.appendChild(card);
    const shell = document.createElement("div"); document.body.appendChild(shell); shell.appendChild(mount);
    const focused = focusInside ? card : shell;
    const navTree = { GetLastFocusedNode: () => ({ m_element: focused }), TransferFocus: vi.fn() };
    const parent: any = { m_element: shell, m_rgChildren: [] as any[] };
    parent.RemoveChild = vi.fn((n: any) => parent.m_rgChildren.splice(parent.m_rgChildren.indexOf(n), 1));
    const wrapperNode: any = { m_element: wrapper, m_rgChildren: [], m_Parent: parent, m_Tree: navTree };
    parent.m_rgChildren.push(wrapperNode);
    fiberNode(wrapper, wrapperNode);
    return { mount, navTree, parent, wrapperNode };
  }

  it("does nothing while the Home is on screen", () => {
    const { mount, parent, wrapperNode, navTree } = setup(true);
    expect(releaseDetachedNavNodes(mount)).toBe(-1);
    expect(parent.m_rgChildren).toEqual([wrapperNode]);
    expect(navTree.TransferFocus).not.toHaveBeenCalled();
  });

  it("releases the focus held inside the shelves, then takes them out as Steam's unmount does", () => {
    const { mount, parent, navTree } = setup(true);
    mount.remove();
    expect(releaseDetachedNavNodes(mount)).toBe(1);
    expect(navTree.TransferFocus).toHaveBeenCalledWith(2, null);
    expect(parent.RemoveChild).toHaveBeenCalledTimes(1);
    expect(parent.m_rgChildren).toEqual([]);
    // Already out: nothing more to do.
    expect(releaseDetachedNavNodes(mount)).toBe(0);
  });

  it("leaves Steam's focus alone when it is elsewhere", () => {
    const { mount, parent, navTree } = setup(false);
    mount.remove();
    expect(releaseDetachedNavNodes(mount)).toBe(1);
    expect(navTree.TransferFocus).not.toHaveBeenCalled();
    expect(parent.m_rgChildren).toEqual([]);
  });
});
