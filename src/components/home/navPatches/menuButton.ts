import { getAllSteamDocuments } from "../../../runtime/steamHost";
import { showGameMenu } from "../../../core/steamGameMenu";
import { logInfo } from "../../../runtime/logger";
import {
  getOverlayFocusedAppId,
  getOverlayFirstCachedAppId,
  isRecentsReplaceInjecting,
} from "../../../runtime/recentsReplace";
import { OPTIONS_BUTTON } from "./constants";

const patchedMenuControllers = new WeakSet<object>();

function findFocusedDsCard(): HTMLElement | null {
  // DispatchVirtualButtonClick runs from SharedJSContext, but ds-cards live in
  // the popup (GamepadUI) window. Scan every known Steam document — preferred
  // first, then all candidates — so we find the focused card regardless of
  // which window holds it.
  for (const d of getAllSteamDocuments()) {
    const el = (
      d.querySelector(".ds-card.gpfocus") ??
      d.querySelector(".ds-card:focus") ??
      (d.activeElement?.closest?.(".ds-card") as HTMLElement | null)
    ) as HTMLElement | null;
    if (el) return el;
  }
  return null;
}

function interceptMenuBtn(button: number): boolean {
  if (button !== OPTIONS_BUTTON) return false;
  try {
    const focused = findFocusedDsCard();
    if (focused) {
      const appid = Number(focused.getAttribute("data-appid") ?? 0);
      if (appid > 0) { showGameMenu(appid); return true; }
    }
    // Overlay: native recents cards — intercept unconditionally to prevent native crash.
    // Use tracked focused appid, falling back to first cached appid.
    if (isRecentsReplaceInjecting()) {
      const appid = getOverlayFocusedAppId() || getOverlayFirstCachedAppId();
      if (appid > 0) { showGameMenu(appid); return true; }
      return true; // still intercept even if no appid yet — prevents native crash
    }
  } catch { return false; }
  return false;
}

/**
 * Intercepts the Options/Menu button so pressing it on a shelf card opens
 * our game context menu instead of Steam's default behavior (which crashes
 * on our synthetic cards). Installs three layers:
 *
 * - Document-level `vgp_onmenubutton` / `contextmenu` listeners (one per
 *   known Steam document) — first chance to catch the press.
 * - `ctrl.DispatchVirtualButtonClick` instance-level patch.
 * - Prototype-level patch as fallback when the controller doesn't own
 *   its own dispatch fn.
 *
 * All three dedupe through `patchedMenuControllers: WeakSet` so repeat
 * calls (e.g. from observer-driven re-runs) are no-ops.
 */
export function patchMenuButton(): void {
  const DS_DOC_MENU = "__ds_doc_menu__";
  // Register on every Steam document we can see: ds-cards may live in the
  // popup (GamepadUI) while the plugin bundle itself runs in SharedJSContext.
  // Event listeners must live on the document that actually hosts the card.
  const handleMenu = (evt: Event) => {
    try {
      const focused = findFocusedDsCard();
      if (focused) {
        const appid = Number(focused.getAttribute("data-appid") ?? 0);
        if (appid > 0) {
          evt.stopImmediatePropagation();
          evt.preventDefault();
          showGameMenu(appid);
          return;
        }
      }
      // Overlay: intercept unconditionally — native handler crashes on replaced cards.
      if (isRecentsReplaceInjecting()) {
        evt.stopImmediatePropagation();
        evt.preventDefault();
        const appid = getOverlayFocusedAppId() || getOverlayFirstCachedAppId();
        if (appid > 0) showGameMenu(appid);
      }
    } catch (e) { logInfo("HOME", "handleMenu failed", String(e)); }
  };
  for (const d of getAllSteamDocuments()) {
    if ((d as any)[DS_DOC_MENU]) continue;
    (d as any)[DS_DOC_MENU] = true;
    d.addEventListener("vgp_onmenubutton", handleMenu, true);
    d.addEventListener("contextmenu", handleMenu, true);
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
