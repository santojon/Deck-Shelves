import { getAllSteamDocuments } from "../../../runtime/steamHost";
import { showGameMenu } from "../../../core/steamGameMenu";
import { logInfo } from "../../../runtime/logger";
import {
  getOverlayFocusedAppId,
  getOverlayFirstCachedAppId,
  isRecentsReplaceInjecting,
} from "../../../runtime/recentsReplace";
import { OPTIONS_BUTTON } from "./constants";
import { registerDisposer } from "../../../runtime/runtimeDisposer";
import { resolveFocusNavController } from "./focusNav";

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

function readCardIds(el: HTMLElement): { appid: number; shelfId?: string } {
  const appid = Number(el.getAttribute("data-appid") ?? 0);
  const shelfId = el.getAttribute("data-shelfid") ?? undefined;
  return { appid, shelfId: shelfId || undefined };
}

function cardFromEventTarget(evt: Event): HTMLElement | null {
  const target = evt.target as HTMLElement | null;
  return (target?.closest?.(".ds-card") as HTMLElement | null) ?? null;
}

function interceptMenuBtn(button: number): boolean {
  if (button !== OPTIONS_BUTTON) return false;
  try {
    const focused = findFocusedDsCard();
    if (focused) {
      const { appid, shelfId } = readCardIds(focused);
      if (appid > 0) { showGameMenu(appid, shelfId); return true; }
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

/* Wrap `DispatchVirtualButtonClick` on `target` (an instance or a prototype)
   so the Options button reaches the shelf menu first. `bindTo` pins the
   original to an instance (the instance-method case); otherwise the call-site
   `this` is forwarded (prototype / nested-controller cases). */
function patchDispatch(target: any, bindTo?: object): boolean {
  if (!target || patchedMenuControllers.has(target) || typeof target.DispatchVirtualButtonClick !== "function") return false;
  const fn = target.DispatchVirtualButtonClick;
  const orig = bindTo ? fn.bind(bindTo) : fn;
  target.DispatchVirtualButtonClick = function (this: any, button: number, ...args: any[]) {
    if (interceptMenuBtn(button)) return;
    return orig.apply(this, [button, ...args]);
  };
  patchedMenuControllers.add(target);
  return true;
}

// Register on every Steam document we can see: ds-cards may live in the
// popup (GamepadUI) while the plugin bundle itself runs in SharedJSContext.
// Event listeners must live on the document that actually hosts the card.
function installDocumentMenuListeners(handleMenu: (evt: Event) => void): void {
  const DS_DOC_MENU = "__ds_doc_menu__";
  for (const d of getAllSteamDocuments()) {
    if ((d as any)[DS_DOC_MENU]) continue;
    (d as any)[DS_DOC_MENU] = true;
    d.addEventListener("vgp_onmenubutton", handleMenu, true);
    d.addEventListener("contextmenu", handleMenu, true);
    // Removed with this instance (a hot-swap's next instance attaches its own).
    registerDisposer(() => {
      try {
        d.removeEventListener("vgp_onmenubutton", handleMenu, true);
        d.removeEventListener("contextmenu", handleMenu, true);
        delete (d as any)[DS_DOC_MENU];
      } catch {}
    });
  }
}

export function patchMenuButton(): void {
  const handleMenu = (evt: Event) => {
    try {
      // vgp_onmenubutton / contextmenu fire on the focused element — read the
      /* target directly before falling back to the focus-based queries. This
         handles cases where __ds_last_focused_card is briefly stale (e.g.
         DispatchVirtualButtonClick intercepted for the wrong card) because the
         document-level capture listener fires once the event IS dispatched on
         the correct element. */
      const focused = cardFromEventTarget(evt) ?? findFocusedDsCard();
      if (focused) {
        const { appid, shelfId } = readCardIds(focused);
        if (appid > 0) {
          evt.stopImmediatePropagation();
          evt.preventDefault();
          showGameMenu(appid, shelfId);
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
  installDocumentMenuListeners(handleMenu);

  const ctrl = resolveFocusNavController();
  if (!ctrl) return;
  // Instance method first, then the prototype, then the nested controller of
  // the active context — the first one that takes the wrapper wins.
  if (patchDispatch(ctrl, ctrl)) return;
  if (!patchedMenuControllers.has(ctrl) && patchDispatch(Object.getPrototypeOf(ctrl))) {
    patchedMenuControllers.add(ctrl);
    return;
  }
  const ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  patchDispatch(ctx?.m_controller);
}
