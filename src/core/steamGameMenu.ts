import { showContextMenu } from "@decky/ui";
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../runtime/steamHost";
import { isSteamOS38OrLater } from "./steamOSVersion";
import i18n from "../i18n";

/**
 * Returns `true` when this device should use the pre-3.8 (v1.4.0-style) menu
 * extraction flow. Conservative default: only `true` when we explicitly
 * detect SteamOS ≤ 3.7. Unknown / 3.8+ keep the current path.
 */
function useLegacyMenuFlow(): boolean {
  return isSteamOS38OrLater() === false;
}

let cachedMenuComponent: any = null;
let cachedMenuTemplateProps: Record<string, any> = {};
let lastExtractionAttempt = 0;
const EXTRACTION_COOLDOWN = 3000;
let passiveHookInstalled = false;
let showContextMenuHookInstalled = false;
let showGameMenuActive = false;

// Independent legacy (≤ 3.7) cache — never shared with the modern path.
// Sharing the cache would let a partially-corrupted modern extraction
// poison the legacy fallback (and vice-versa). Two distinct sets of state
// also let us run the v1.2.0 recursive retry without disturbing modern
// runs interleaved on the same session.
let legacyCachedComponent: any = null;
let legacyCachedTemplateProps: Record<string, any> = {};
let legacyLastAttempt = 0;

function getSteamReact(): any {
  return (globalThis as any).SP_REACT;
}

function getAppStore(): any {
  return (globalThis as any).appStore;
}

// Cache of patched/wrapped captured components so we patch each component
// at most once and can dedupe across showGameMenu calls.
const patchedComponents = new WeakSet<any>();
const wrappedComponents = new WeakMap<any, any>();

/**
 * Builds the Deck Shelves > Shelf submenu items as DFL `MenuItem` elements.
 * Reads live shelf state from `settingsStore` so labels (Hide vs Show, dirs
 * disabled at boundaries) reflect the current configuration.
 *
 * Returns an array of items meant to be appended to either:
 *  - the captured native menu (after we located its `Menu` element via
 *    `findInReactTree`), or
 *  - the DFL fallback menu (rebuilt from scratch).
 *
 * Lazy-imports the action handlers so this module stays Decky-only and free
 * of cross-cutting React imports — handlers go through `core/shelfActions.ts`
 * which talks to `settingsStore` directly + dispatches Edit / Delete to the
 * QAM-mounted modal handler.
 */
function buildDeckShelvesMenuItems(shelfId: string, dfl: any, R: any): any[] {
  if (!dfl?.MenuItem || !R?.createElement) return [];
  let getCurrentSettings: any, actions: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getCurrentSettings = require("../store/settingsStore").getCurrentSettings;
    actions = require("./shelfActions");
  } catch { return []; }

  const settings = getCurrentSettings?.();
  if (!settings) return [];
  const idx = (settings.shelves ?? []).findIndex((sh: any) => sh.id === shelfId);
  if (idx < 0) return [];
  const shelf = settings.shelves[idx];
  const lastIdx = settings.shelves.length - 1;
  const isHidden = !!shelf.hidden;
  let isCollapsed = false;
  try { isCollapsed = (globalThis as any).localStorage?.getItem?.(`ds-collapsed-${shelfId}`) === "1"; } catch {}

  // The bundle owns its own i18next instance — `globalThis.i18next` is the
  // host's, which doesn't have our keys. Always call our local `i18n.t`.
  const lbl = (key: string, fallback: string): string => {
    try { const v = i18n.t(key as any); return (typeof v === "string" && v && v !== key) ? v : fallback; } catch { return fallback; }
  };
  const copySuffix = lbl("copySuffix", "(copy)");

  const mk = (key: string, label: string, onSelect: () => void, disabled = false): any =>
    R.createElement(dfl.MenuItem, { key, disabled, onSelected: onSelect }, label);

  const items: any[] = [
    mk("ds-edit", lbl("editShelf", "Edit"), () => actions.dispatchShelfModal("edit", shelfId)),
    mk("ds-duplicate", lbl("duplicateShelf", "Duplicate"), () => { actions.duplicateShelfById(shelfId, copySuffix); }),
    mk("ds-collapse",
      isCollapsed ? lbl("expand_shelf", "Expand shelf") : lbl("collapse_shelf", "Collapse shelf"),
      () => { actions.setShelfCollapsed(shelfId, !isCollapsed); }),
    mk("ds-hide",
      isHidden ? lbl("show_shelf", "Show shelf") : lbl("hide_shelf", "Hide shelf"),
      () => { actions.toggleShelfHiddenById(shelfId); }),
    mk("ds-move-up", lbl("move_up", "Move up"), () => { actions.moveShelfById(shelfId, -1); }, idx <= 0),
    mk("ds-move-down", lbl("move_down", "Move down"), () => { actions.moveShelfById(shelfId, 1); }, idx >= lastIdx),
    mk("ds-delete", lbl("deleteShelf", "Delete"), () => actions.dispatchShelfModal("delete", shelfId)),
  ];

  // Wrap inside `Deck Shelves > Shelf` submenu when MenuGroup is available;
  // otherwise emit the items inline (legacy DFL fallback).
  if (dfl.MenuGroup) {
    const inner = R.createElement(dfl.MenuGroup, { key: "ds-submenu-shelf", label: lbl("menu_shelf", "Shelf") }, ...items);
    const outer = R.createElement(dfl.MenuGroup, { key: "ds-submenu-deckshelves", label: lbl("menu_deck_shelves", "Deck Shelves") }, inner);
    return [outer];
  }
  return items;
}

/**
 * Locates the outermost `Menu` element in the rendered tree and appends the
 * Deck Shelves submenu as additional children. Same shape as the seam used
 * by HLTB / cheatdeck / SDH-PauseGames to extend the native game menu.
 *
 * Mutates the existing element's `props.children` rather than replacing the
 * element so React's reconciliation key flow stays consistent.
 */
function injectDeckShelvesIntoTree(rendered: any, shelfId: string): any {
  if (!rendered) {
    if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] inject skipped — rendered is null"); } catch {}
    return rendered;
  }
  const dfl = getDFL();
  const R = getSteamReact();
  if (!dfl?.findInReactTree) {
    if ((globalThis as any).__DEV__) try { (globalThis as any).console?.warn?.("[DS][menu] inject skipped — dfl.findInReactTree unavailable"); } catch {}
    return rendered;
  }
  try {
    // Broader Menu detection — the captured AppContextMenu may render the
    // outermost Menu using a Steam-internal class that is NOT identical to
    // `dfl.Menu`, so we accept ANY node with a string `label` whose
    // `children` is iterable (the canonical Menu shape across SteamOS 3.5–3.9).
    const menu = dfl.findInReactTree(rendered, (node: any) => {
      if (!node || typeof node !== "object" || !node.props) return false;
      if (node.type === dfl.Menu) return true;
      if (typeof node.props.label !== "string") return false;
      const ch = node.props.children;
      return Array.isArray(ch) || (ch !== undefined && ch !== null);
    });
    if (!menu || !menu.props) {
      if ((globalThis as any).__DEV__) try { (globalThis as any).console?.warn?.("[DS][menu] Menu node not found in captured tree", { shelfId, treeKind: rendered?.type?.displayName ?? typeof rendered?.type }); } catch {}
      return rendered;
    }
    const items = buildDeckShelvesMenuItems(shelfId, dfl, R);
    if (!items.length) {
      if ((globalThis as any).__DEV__) try { (globalThis as any).console?.warn?.("[DS][menu] no items to inject — buildDeckShelvesMenuItems returned []"); } catch {}
      return rendered;
    }
    const existing = Array.isArray(menu.props.children)
      ? menu.props.children
      : (menu.props.children !== undefined ? [menu.props.children] : []);
    menu.props.children = [...existing, ...items];
    if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] injected", { shelfId, label: menu.props.label, before: existing.length, added: items.length }); } catch {}
    return rendered;
  } catch (e) {
    try { (globalThis as any).console?.warn?.("[DS][menu] injectDeckShelvesIntoTree threw", e); } catch {}
    return rendered;
  }
}

/**
 * Returns the captured menu component wrapped so its rendered output gains
 * the Deck Shelves submenu when `_dsShelfId` is present in props.
 *
 * Three target shapes are handled (covers every Steam Deck capture observed
 * on 3.5–3.9): class component (afterPatch on `prototype.render`),
 * forwardRef (afterPatch on `.render`), plain function (HOC wrapper that
 * calls the inner function and patches its result tree).
 */
function getInjectedMenuComponent(inner: any): any {
  if (!inner) return inner;
  const dfl = getDFL();
  if (!dfl) {
    if ((globalThis as any).__DEV__) try { (globalThis as any).console?.warn?.("[DS][menu] inject skipped — DFL not available"); } catch {}
    return inner;
  }

  // Class component path — afterPatch on prototype.render preserves the
  // original component identity so React's reconciliation isn't disturbed.
  if (typeof dfl.afterPatch === "function") {
    if (inner?.prototype && typeof inner.prototype.render === "function") {
      if (!patchedComponents.has(inner)) {
        try {
          dfl.afterPatch(inner.prototype, "render", function (this: any, _args: any[], result: any) {
            const shelfId = this?.props?._dsShelfId;
            if (shelfId) return injectDeckShelvesIntoTree(result, shelfId);
            return result;
          });
          patchedComponents.add(inner);
          if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] afterPatch installed (class)", { name: inner.name ?? inner?.displayName ?? "<anon>" }); } catch {}
        } catch (e) { try { (globalThis as any).console?.warn?.("[DS][menu] afterPatch class failed", e); } catch {} }
      }
      return inner;
    }
    if (typeof inner.render === "function" && inner.render !== inner) {
      // forwardRef shape
      if (!patchedComponents.has(inner)) {
        try {
          dfl.afterPatch(inner, "render", function (_args: any[], result: any) {
            const props = _args?.[0];
            const shelfId = props?._dsShelfId;
            if (shelfId) return injectDeckShelvesIntoTree(result, shelfId);
            return result;
          });
          patchedComponents.add(inner);
          if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] afterPatch installed (forwardRef)", { name: inner.displayName ?? "<forwardRef>" }); } catch {}
        } catch (e) { try { (globalThis as any).console?.warn?.("[DS][menu] afterPatch forwardRef failed", e); } catch {} }
      }
      return inner;
    }
  }

  // Plain function component fallback — wrap and call directly. AppContextMenu
  // is typically pure (no hooks), so calling it outside the React reconciler
  // is safe; if the inner ever starts using hooks we'd see immediate React
  // warnings and can switch to a different seam.
  if (typeof inner === "function") {
    const cached = wrappedComponents.get(inner);
    if (cached) return cached;
    const wrapped = function DSPatchedAppContextMenu(props: any) {
      const result = (inner as any)(props);
      const shelfId = props?._dsShelfId;
      if (shelfId) return injectDeckShelvesIntoTree(result, shelfId);
      return result;
    };
    wrappedComponents.set(inner, wrapped);
    if ((globalThis as any).__DEV__) try { (globalThis as any).console?.info?.("[DS][menu] HOC wrapper created (function)", { name: inner.name ?? inner?.displayName ?? "<anon>" }); } catch {}
    return wrapped;
  }

  if ((globalThis as any).__DEV__) try { (globalThis as any).console?.warn?.("[DS][menu] no patch path matched — captured component is neither class/forwardRef/function", { kind: typeof inner, name: inner?.name ?? inner?.displayName }); } catch {}
  return inner;
}

function getDFL(): any {
  return (globalThis as any).DFL ?? (globalThis as any).deckyFrontendLib ?? (globalThis as any).window?.DFL;
}

function getSPDocument(): Document {
  return getPreferredSteamDocument();
}

/**
 * Steam's native game-card `onMenuButton` handler builds the
 * `{overview, client, …}` AppContextMenu element via either
 * `React.createElement` (older Steam builds, mixed code paths) or the
 * React 18 JSX runtime `SP_JSX.jsx` / `SP_JSX.jsxs` (every recent build,
 * including BOTH SteamOS 3.7.21 stable AND 3.8/3.9 — confirmed via CDP).
 *
 * Patching only `React.createElement` (as the v1.x series did) silently
 * misses the JSX-runtime path, leaving `cachedComponent` null forever and
 * forcing the menu into the DFL fallback. This helper installs hooks on
 * all three primitives under a single capture flag and returns a
 * `restore()` plus a getter for the captured component + sanitised
 * template props. Idempotent: the same `onCapture` callback fires on
 * whichever primitive Steam happens to use.
 */
function installCaptureHooks(): {
  getCaptured: () => { component: any; templateProps: Record<string, any> } | null;
  restore: () => void;
} {
  const React = getSteamReact();
  const jsxRuntime: any = (globalThis as any).SP_JSX;

  const origCreateElement: any = React?.createElement;
  const origJsx: any = jsxRuntime?.jsx;
  const origJsxs: any = jsxRuntime?.jsxs;

  let captured: { component: any; templateProps: Record<string, any> } | null = null;

  const captureFromArgs = (type: any, props: any) => {
    if (captured) return;
    if (typeof type !== "function") return;
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

/**
 * Resolve the card anchor across every Steam window we know about. DS cards
 * live in the GamepadUI popup while the plugin bundle (and the menu
 * interceptor) runs in SharedJSContext — querying only the preferred doc
 * misses the card and the context menu ends up anchored to <body>, which
 * DFL renders off-screen.
 *
 * Used only by the modern (3.8+) path. The legacy (≤ 3.7) flow does its
 * own single-document anchor lookup inline in `showGameMenuLegacy`.
 */
function findCardAnchor(appid: number): { doc: Document; el: HTMLElement } | null {
  for (const d of getAllSteamDocuments()) {
    const el = (
      d.querySelector(`.ds-card[data-appid="${appid}"]`) ??
      d.querySelector(".ds-card.gpfocus") ??
      d.querySelector(".ds-card:focus")
    ) as HTMLElement | null;
    if (el) return { doc: d, el };
  }
  return null;
}

/**
 * Prewarm the context-menu cache shortly after plugin mount. On cold start
 * (Steam restart), the native library panels may not be rendered yet when the
 * plugin first mounts, so the first extraction attempt fails and the menu
 * button stops responding until the user manually opens a native menu. This
 * function retries extraction at 500ms / 1500ms / 3500ms / 7000ms, bypassing
 * the normal cooldown. Idempotent: stops once the cache is populated.
 *
 * Extraction is attempted regardless of SteamOS version — empirically, some
 * 3.9+ builds still render the `{overview, client}` template, so skipping by
 * version was causing false negatives where the real menu was available.
 * If extraction fails on every retry, showGameMenu silently falls through to
 * the DFL menu (Play / Properties / View Details).
 */
export function prewarmMenuExtraction(): () => void {
  if (cachedMenuComponent) return () => {};
  // Skip on legacy (≤ 3.7): the flow extracts lazily on the first
  // MENU press; firing 5 staggered extractions on cold boot hit a race in
  // 3.7's overlay timing where the panels iteration finds the right fiber
  // but the synthetic `onMenuButton` call mutates `lastExtractionAttempt`
  // before the user ever interacts.
  if (useLegacyMenuFlow()) return () => {};
  // Early 150ms tick runs before `recentsReplace` overwrites the native
  // card content on most devices, so we can capture the native
  // `{overview, client}` menu factory before the overlay injection.
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

export function installPassiveMenuHook(): void {
  if (passiveHookInstalled || cachedMenuComponent) return;
  const React = getSteamReact();
  const jsxRuntime: any = (globalThis as any).SP_JSX;
  if (!React?.createElement && typeof jsxRuntime?.jsx !== "function") return;

  // Persistent passive hook — captures the {overview, client} template the
  // first time ANY native game menu is opened (e.g. user right-clicks a
  // native card, or a `prewarmMenuExtraction` tick fires). Patches all
  // three primitives (createElement + jsx + jsxs) so it works on every
  // build (3.7 emits via jsx, 3.8/3.9 also emits via jsx). Self-uninstalls
  // on first capture to avoid persistent overhead.
  const origCreateElement: any = React?.createElement;
  const origJsx: any = jsxRuntime?.jsx;
  const origJsxs: any = jsxRuntime?.jsxs;

  const tryCapture = (type: any, props: any) => {
    if (cachedMenuComponent) return false;
    if (typeof type !== "function") return false;
    if (!props || !("overview" in props) || !("client" in props)) return false;
    cachedMenuComponent = type;
    const tProps = { ...props };
    delete tProps.overview;
    delete tProps.hasCustomArtwork;
    delete tProps.onChangeArtwork;
    cachedMenuTemplateProps = tProps;
    if (React && typeof origCreateElement === "function") React.createElement = origCreateElement;
    if (jsxRuntime && typeof origJsx === "function") jsxRuntime.jsx = origJsx;
    if (jsxRuntime && typeof origJsxs === "function") jsxRuntime.jsxs = origJsxs;
    passiveHookInstalled = false;
    return true;
  };

  if (React && typeof origCreateElement === "function") {
    React.createElement = function (type: any, props: any, ...args: any[]) {
      tryCapture(type, props);
      return origCreateElement.apply(React, [type, props, ...args]);
    };
  }
  if (jsxRuntime && typeof origJsx === "function") {
    jsxRuntime.jsx = function (type: any, props: any, key?: any) {
      tryCapture(type, props);
      return origJsx.call(jsxRuntime, type, props, key);
    };
  }
  if (jsxRuntime && typeof origJsxs === "function") {
    jsxRuntime.jsxs = function (type: any, props: any, key?: any) {
      tryCapture(type, props);
      return origJsxs.call(jsxRuntime, type, props, key);
    };
  }
  passiveHookInstalled = true;
}

/**
 * Persistent hook on `DFL.showContextMenu` that captures the native menu
 * component whenever Steam opens a context menu for a game — covers paths
 * the `React.createElement` capture misses (e.g. showContextMenu invoked
 * via internal Steam code that constructs the element before we installed
 * the createElement hook). Stays installed for the life of the session;
 * the guard `cachedMenuComponent` makes the capture a single-shot, the
 * wrapper itself just passes through after that.
 */
export function installPassiveShowContextMenuHook(): void {
  if (showContextMenuHookInstalled) return;
  // Legacy (≤ 3.7): rely on the React.createElement hook only. The DFL
  // showContextMenu wrapper was added for 3.8/3.9-only paths where Steam
  // sometimes constructs the menu element via a module-bound reference
  // before the createElement hook installs; pre-3.8 the createElement
  // capture is sufficient on its own.
  if (useLegacyMenuFlow()) return;
  const dfl = getDFL();
  if (!dfl || typeof dfl.showContextMenu !== "function") return;
  const orig = dfl.showContextMenu;
  dfl.showContextMenu = function (element: any, anchor: any, ...rest: any[]) {
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
        }
      }
    } catch {}
    return orig.apply(this, [element, anchor, ...rest]);
  };
  showContextMenuHookInstalled = true;
}

/**
 * Pure v1.2.0 extraction port — used only on SteamOS ≤ 3.7. Identical
 * iteration / fiber walk / React.createElement hook as the original; uses
 * its own cache (`legacyCachedComponent` / `legacyCachedTemplateProps`)
 * so the modern path can't poison it and vice-versa.
 *
 * No prewarm, no DFL.showContextMenu hook, no cross-window walk, no
 * `getBoundingClientRect` rect filter, no cooldown bypass tricks — just
 * the same code that worked on 3.7.21 in the v1.2/v1.3/v1.4 series.
 */
function extractAppContextMenuLegacy(): boolean {
  if (legacyCachedComponent) return true;
  const now = Date.now();
  if (now - legacyLastAttempt < EXTRACTION_COOLDOWN) return false;
  legacyLastAttempt = now;

  const doc = getSPDocument();
  const React = getSteamReact();
  if (!doc || !React?.createElement) return false;

  const panels = doc.querySelectorAll(".Panel.Focusable");
  let menuFn: ((e: any) => void) | null = null;

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const cls = panel.className ?? "";
    if (cls.indexOf("ds-card") >= 0 || cls.indexOf("ds-row") >= 0) continue;
    if (!panel.querySelector("img")) continue;

    const fiberKey = Object.keys(panel).find((k: string) => k.startsWith("__reactFiber$"));
    if (!fiberKey) continue;
    let fiber = (panel as any)[fiberKey];

    for (let d = 0; d < 25 && fiber; d++) {
      const props = fiber.memoizedProps || fiber.pendingProps || {};
      if (typeof props.onMenuButton === "function") {
        menuFn = props.onMenuButton;
        break;
      }
      fiber = fiber.return;
    }
    if (menuFn) break;
  }

  if (!menuFn) return false;

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
    legacyCachedComponent = captured.component;
    legacyCachedTemplateProps = captured.templateProps;
    return true;
  }

  return false;
}

/**
 * Pure v1.2.0 render port. Returns `true` if the native menu was rendered
 * (so the caller can skip the DFL fallback), `false` if extraction failed
 * even after the recursive retry — caller falls through to DFL fallback.
 */
function showGameMenuLegacy(appid: number, shelfId?: string): boolean {
  if (!legacyCachedComponent) extractAppContextMenuLegacy();

  const React = getSteamReact();
  const appStore = getAppStore();

  if (React && appStore && legacyCachedComponent) {
    try {
      const overview = appStore.GetAppOverviewByAppID?.(appid);
      if (overview) {
        const doc = getSPDocument();
        const cardEl = (doc.querySelector(`.ds-card[data-appid="${appid}"]`)
          ?? doc.querySelector(".ds-card.gpfocus")
          ?? doc.querySelector(".ds-card:focus")
          ?? doc.activeElement) as HTMLElement;

        const ownerWindow = (getPreferredSteamWindow() as any)
          ?? (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow
          ?? window;

        const renderTarget = shelfId
          ? getInjectedMenuComponent(legacyCachedComponent)
          : legacyCachedComponent;
        const menuElement = React.createElement(renderTarget, {
          ...legacyCachedTemplateProps,
          overview,
          client: legacyCachedTemplateProps.client ?? "mostavailable",
          launchSource: legacyCachedTemplateProps.launchSource ?? 1000,
          bInGamepadUI: legacyCachedTemplateProps.bInGamepadUI ?? true,
          strCollectionId: legacyCachedTemplateProps.strCollectionId ?? "",
          ownerWindow: ownerWindow ?? legacyCachedTemplateProps.ownerWindow,
          hasCustomArtwork: undefined,
          onChangeArtwork: undefined,
          ...(shelfId ? { _dsShelfId: shelfId } : {}),
        });

        const dfl = getDFL();
        if (dfl?.showContextMenu) {
          dfl.showContextMenu(menuElement, cardEl);
        } else {
          showContextMenu(menuElement, cardEl as any);
        }
        return true;
      }
    } catch {
      legacyCachedComponent = null;
      legacyCachedTemplateProps = {};
    }
  }

  // v1.2.0 recursive retry: if extraction was empty, force a re-attempt
  // (cooldown bypass) and recurse exactly once. The outer `showGameMenu`
  // wraps this in `showGameMenuActive`, so we cannot loop indefinitely.
  if (!legacyCachedComponent) {
    legacyLastAttempt = 0;
    extractAppContextMenuLegacy();
    if (legacyCachedComponent) {
      return showGameMenuLegacy(appid, shelfId);
    }
  }

  return false;
}

export function extractAppContextMenu(): boolean {
  if (cachedMenuComponent) return true;
  const now = Date.now();
  if (now - lastExtractionAttempt < EXTRACTION_COOLDOWN) return false;
  lastExtractionAttempt = now;

  const doc = getSPDocument();
  const React = getSteamReact();
  if (!doc || !React?.createElement) return false;

  // Match v1.4.0 behavior: iterate every visible Panel.Focusable with an
  // image and a `__reactFiber$` — no `nativeRecents.contains(panel)` filter.
  // The nativeRecents exclusion was added later thinking it'd be safer, but
  // it excluded the exact wrappers that host the native `onMenuButton`
  // when recents-replace is active — killing extraction.
  const panels = doc.querySelectorAll(".Panel.Focusable");
  let menuFn: ((e: any) => void) | null = null;

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const cls = panel.className ?? "";
    if (cls.indexOf("ds-card") >= 0 || cls.indexOf("ds-row") >= 0) continue;
    if (!panel.querySelector("img")) continue;
    const rect = (panel as HTMLElement).getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const fiberKey = Object.keys(panel).find((k: string) => k.startsWith("__reactFiber$"));
    if (!fiberKey) continue;
    let fiber = (panel as any)[fiberKey];

    for (let d = 0; d < 25 && fiber; d++) {
      const props = fiber.memoizedProps || fiber.pendingProps || {};
      if (typeof props.onMenuButton === "function") {
        menuFn = props.onMenuButton;
        break;
      }
      fiber = fiber.return;
    }
    if (menuFn) break;
  }

  if (!menuFn) return false;

  // Hook React.createElement + SP_JSX.jsx/jsxs together — both 3.7.21 and
  // 3.8/3.9 emit the {overview, client} menu via the JSX runtime form
  // (`SP_JSX.jsx`), not `React.createElement`. Patching only createElement
  // (the original strategy) silently misses the modern path too, even on
  // 3.9. Confirmed via CDP on both versions.
  //
  // We do NOT stub `dfl.showContextMenu` here (that was added later
  // thinking it'd prevent a brief native-menu flash during extraction, but
  // the handler's `showContextMenu` call often resolves to a module-bound
  // reference that doesn't go through `dfl`, so the stub is a no-op at best
  // and breaks capture ordering at worst).
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
    cachedMenuComponent = captured.component;
    cachedMenuTemplateProps = captured.templateProps;
    passiveHookInstalled = false;
    return true;
  }

  return false;
}

export function showGameMenu(appid: number, shelfId?: string): void {
  if (showGameMenuActive) return;
  showGameMenuActive = true;
  try {
    // Legacy (SteamOS ≤ 3.7): pure v1.2.0 port with its own cache, recursive
    // retry, single-document anchor lookup. If it succeeds it returns; if
    // extraction fails after the recursive retry, fall through to the
    // shared DFL fallback below. The modern path is never touched on legacy
    // devices, so the two caches stay independent.
    if (useLegacyMenuFlow()) {
      try {
        if (showGameMenuLegacy(appid, shelfId)) return;
      } catch {
        legacyCachedComponent = null;
        legacyCachedTemplateProps = {};
      }
    } else {
    // Native-menu path: extraction + cached component render. Wrapped in its
    // own try so any failure (extraction crash, component render error) falls
    // through to the DFL fallback menu rather than bubbling up to the caller.
    try {
      installPassiveMenuHook();
      if (!cachedMenuComponent) extractAppContextMenu();

      const React = getSteamReact();
      const appStore = getAppStore();

      {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (React && appStore && cachedMenuComponent) {
            try {
              const overview = appStore.GetAppOverviewByAppID?.(appid);
              if (overview) {
                const anchor = findCardAnchor(appid);
                const cardEl = (anchor?.el
                  ?? getSPDocument().activeElement) as HTMLElement;

                const ownerWindow = (anchor?.doc.defaultView as any)
                  ?? (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow
                  ?? (getPreferredSteamWindow() as any)
                  ?? window;

                // When the press came from one of our shelf cards, route the
                // component through `getInjectedMenuComponent` so its rendered
                // tree gains the `Deck Shelves > Shelf > […]` submenu — same
                // afterPatch / HOC seam used by HLTB / cheatdeck on the native
                // game menu. Non-shelf cards continue to render the captured
                // component unchanged.
                const renderTarget = shelfId
                  ? getInjectedMenuComponent(cachedMenuComponent)
                  : cachedMenuComponent;
                const menuElement = React.createElement(renderTarget, {
                  ...cachedMenuTemplateProps,
                  overview,
                  client: cachedMenuTemplateProps.client ?? "mostavailable",
                  launchSource: cachedMenuTemplateProps.launchSource ?? 1000,
                  bInGamepadUI: cachedMenuTemplateProps.bInGamepadUI ?? true,
                  strCollectionId: cachedMenuTemplateProps.strCollectionId ?? "",
                  ownerWindow: ownerWindow ?? cachedMenuTemplateProps.ownerWindow,
                  hasCustomArtwork: undefined,
                  onChangeArtwork: undefined,
                  ...(shelfId ? { _dsShelfId: shelfId } : {}),
                });

                const dfl = getDFL();
                if (dfl?.showContextMenu) {
                  dfl.showContextMenu(menuElement, cardEl);
                } else {
                  showContextMenu(menuElement, cardEl as any);
                }
                return;
              }
            } catch {
              cachedMenuComponent = null;
              cachedMenuTemplateProps = {};
            }
          }

          if (attempt === 0 && !cachedMenuComponent) {
            lastExtractionAttempt = 0;
            extractAppContextMenu();
          } else {
            break;
          }
        }
      }
    } catch {
      cachedMenuComponent = null;
      cachedMenuTemplateProps = {};
    }
    }

    try {
      const dfl = getDFL();
      const R = getSteamReact();
      const appStore = getAppStore();
      if (dfl?.showContextMenu && R && dfl.Menu && dfl.MenuItem) {
        const anchor = findCardAnchor(appid);
        const cardEl = (anchor?.el ?? getSPDocument().activeElement) as HTMLElement;
        const overview = appStore?.GetAppOverviewByAppID?.(appid);
        const installed = overview?.installed === true;
        const nav = dfl.Navigation ?? (globalThis as any).SteamClient?.Navigation;
        const sc: any = (globalThis as any).SteamClient;
        // Use the bundle's own i18next instance (the host's `globalThis.i18next`
        // doesn't have our keys, so the previous lookup always fell back to
        // English).
        const lbl = (key: string, fallback: string) => {
          try { const v = i18n.t(key as any); return (typeof v === "string" && v && v !== key) ? v : fallback; } catch { return fallback; }
        };
        const items: any[] = [];
        if (installed && typeof sc?.Apps?.RunGame === "function") {
          items.push(R.createElement(dfl.MenuItem, {
            key: "play",
            onSelected: () => { try { sc?.Apps?.RunGame(String(appid), "", -1, 1); } catch {} },
          }, lbl("menu_play", "Play")));
        }
        if (typeof nav?.NavigateToAppProperties === "function") {
          items.push(R.createElement(dfl.MenuItem, {
            key: "properties",
            onSelected: () => { try { nav.NavigateToAppProperties(appid); } catch {} },
          }, lbl("menu_properties", "Properties")));
        }
        items.push(R.createElement(dfl.MenuItem, {
          key: "details",
          onSelected: () => {
            try { (nav?.Navigate ?? sc?.Browser?.Navigate)?.(`/library/app/${appid}`); } catch {}
          },
        }, lbl("menu_view_details", "View Details")));
        // Append the Deck Shelves submenu when this fallback runs from a
        // shelf-card press — gives the user the same actions even if the
        // captured-menu path failed for any reason.
        if (shelfId) {
          const dsItems = buildDeckShelvesMenuItems(shelfId, dfl, R);
          for (const it of dsItems) items.push(it);
        }
        const menu = R.createElement(dfl.Menu, { label: overview?.display_name ?? "Game" }, ...items);
        dfl.showContextMenu(menu, cardEl);
      }
    } catch {}
  } finally {
    showGameMenuActive = false;
  }
}
