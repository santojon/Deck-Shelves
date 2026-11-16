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
import { getActiveFocusedElement } from "../../../core/focusRestore";

const patchedMenuControllers = new WeakSet<object>();
const HOME_MOUNT_ID = "deck-shelves-home-root";
const PLUGIN_AREA = ".ds-card, .deck-shelves-root, #" + HOME_MOUNT_ID;

function findFocusedDsCard(focus: HTMLElement | null): HTMLElement | null {
  for (const d of getAllSteamDocuments()) {
    const el = (
      d.querySelector(".ds-card.gpfocus") ??
      d.querySelector(".ds-card:focus")
    ) as HTMLElement | null;
    if (el) return el;
  }
  if (focus && !focus.closest?.(PLUGIN_AREA)) return null;
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

function isOnReplacedRow(focus: HTMLElement | null): boolean {
  if (!focus) return false;
  const row = focus.ownerDocument?.getElementById(HOME_MOUNT_ID)?.previousElementSibling;
  return !!row && row.contains(focus);
}

function replacedRowMenuAppId(focus: HTMLElement | null): number {
  if (!isRecentsReplaceInjecting() || !isOnReplacedRow(focus)) return 0;
  return getOverlayFocusedAppId() || getOverlayFirstCachedAppId();
}

function eventFocus(evt: Event): HTMLElement | null {
  const target = evt.target as HTMLElement | null;
  const doc = target?.ownerDocument;
  if (!target?.closest || target === doc?.body || target === doc?.documentElement) return getActiveFocusedElement();
  return target;
}

function interceptMenuBtn(button: number): boolean {
  if (button !== OPTIONS_BUTTON) return false;
  try {
    const focus = getActiveFocusedElement();
    const focused = findFocusedDsCard(focus);
    if (focused) {
      const { appid, shelfId } = readCardIds(focused);
      if (appid > 0) { showGameMenu(appid, shelfId); return true; }
    }
    const appid = replacedRowMenuAppId(focus);
    if (appid > 0) { showGameMenu(appid); return true; }
  } catch { return false; }
  return false;
}

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

// Cards can live in another document than the one this bundle runs in.
function installDocumentMenuListeners(handleMenu: (evt: Event) => void): void {
  const DS_DOC_MENU = "__ds_doc_menu__";
  for (const d of getAllSteamDocuments()) {
    if ((d as any)[DS_DOC_MENU]) continue;
    (d as any)[DS_DOC_MENU] = true;
    d.addEventListener("vgp_onmenubutton", handleMenu, true);
    d.addEventListener("contextmenu", handleMenu, true);
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
      const focus = eventFocus(evt);
      const focused = cardFromEventTarget(evt) ?? findFocusedDsCard(focus);
      if (focused) {
        const { appid, shelfId } = readCardIds(focused);
        if (appid > 0) {
          evt.stopImmediatePropagation();
          evt.preventDefault();
          showGameMenu(appid, shelfId);
          return;
        }
      }
      const appid = replacedRowMenuAppId(focus);
      if (appid > 0) {
        evt.stopImmediatePropagation();
        evt.preventDefault();
        showGameMenu(appid);
      }
    } catch (e) { logInfo("HOME", "handleMenu failed", String(e)); }
  };
  installDocumentMenuListeners(handleMenu);

  const ctrl = resolveFocusNavController();
  if (!ctrl) return;
  if (patchDispatch(ctrl, ctrl)) return;
  if (!patchedMenuControllers.has(ctrl) && patchDispatch(Object.getPrototypeOf(ctrl))) {
    patchedMenuControllers.add(ctrl);
    return;
  }
  const ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  patchDispatch(ctx?.m_controller);
}
