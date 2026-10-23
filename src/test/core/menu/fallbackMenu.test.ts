import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const runGame = vi.fn();
  const sc = {
    Apps: { RunGame: runGame, VerifyApp: vi.fn(), UninstallApps: vi.fn(), BrowseScreenshotsForApp: vi.fn() },
    Downloads: { ResumeAppUpdate: vi.fn(), EnableAllDownloads: vi.fn() },
  };
  const fl = {
    showContextMenu: vi.fn(),
    Menu: "Menu",
    MenuItem: "MenuItem",
    MenuSeparator: "MenuSeparator",
    Navigation: { NavigateToAppProperties: vi.fn(), Navigate: vi.fn() },
  };
  const overviews: Record<number, any> = {};
  return { sc, fl, overviews, runGame };
});

vi.mock("../../../runtime/host/decky", () => ({ getFrontendLib: () => h.fl }));
vi.mock("../../../runtime/steamHost", () => ({ getPreferredSteamDocument: () => ({ activeElement: null }) }));
vi.mock("../../../steam/internals", () => ({
  steamClient: () => h.sc,
  steamAppStore: () => ({ GetAppOverviewByAppID: (id: number) => h.overviews[id] }),
  steamReact: () => ({ createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props ?? {}, children }) }),
}));
vi.mock("../../../core/menu/menuContext", () => ({ buildDeckShelvesMenuItems: () => [], findCardAnchor: () => null }));
vi.mock("../../../i18n", () => ({ default: { t: (k: string) => k } }));

import { showFallbackMenu } from "../../../core/menu/fallbackMenu";

const APPID = 1222680;

function overview(display_status: number, status_percentage = 0) {
  return { appid: APPID, display_name: "Racing", installed: true, per_client_data: [{ clientid: "0", installed: true, display_status, status_percentage }] };
}

function firstItem() {
  const menu = h.fl.showContextMenu.mock.calls.at(-1)![0];
  return menu.children[0];
}

describe("fallback game menu: the first item follows the game's state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(h.overviews)) delete h.overviews[Number(k)];
  });

  for (const [name, ds] of [["queued", 19], ["required", 20], ["paused", 18]] as const) {
    it(`an update ${name} starts with Update, which updates and never launches`, () => {
      h.overviews[APPID] = overview(ds);
      showFallbackMenu(APPID, undefined);
      const item = firstItem();
      expect(item.props.key).toBe("update");
      expect(item.children).toEqual(["Update"]);
      item.props.onSelected();
      expect(h.sc.Downloads.ResumeAppUpdate).toHaveBeenCalledWith(APPID, "0");
      expect(h.runGame).not.toHaveBeenCalled();
    });
  }

  it("a download in progress starts with Pause", () => {
    h.overviews[APPID] = overview(7, 40);
    showFallbackMenu(APPID, undefined);
    const item = firstItem();
    expect(item.props.key).toBe("pause");
    item.props.onSelected();
    expect(h.sc.Downloads.EnableAllDownloads).toHaveBeenCalledWith(false, "0");
  });

  it("a game ready to play still starts with Play", () => {
    h.overviews[APPID] = overview(11);
    showFallbackMenu(APPID, undefined);
    const item = firstItem();
    expect(item.props.key).toBe("play");
    item.props.onSelected();
    expect(h.runGame).toHaveBeenCalled();
    expect(h.sc.Downloads.ResumeAppUpdate).not.toHaveBeenCalled();
  });
});
