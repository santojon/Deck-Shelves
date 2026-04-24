import { showContextMenu } from "@decky/ui";
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../runtime/steamHost";

let cachedMenuComponent: any = null;
let cachedMenuTemplateProps: Record<string, any> = {};
let lastExtractionAttempt = 0;
const EXTRACTION_COOLDOWN = 3000;
let passiveHookInstalled = false;
let showContextMenuHookInstalled = false;
let showGameMenuActive = false;

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

export function extractAppContextMenu(): boolean {
  if (cachedMenuComponent) return true;
  const now = Date.now();
  if (now - lastExtractionAttempt < EXTRACTION_COOLDOWN) return false;
  lastExtractionAttempt = now;

  const doc = getSPDocument();
  const React = getSteamReact();
  if (!doc || !React?.createElement) return false;

  const mount = doc.getElementById("deck-shelves-home-root");
  const nativeRecents = (mount?.previousElementSibling ?? null) as Element | null;

  const panels = doc.querySelectorAll(".Panel.Focusable");
  let menuFn: ((e: any) => void) | null = null;

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    if (nativeRecents && nativeRecents.contains(panel)) continue;
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

  const dfl = getDFL();
  const origDflShow = dfl?.showContextMenu;
  const origDeckyShow = (globalThis as any).showContextMenu;
  if (dfl?.showContextMenu) dfl.showContextMenu = () => {};
  if ((globalThis as any).showContextMenu) (globalThis as any).showContextMenu = () => {};
  try {
    const fakeEvt = new CustomEvent("fake", { bubbles: false });
    (fakeEvt as any).stopPropagation = () => {};
    (fakeEvt as any).preventDefault = () => {};
    menuFn(fakeEvt);
  } catch {
  } finally {
    React.createElement = origCreateElement;
    if (dfl?.showContextMenu !== undefined) dfl.showContextMenu = origDflShow;
    if (origDeckyShow !== undefined) (globalThis as any).showContextMenu = origDeckyShow;
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
    // Native-menu path: extraction + cached component render. Wrapped in its
    // own try so any failure (extraction crash, component render error) falls
    // through to the DFL fallback menu rather than bubbling up to the caller.
    try {
      installPassiveMenuHook();
      if (!cachedMenuComponent) extractAppContextMenu();

      const React = getSteamReact();
      const appStore = getAppStore();

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
    } catch {
      cachedMenuComponent = null;
      cachedMenuTemplateProps = {};
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
            onSelected: () => { try { sc.Apps.RunGame(String(appid), "", -1, 1); } catch {} },
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
