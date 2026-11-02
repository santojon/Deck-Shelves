import { logInfo } from "../../../runtime/logger";
import { navNodeFromFiber } from "../../../core/focusRestore";
import { findMainNavRoot, navNodeElement, resolveFocusNavController } from "./focusNav";

// Every nav node whose element is one of our `.deck-shelves-root` wrappers.
function findOurNavNodes(root: any): any[] {
  const ourNodes: any[] = [];
  (function findWrapper(node: any) {
    const el = navNodeElement(node);
    if (el && typeof el.className === "string" && el.className.includes("deck-shelves-root")) {
      ourNodes.push(node);
      return;
    }
    for (const child of (node.m_rgChildren || [])) findWrapper(child);
  })(root);
  return ourNodes;
}

/* The standalone host mounts our root outside Steam's React tree: the
   Focusable still makes its node, but the node hangs off a parent that does
   not list it, so a walk from the root never meets it (D-pad traversal then
   skips every shelf). The node is still on the wrapper element's fiber. */
function findOurNavNodesByFiber(mountEl: HTMLElement): any[] {
  const out: any[] = [];
  for (const el of Array.from(mountEl.querySelectorAll<HTMLElement>(".deck-shelves-root"))) {
    const node = navNodeFromFiber(el);
    if (node && !out.includes(node)) out.push(node);
  }
  return out;
}

// Our wrapper nodes: the ones the tree walk reaches, else the ones on the fibers.
function locateOurNavNodes(root: any, mountEl: HTMLElement): any[] {
  const walked = findOurNavNodes(root);
  return walked.length ? walked : findOurNavNodesByFiber(mountEl);
}

/* -2: our DOM is on screen but Steam's live tree has no node for it (the
   tree was rebuilt under us) — the caller can re-mount to re-register. */
function missingNodesResult(mountEl: HTMLElement): number {
  const domPresent = !!mountEl.querySelector(".deck-shelves-root");
  if (domPresent) logInfo("HOME", "reparentNavTreeNodes: DS nav node absent from tree while DOM present — focus loss imminent");
  return domPresent ? -2 : 0;
}

/* Do not perturb the tree while focus is inside our subtree — that can
   orphan the currently-focused node if splicing happens mid-navigation. */
function focusIsInsideOurNodes(ctrl: any, context: any, ourNodes: any[]): boolean {
  const activeEl = ctrl.m_ActiveContext?.ActiveElementNavNode?.m_element
    ?? context?.ActiveElementNavNode?.m_element;
  return !!activeEl && ourNodes.some((n) => navNodeElement(n)?.contains?.(activeEl));
}

function findDeepestContainer(node: any, refEl: HTMLElement): any | null {
  for (const child of (node.m_rgChildren || [])) {
    const childEl = navNodeElement(child);
    if (childEl && childEl.contains(refEl)) {
      return findDeepestContainer(child, refEl) || child;
    }
  }
  const el = navNodeElement(node);
  if (el && el.contains(refEl)) return node;
  return null;
}

function findNodeByElement(start: any, targetEl: HTMLElement): any | null {
  let found: any = null;
  (function walk(n: any) {
    if (found) return;
    const e = navNodeElement(n);
    if (e === targetEl) { found = n; return; }
    for (const c of (n.m_rgChildren || [])) walk(c);
  })(start);
  return found;
}

// The nearest ancestor that is a vertical layout holding at least two children.
function climbToLayoutContainer(deepest: any): any {
  let target = deepest;
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
  return target;
}

/* Preferred target: the nav node whose Element === mountEl.parentElement.
   That's the home Panel that in DOM already contains [recents, mount, tabs]
   — placing our nav node inside it gets D-pad traversal
   recents → shelves → tabs (matching DOM order) instead of forcing users
   to walk past the tabs before reaching shelves. */
function chooseTargetNode(root: any, mountEl: HTMLElement): any | null {
  const domParent = mountEl.parentElement;
  if (domParent) {
    const domParentNode = findNodeByElement(root, domParent);
    if (domParentNode && domParentNode.GetLayout?.() === 1) return domParentNode;
  }
  const refEl = (mountEl.previousElementSibling as HTMLElement | null) || mountEl;
  const deepest = findDeepestContainer(root, refEl);
  return deepest ? climbToLayoutContainer(deepest) : null;
}

// Keep DOM order: insert before the first sibling that follows our element.
function insertionIndexFor(ourEl: HTMLElement | null, targetChildren: any[]): number {
  if (!ourEl) return targetChildren.length;
  for (let i = 0; i < targetChildren.length; i++) {
    const childEl = navNodeElement(targetChildren[i]);
    if (childEl && ourEl.compareDocumentPosition(childEl) & Node.DOCUMENT_POSITION_FOLLOWING) return i;
  }
  return targetChildren.length;
}

function listedUnder(node: any, parent: any): boolean {
  return !!parent && (parent.m_rgChildren || []).includes(node);
}

function moveNodeUnder(ourNode: any, target: any): boolean {
  const mParent = ourNode.m_Parent;
  if (mParent === target && listedUnder(ourNode, target)) return false;
  // Detach from the old parent when it lists us; a node its parent does not
  // list (the standalone host's root) is simply attached below.
  const parentChildren: any[] | undefined = mParent?.m_rgChildren;
  const idx = parentChildren ? parentChildren.indexOf(ourNode) : -1;
  if (idx >= 0) parentChildren!.splice(idx, 1);

  const targetChildren: any[] = target.m_rgChildren || (target.m_rgChildren = []);
  targetChildren.splice(insertionIndexFor(navNodeElement(ourNode), targetChildren), 0, ourNode);
  ourNode.m_Parent = target;
  return true;
}

// Steam's focus source for a change the app makes itself (its own unmount uses it).
const FOCUS_SOURCE_APPLICATION = 2;

function releaseNode(node: any): boolean {
  const parent = node.m_Parent;
  if (!listedUnder(node, parent)) return false;
  const tree = node.Tree ?? node.m_Tree;
  const focused = navNodeElement(tree?.GetLastFocusedNode?.());
  if (focused && navNodeElement(node)?.contains(focused)) tree.TransferFocus?.(FOCUS_SOURCE_APPLICATION, null);
  if (typeof parent.RemoveChild === "function") parent.RemoveChild(node);
  else parent.m_rgChildren.splice(parent.m_rgChildren.indexOf(node), 1);
  return true;
}

/* The Home left the document (a game launched from it) while our React tree lives on, so our
   nodes would stay in Steam's tree: Steam then focuses a card no one sees and sends it the Steam
   and QAM buttons, which never reach Steam. Take them out as Steam's own unmount does (focus
   released first); reparentNavTreeNodes puts them back on the return. -1 while still attached. */
export function releaseDetachedNavNodes(mountEl: HTMLElement): number {
  if (mountEl.isConnected) return -1;
  let released = 0;
  for (const node of findOurNavNodesByFiber(mountEl)) if (releaseNode(node)) released++;
  if (released) logInfo("HOME", "Home left the document: shelves taken out of the nav tree", { released });
  return released;
}

export function reparentNavTreeNodes(mountEl: HTMLElement): number {
  const ctrl = resolveFocusNavController();
  if (!ctrl) return -1;

  const context = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  const root = findMainNavRoot(context);
  if (!root) return -1;

  const ourNodes = locateOurNavNodes(root, mountEl);
  if (!ourNodes.length) return missingNodesResult(mountEl);
  if (focusIsInsideOurNodes(ctrl, context, ourNodes)) return 0;

  const target = chooseTargetNode(root, mountEl);
  if (!target) return -1;

  // Stability guard: once ourNodes are under the chosen target, no churn.
  if (ourNodes.every((n) => n.m_Parent === target && listedUnder(n, target))) return 0;

  let moved = 0;
  for (const ourNode of ourNodes) {
    if (moveNodeUnder(ourNode, target)) moved++;
  }
  return moved;
}
