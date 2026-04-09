/**
 * Navigation tree patches for shelf integration with Steam's GamepadUI.
 *
 * - reparentNavTreeNodes: moves our shelf nav nodes into the correct
 *   position in Steam's focus navigation tree.
 * - patchMenuButton: intercepts Options/Menu button to show our
 *   game context menu when a shelf card is focused.
 * - patchShelfEdgeNavigation: prevents D-pad from escaping the
 *   shelf row horizontally and implements scroll throttle.
 */

import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { showGameMenu } from "../../core/steamGameMenu";
import { logInfo } from "../../runtime/logger";

const DIR_LEFT  = 11;
const DIR_RIGHT = 12;
const DS_EDGE_PATCHED   = "__ds_edge_patched__";
const DS_EDGE_LISTENER  = "__ds_edge_listener__";
const patchedMenuControllers = new WeakSet<object>();
const OPTIONS_BUTTON    = 4;

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
  if (!ourNodes.length) return 0;

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

  const nativeSibling = mountEl.previousElementSibling as HTMLElement | null;
  const refEl = nativeSibling || mountEl;
  const deepest = findDeepestContainer(root, refEl);
  if (!deepest) return -1;

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

function interceptMenuBtn(button: number): boolean {
  if (button !== OPTIONS_BUTTON) return false;
  try {
    const doc = getPreferredSteamDocument();
    const focused = (doc?.querySelector(".ds-card.gpfocus") ?? doc?.querySelector(".ds-card:focus")) as HTMLElement | null;
    if (!focused) return false;
    const appid = Number(focused.getAttribute("data-appid") ?? 0);
    if (appid <= 0) return false;
    showGameMenu(appid);
    return true;
  } catch { return false; }
}

export function patchMenuButton(): void {
  const DS_DOC_MENU = "__ds_doc_menu__";
  const doc = getPreferredSteamDocument();

  if (doc && !(doc as any)[DS_DOC_MENU]) {
    (doc as any)[DS_DOC_MENU] = true;
    const handleMenu = (evt: Event) => {
      try {
        const focused = (doc.querySelector(".ds-card.gpfocus") ?? doc.querySelector(".ds-card:focus")) as HTMLElement | null;
        if (focused) {
          const appid = Number(focused.getAttribute("data-appid") ?? 0);
          if (appid > 0) {
            evt.stopImmediatePropagation();
            evt.preventDefault();
            showGameMenu(appid);
          }
        }
      } catch (e) { logInfo("HOME", "handleMenu failed", String(e)); }
    };
    doc.addEventListener("vgp_onmenubutton", handleMenu, true);
    doc.addEventListener("contextmenu", handleMenu, true);
  }

  const ctrl = (globalThis as any).FocusNavController
    ?? (globalThis as any).GamepadNavTree?.m_context?.m_controller;
  if (!ctrl) return;

  if (typeof ctrl.DispatchVirtualButtonClick === "function" && !patchedMenuControllers.has(ctrl)) {
    const orig = ctrl.DispatchVirtualButtonClick.bind(ctrl);
    ctrl.DispatchVirtualButtonClick = (button: number, ...args: any[]) => {
      if (interceptMenuBtn(button)) return;
      return orig(button, ...args);
    };
    patchedMenuControllers.add(ctrl);
    return;
  }

  if (!patchedMenuControllers.has(ctrl)) {
    const proto = Object.getPrototypeOf(ctrl);
    if (proto && !patchedMenuControllers.has(proto) && typeof proto.DispatchVirtualButtonClick === "function") {
      const orig = proto.DispatchVirtualButtonClick;
      proto.DispatchVirtualButtonClick = function(button: number, ...args: any[]) {
        if (interceptMenuBtn(button)) return;
        return orig.apply(this, [button, ...args]);
      };
      patchedMenuControllers.add(proto);
      patchedMenuControllers.add(ctrl);
      return;
    }
  }

  const ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  const controller = ctx?.m_controller;
  if (controller && !patchedMenuControllers.has(controller) && typeof controller.DispatchVirtualButtonClick === "function") {
    const origDispatch = controller.DispatchVirtualButtonClick;
    controller.DispatchVirtualButtonClick = function(button: number, ...args: any[]) {
      if (interceptMenuBtn(button)) return;
      return origDispatch.apply(this, [button, ...args]);
    };
    patchedMenuControllers.add(controller);
  }
}

export function patchShelfEdgeNavigation(mountEl: HTMLElement): void {
  const ctrl = (globalThis as any).FocusNavController
    ?? (globalThis as any).GamepadNavTree?.m_context?.m_controller;
  if (!ctrl) return;

  const context = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  const trees: any[] = context?.m_rgGamepadNavigationTrees ?? [];
  const mainTree = trees.find((t: any) => t.m_ID === "GamepadUI_Full_Root");
  if (!mainTree) return;

  const root = mainTree.Root || mainTree.m_Root || mainTree;
  const proto = Object.getPrototypeOf(root);

  if (proto && !((proto as any)[DS_EDGE_PATCHED]) && typeof proto.BTryInternalNavigation === "function") {
    const orig = proto.BTryInternalNavigation;
    proto.BTryInternalNavigation = function (direction: number, flag: any) {
      if (direction === DIR_LEFT || direction === DIR_RIGHT) {
        const el = this.Element || this.m_element || this.m_Element;
        if (el && typeof el.className === "string" && el.className.includes("ds-row-scroll")) {
          const throttled: Set<HTMLElement> = (globalThis as any).__ds_scroll_throttle_rows;
          if (throttled?.has(el)) return true;
        }
      }
      const result = orig.call(this, direction, flag);
      if (!result && (direction === DIR_LEFT || direction === DIR_RIGHT)) {
        const el = this.Element || this.m_element || this.m_Element;
        if (el && typeof el.className === "string" && el.className.includes("ds-row-scroll")) {
          return true;
        }
      }
      return result;
    };
    (proto as any)[DS_EDGE_PATCHED] = true;
  }

  const wrapperEl = mountEl.querySelector(".deck-shelves-root") as HTMLElement | null;
  if (wrapperEl && !(wrapperEl as any)[DS_EDGE_LISTENER]) {
    (wrapperEl as any)[DS_EDGE_LISTENER] = true;
    wrapperEl.addEventListener("vgp_ondirection", (evt: Event) => {
      const btn = (evt as CustomEvent<any>).detail?.button;
      if (btn === DIR_LEFT || btn === DIR_RIGHT) {
        evt.stopPropagation();
      }
    });
  }
}
