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

/* Only a SteamOS build confirmed older than 3.8 uses the legacy menu flow.
   Unknown / non-SteamOS hosts (Windows, macOS, desktop-Linux Steam —
   getSteamOSVersion() is null there, so isSteamOS38OrLater() is null, not false)
   fall through to the MODERN flow, which is correct for every current client. */
function isLegacyMenuFlow(): boolean {
  return isSteamOS38OrLater() === false;
}

let cachedMenuComponent: any = null;
// Guards the synthetic-open prewarm to one run per session (see its own note).
let prewarmAttempted = false;
let cachedMenuTemplateProps: Record<string, any> = {};
let lastExtractionAttempt = 0;
const EXTRACTION_COOLDOWN = 3000;
let passiveHookInstalled = false;
let showContextMenuHookInstalled = false;
let showGameMenuActive = false;

/* Independent legacy (≤ 3.7) cache — never shared with the modern path.
   Sharing the cache would let a partially-corrupted modern extraction
   poison the legacy fallback (and vice-versa). Two distinct sets of state
   also let us run the v1.2.0 recursive retry without disturbing modern
   runs interleaved on the same session. */
let legacyCachedComponent: any = null;
let legacyCachedTemplateProps: Record<string, any> = {};
let legacyLastAttempt = 0;

function getSteamReact(): any {
  return steamReact();
}

function getAppStore(): any {
  return steamAppStore();
}

// Direct webpack patch of LibraryContextMenu.prototype.render. Gated
// on _activeShelfIdForMenu so native cards aren't affected.
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
    /* Exact match on group-level keys + prefix match on the per-shelf
       flat items the library-card path emits (one MenuItem per shelf,
       key like `ds-lib-add-s_7b1a8487`). Without the prefix check, the
       flat items accumulated across re-renders. */
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

/* On a menu's first render the props are the game menu's own; on later renders they are the
   menu body's, which name no app, so the list's own entries say which game it is. The card
   that opened the menu is the last resort. */
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

// Debug tap, surfaced through `window.deckShelves.debug` for probes over CDP.
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
    if (!g.deckShelves) return; // not installed yet — debug fields no-op
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

/* `getFrontendLib` — the host-parametric lib-object resolver — is imported from
   the host adapter (see the top import). It is THE single place that maps a
   loader global (`DFL`) or a neutral host (`__SHELVES_HOST__.ui`) to the UI
   surface; the menu code below just calls it, never re-derives the chain. */

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
    // Accept any component type — modern Steam wraps `AppContextMenu` in
    /* `React.memo` (an object with `$$typeof === Symbol.for('react.memo')`)
       or `React.forwardRef`, so the previous `typeof type !== "function"`
       gate silently rejected the real captures and forced every shelf-card
       menu into the fallback path. The `overview + client` props signature is
       unique to `AppContextMenu`, so it's a sufficient filter on its own. */
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
  /* Once per session, not once per Home mount. This schedules synthetic menu
     opens, and each one can strand an empty modal overlay that captures the
     gamepad focus context (observed live: a childless `ModalDialogOverlay_*`
     nav tree, no `.gpfocus`, navigation dead — and Escape does NOT clear it). */
  /* Re-running on every return to Home meant 5 more chances to strand one each
     time the capture hadn't succeeded. The passive hook still captures the menu
     whenever the user opens one for real, so nothing is permanently lost. */
  if (prewarmAttempted) return () => {};
  prewarmAttempted = true;
  /* Skip on legacy (≤ 3.7): the flow extracts lazily on the first
     MENU press; firing 5 staggered extractions on cold boot hit a race in
     3.7's overlay timing where the panels iteration finds the right fiber
     but the synthetic `onMenuButton` call mutates `lastExtractionAttempt`
     before the user ever interacts. */
  if (isLegacyMenuFlow()) return () => {};
  // Early 150ms tick runs before the recents replacement swaps the native
  // row's games on most devices, so the native `{overview, client}` menu
  // factory is captured first.
  const delays = [150, 500, 1500, 3500, 7000];
  const timers: any[] = [];
  for (const ms of delays) {
    timers.push(setTimeout(() => {
      if (cachedMenuComponent) return;
      lastExtractionAttempt = 0; // bypass cooldown — we want every delay to actually try
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
  /* Legacy (≤ 3.7): rely on the React.createElement hook only. The frontend-lib
     showContextMenu wrapper was added for 3.8/3.9-only paths where Steam
     sometimes constructs the menu element via a module-bound reference
     before the createElement hook installs; pre-3.8 the createElement
     capture is sufficient on its own. */
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
          // See tryCapture in installPassiveMenuHook — patch on capture so
          // native renders also gain DS items via resolveShelfIdFromProps.
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

/* `menuFn` is Steam's own onMenuButton handler — calling it for real opens
   a real menu overlay as a side effect of letting Steam render it (that's
   how the createElement hook gets a chance to see it). Dispatch a synthetic
   Escape right after, the same "cancel" signal GamepadUI's own B-button
   sends, so the capture never leaves a menu visibly open on screen. */
function dismissSyntheticMenu(): void {
  /* Dispatch on every known Steam document (not just the one getSPDocument()
     guesses) — the menu can render in a different window than the one this
     resolver picks, and a dismiss aimed at the wrong window silently does
     nothing, leaving the menu stuck on screen. */
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

/* A synthetic menu open can commit AFTER a fixed dismiss schedule has run,
   leaving an empty modal overlay registered in the gamepad nav tree that
   captures the focus context and freezes navigation (observed live: an extra
   `ModalDialogOverlay_*` tree with zero children holding lastFocus, and no
   `.gpfocus` anywhere, while the shelves rendered fine). */
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
    /* The capture happens synchronously inside menuFn(), but the menu
       manager's actual open (via a ref/context, not a plain synchronous
       DOM write) can commit on a later tick — dismissing only once, right
       here, can fire before that commit and leave the menu stuck visible.
       Repeat over the next couple of ticks/frames to catch it either way. */
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
  // See buildFreshMenuElement — render via createElement so a class-component menu
  // (beta) is instantiated and its patched render runs, not called as a function.
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
  /* Zero rect normally means "not really rendered" — except inside the
     native recents row we collapse via display:none (homePatch.tsx). Those
     cards are real, just visually hidden, and the only native menu source
     available on the home once hidden. */
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
  // Render via React.createElement, not `baseTarget(props)` — the captured menu is
  // a plain function on the stable client but a CLASS on the beta, and calling a
  // class as a function bypasses its (patched) render, so our items never inject.
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
  // Native menu actions (Customize Artwork, Properties, …) bypass our
  // onActivate, so save focus here for B-back restoration.
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
