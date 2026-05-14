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
  for (const d of getAllSteamDocuments()) {
    const el = (
      d.querySelector(".ds-card.gpfocus") ??
      d.querySelector(".ds-card:focus")
    ) as HTMLElement | null;
    if (el) return el;
  }
  try {
    const el = (globalThis as any).__ds_last_focused_card as HTMLElement | null;
    if (el?.isConnected) return el;
  } catch {}
  return null;
}

function interceptMenuBtn(button: number): boolean {
  if (button !== OPTIONS_BUTTON) return false;
  try {
    const focused = findFocusedDsCard();
    if (focused) {
      const appid = Number(focused.getAttribute("data-appid") ?? 0);
      const shelfId = focused.getAttribute("data-shelfid") ?? undefined;
      if (appid > 0) { showGameMenu(appid, shelfId || undefined); return true; }
    }
    // Recents overlay: intercept unconditionally — native handler crashes on
    // replaced cards. Use tracked focused appid, falling back to first cached.
    if (isRecentsReplaceInjecting()) {
      const appid = getOverlayFocusedAppId() || getOverlayFirstCachedAppId();
      if (appid > 0) { showGameMenu(appid); return true; }
      return true;
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
      // vgp_onmenubutton / contextmenu fire on the focused element — read the
      // target directly before falling back to the focus-based queries. This
      // handles cases where __ds_last_focused_card is briefly stale (e.g.
      // DispatchVirtualButtonClick intercepted for the wrong card) because the
      // document-level capture listener fires once the event IS dispatched on
      // the correct element.
      const fromTarget = (evt.target as HTMLElement)?.closest?.('.ds-card') as HTMLElement | null;
      const focused = fromTarget ?? findFocusedDsCard();
      if (focused) {
        const appid = Number(focused.getAttribute("data-appid") ?? 0);
        const shelfId = focused.getAttribute("data-shelfid") ?? undefined;
        if (appid > 0) {
          evt.stopImmediatePropagation();
          evt.preventDefault();
          showGameMenu(appid, shelfId || undefined);
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
