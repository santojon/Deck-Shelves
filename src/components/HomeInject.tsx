import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ShelfView } from "./Shelf";
import type { Settings } from "../types";
import { refreshSettings, subscribeSettings } from "../settingsStore";
import { PlatformProvider } from "../runtime/platformContext";
import { createDeckyPlatform } from "../runtime/deckyPlatform";
import { logInfo, logWarn } from "../runtime/logger";
import { logDiagnostic } from "../runtime/diagnostics";
import { getPreferredSteamDocument, getPreferredSteamWindow } from "../runtime/steamHost";
import { applyHideRecents, getMountFailed } from "../runtime/homePatch";
import { Focusable } from "@decky/ui";
import { installPassiveMenuHook, extractAppContextMenu, showGameMenu } from "../core/steamGameMenu";
import { tryRestoreFocus, hasPendingFocus, beginFocusRestoreLoop } from "../core/focusRestore";

const ROOT_ID = "deck-shelves-home-root";
const homePlatform = createDeckyPlatform();

const DIR_LEFT  = 11;
const DIR_RIGHT = 12;
const DS_EDGE_PATCHED   = "__ds_edge_patched__";
const DS_EDGE_LISTENER  = "__ds_edge_listener__";
const patchedMenuControllers = new WeakSet<object>();
const OPTIONS_BUTTON    = 4;

function reparentNavTreeNodes(mountEl: HTMLElement): number {
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
      return; // don't recurse into our own subtree
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
    } catch {}
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

function patchMenuButton(): void {
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
      } catch {}
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

function patchShelfEdgeNavigation(mountEl: HTMLElement): void {
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

function isHomeRoute(): boolean {
  const win = getPreferredSteamWindow();
  const href = `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`.toLowerCase();
  if (href.includes("library/home") || href.includes("#library/home")) return true;
  if (href.includes("/library") && !href.includes("/library/app/") && !href.includes("/library/collections")) return true;
  return false;
}

function hasHomeDomSignals(): boolean {
  const doc = getPreferredSteamDocument();
  if (!doc) return false;
  if (doc.querySelector('[class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="gamepadlibrary"]')) return true;
  if (doc.querySelector('[aria-label="Jogos recentes"], [aria-label="Recent Games"], [class*="ReactVirtualized__Grid"][aria-label]')) return true;
  try { if (doc.querySelector('div._282X0J4BtrSF1IXctmOe-X')) return true; } catch {}
  return false;
}

function detectNavTreeApi(): { available: boolean; detail: string } {
  try {
    const ctrl = (globalThis as any).FocusNavController
      ?? (globalThis as any).GamepadNavTree?.m_context?.m_controller;
    if (!ctrl) return { available: false, detail: 'no FocusNavController' };
    const ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
    const trees: any[] = ctx?.m_rgGamepadNavigationTrees ?? [];
    const main = trees.find((t: any) => t.m_ID === "GamepadUI_Full_Root");
    if (!main) return { available: false, detail: 'no GamepadUI_Full_Root tree' };
    const root = main.Root || main.m_Root;
    if (!root) return { available: false, detail: 'no Root on main tree' };
    if (!Array.isArray(root.m_rgChildren)) return { available: false, detail: 'm_rgChildren unavailable' };
    return { available: true, detail: `${root.m_rgChildren.length} root children` };
  } catch (e) {
    return { available: false, detail: String(e) };
  }
}

function resolveAnchor(): { parent: HTMLElement; before: ChildNode | null } | null {
  const doc = getPreferredSteamDocument();
  if (!doc) return null;

  // Strategy: find the "Recent Games" section, then walk UP to the scrollable
  // viewport and insert as a direct child AFTER the Recent Games chain.
  // This prevents our mount from expanding the native section and overlapping
  // subsequent native content (e.g., "What's New" tabs).
  const recentLabels = ["jogos recentes", "recent games", "recently played", "jogados recentemente"];
  const candidates = Array.from(doc.querySelectorAll('[role="list"],[aria-label],[class*="ReactVirtualized__Grid"]'));
  for (const node of candidates) {
    const txt = `${(node.getAttribute?.("aria-label") || "")} ${(node.textContent || "")}`.toLowerCase();
    if (!recentLabels.some((l) => txt.includes(l))) continue;
    // Walk up to the scrollable viewport ancestor
    let container: HTMLElement | null = node as HTMLElement;
    for (let i = 0; i < 12 && container; i++) {
      const p: HTMLElement | null = container.parentElement;
      if (!p || p === doc.body) break;
      try {
        const cs = getComputedStyle(p);
        const oy = (cs.overflowY || '').toLowerCase();
        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) {
          // Found the scrollable viewport — insert after the current container
          return { parent: p, before: container.nextSibling };
        }
      } catch {}
      container = p;
    }
    // Fallback: find first ancestor with multiple children
    container = node as HTMLElement;
    for (let i = 0; i < 6 && container; i++) {
      const p: HTMLElement | null = container.parentElement;
      if (!p || p === doc.body) break;
      if (p.childElementCount > 1) {
        return { parent: p, before: container.nextSibling };
      }
      container = p;
    }
  }

  const chipLabels = ["what's new", "friends", "recommended", "novidades", "amigos", "recomendados"];
  for (const node of Array.from(doc.querySelectorAll('button, [role="tab"]'))) {
    const text = (node.textContent || "").trim().toLowerCase();
    if (!chipLabels.includes(text)) continue;
    let row: HTMLElement | null = node.parentElement as HTMLElement;
    while (row && row.childElementCount <= 1 && row !== doc.body) row = row.parentElement;
    if (row?.parentElement && row !== doc.body) return { parent: row.parentElement, before: row };
  }

  const containers = Array.from(doc.querySelectorAll('[class*="gamepadlibrary"],[class*="libraryhome"],[class*="BasicHomeView"],main,[role="main"]'));
  for (const node of containers) {
    if (node instanceof HTMLElement) return { parent: node, before: node.firstChild };
  }

  return null;
}

function findOrCreateMount(): HTMLElement | null {
  const doc = getPreferredSteamDocument();
  const existing = doc.getElementById(ROOT_ID) as HTMLElement | null;
  if (existing?.isConnected) return existing;

  const anchor = resolveAnchor();
  if (!anchor || anchor.parent === doc.body) return null;

  const mount = doc.createElement("div");
  mount.id = ROOT_ID;
  mount.style.cssText = "width:100%;display:block;position:relative;z-index:0;margin:0;padding:0;";
  anchor.parent.insertBefore(mount, anchor.before);

  logInfo("HOME", "mount created", { parent: anchor.parent.tagName });
  return mount;
}

export function HomeShelves() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;

    const updateMount = () => {
      if (!alive) return;
      const homeVisible = isHomeRoute() || hasHomeDomSignals();
      if (!homeVisible) {
        setMountEl(null);
        getPreferredSteamDocument().getElementById(ROOT_ID)?.remove();
        return;
      }
      const el = findOrCreateMount();
      if (el) setMountEl(el);
    };

    updateMount();
    const doc = getPreferredSteamDocument();
    const win = getPreferredSteamWindow();
    const obs = new MutationObserver(updateMount);
    obs.observe(doc.body, { childList: true, subtree: true });
    // Long fallback for edge cases the observer misses (e.g. iframe navigation)
    const timer = window.setInterval(updateMount, 10000);
    win.addEventListener("hashchange", updateMount);
    win.addEventListener("popstate", updateMount);

    return () => {
      alive = false;
      obs.disconnect();
      window.clearInterval(timer);
      win.removeEventListener("hashchange", updateMount);
      win.removeEventListener("popstate", updateMount);
      doc.getElementById(ROOT_ID)?.remove();
    };
  }, []);

  useEffect(() => {
    if (!mountEl) return;
    let alive = true;
    mountEl.dataset.deckShelvesRenderer = 'react';
    const unsub = subscribeSettings((s) => { if (alive) setSettings(s); });
    refreshSettings().then((s) => { if (alive) setSettings(s); }).catch(() => undefined);

    const onSettingsChanged = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && alive) setSettings(detail);
    };
    globalThis.addEventListener("deck-shelves-settings-changed", onSettingsChanged);

    return () => {
      alive = false;
      unsub();
      globalThis.removeEventListener("deck-shelves-settings-changed", onSettingsChanged);
      delete mountEl.dataset.deckShelvesRenderer;
    };
  }, [mountEl]);

  // Apply hideRecents whenever the setting changes
  useEffect(() => {
    applyHideRecents(settings?.hideRecents === true);
  }, [settings?.hideRecents]);

  if (!mountEl) return null;
  if (!settings) return null;

  // Crash protection: don't attempt to render if mounting has failed
  if (getMountFailed()) {
    logWarn("HOME", "mount failed — skipping render");
    return null;
  }

  if (!settings.enabled) {
    logWarn("HOME", "plugin disabled");
    return null;
  }
  const shelves = (settings.shelves ?? []).filter((s) => s.enabled && !s.hidden);
  logInfo("HOME", "rendering shelves via portal", { visible: shelves.length, mountConnected: mountEl.isConnected });
  if (!shelves.length) return null;

  return createPortal(
    <PlatformProvider platform={homePlatform}>
      <ShelvesContainer mountEl={mountEl} shelves={shelves} />
    </PlatformProvider>,
    mountEl,
  ) as any;
}

function ShelvesContainer({ mountEl, shelves }: { mountEl: HTMLElement; shelves: any[] }) {
  useEffect(() => {
    // One-time nav tree API detection — result surfaced in About > Diagnostics
    const navApi = detectNavTreeApi();
    logDiagnostic(
      navApi.available ? 'info' : 'warn',
      navApi.available ? 'Gamepad nav tree API available' : 'Gamepad nav tree API unavailable',
      navApi.detail,
    );

    const applyPatches = () => {
      try {
        reparentNavTreeNodes(mountEl);
        patchShelfEdgeNavigation(mountEl);
        patchMenuButton();
        installPassiveMenuHook();
        tryRestoreFocus();
      } catch {}
    };

    // Run patches immediately, then on DOM mutations + long fallback
    applyPatches();
    const obs = new MutationObserver(applyPatches);
    obs.observe(mountEl, { childList: true, subtree: true });
    const fallback = setInterval(applyPatches, 10000);

    const win = getPreferredSteamWindow();
    const onNavEvent = () => { applyPatches(); if (hasPendingFocus()) beginFocusRestoreLoop(); };
    win.addEventListener("popstate", onNavEvent);
    win.addEventListener("hashchange", onNavEvent);

    return () => {
      obs.disconnect();
      clearInterval(fallback);
      win.removeEventListener("popstate", onNavEvent);
      win.removeEventListener("hashchange", onNavEvent);
    };
  }, [mountEl]);

  return (
    <Focusable
      className="deck-shelves-root"
      flow-children="column"
      style={{ width: "100%", display: "flex", flexDirection: "column", paddingBottom: 8, marginBottom: 24 }}
    >
      {shelves.map((shelf) => <ShelfView key={shelf.id} shelf={shelf} />)}
    </Focusable>
  );
}
