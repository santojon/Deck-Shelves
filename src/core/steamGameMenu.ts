import { showContextMenu, getFrontendLib } from "../runtime/host/decky";
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../runtime/steamHost";
import { isSteamOS38OrLater } from "./steamOSVersion";
import { saveFocusTarget } from "./focusRestore";
import { steamAppStore, steamUIStore, steamReact, steamJsxRuntime } from "../steam/internals";
import { buildShelfContextMenu, buildLibraryAddToShelfItems } from "./menu/itemBuilders";
import {
  DS_ROOT_KEYS, buildDeckShelvesMenuItems, findCardAnchor, getActiveAppIdForMenu,
  resolveShelfIdByAppid, resolveShelfIdFromProps, setActiveShelfIdForMenu,
} from "./menu/menuContext";
import { getInjectedMenuComponent, injectDeckShelvesIntoTree } from "./menu/menuTreeInjection";
import { showFallbackMenu } from "./menu/fallbackMenu";
import { isGameMenuItemList, locateLibraryMenuClass } from "./menu/libraryMenuLocator";
import { installGameMenuEntries, type GameMenuEntriesEvent, type GameMenuListContext } from "./menu/gameMenuEntries";
import { registerDisposer } from "../runtime/runtimeDisposer";

export { buildShelfContextMenu, buildLibraryAddToShelfItems };

// Only a SteamOS build confirmed older than 3.8 uses the legacy flow; unknown hosts get the modern one.
function isLegacyMenuFlow(): boolean {
  return isSteamOS38OrLater() === false;
}

let cachedMenuComponent: any = null;
let prewarmAttempted = false;
let cachedMenuTemplateProps: Record<string, any> = {};
let lastExtractionAttempt = 0;
const EXTRACTION_COOLDOWN = 3000;
let passiveHookInstalled = false;
let showContextMenuHookInstalled = false;
let showGameMenuActive = false;

// Kept apart from the modern cache so a bad extraction on one path can't poison the other.
let legacyCachedComponent: any = null;
let legacyCachedTemplateProps: Record<string, any> = {};
let legacyLastAttempt = 0;

function getSteamReact(): any {
  return steamReact();
}

function getAppStore(): any {
  return steamAppStore();
}

// Gated on the active shelf id so native cards aren't affected.
let _libraryContextMenuClass: any = null;
let _libraryContextMenuPatched = false;
let _menuClassLookupDone = false;
function discoverLibraryContextMenuClass(): any {
  if (_libraryContextMenuClass || _menuClassLookupDone) return _libraryContextMenuClass;
  _menuClassLookupDone = true;
  _libraryContextMenuClass = locateLibraryMenuClass();
  return _libraryContextMenuClass;
}

type MenuCheckContext = { props?: any; appid?: number };

// One check for both the finder and the insert gate, so the two always agree.
function isGameMenuList(items: any, ctx: MenuCheckContext): boolean {
  return isGameMenuItemList(items, { ...ctx, menuClass: _libraryContextMenuClass });
}

function menuContextOf(props: any): MenuCheckContext {
  return { props, appid: appidFromSelfProps({ props }) };
}

function dedupDsMenuItems(items: any[]): void {
  if (!Array.isArray(items)) return;
  for (let i = items.length - 1; i >= 0; i--) {
    const k = items[i]?.key;
    if (typeof k !== "string") continue;
    // Per-shelf flat items are matched by prefix, or they pile up across re-renders.
    if (DS_ROOT_KEYS.has(k) || k.startsWith("ds-lib-add-") || k.startsWith("ds-lib-rm-") || k.startsWith("ds-card-add-") || k.startsWith("ds-card-rm-")) {
      items.splice(i, 1);
    }
  }
}

function appidFromSelfProps(self: any): number {
  try { return Number(self?.props?.overview?.appid) || 0; } catch { return 0; }
}

// The apps one list entry names: its overview, or its list of apps when that holds one app.
function appidsOfEntry(entry: any): number[] {
  const props = entry?.props ?? {};
  const single = Array.isArray(props.rgApps) && props.rgApps.length === 1 ? props.rgApps[0] : null;
  return [props.overview?.appid, single?.appid].map((id) => Number(id) || 0).filter((id) => id > 0);
}

// The one app a game menu list names through its own entries; 0 when it names none or several.
function appidNamedByList(menuItems: any[]): number {
  const named = new Set<number>();
  for (const entry of Array.isArray(menuItems) ? menuItems : []) {
    for (const appid of appidsOfEntry(entry)) named.add(appid);
  }
  return named.size === 1 ? [...named][0] : 0;
}

// Later renders get the menu body's props, which name no app, so the list's entries identify the game.
function resolveAppidFromMenuChildren(menuItems: any[], self: any): number {
  return appidFromSelfProps(self) || appidNamedByList(menuItems) || getActiveAppIdForMenu() || 0;
}

// The entries for one game menu: the shelf's actions when the game sits on a shelf, else "Add to shelf".
function libraryMenuEntriesFor({ list, props }: GameMenuListContext): unknown[] {
  const fl = getFrontendLib();
  const R = getSteamReact();
  if (!fl || !R) return [];
  const appid = resolveAppidFromMenuChildren(list, { props });
  const shelfId = resolveShelfIdByAppid(appid);
  if (shelfId) {
    bumpDebugCounter("lcmShelfCalls");
    return buildDeckShelvesMenuItems(shelfId, fl, R, appid);
  }
  bumpDebugCounter("lcmLibraryCalls");
  return appid > 0 ? buildLibraryAddToShelfItems(appid, fl, R) : [];
}

function makeMenuSeparator(): unknown {
  const fl = getFrontendLib();
  const R = getSteamReact();
  return fl?.MenuSeparator && R ? R.createElement(fl.MenuSeparator, { key: "ds-sep-boot" }) : null;
}

const PASS_COUNTERS: Partial<Record<GameMenuEntriesEvent["type"], string>> = {
  rejected: "lcmNoChildren", empty: "lcmNoAppid", placed: "lcmSplicedLib", failed: "lcmFailed",
};

function recordMenuEvent(event: GameMenuEntriesEvent): void {
  if (event.type === "installed" || event.type === "uninstalled") { setDebugCounter("lcmPatched", event.type === "installed"); return; }
  if (!("ms" in event)) return;
  bumpDebugCounter("lcmRenderCalls");
  const counter = PASS_COUNTERS[event.type];
  if (counter) bumpDebugCounter(counter);
  const bucket = getDebugBucket();
  if (bucket && event.ms > Number(bucket.lcmPassMsMax || 0)) bucket.lcmPassMsMax = Math.round(event.ms * 100) / 100;
}

const DEBUG_COUNTERS = ["lcmRenderCalls", "lcmLibraryCalls", "lcmShelfCalls", "lcmNoAppid", "lcmNoChildren", "lcmSplicedLib", "lcmFailed", "lcmPassMsMax"];

export function installLibraryContextMenuPatch(): void {
  if (_libraryContextMenuPatched) return;
  const cls = discoverLibraryContextMenuClass();
  if (!cls?.prototype?.render) return;
  ensureDebugBucket();
  setDebugCounter("lcmPatched", false);
  for (const key of DEBUG_COUNTERS) setDebugCounter(key, 0);
  const handle = installGameMenuEntries({
    menuClass: cls,
    isGameMenuList: (candidate, { props }) => isGameMenuList(candidate, menuContextOf(props)),
    entriesFor: libraryMenuEntriesFor,
    removeOwnEntries: dedupDsMenuItems,
    makeSeparator: makeMenuSeparator,
    onEvent: recordMenuEvent,
  });
  _libraryContextMenuPatched = handle !== null;
  // A plugin reload or hot-swap takes the patch off Steam's class.
  if (handle) registerDisposer(() => { handle.uninstall(); _libraryContextMenuPatched = false; });
}

type DebugBucket = Record<string, number | boolean>;

function getDebugBucket(): DebugBucket | null {
  try {
    const ds = (globalThis as any).deckShelves;
    if (!ds) return null;
    if (!ds.debug) ds.debug = {};
    return ds.debug as DebugBucket;
  } catch { return null; }
}

function ensureDebugBucket(): void {
  try {
    const g: any = (globalThis as any);
    if (!g.deckShelves) return;
    if (!g.deckShelves.debug) g.deckShelves.debug = {};
  } catch {}
}

function setDebugCounter(key: string, value: number | boolean): void {
  const bucket = getDebugBucket();
  if (bucket) bucket[key] = value;
}

function bumpDebugCounter(key: string): void {
  const bucket = getDebugBucket();
  if (!bucket) return;
  const cur = bucket[key];
  bucket[key] = (typeof cur === "number" ? cur : 0) + 1;
}

let _ctxMenuPatchInstalled = false;

export function installCreateContextMenuPatch(): void {
  if (_ctxMenuPatchInstalled) return;

  const cls = discoverLibraryContextMenuClass();
  if (!cls?.prototype?.render) return;

  try {
    const origBootstrap = cls.prototype.render;
    cls.prototype.render = function (this: any) {
      const self = this;
      const origDP = Object.defineProperty;
      let intercepted = false;
      (Object.defineProperty as any) = function (target: any, prop: PropertyKey, desc: PropertyDescriptor) {
        if (!intercepted && prop === "render" && target === self && typeof desc?.value === "function") {
          intercepted = true;
          Object.defineProperty = origDP;
          const X = desc.value;
          const wrappedX = function (this: any) {
            const ret = X.apply(this, arguments as any);
            try {
              const shelfId = resolveShelfIdFromProps(this?.props);
              if (shelfId) return injectDeckShelvesIntoTree(ret, shelfId);
            } catch {}
            return ret;
          };
          return origDP.call(Object, target, prop, { ...desc, value: wrappedX });
        }
        return origDP.apply(Object, [target, prop, desc] as any);
      };
      try {
        return origBootstrap.apply(this, arguments as any);
      } finally {
        Object.defineProperty = origDP;
      }
    };
    _ctxMenuPatchInstalled = true;
  } catch {}
}

function getSPDocument(): Document {
  return getPreferredSteamDocument();
}

function installCaptureHooks(): {
  getCaptured: () => { component: any; templateProps: Record<string, any> } | null;
  restore: () => void;
} {
  const React = getSteamReact();
  const jsxRuntime: any = steamJsxRuntime();

  const origCreateElement: any = React?.createElement;
  const origJsx: any = jsxRuntime?.jsx;
  const origJsxs: any = jsxRuntime?.jsxs;

  let captured: { component: any; templateProps: Record<string, any> } | null = null;

  const captureFromArgs = (type: any, props: any) => {
    if (captured) return;
    // Modern Steam wraps the menu in memo or forwardRef, so any component type is accepted.
    if (!type) return;
    if (!props || !("overview" in props) || !("client" in props)) return;
    const tProps = { ...props };
    delete tProps.overview;
    delete tProps.hasCustomArtwork;
    delete tProps.onChangeArtwork;
    captured = { component: type, templateProps: tProps };
  };

  if (React && typeof origCreateElement === "function") {
    React.createElement = function (type: any, props: any, ...args: any[]) {
      captureFromArgs(type, props);
      return origCreateElement.apply(React, [type, props, ...args]);
    };
  }
  if (jsxRuntime && typeof origJsx === "function") {
    jsxRuntime.jsx = function (type: any, props: any, key?: any) {
      captureFromArgs(type, props);
      return origJsx.call(jsxRuntime, type, props, key);
    };
  }
  if (jsxRuntime && typeof origJsxs === "function") {
    jsxRuntime.jsxs = function (type: any, props: any, key?: any) {
      captureFromArgs(type, props);
      return origJsxs.call(jsxRuntime, type, props, key);
    };
  }

  return {
    getCaptured: () => captured,
    restore: () => {
      if (React && typeof origCreateElement === "function") React.createElement = origCreateElement;
      if (jsxRuntime && typeof origJsx === "function") jsxRuntime.jsx = origJsx;
      if (jsxRuntime && typeof origJsxs === "function") jsxRuntime.jsxs = origJsxs;
    },
  };
}

export function prewarmMenuExtraction(): () => void {
  if (cachedMenuComponent) return () => {};
  // Once per session: each synthetic open can strand an empty modal overlay that freezes gamepad navigation.
  if (prewarmAttempted) return () => {};
  prewarmAttempted = true;
  // Skipped on legacy builds, where cold-boot extractions race the overlay timing.
  if (isLegacyMenuFlow()) return () => {};
  // The early tick captures the native menu factory before the recents row is replaced.
  const delays = [150, 500, 1500, 3500, 7000];
  const timers: any[] = [];
  for (const ms of delays) {
    timers.push(setTimeout(() => {
      if (cachedMenuComponent) return;
      lastExtractionAttempt = 0;
      try { extractAppContextMenu(); } catch {}
    }, ms));
  }
  return () => { for (const t of timers) clearTimeout(t); };
}

function isCapturableMenuProps(props: any): boolean {
  return !!(props && "overview" in props && "client" in props);
}

function sanitizeCapturedTemplateProps(props: any): Record<string, any> {
  const tProps = { ...props };
  delete tProps.overview;
  delete tProps.hasCustomArtwork;
  delete tProps.onChangeArtwork;
  return tProps;
}

function uninstallPassiveHookFns(React: any, jsxRuntime: any, originals: { ce: any; jsx: any; jsxs: any }): void {
  if (React && typeof originals.ce === "function") React.createElement = originals.ce;
  if (jsxRuntime && typeof originals.jsx === "function") jsxRuntime.jsx = originals.jsx;
  if (jsxRuntime && typeof originals.jsxs === "function") jsxRuntime.jsxs = originals.jsxs;
  passiveHookInstalled = false;
}

function makePassiveCaptureFn(React: any, jsxRuntime: any, originals: { ce: any; jsx: any; jsxs: any }) {
  return (type: any, props: any): boolean => {
    if (cachedMenuComponent || !type || !isCapturableMenuProps(props)) return false;
    cachedMenuComponent = type;
    cachedMenuTemplateProps = sanitizeCapturedTemplateProps(props);
    uninstallPassiveHookFns(React, jsxRuntime, originals);
    try { getInjectedMenuComponent(cachedMenuComponent); } catch {}
    return true;
  };
}

function installPassiveHookFns(React: any, jsxRuntime: any, originals: { ce: any; jsx: any; jsxs: any }, capture: (t: any, p: any) => boolean): void {
  if (React && typeof originals.ce === "function") {
    React.createElement = function (type: any, props: any, ...args: any[]) {
      capture(type, props);
      return originals.ce.apply(React, [type, props, ...args]);
    };
  }
  if (jsxRuntime && typeof originals.jsx === "function") {
    jsxRuntime.jsx = function (type: any, props: any, key?: any) {
      capture(type, props);
      return originals.jsx.call(jsxRuntime, type, props, key);
    };
  }
  if (jsxRuntime && typeof originals.jsxs === "function") {
    jsxRuntime.jsxs = function (type: any, props: any, key?: any) {
      capture(type, props);
      return originals.jsxs.call(jsxRuntime, type, props, key);
    };
  }
}

export function installPassiveMenuHook(): void {
  if (passiveHookInstalled || cachedMenuComponent) return;
  const React = getSteamReact();
  const jsxRuntime: any = steamJsxRuntime();
  if (!React?.createElement && typeof jsxRuntime?.jsx !== "function") return;
  const originals = { ce: React?.createElement, jsx: jsxRuntime?.jsx, jsxs: jsxRuntime?.jsxs };
  installPassiveHookFns(React, jsxRuntime, originals, makePassiveCaptureFn(React, jsxRuntime, originals));
  passiveHookInstalled = true;
}

export function installPassiveShowContextMenuHook(): void {
  if (showContextMenuHookInstalled) return;
  // Legacy builds only need the createElement hook.
  if (isLegacyMenuFlow()) return;
  const fl = getFrontendLib();
  if (!fl || typeof fl.showContextMenu !== "function") return;
  const orig = fl.showContextMenu;
  fl.showContextMenu = function (element: any, anchor: any, ...rest: any[]) {
    try {
      if (!cachedMenuComponent && element && typeof element.type === "function") {
        const props = element.props ?? {};
        if ("overview" in props && "client" in props) {
          cachedMenuComponent = element.type;
          const tProps = { ...props };
          delete tProps.overview;
          delete tProps.hasCustomArtwork;
          delete tProps.onChangeArtwork;
          cachedMenuTemplateProps = tProps;
          // Patch on capture so native renders also get the shelf items.
          try { getInjectedMenuComponent(cachedMenuComponent); } catch {}
        }
      }
    } catch {}
    return orig.apply(this, [element, anchor, ...rest]);
  };
  showContextMenuHookInstalled = true;
}

function isLegacyPanelCandidate(panel: Element): boolean {
  const cls = panel.className ?? "";
  if (cls.indexOf("ds-card") >= 0 || cls.indexOf("ds-row") >= 0) return false;
  return !!panel.querySelector("img");
}

function findMenuFnInFiber(panel: any): ((e: any) => void) | null {
  const fiberKey = Object.keys(panel).find((k: string) => k.startsWith("__reactFiber$"));
  if (!fiberKey) return null;
  let fiber = panel[fiberKey];
  for (let d = 0; d < 25 && fiber; d++) {
    const props = fiber.memoizedProps || fiber.pendingProps || {};
    if (typeof props.onMenuButton === "function") return props.onMenuButton;
    fiber = fiber.return;
  }
  return null;
}

function findLegacyMenuFn(doc: Document): ((e: any) => void) | null {
  for (const panel of Array.from(doc.querySelectorAll(".Panel.Focusable"))) {
    if (!isLegacyPanelCandidate(panel)) continue;
    const fn = findMenuFnInFiber(panel);
    if (fn) return fn;
  }
  return null;
}

// Opens Steam's real menu so the hook can capture it, then sends a synthetic Escape to close it.
function dismissSyntheticMenu(): void {
  // Sent to every Steam document, since the menu may render in another window.
  const docs = new Set<Document>([getSPDocument(), ...getAllSteamDocuments()].filter(Boolean) as Document[]);
  for (const doc of docs) {
    try {
      for (const type of ["keydown", "keyup"] as const) {
        const evt = new KeyboardEvent(type, { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true });
        doc.dispatchEvent(evt);
        doc.defaultView?.dispatchEvent(evt);
      }
    } catch {}
  }
}

// A synthetic open can commit after the dismiss schedule and leave an empty overlay that freezes navigation.
function runLegacyMenuCapture(menuFn: (e: any) => void): { component: any; templateProps: Record<string, any> } | null {
  const hooks = installCaptureHooks();
  try {
    const fakeEvt = new CustomEvent("fake", { bubbles: false });
    (fakeEvt as any).stopPropagation = () => {};
    (fakeEvt as any).preventDefault = () => {};
    menuFn(fakeEvt);
  } catch {
  } finally {
    hooks.restore();
  }
  const captured = hooks.getCaptured();
  if (captured) {
    // The menu can commit a tick or two later, so the dismiss repeats.
    dismissSyntheticMenu();
    setTimeout(dismissSyntheticMenu, 0);
    setTimeout(dismissSyntheticMenu, 50);
    setTimeout(dismissSyntheticMenu, 200);
  }
  return captured;
}

function extractAppContextMenuLegacy(): boolean {
  if (legacyCachedComponent) return true;
  const now = Date.now();
  if (now - legacyLastAttempt < EXTRACTION_COOLDOWN) return false;
  legacyLastAttempt = now;
  const doc = getSPDocument();
  const React = getSteamReact();
  if (!doc || !React?.createElement) return false;
  const menuFn = findLegacyMenuFn(doc);
  if (!menuFn) return false;
  const captured = runLegacyMenuCapture(menuFn);
  if (!captured) return false;
  legacyCachedComponent = captured.component;
  legacyCachedTemplateProps = captured.templateProps;
  try { getInjectedMenuComponent(legacyCachedComponent); } catch {}
  return true;
}

function resolveLegacyCardEl(doc: Document, appid: number): HTMLElement {
  return (doc.querySelector(`.ds-card[data-appid="${appid}"]`)
    ?? doc.querySelector(".ds-card.gpfocus")
    ?? doc.querySelector(".ds-card:focus")
    ?? doc.activeElement) as HTMLElement;
}

function resolveLegacyOwnerWindow(): any {
  return (getPreferredSteamWindow() as any)
    ?? steamUIStore()?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow
    ?? window;
}

function buildLegacyMenuElement(React: any, overview: any, shelfId: string | undefined): any {
  const ownerWindow = resolveLegacyOwnerWindow();
  const baseTarget = shelfId ? getInjectedMenuComponent(legacyCachedComponent) : legacyCachedComponent;
  // createElement so a class-component menu runs its patched render.
  const renderTarget = function DsFreshMenuLegacy(props: any) { return React.createElement(baseTarget, props); };
  const props = buildMenuProps(overview, ownerWindow, shelfId, legacyCachedTemplateProps);
  return React.createElement(renderTarget, props);
}

function renderLegacyCachedMenu(appid: number, shelfId?: string): boolean {
  const React = getSteamReact();
  const appStore = getAppStore();
  if (!React || !appStore || !legacyCachedComponent) return false;
  try {
    const overview = appStore.GetAppOverviewByAppID?.(appid);
    if (!overview) return false;
    const cardEl = resolveLegacyCardEl(getSPDocument(), appid);
    const menuElement = buildLegacyMenuElement(React, overview, shelfId);
    if (shelfId) setActiveShelfIdForMenu(shelfId, appid);
    presentMenuElement(menuElement, cardEl);
    return true;
  } catch {
    legacyCachedComponent = null;
    legacyCachedTemplateProps = {};
    return false;
  }
}

function showGameMenuLegacy(appid: number, shelfId?: string): boolean {
  if (!legacyCachedComponent) extractAppContextMenuLegacy();
  if (renderLegacyCachedMenu(appid, shelfId)) return true;
  if (!legacyCachedComponent) {
    legacyLastAttempt = 0;
    extractAppContextMenuLegacy();
    if (legacyCachedComponent && renderLegacyCachedMenu(appid, shelfId)) return true;
  }

  return false;
}

function isModernPanelCandidate(panel: Element): boolean {
  if (!isLegacyPanelCandidate(panel)) return false;
  const rect = (panel as HTMLElement).getBoundingClientRect();
  if (rect.width !== 0 && rect.height !== 0) return true;
  // Cards in the hidden native recents row have a zero rect but are real.
  return !!panel.closest('[data-ds-hidden-collapse="1"]');
}

function findModernMenuFn(doc: Document): ((e: any) => void) | null {
  for (const panel of Array.from(doc.querySelectorAll(".Panel.Focusable"))) {
    if (!isModernPanelCandidate(panel)) continue;
    const fn = findMenuFnInFiber(panel);
    if (fn) return fn;
  }
  return null;
}

function extractAppContextMenu(): boolean {
  if (cachedMenuComponent) return true;
  const now = Date.now();
  if (now - lastExtractionAttempt < EXTRACTION_COOLDOWN) return false;
  lastExtractionAttempt = now;
  const doc = getSPDocument();
  const React = getSteamReact();
  if (!doc || !React?.createElement) return false;
  const menuFn = findModernMenuFn(doc);
  if (!menuFn) return false;
  const captured = runLegacyMenuCapture(menuFn);
  if (!captured) return false;
  cachedMenuComponent = captured.component;
  cachedMenuTemplateProps = captured.templateProps;
  passiveHookInstalled = false;
  try { getInjectedMenuComponent(cachedMenuComponent); } catch {}
  return true;
}

function resolveOwnerWindow(anchorDoc?: Document): any {
  return (anchorDoc?.defaultView as any)
    ?? steamUIStore()?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow
    ?? (getPreferredSteamWindow() as any)
    ?? window;
}

function buildMenuProps(overview: any, ownerWindow: any, shelfId: string | undefined, base: Record<string, any>): any {
  return {
    ...base,
    overview,
    client: base.client ?? "mostavailable",
    launchSource: base.launchSource ?? 1000,
    bInGamepadUI: base.bInGamepadUI ?? true,
    strCollectionId: base.strCollectionId ?? "",
    ownerWindow: ownerWindow ?? base.ownerWindow,
    hasCustomArtwork: undefined,
    onChangeArtwork: undefined,
    ...(shelfId ? { _dsShelfId: shelfId } : {}),
  };
}

function presentMenuElement(menuElement: any, cardEl: HTMLElement): void {
  const fl = getFrontendLib();
  if (fl?.showContextMenu) fl.showContextMenu(menuElement, cardEl);
  else showContextMenu(menuElement, cardEl as any);
}

function buildFreshMenuElement(overview: any, anchorDoc: Document | undefined, shelfId: string | undefined): any {
  const React = getSteamReact();
  const baseTarget = shelfId ? getInjectedMenuComponent(cachedMenuComponent) : cachedMenuComponent;
  // createElement, not a direct call: the captured menu is a class on some clients, and calling it skips the patched render.
  const renderTarget = function DsFreshMenu(props: any) { return React.createElement(baseTarget, props); };
  const props = buildMenuProps(overview, resolveOwnerWindow(anchorDoc), shelfId, cachedMenuTemplateProps);
  return React.createElement(renderTarget, props);
}

function readyToRenderCachedMenu(): boolean {
  return !!(getSteamReact() && getAppStore() && cachedMenuComponent);
}

function renderCachedMenuOnce(appid: number, shelfId?: string): boolean {
  if (!readyToRenderCachedMenu()) return false;
  try {
    const overview = getAppStore().GetAppOverviewByAppID?.(appid);
    if (!overview) return false;
    const anchor = findCardAnchor(appid);
    const cardEl = (anchor?.el ?? getSPDocument().activeElement) as HTMLElement;
    if (shelfId) setActiveShelfIdForMenu(shelfId, appid);
    presentMenuElement(buildFreshMenuElement(overview, anchor?.doc, shelfId), cardEl);
    return true;
  } catch {
    cachedMenuComponent = null;
    cachedMenuTemplateProps = {};
    return false;
  }
}

function tryShowGameMenuNative(appid: number, shelfId?: string): boolean {
  try {
    installPassiveMenuHook();
    if (!cachedMenuComponent) extractAppContextMenu();
    if (renderCachedMenuOnce(appid, shelfId)) return true;
    if (!cachedMenuComponent) {
      lastExtractionAttempt = 0;
      extractAppContextMenu();
      if (renderCachedMenuOnce(appid, shelfId)) return true;
    }
  } catch {
    cachedMenuComponent = null;
    cachedMenuTemplateProps = {};
  }
  return false;
}

function tryShowGameMenuLegacyWrapped(appid: number, shelfId?: string): boolean {
  try { return showGameMenuLegacy(appid, shelfId); }
  catch {
    legacyCachedComponent = null;
    legacyCachedTemplateProps = {};
    return false;
  }
}

export function showGameMenu(appid: number, shelfId?: string): void {
  if (showGameMenuActive) return;
  showGameMenuActive = true;
  // Native menu actions bypass onActivate, so focus is saved here for restoring on B.
  try { if (appid > 0) saveFocusTarget(appid, shelfId); } catch {}
  try {
    if (isLegacyMenuFlow()) {
      if (tryShowGameMenuLegacyWrapped(appid, shelfId)) return;
    } else if (tryShowGameMenuNative(appid, shelfId)) {
      return;
    }
    showFallbackMenu(appid, shelfId);
  } finally {
    showGameMenuActive = false;
  }
}
