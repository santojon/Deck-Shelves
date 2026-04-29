import { showContextMenu } from "@decky/ui";
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../runtime/steamHost";
import { isSteamOS38OrLater } from "./steamOSVersion";

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

function getDFL(): any {
  return (globalThis as any).DFL ?? (globalThis as any).deckyFrontendLib ?? (globalThis as any).window?.DFL;
}

function getSPDocument(): Document {
  return getPreferredSteamDocument();
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
  if (!React?.createElement) return;

  const origCreateElement = React.createElement;
  React.createElement = function (type: any, props: any, ...args: any[]) {
    if (!cachedMenuComponent && typeof type === "function"
        && props && "overview" in props && "client" in props) {
      cachedMenuComponent = type;
      const tProps = { ...props };
      delete tProps.overview;
      delete tProps.hasCustomArtwork;
      delete tProps.onChangeArtwork;
      cachedMenuTemplateProps = tProps;
      React.createElement = origCreateElement;
      passiveHookInstalled = false;
    }
    return origCreateElement.apply(React, [type, props, ...args]);
  };
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

  // Hook every element-creation primitive Steam may use on 3.7.x. CDP
  // probing on 3.7.21 stable confirmed the native handler emits the menu
  // via the JSX runtime form (`SP_JSX.jsx(<Component>, {overview, client, …})`),
  // NOT `React.createElement`. The v1.2/v1.4 series only patched
  // `React.createElement`, so the original strategy never captured the
  // component on this build — which is why showGameMenu always fell into
  // the DFL fallback here. Patch jsx + jsxs (and createElement, defensively
  // for builds that mix forms) on the same hook flag.
  const origCreateElement = React.createElement;
  const jsxRuntime: any = (globalThis as any).SP_JSX;
  const origJsx: any = jsxRuntime?.jsx;
  const origJsxs: any = jsxRuntime?.jsxs;
  let capturedComponent: any = null;
  let capturedTemplateProps: Record<string, any> = {};

  const captureFromArgs = (type: any, props: any) => {
    if (!capturedComponent && typeof type === "function"
        && props && "overview" in props && "client" in props) {
      capturedComponent = type;
      const tProps = { ...props };
      delete tProps.overview;
      delete tProps.hasCustomArtwork;
      delete tProps.onChangeArtwork;
      capturedTemplateProps = tProps;
    }
  };

  React.createElement = function (type: any, props: any, ...args: any[]) {
    captureFromArgs(type, props);
    return origCreateElement.apply(React, [type, props, ...args]);
  };
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

  try {
    const fakeEvt = new CustomEvent("fake", { bubbles: false });
    (fakeEvt as any).stopPropagation = () => {};
    (fakeEvt as any).preventDefault = () => {};
    menuFn(fakeEvt);
  } catch {
  } finally {
    React.createElement = origCreateElement;
    if (jsxRuntime && typeof origJsx === "function") jsxRuntime.jsx = origJsx;
    if (jsxRuntime && typeof origJsxs === "function") jsxRuntime.jsxs = origJsxs;
  }

  if (capturedComponent) {
    legacyCachedComponent = capturedComponent;
    legacyCachedTemplateProps = capturedTemplateProps;
    return true;
  }

  return false;
}

/**
 * Pure v1.2.0 render port. Returns `true` if the native menu was rendered
 * (so the caller can skip the DFL fallback), `false` if extraction failed
 * even after the recursive retry — caller falls through to DFL fallback.
 */
function showGameMenuLegacy(appid: number): boolean {
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

        const menuElement = React.createElement(legacyCachedComponent, {
          ...legacyCachedTemplateProps,
          overview,
          client: legacyCachedTemplateProps.client ?? "mostavailable",
          launchSource: legacyCachedTemplateProps.launchSource ?? 1000,
          bInGamepadUI: legacyCachedTemplateProps.bInGamepadUI ?? true,
          strCollectionId: legacyCachedTemplateProps.strCollectionId ?? "",
          ownerWindow: ownerWindow ?? legacyCachedTemplateProps.ownerWindow,
          hasCustomArtwork: undefined,
          onChangeArtwork: undefined,
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
      return showGameMenuLegacy(appid);
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

  const origCreateElement = React.createElement;
  let capturedComponent: any = null;
  let capturedTemplateProps: Record<string, any> = {};

  React.createElement = function (type: any, props: any, ...args: any[]) {
    if (!capturedComponent && typeof type === "function"
        && props && "overview" in props && "client" in props) {
      capturedComponent = type;
      const tProps = { ...props };
      delete tProps.overview;
      delete tProps.hasCustomArtwork;
      delete tProps.onChangeArtwork;
      capturedTemplateProps = tProps;
    }
    return origCreateElement.apply(React, [type, props, ...args]);
  };

  // Invoke the native handler to force it to build a `{overview, client}`
  // menu element — captured by the React.createElement hook above. We do
  // NOT stub `dfl.showContextMenu` here (that was added later thinking it'd
  // prevent a brief native-menu flash during extraction, but the handler's
  // `showContextMenu` call often resolves to a module-bound reference that
  // doesn't go through `dfl`, so the stub is a no-op at best and breaks
  // capture ordering at worst).
  try {
    const fakeEvt = new CustomEvent("fake", { bubbles: false });
    (fakeEvt as any).stopPropagation = () => {};
    (fakeEvt as any).preventDefault = () => {};
    menuFn(fakeEvt);
  } catch {
  } finally {
    React.createElement = origCreateElement;
  }

  if (capturedComponent) {
    cachedMenuComponent = capturedComponent;
    cachedMenuTemplateProps = capturedTemplateProps;
    passiveHookInstalled = false;
    return true;
  }

  return false;
}

export function showGameMenu(appid: number): void {
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
        if (showGameMenuLegacy(appid)) return;
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

                const menuElement = React.createElement(cachedMenuComponent, {
                  ...cachedMenuTemplateProps,
                  overview,
                  client: cachedMenuTemplateProps.client ?? "mostavailable",
                  launchSource: cachedMenuTemplateProps.launchSource ?? 1000,
                  bInGamepadUI: cachedMenuTemplateProps.bInGamepadUI ?? true,
                  strCollectionId: cachedMenuTemplateProps.strCollectionId ?? "",
                  ownerWindow: ownerWindow ?? cachedMenuTemplateProps.ownerWindow,
                  hasCustomArtwork: undefined,
                  onChangeArtwork: undefined,
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
        const i18nT: any = (globalThis as any).i18next?.t?.bind((globalThis as any).i18next);
        const lbl = (key: string, fallback: string) => {
          try { const v = i18nT?.(key); return v && v !== key ? v : fallback; } catch { return fallback; }
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
        const menu = R.createElement(dfl.Menu, { label: overview?.display_name ?? "Game" }, ...items);
        dfl.showContextMenu(menu, cardEl);
      }
    } catch {}
  } finally {
    showGameMenuActive = false;
  }
}
