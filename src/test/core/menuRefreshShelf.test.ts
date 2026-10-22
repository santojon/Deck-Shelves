import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  settings: null as any,
  smart: [] as string[],
  random: [] as string[],
  online: 0,
  refresh: [] as any[],
}));

vi.mock("../../core/shelfRefresh", () => ({ triggerShelfRefresh: (o: any) => { calls.refresh.push(o); } }));
vi.mock("../../core/focusRestore", () => ({ saveFocusTarget: () => {}, beginFocusRestoreLoop: () => {} }));
vi.mock("../../store/settingsStore", () => ({ getCurrentSettings: () => calls.settings, saveSettings: () => Promise.resolve(true) }));
vi.mock("../../steam/smartShelves", async (orig) => ({ ...(await orig<any>()), invalidateSmartShelfCache: (id: string) => { calls.smart.push(id); } }));
vi.mock("../../steam", async (orig) => ({ ...(await orig<any>()), invalidateRandomSortCache: (id: string) => { calls.random.push(id); } }));
vi.mock("../../core/shelfActions", async (orig) => ({ ...(await orig<any>()), clearOnlineShelfCache: () => { calls.online++; } }));

import { buildDeckShelvesMenuItems } from "../../core/menu/itemBuilders";

const R = { createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, key: props?.key ?? null, props: { ...props, children } }) };
const dfl = { MenuItem: "MenuItem", MenuGroup: "MenuGroup" };

const freshSettings = () => ({
  shelves: [
    { id: "roulette", title: "Random", enabled: true, source: { type: "filter", filter: { sort: "random" } }, hiddenAppIds: [] },
    { id: "wish", title: "Wishlist", enabled: true, source: { type: "wishlist" }, hiddenAppIds: [] },
    { id: "plain", title: "Plain", enabled: true, source: { type: "collection", collectionId: "c" }, hiddenAppIds: [] },
  ],
  smartShelves: [{ id: "smart", title: "Roulette", mode: "random_pick", enabled: true, limit: 10, hiddenAppIds: [] }],
});

// Walks the built menu tree (groups nest their entries as children) for an entry key.
function findKey(items: any[], key: string): any {
  for (const item of items) {
    if (!item) continue;
    if (item.key === key) return item;
    const kids = item.props?.children;
    const found = Array.isArray(kids) ? findKey(kids, key) : undefined;
    if (found) return found;
  }
  return undefined;
}

const refreshEntry = (shelfId: string) => findKey(buildDeckShelvesMenuItems(shelfId, dfl, R, 8), "ds-refresh");

describe("shelf menu refresh entry", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    calls.settings = freshSettings();
    calls.smart.length = 0;
    calls.random.length = 0;
    calls.online = 0;
    calls.refresh.length = 0;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("random shelf: clears its random order and refreshes it", () => {
    const entry = refreshEntry("roulette");
    expect(entry, "ds-refresh entry missing").toBeTruthy();
    entry.props.onSelected();
    expect(calls.random).toEqual(["roulette"]);
    expect(calls.smart).toEqual([]);
    expect(calls.online).toBe(0);
    expect(calls.refresh).toEqual([{ manual: true, shelfId: "roulette" }]);
  });

  it("smart shelf: drops its result cache as well", () => {
    refreshEntry("smart").props.onSelected();
    expect(calls.smart).toEqual(["smart"]);
    expect(calls.random).toEqual(["smart"]);
    expect(calls.online).toBe(0);
    expect(calls.refresh).toEqual([{ manual: true, shelfId: "smart" }]);
  });

  it("online shelf: drops the online cache as well", () => {
    refreshEntry("wish").props.onSelected();
    expect(calls.online).toBe(1);
    expect(calls.smart).toEqual([]);
    expect(calls.random).toEqual(["wish"]);
    expect(calls.refresh).toEqual([{ manual: true, shelfId: "wish" }]);
  });

  it("a plain collection shelf has no refresh entry", () => {
    expect(refreshEntry("plain")).toBeUndefined();
  });
});
