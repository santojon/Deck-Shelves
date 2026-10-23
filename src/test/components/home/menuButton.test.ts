// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ injecting: false, focusedAppId: 0, firstAppId: 0 }));
const showGameMenu = vi.hoisted(() => vi.fn());

vi.mock("../../../runtime/steamHost", () => ({ getAllSteamDocuments: () => [document] }));
vi.mock("../../../core/steamGameMenu", () => ({ showGameMenu }));
vi.mock("../../../runtime/logger", () => ({ logInfo: vi.fn() }));
vi.mock("../../../runtime/recentsReplace", () => ({
  isRecentsReplaceInjecting: () => state.injecting,
  getOverlayFocusedAppId: () => state.focusedAppId,
  getOverlayFirstCachedAppId: () => state.firstAppId,
}));

import { patchMenuButton } from "../../../components/home/navPatches/menuButton";

const OPTIONS_BUTTON = 4;
const steamDispatch = vi.fn();
const ctrl: any = { DispatchVirtualButtonClick: steamDispatch, m_ActiveContext: { m_lastFocusNode: null } };
const steamListener = vi.fn();
const MENU_EVENT = "vgp_onmenubutton";

function el(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

// The Home: Steam's tabs, the Recents row, then the plugin's mount right after the row.
function buildHome(): void {
  document.body.innerHTML = `
    <div id="home">
      <div id="tabs"><button id="tab">tab</button></div>
      <div id="row"><div id="tile1" tabindex="0"></div><div id="tile2" tabindex="0"></div></div>
      <div id="deck-shelves-home-root"><div class="deck-shelves-root" id="dsroot">
        <div class="ds-card" id="card" data-appid="111" data-shelfid="s1" tabindex="0"></div>
        <div id="dsbutton" tabindex="0"></div>
      </div></div>
    </div>`;
}

function setNavFocus(id: string | null): void {
  ctrl.m_ActiveContext.m_lastFocusNode = id ? { m_element: el(id) } : null;
}

function pressMenu(): void {
  ctrl.DispatchVirtualButtonClick(OPTIONS_BUTTON);
}

function menuEventOn(id: string, type = "vgp_onmenubutton"): Event {
  const evt = new Event(type, { bubbles: true, cancelable: true });
  el(id).dispatchEvent(evt);
  return evt;
}

function expectSteamHandled(evt?: Event): void {
  expect(showGameMenu).not.toHaveBeenCalled();
  if (evt) {
    expect(evt.defaultPrevented).toBe(false);
    expect(steamListener).toHaveBeenCalledTimes(1);
  } else {
    expect(steamDispatch).toHaveBeenCalledWith(OPTIONS_BUTTON);
  }
}

function expectPluginMenu(evt: Event | undefined, ...args: unknown[]): void {
  expect(showGameMenu).toHaveBeenCalledTimes(1);
  expect(showGameMenu).toHaveBeenCalledWith(...args);
  if (evt) {
    expect(evt.defaultPrevented).toBe(true);
    expect(steamListener).not.toHaveBeenCalled();
  } else {
    expect(steamDispatch).not.toHaveBeenCalled();
  }
}

beforeAll(() => {
  (globalThis as any).FocusNavController = ctrl;
  patchMenuButton();
  document.addEventListener(MENU_EVENT, steamListener);
  document.addEventListener("contextmenu", steamListener);
});

beforeEach(() => {
  buildHome();
  showGameMenu.mockClear();
  steamDispatch.mockClear();
  steamListener.mockClear();
  state.injecting = false;
  state.focusedAppId = 0;
  state.firstAppId = 0;
  setNavFocus(null);
  (globalThis as any).__ds_last_focused_card = null;
});

describe("menu button: a plugin card focused", () => {
  for (const injecting of [false, true]) {
    it(`opens that card's menu (feature in use: ${injecting})`, () => {
      state.injecting = injecting;
      state.focusedAppId = 222;
      state.firstAppId = 333;
      // The plugin's rows record a card as it takes focus.
      (globalThis as any).__ds_last_focused_card = el("card");
      setNavFocus("card");
      pressMenu();
      expectPluginMenu(undefined, 111, "s1");
      showGameMenu.mockClear();
      expectPluginMenu(menuEventOn("card"), 111, "s1");
      showGameMenu.mockClear();
      expectPluginMenu(menuEventOn("card", "contextmenu"), 111, "s1");
    });
  }

  it("keeps the last focused card when focus is inside the plugin's area", () => {
    (globalThis as any).__ds_last_focused_card = el("card");
    setNavFocus("dsbutton");
    pressMenu();
    expectPluginMenu(undefined, 111, "s1");
    showGameMenu.mockClear();
    expectPluginMenu(menuEventOn("dsbutton"), 111, "s1");
  });

  it("keeps the last focused card when no focus is known", () => {
    (globalThis as any).__ds_last_focused_card = el("card");
    pressMenu();
    expectPluginMenu(undefined, 111, "s1");
  });
});

describe("menu button: feature in use, focus on a tile of the row", () => {
  beforeEach(() => { state.injecting = true; state.firstAppId = 333; });

  it("opens the plugin's menu for the reported tile", () => {
    state.focusedAppId = 222;
    setNavFocus("tile2");
    pressMenu();
    expectPluginMenu(undefined, 222);
    showGameMenu.mockClear();
    expectPluginMenu(menuEventOn("tile2"), 222);
  });

  it("opens the plugin's menu for the row's first game when no tile focus was reported", () => {
    setNavFocus("tile1");
    pressMenu();
    expectPluginMenu(undefined, 333);
    showGameMenu.mockClear();
    expectPluginMenu(menuEventOn("tile1"), 333);
  });

  it("judges an event that reaches the document body by Steam's focus", () => {
    state.focusedAppId = 222;
    setNavFocus("tile2");
    const evt = new Event("vgp_onmenubutton", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(evt);
    expectPluginMenu(evt, 222);
  });

  it("a right click on a tile of the row", () => {
    state.focusedAppId = 222;
    expectPluginMenu(menuEventOn("tile1", "contextmenu"), 222);
  });

  it("ignores a last focused plugin card", () => {
    state.focusedAppId = 222;
    (globalThis as any).__ds_last_focused_card = el("card");
    setNavFocus("tile1");
    pressMenu();
    expectPluginMenu(undefined, 222);
    showGameMenu.mockClear();
    expectPluginMenu(menuEventOn("tile1"), 222);
  });
});

describe("menu button: Steam's own handling", () => {
  for (const injecting of [false, true]) {
    for (const reported of [0, 222]) {
      it(`focus on the Home tabs (feature in use: ${injecting}, reported: ${reported})`, () => {
        state.injecting = injecting;
        state.focusedAppId = reported;
        state.firstAppId = injecting ? 333 : 0;
        setNavFocus("tab");
        pressMenu();
        expectSteamHandled();
        expectSteamHandled(menuEventOn("tab"));
      });

      it(`a last focused card does not apply on a native element (feature in use: ${injecting}, reported: ${reported})`, () => {
        state.injecting = injecting;
        state.focusedAppId = reported;
        state.firstAppId = injecting ? 333 : 0;
        (globalThis as any).__ds_last_focused_card = el("card");
        setNavFocus("tab");
        pressMenu();
        expectSteamHandled();
        expectSteamHandled(menuEventOn("tab"));
      });
    }
  }

  it("focus on a tile of the row with the feature not in use", () => {
    state.focusedAppId = 222;
    setNavFocus("tile1");
    pressMenu();
    expectSteamHandled();
    expectSteamHandled(menuEventOn("tile1"));
  });

  it("an event on the document body with Steam's focus on the Home tabs", () => {
    state.injecting = true;
    state.focusedAppId = 222;
    setNavFocus("tab");
    const evt = new Event("vgp_onmenubutton", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(evt);
    expectSteamHandled(evt);
  });

  it("a right click off the row and off plugin cards, feature in use", () => {
    state.injecting = true;
    state.firstAppId = 333;
    (globalThis as any).__ds_last_focused_card = el("card");
    expectSteamHandled(menuEventOn("tab", "contextmenu"));
  });

  it("other buttons pass through", () => {
    state.injecting = true;
    state.firstAppId = 333;
    setNavFocus("tile1");
    ctrl.DispatchVirtualButtonClick(1);
    expect(steamDispatch).toHaveBeenCalledWith(1);
    expect(showGameMenu).not.toHaveBeenCalled();
  });
});
