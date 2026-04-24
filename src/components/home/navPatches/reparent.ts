import { logInfo } from "../../../runtime/logger";

/**
 * Moves the shelf's nav-tree nodes into the correct position inside
 * Steam's focus navigation tree. The React portal registers our
 * `Focusable` at the wrong tree depth (no home context), so D-pad
 * traversal would otherwise skip our shelves or snap to the tabs.
 *
 * Stability guard: once our nodes are parented under the chosen target,
 * the function short-circuits — no churn in steady state.
 */
export function reparentNavTreeNodes(mountEl: HTMLElement): number {
  const ctrl = (globalThis as any).FocusNavController
    ?? (globalThis as any).GamepadNavTree?.m_context?.m_controller;
  if (!ctrl) return -1;

  const context = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  const trees: any[] = context?.m_rgGamepadNavigationTrees ?? [];
  const mainTree = trees.find((t: any) => t.m_ID === "GamepadUI_Full_Root");
  if (!mainTree) return -1;

  const root = mainTree.Root || mainTree.m_Root || mainTree;

  const ourNodes: any[] = [];
  (function findWrapper(node: any) {
    const el = node.Element || node.m_element || node.m_Element;
    if (el && typeof el.className === "string" && el.className.includes("deck-shelves-root")) {
      ourNodes.push(node);
      return;
    }
    for (const child of (node.m_rgChildren || [])) findWrapper(child);
  })(root);
  if (!ourNodes.length) {
    const domPresent = !!mountEl.querySelector(".deck-shelves-root");
    if (domPresent) logInfo("HOME", "reparentNavTreeNodes: DS nav node absent from tree while DOM present — focus loss imminent");
    return 0;
  }

  // Do not perturb the tree while focus is inside our subtree — that
  // can orphan the currently-focused node if splicing happens mid-navigation.
  const activeEl = ctrl.m_ActiveContext?.ActiveElementNavNode?.m_element
    ?? context?.ActiveElementNavNode?.m_element;
  if (activeEl && ourNodes.some((n) => {
    const el = n.Element || n.m_element || n.m_Element;
    return el?.contains?.(activeEl);
  })) return 0;

  function findDeepestContainer(node: any, refEl: HTMLElement): any | null {
    for (const child of (node.m_rgChildren || [])) {
      const childEl = child.Element || child.m_element || child.m_Element;
      if (childEl && childEl.contains(refEl)) {
        return findDeepestContainer(child, refEl) || child;
      }
    }
    const el = node.Element || node.m_element || node.m_Element;
    if (el && el.contains(refEl)) return node;
    return null;
  }

  // Preferred target: the nav node whose Element === mountEl.parentElement.
  // That's the home Panel that in DOM already contains [recents, mount, tabs]
  // — placing our nav node inside it gets D-pad traversal
  // recents → shelves → tabs (matching DOM order) instead of forcing users
  // to walk past the tabs before reaching shelves.
  function findNodeByElement(start: any, targetEl: HTMLElement): any | null {
    let found: any = null;
    (function walk(n: any) {
      if (found) return;
      const e = n.Element || n.m_element || n.m_Element;
      if (e === targetEl) { found = n; return; }
      for (const c of (n.m_rgChildren || [])) walk(c);
    })(start);
    return found;
  }

  let target: any = null;
  const domParent = mountEl.parentElement;
  if (domParent) {
    const domParentNode = findNodeByElement(root, domParent);
    if (domParentNode && domParentNode.GetLayout?.() === 1) {
      target = domParentNode;
    }
  }

  if (!target) {
    const nativeSibling = mountEl.previousElementSibling as HTMLElement | null;
    const refEl = nativeSibling || mountEl;
    const deepest = findDeepestContainer(root, refEl);
    if (!deepest) return -1;
    target = deepest;
    let cursor: any = deepest.m_Parent;
    while (cursor) {
      try {
        const layout = cursor.GetLayout?.();
        const cc = (cursor.m_rgChildren || []).length;
        if (layout === 1 && cc >= 2) {
          target = cursor;
          break;
        }
      } catch (e) { logInfo("HOME", "reparentNavTreeNodes: layout read failed", String(e)); }
      cursor = cursor.m_Parent;
    }
  }

  // Stability guard: once ourNodes are under the chosen target, no churn.
  if (target && ourNodes.every((n) => n.m_Parent === target)) {
    return 0;
  }

  let moved = 0;
  for (const ourNode of ourNodes) {
    const mParent = ourNode.m_Parent;
    if (mParent === target) continue;

    const parentChildren: any[] = mParent?.m_rgChildren;
    if (!parentChildren) continue;
    const idx = parentChildren.indexOf(ourNode);
    if (idx < 0) continue;
    parentChildren.splice(idx, 1);

    const targetChildren: any[] = target.m_rgChildren || [];
    const ourEl = ourNode.Element || ourNode.m_element || ourNode.m_Element;
    let insertIdx = targetChildren.length;
    if (ourEl) {
      for (let i = 0; i < targetChildren.length; i++) {
        const childEl = targetChildren[i].Element || targetChildren[i].m_element || targetChildren[i].m_Element;
        if (childEl && ourEl.compareDocumentPosition(childEl) & Node.DOCUMENT_POSITION_FOLLOWING) {
          insertIdx = i;
          break;
        }
      }
    }
    targetChildren.splice(insertIdx, 0, ourNode);
    if ("m_Parent" in ourNode) ourNode.m_Parent = target;
    moved++;
  }

  return moved;
}
