import React from "react";
import { HomeShelves as HomeShelvesRaw, bridgeHasFilledHome } from "../components/HomeInject";
import { wrapHomeShelves } from "../qa/harness";
const HomeShelves = wrapHomeShelves(HomeShelvesRaw);
import { SearchOverlay } from "../features/search/SearchOverlay";
import { ShelfSideNav } from "../features/sidenav/ShelfSideNav";
import { DeckScreensaverOverlay } from "../components/screensaver/DeckScreensaverOverlay";
import { logInfo, logWarn } from "./logger";
import { findModuleByExport } from "./host/decky";
import { recordRemountTry, observerCreated, observerDisposed } from "../core/perfMetrics";
import { createBridgeGateState, noteFallbackTick, bridgeGraceActive, hrefOf } from "./homePatchFallbackGate";
import { installFallbackPoll, type FallbackPoll } from "./homePatchFallback";
import { getPowerState } from "./powerGate";
import { activeNavTrees } from "../components/home/navPatches/focusNav";
import { getHostContext, ROOT_ID, isHomeVisible, hrefIsHomeLike, isDesktopUiActive } from "./homePatchWindow";
import { setFocusableTabindex, applyHideHomeTabs, pendingHideHomeTabs, hiddenHomeTabs, restoreAllHomeTabs } from "./homePatchTabs";
import { applyHideRecents, pendingHideRecents, reseedCachedRecentsEl, cachedRecentsEl, applyRecentsFocusSuppression, applyRecentsCollapse } from "./homePatchRecents";
import { HomeBoundary, ensureMount } from "./homePatchMount";

export { applyHideHomeTabs, getPendingHideHomeTabs } from "./homePatchTabs";
export { applyReplaceActiveMargin, applyHideRecents, getPendingHideRecents } from "./homePatchRecents";
export { getMountFailed, getMountError, resetMountFailed, subscribeMountFailed } from "./homePatchMount";

const GLOBAL_COMPONENT_ID = "DeckShelvesHomeDomBridge";

let observer: MutationObserver | null = null;
let fallbackPoll: FallbackPoll | null = null;
let removeGlobalComponent: (() => void) | null = null;
const uninstallHooks: Array<() => void> = [];

export function reapplyHomeHides(): void {
  applyHideRecents(pendingHideRecents);
  applyHideHomeTabs(pendingHideHomeTabs);
}

// Steam re-renders hidden rows on route round-trips with `tabindex=0`, which traps gamepad focus.
export function enforceHomeFocusSuppression(): void {
  try {
    if (pendingHideRecents) {
      reseedCachedRecentsEl();
      const el = cachedRecentsEl;
      const repurposed = !!el && !!el.querySelector('.ds-shelf, .deck-shelves-root, #' + ROOT_ID);
      if (el && !repurposed) applyRecentsFocusSuppression(true);
    }
    if (pendingHideHomeTabs) {
      for (const el of Array.from(hiddenHomeTabs)) {
        if (!el.isConnected) continue;
        const focusables = el.querySelectorAll<HTMLElement>('[tabindex], button, a, input, [role="button"], .Focusable');
        for (const f of Array.from(focusables)) setFocusableTabindex(f, true);
      }
    }
  } catch (e) { logInfo("HOME", "enforceHomeFocusSuppression failed", String(e)); }
}

function HomeDomBridge() {
  // On a sole host the cross-window portal is unreliable and the same-window fallback owns the Home.
  if ((globalThis as any).__ds_sole_home_owned) return null;
  getHostContext();
  return React.createElement(
    HomeBoundary,
    null,
    React.createElement(React.Fragment, null,
      React.createElement(HomeShelves),
      React.createElement(SearchOverlay),
      React.createElement(ShelfSideNav),
      React.createElement(DeckScreensaverOverlay),
    ),
  );
}

function tryStoreMethod(store: any, method: 'addComponent' | 'register'): boolean {
  if (typeof store[method] !== "function") return false;
  try {
    const dispose = store[method](GLOBAL_COMPONENT_ID, HomeDomBridge);
    if (typeof dispose === "function") uninstallHooks.push(dispose);
    return true;
  } catch { return false; }
}

function tryStoreStateArray(store: any, state: any, key: 'components' | 'globalComponents'): boolean {
  const arr = (state as any)[key];
  if (!Array.isArray(arr)) return false;
  const next = arr.slice();
  next.push({ id: GLOBAL_COMPONENT_ID, component: HomeDomBridge });
  store.setState({ ...(state as any), [key]: next });
  uninstallHooks.push(() => {
    try {
      const s = store.getState?.();
      const filtered = Array.isArray(s?.[key]) ? s[key].filter((x: any) => x?.id !== GLOBAL_COMPONENT_ID) : s?.[key];
      store.setState({ ...(s ?? {}), [key]: filtered });
    } catch {}
  });
  return true;
}

function tryStoreGetSetState(store: any): boolean {
  if (typeof store.getState !== "function" || typeof store.setState !== "function") return false;
  try {
    const state = store.getState?.();
    if (!state || typeof state !== "object") return false;
    return tryStoreStateArray(store, state, 'components') || tryStoreStateArray(store, state, 'globalComponents');
  } catch { return false; }
}

function registerBridgeViaStore(store: any): boolean {
  if (!store) return false;
  return tryStoreMethod(store, 'addComponent')
      || tryStoreMethod(store, 'register')
      || tryStoreGetSetState(store);
}

function registerBridgeViaWrapper(routerHook: any): boolean {
  const wrapKey = ["DeckyGlobalComponentsWrapper", "DeckyGamepadRouterWrapper", "DeckyDesktopRouterWrapper"];
  for (const key of wrapKey) {
    const original = routerHook?.[key];
    if (typeof original !== "function") continue;
    if ((original as any).__deckShelvesWrapped) return true;
    try {
      const wrapped = function wrappedDeckyComponent(props: any) {
        const originalNode = original(props);
        return React.createElement(React.Fragment, null, originalNode, React.createElement(HomeDomBridge));
      };
      (wrapped as any).__deckShelvesWrapped = true;
      routerHook[key] = wrapped;
      uninstallHooks.push(() => {
        try {
          if (routerHook[key] === wrapped) routerHook[key] = original;
        } catch {}
      });
      return true;
    } catch {}
  }
  return false;
}

function registerBridgeViaRouteHook(routerHook: any): boolean {
  const originalRoute = routerHook?.Route;
  if (typeof originalRoute !== "function") return false;
  if ((originalRoute as any).__deckShelvesWrappedRoute) return true;
  try {
    const wrappedRoute = function wrappedRoute(...args: any[]) {
      const node = originalRoute(...args);
      return React.createElement(React.Fragment, null, node, React.createElement(HomeDomBridge));
    };
    (wrappedRoute as any).__deckShelvesWrappedRoute = true;
    routerHook.Route = wrappedRoute;
    uninstallHooks.push(() => {
      try {
        if (routerHook.Route === wrappedRoute) routerHook.Route = originalRoute;
      } catch {}
    });
    return true;
  } catch {}
  return false;
}

type BridgeAttempt = { signature: string; invoke: () => any };

function buildAddGlobalAttempts(addGlobalComponent: Function): BridgeAttempt[] {
  return [
    { signature: "id,component", invoke: () => addGlobalComponent(GLOBAL_COMPONENT_ID, HomeDomBridge) },
    { signature: "component", invoke: () => addGlobalComponent(HomeDomBridge) },
    { signature: "object", invoke: () => addGlobalComponent({ id: GLOBAL_COMPONENT_ID, component: HomeDomBridge }) },
  ];
}

function tryAddGlobalComponentSignatures(routerHook: any): boolean {
  const fn = routerHook?.addGlobalComponent;
  if (typeof fn !== "function") {
    logWarn("HOME", "routerHook.addGlobalComponent unavailable");
    return false;
  }
  for (const attempt of buildAddGlobalAttempts(fn)) {
    try {
      const disp = attempt.invoke();
      if (typeof disp === "function") removeGlobalComponent = disp;
      logInfo("HOME", "global component bridge registered", { signature: attempt.signature });
      return true;
    } catch {}
  }
  return false;
}

function registerGlobalBridge(routerHook: any): boolean {
  if (tryAddGlobalComponentSignatures(routerHook)) return true;
  const storeAttempts: Array<[any, string]> = [
    [routerHook?.globalComponentsState, "globalComponentsState"],
    [routerHook?.renderedComponents, "renderedComponents"],
  ];
  for (const [store, signature] of storeAttempts) {
    if (registerBridgeViaStore(store)) {
      logInfo("HOME", "global component bridge registered", { signature });
      return true;
    }
  }
  if (registerBridgeViaWrapper(routerHook)) {
    logInfo("HOME", "global component bridge registered", { signature: "wrapper-patch" });
    return true;
  }
  if (registerBridgeViaRouteHook(routerHook)) {
    logInfo("HOME", "global component bridge registered", { signature: "route-hook" });
    return true;
  }
  return false;
}

export function installHomePatch(_routerHook?: any) {
  if (typeof document === "undefined") return null;
  const routerHook = _routerHook;

  logInfo("HOME", "installHomePatch start", {
    pathname: getHostContext().win.location?.pathname,
    hash: getHostContext().win.location?.hash,
    hasRouterHook: !!routerHook,
    routerHookKeys: Object.keys(routerHook ?? {}).slice(0, 20),
  });

  // Hides left behind by a predecessor would misplace our mount.
  restoreAllHomeTabs(); applyRecentsCollapse(false);
  const gate = createBridgeGateState(Date.now());

  try {
    gate.bridgeRegistered = registerGlobalBridge(routerHook);
    if (!gate.bridgeRegistered) logWarn("HOME", "all global bridge strategies failed");
  } catch (error) {
    logWarn("HOME", "global component bridge setup failed", String(error));
  }

  let fallbackRoot: { unmount(): void } | null = null;
  // The element, not its id: the Home can recreate the anchor with the same id.
  let fallbackMountEl: HTMLElement | null = null;
  // A new root clears its container on first commit, so it never lives on the mount itself.
  let fallbackHostEl: HTMLElement | null = null;
  let fallbackRetries = 0;
  const MAX_FALLBACK_RETRIES = 6;

  // A slow cold boot can exhaust the fast retries before the anchor appears, so back off instead of stopping.
  const giveUpFallback = () => {
    logWarn("HOME", "fallback: anchor not found after repeated attempts — backing off", { retries: fallbackRetries });
    fallbackRetries = 0;
    fallbackPoll?.backoff();
    // The observer stays attached so later hydration still reaches the fallback.
  };

  const resolveReactDOM = (win: Window): any => {
    return (globalThis as any).ReactDOM ?? (globalThis as any).SP_REACTDOM ?? (win as any).ReactDOM ?? (win as any).SP_REACTDOM;
  };

  // React DOM 19 moved createRoot out of react-dom; it lives in its own webpack module.
  let cachedWebpackCreateRoot: ((container: Element) => { render(node: unknown): void; unmount(): void }) | null | undefined;
  const findCreateRootViaWebpack = (): typeof cachedWebpackCreateRoot => {
    if (cachedWebpackCreateRoot !== undefined) return cachedWebpackCreateRoot;
    try {
      const mod: any = findModuleByExport((_val: any, name: string) => name === "createRoot");
      cachedWebpackCreateRoot = typeof mod?.createRoot === "function" ? mod.createRoot : null;
    } catch { cachedWebpackCreateRoot = null; }
    return cachedWebpackCreateRoot;
  };

  // Reuse a real registered nav node as the parent context; a synthetic one makes navigation erratic.
  const looksLikeNavNode = (v: any): boolean =>
    !!v && typeof v === "object" && typeof v.BTakeFocus === "function" && !!(v.m_Tree || v.Tree);

  const findNavProviderInChain = (startFiber: any): any | null => {
    let f = startFiber;
    for (let i = 0; i < 40 && f; i++) {
      if (f.tag === 10 && looksLikeNavNode(f.memoizedProps?.value)) return f.type;
      f = f.return;
    }
    return null;
  };

  let cachedNavProviderType: any | null | undefined;
  const findNavProviderType = (mount: HTMLElement): any | null => {
    if (cachedNavProviderType !== undefined) return cachedNavProviderType;
    cachedNavProviderType = null;
    try {
      const candidates = [mount.previousElementSibling, mount.nextElementSibling, mount.parentElement]
        .filter((el): el is HTMLElement => !!el && el !== mount);
      for (const el of candidates) {
        const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
        if (!fiberKey) continue;
        const found = findNavProviderInChain((el as any)[fiberKey]);
        if (found) { cachedNavProviderType = found; return found; }
      }
    } catch (e) { logInfo("HOME", "findNavProviderType failed", String(e)); }
    return cachedNavProviderType;
  };

  const findNodeByElement = (node: any, targetEl: HTMLElement): any | null => {
    const el = node.Element ?? node.m_element ?? node.m_Element;
    if (el === targetEl) return node;
    const children: any[] = node.m_rgChildren ?? [];
    for (const child of children) {
      const found = findNodeByElement(child, targetEl);
      if (found) return found;
    }
    return null;
  };

  const findRealParentNavNode = (mount: HTMLElement): any | null => {
    const targetEl = mount.parentElement;
    if (!targetEl) return null;
    try {
      for (const tree of activeNavTrees()) {
        const root = tree.Root ?? tree.m_Root ?? tree.m_root;
        if (!root) continue;
        const found = findNodeByElement(root, targetEl);
        if (found) return found;
      }
    } catch (e) { logInfo("HOME", "findRealParentNavNode failed", String(e)); }
    return null;
  };

  const wrapWithRealNavParent = (mount: HTMLElement, innerTree: any): any => {
    const providerType = findNavProviderType(mount);
    const realParentNode = providerType ? findRealParentNavNode(mount) : null;
    if (!providerType || !realParentNode) return innerTree;
    logInfo("HOME", "fallback: wrapped tree in real nav-tree parent node");
    return React.createElement(providerType, { value: realParentNode }, innerTree);
  };

  const renderWithReactDOM = (ReactDOM: any, mount: HTMLElement): { unmount(): void } | null => {
    const innerTree = React.createElement(
    HomeBoundary,
    null,
    React.createElement(React.Fragment, null,
      React.createElement(HomeShelves, { fallback: true }),
      React.createElement(SearchOverlay),
      React.createElement(ShelfSideNav),
      React.createElement(DeckScreensaverOverlay),
    ),
  );
    const tree = wrapWithRealNavParent(mount, innerTree);
    const host = mount.ownerDocument.createElement("div");
    host.setAttribute("data-ds-fallback-host", ""); host.style.display = "contents";
    mount.appendChild(host); fallbackHostEl = host;
    const renderFn = ReactDOM.createRoot ?? ReactDOM.default?.createRoot;
    if (typeof renderFn === "function") {
      const root = renderFn.call(ReactDOM.default ?? ReactDOM, host); root.render(tree);
      logInfo("HOME", "fallback: rendered via createRoot"); return root;
    }
    if (typeof ReactDOM.render === "function") {
      ReactDOM.render(tree, host); logInfo("HOME", "fallback: rendered via legacy render");
      return { unmount: () => { try { ReactDOM.unmountComponentAtNode?.(host); } catch {} } };
    }
    const webpackCreateRoot = findCreateRootViaWebpack();
    if (!webpackCreateRoot) return null;
    const root = webpackCreateRoot(host); root.render(tree);
    logInfo("HOME", "fallback: rendered via webpack-discovered createRoot"); return root;
  };

  const ensureFallbackMount = (): HTMLElement | null => {
    const mount = ensureMount();
    if (mount) { fallbackRetries = 0; return mount; }
    if (++fallbackRetries >= MAX_FALLBACK_RETRIES) giveUpFallback();
    return null;
  };

  const teardownPreviousFallbackRoot = (): void => {
    if (fallbackRoot) { try { fallbackRoot.unmount(); } catch {} fallbackRoot = null; }
    if (fallbackHostEl) { try { fallbackHostEl.remove(); } catch {} fallbackHostEl = null; }
  };

  const mountFallbackTo = (win: Window, mount: HTMLElement): void => {
    teardownPreviousFallbackRoot();
    const ReactDOM = resolveReactDOM(win);
    if (!ReactDOM) { logWarn("HOME", "fallback: ReactDOM unavailable"); return; }
    const rendered = renderWithReactDOM(ReactDOM, mount);
    if (rendered) {
      fallbackRoot = rendered; fallbackMountEl = mount;
      // Sole host: tell the bridge to stand down so it never double-mounts into the same root.
      try { if (win !== window && !bridgeHasFilledHome()) (globalThis as any).__ds_sole_home_owned = true; } catch {}
    } else logWarn("HOME", "fallback: no working render path found (global or webpack)");
  };

  // The bridge owns the Home only once real shelf DOM is in the root; on a sole host it can stay empty.
  // A real shelf panel, not the bridge overlays' lone empty span.
  const bridgeOwnsHome = (doc: Document): boolean => doc.getElementById(ROOT_ID)?.querySelector(".deck-shelves-root") != null;

  // Two copies mean both rendered; a single copy may be ours alone and must never be torn down.
  const homeHasDuplicateContent = (doc: Document): boolean => (doc.getElementById(ROOT_ID)?.querySelectorAll(".deck-shelves-root").length ?? 0) > 1;

  // A fresh `data-ds-claimed-at` counts as ownership, since the bridge stamps it before its first commit.
  const tickAndCheckClaim = (doc: Document): boolean => {
    const root = doc.getElementById(ROOT_ID);
    const href = hrefOf(doc.defaultView);
    const rootFilled = !!root?.querySelector(".deck-shelves-root");
    // Host window: Home is the bare document URL; every other screen is /routes/<…>.
    noteFallbackTick(gate, !href.includes("/routes/") || hrefIsHomeLike(href), rootFilled, Date.now(), bridgeHasFilledHome());
    return !fallbackRoot && Date.now() - Number(root?.dataset?.dsClaimedAt || 0) < 3000;
  };

  const fallbackShouldYield = (doc: Document): boolean => {
    // Switching to the desktop client keeps our mount alive under another skin, so tear it down here.
    if (isDesktopUiActive(doc)) {
      if (fallbackRoot) teardownPreviousFallbackRoot();
      fallbackRetries = 0;
      return true;
    }
    if (tickAndCheckClaim(doc)) return true;
    if (!isHomeVisible()) { fallbackRetries = 0; return true; }
    if (bridgeOwnsHome(doc)) {
      if (fallbackRoot && (fallbackMountEl !== doc.getElementById(ROOT_ID) || homeHasDuplicateContent(doc))) {
        teardownPreviousFallbackRoot();
      }
      return true;
    }
    return bridgeGraceActive(gate, Date.now());
  };

  // The body observer fires hundreds of times per second at boot, so coalesce to one call per frame.
  let fallbackPending: number | null = null;
  const scheduleFallback = () => {
    if (fallbackPending != null) return;
    fallbackPending = window.requestAnimationFrame(() => {
      fallbackPending = null;
      tryFallbackRender();
    });
  };
  // The Big Picture window can appear or change after install, so follow its body.
  let observedDoc: Document | null = null;
  let unlistenPageHide: (() => void) | null = null;
  const attachObserver = (doc: Document): void => {
    if (!doc || !doc.body || observedDoc === doc) return;
    observer?.disconnect();
    observedDoc = doc;
    observer = new MutationObserver(scheduleFallback);
    try { observer.observe(doc.body, { childList: true, subtree: true }); } catch {}
    // That document going away (renderer reload) restarts the mount poll.
    unlistenPageHide?.();
    const win = doc.defaultView;
    const onPageHide = () => fallbackPoll?.wake();
    try { win?.addEventListener("pagehide", onPageHide); unlistenPageHide = () => win?.removeEventListener("pagehide", onPageHide); } catch {}
  };

  const tryFallbackRender = () => {
    try {
      const { win, doc } = getHostContext();
      attachObserver(doc);
      // The gate re-reads the route and window here: a sole host has no router hook to tell it.
      getPowerState();
      if (fallbackShouldYield(doc)) return;
      const mount = ensureFallbackMount();
      if (!mount) return;
      // Any React mount sets the "react" marker, even the empty bridge, so it can't gate us.
      if (fallbackRoot && fallbackMountEl === mount && mount.isConnected && fallbackHostEl?.isConnected) return;
      mountFallbackTo(win, mount); recordRemountTry();
    } catch (err) {
      logWarn("HOME", "fallback render error", String(err));
    }
  };

  const { win: hostWin, doc: hostDoc } = getHostContext();
  observer?.disconnect();
  observedDoc = null; attachObserver(hostDoc); observerCreated();

  fallbackPoll?.dispose();
  fallbackPoll = installFallbackPoll(tryFallbackRender, () => !!fallbackRoot && !!fallbackHostEl?.isConnected);

  const onRouteSignal = () => tryFallbackRender();
  hostWin.addEventListener("hashchange", onRouteSignal);
  hostWin.addEventListener("popstate", onRouteSignal);
  globalThis.addEventListener?.("deck-shelves-settings-changed", onRouteSignal as EventListener);

  logInfo("HOME", "installHomePatch complete", { bridgeRegistered: gate.bridgeRegistered });

  const popAllUninstallHooks = (): void => {
    while (uninstallHooks.length) {
      const fn = uninstallHooks.pop();
      try { fn?.(); } catch {}
    }
  };

  const removeBridgeRegistration = (): void => {
    try { removeGlobalComponent?.(); removeGlobalComponent = null; } catch {}
    try { routerHook?.removeGlobalComponent?.(GLOBAL_COMPONENT_ID); } catch {}
    try { routerHook?.removeGlobalComponent?.(HomeDomBridge); } catch {}
  };

  const runUninstallHooks = (): void => {
    removeBridgeRegistration();
    popAllUninstallHooks();
  };

  const tearDownObserversAndListeners = (): void => {
    fallbackPoll?.dispose(); fallbackPoll = null;
    unlistenPageHide?.(); unlistenPageHide = null;
    if (observer) observerDisposed(); observer?.disconnect(); observer = null;
    hostWin.removeEventListener("hashchange", onRouteSignal); hostWin.removeEventListener("popstate", onRouteSignal);
    globalThis.removeEventListener?.("deck-shelves-settings-changed", onRouteSignal as EventListener);
  };

  const tearDownFallbackRoot = (): void => {
    teardownPreviousFallbackRoot();
    // The sole-host claim goes with the root, so a next instance's bridge can render.
    try { hostDoc.getElementById(ROOT_ID)?.remove(); delete (globalThis as any).__ds_sole_home_owned; } catch {}
  };

  return {
    uninstall() {
      logInfo("HOME", "uninstalling home patch");
      // Give Steam its Home back as it was: a successor anchors next to the native rows.
      applyHideHomeTabs(false); applyHideRecents(false); runUninstallHooks();
      tearDownObserversAndListeners(); tearDownFallbackRoot();
    },
  };
}
