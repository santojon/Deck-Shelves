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
import { focusElement } from "../../core/focusRestore";

const DIR_DOWN  = 10;
const DIR_UP    = 9;
const DIR_LEFT  = 11;
const DIR_RIGHT = 12;
const DS_EDGE_PATCHED   = "__ds_edge_patched__";
const DS_EDGE_LISTENER  = "__ds_edge_listener__";
const patchedMenuControllers = new WeakSet<object>();
const OPTIONS_BUTTON    = 4;

let lastReparentTarget: any = null;

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
    lastReparentTarget = target;
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

  lastReparentTarget = target;
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

/**
 * D-pad DOWN bridge: when focus is in a sibling of our mount (native top
 * section: recents/friends/novidades) and Steam's native nav doesn't move
 * focus into our shelves on DOWN, take focus on our first card. This runs
 * as a post-nav fallback (rAF after the event) so legitimate native moves
 * still win. Mirrors upward bridge on UP when focus is in the first shelf.
 *
 * We never manipulate the nav tree — purely event-level focus redirection.
 */
const DS_BRIDGE_ATTACHED = "__ds_bridge_attached__";

export function installVerticalFocusBridge(mountEl: HTMLElement): void {
  const doc = getPreferredSteamDocument();
  if (!doc || (doc as any)[DS_BRIDGE_ATTACHED]) return;
  (doc as any)[DS_BRIDGE_ATTACHED] = true;

  const handler = (evt: Event) => {
    try {
      const btn = (evt as CustomEvent<any>).detail?.button;
      if (btn !== DIR_DOWN && btn !== DIR_UP) return;
      const mount = doc.getElementById("deck-shelves-home-root") as HTMLElement | null;
      if (!mount || !mount.isConnected) return;
      const parent = mount.parentElement;
      if (!parent) return;
      const before = doc.querySelector<HTMLElement>(".gpfocus");
      if (!before) return;
      const beforeRect = before.getBoundingClientRect();
      const mountRect = mount.getBoundingClientRect();

      let redirectTarget: HTMLElement | null = null;

      if (btn === DIR_DOWN) {
        const parentChildren = Array.from(parent.children);
        const mountIdx = parentChildren.indexOf(mount);

        if (mount.contains(before)) {
          // Bug A: block Steam's wrap-around on last shelf, but let downward nav (tabs) through.
          const lastShelf = mount.querySelector<HTMLElement>(".ds-shelf:last-child");
          if (lastShelf?.contains(before)) {
            requestAnimationFrame(() => {
              try {
                const after = doc.querySelector<HTMLElement>(".gpfocus");
                if (!after || mount.contains(after)) return;
                // Only intercept if focus wrapped UP — ignore downward nav to tabs.
                const afterRect = after.getBoundingClientRect();
                if (afterRect.top < beforeRect.top - 20) focusElement(before);
              } catch (e) { logInfo("HOME", "bug-a rAF failed", String(e)); }
            });
          }
          return;
        }

        const sibling = parentChildren.find(
          (c) => c !== mount && (c as Element).contains(before),
        ) as HTMLElement | undefined;
        if (!sibling) return;
        // Bug B: only bridge from siblings ABOVE our mount, not below (native tabs)
        if (parentChildren.indexOf(sibling) > mountIdx) return;
        // Only bridge when focus is in the lower portion of its sibling
        // (likely the last row). Prevents hijacking mid-section DOWN moves.
        const sibRect = sibling.getBoundingClientRect();
        if (beforeRect.top < sibRect.top + sibRect.height * 0.55) return;
        redirectTarget = mount.querySelector<HTMLElement>(".ds-card");
      } else if (btn === DIR_UP) {
        if (!mount.contains(before)) return;
        // Only bridge when focus is in the first row of our shelves
        if (beforeRect.top > mountRect.top + 120) return;
        // Aim at the last focusable in the nearest sibling above our mount
        let sib = mount.previousElementSibling as HTMLElement | null;
        while (sib) {
          const cls = (sib.className || "").toString();
          const hasHashed = cls.split(/\s+/).some((t) => t.startsWith("_") && t.length > 5);
          if (hasHashed && sib.offsetHeight > 0) break;
          sib = sib.previousElementSibling as HTMLElement | null;
        }
        if (!sib) return;
        const candidates = Array.from(
          sib.querySelectorAll<HTMLElement>('[role="button"], button, a, [tabindex]:not([tabindex="-1"]), .Focusable'),
        ).filter((el) => el.offsetParent !== null);
        redirectTarget = candidates[candidates.length - 1] ?? null;
      }

      if (!redirectTarget) return;

      // Post-nav check: run on next frame. If native nav already moved focus
      // somewhere reasonable, don't interfere.
      requestAnimationFrame(() => {
        try {
          const after = doc.querySelector<HTMLElement>(".gpfocus");
          if (!after) return;
          if (after === before) {
            // Focus didn't move — bridge
            focusElement(redirectTarget!);
            return;
          }
          // For DOWN: if focus didn't enter our mount, bridge
          if (btn === DIR_DOWN && !mount.contains(after)) {
            const afterRect = after.getBoundingClientRect();
            if (afterRect.top <= beforeRect.top + 10) {
              focusElement(redirectTarget!);
            }
          }
          // For UP: if focus is still in our mount, bridge
          if (btn === DIR_UP && mount.contains(after)) {
            focusElement(redirectTarget!);
          }
        } catch (e) { logInfo("HOME", "vertical bridge rAF failed", String(e)); }
      });
    } catch (e) { logInfo("HOME", "vertical bridge failed", String(e)); }
  };
  doc.addEventListener("vgp_ondirection", handler, true);
}
