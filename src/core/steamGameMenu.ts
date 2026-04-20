import { showContextMenu } from "@decky/ui";
import { getPreferredSteamDocument, getPreferredSteamWindow } from "../runtime/steamHost";

let cachedMenuComponent: any = null;
let cachedMenuTemplateProps: Record<string, any> = {};
let lastExtractionAttempt = 0;
const EXTRACTION_COOLDOWN = 3000;
let passiveHookInstalled = false;

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

export function extractAppContextMenu(): boolean {
  if (cachedMenuComponent) return true;
  const now = Date.now();
  if (now - lastExtractionAttempt < EXTRACTION_COOLDOWN) return false;
  lastExtractionAttempt = now;

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
  installPassiveMenuHook();
  if (!cachedMenuComponent) extractAppContextMenu();

  const React = getSteamReact();
  const appStore = getAppStore();

  if (React && appStore && cachedMenuComponent) {
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

  if (!cachedMenuComponent) {
    lastExtractionAttempt = 0;
    extractAppContextMenu();
    if (cachedMenuComponent) {
      showGameMenu(appid);
      return;
    }
  }

  try {
    const dfl = getDFL();
    const R = getSteamReact();
    if (dfl?.showContextMenu && R && dfl.Menu && dfl.MenuItem) {
      const doc = getSPDocument();
      const cardEl = (doc.querySelector(`.ds-card[data-appid="${appid}"]`)
        ?? doc.querySelector(".ds-card.gpfocus")
        ?? doc.activeElement) as HTMLElement;
      const menu = R.createElement(dfl.Menu, { label: "Game" },
        R.createElement(dfl.MenuItem, {
          onSelected: () => {
            const nav = dfl.Navigation ?? (globalThis as any).SteamClient?.Navigation;
            nav?.Navigate?.(`/library/app/${appid}`);
          },
        }, "View Details"),
      );
      dfl.showContextMenu(menu, cardEl);
    }
  } catch {}
}
