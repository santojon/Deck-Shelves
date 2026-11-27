import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({
  settings: null as any,
  saveSettings: vi.fn(),
}));

vi.mock("../../core/shelfRefresh", () => ({ triggerShelfRefresh: () => {} }));
vi.mock("../../core/focusRestore", () => ({ saveFocusTarget: () => {}, beginFocusRestoreLoop: () => {} }));
vi.mock("../../store/settingsStore", () => ({
  getCurrentSettings: () => shared.settings,
  saveSettings: (next: any) => shared.saveSettings(next),
}));

import { buildDeckShelvesMenuItems } from "../../core/menu/itemBuilders";

const R = { createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, key: props?.key ?? null, props: { ...props, children } }) };
const dfl = { MenuItem: "MenuItem", MenuGroup: "MenuGroup" };

const shelf = (id: string) => ({ id, title: id, enabled: true, source: { type: "collection", collectionId: "c" }, hiddenAppIds: [] });
const smart = (id: string) => ({ id, title: id, mode: "random_pick", enabled: true, limit: 10, hiddenAppIds: [] });

function findItem(items: any[], key: string): any {
  for (const it of items) {
    if (it?.key === key) return it;
    const kids = (it?.props?.children ?? []).flat?.() ?? [];
    const hit = findItem(kids.filter((k: any) => k && typeof k === "object"), key);
    if (hit) return hit;
  }
  return null;
}

const moveUp = (shelfId: string) => findItem(buildDeckShelvesMenuItems(shelfId, dfl, R, 8), "ds-move-up");
const moveDown = (shelfId: string) => findItem(buildDeckShelvesMenuItems(shelfId, dfl, R, 8), "ds-move-down");

describe("Home menu: move a shelf in the unified list", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    shared.saveSettings.mockReset();
    shared.saveSettings.mockImplementation((next: any) => { shared.settings = next; return Promise.resolve(true); });
    shared.settings = {
      unifiedListEnabled: true,
      shelves: [shelf("a"), shelf("b")],
      smartShelves: [smart("s1"), smart("s2")],
      allShelvesOrder: ["s1", "a", "s2", "b"],
    };
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("lets the first regular shelf move up when a smart shelf is above it", async () => {
    const up = moveUp("a");
    expect(up.props.disabled).toBe(false);
    up.props.onSelected();
    await Promise.resolve();
    expect(shared.saveSettings.mock.calls[0][0].allShelvesOrder).toEqual(["a", "s1", "s2", "b"]);
  });

  it("moves a smart shelf past a regular one and leaves the kind lists alone", async () => {
    const before = shared.settings;
    moveUp("s2").props.onSelected();
    await Promise.resolve();
    const saved = shared.saveSettings.mock.calls[0][0];
    expect(saved.allShelvesOrder).toEqual(["s1", "s2", "a", "b"]);
    expect(saved.shelves).toBe(before.shelves);
    expect(saved.smartShelves).toBe(before.smartShelves);
  });

  it("disables the ends of the unified list only", () => {
    expect(moveUp("s1").props.disabled).toBe(true);
    expect(moveDown("b").props.disabled).toBe(true);
    expect(moveDown("s1").props.disabled).toBe(false);
  });

  it("places shelves the saved order does not name after the named ones", async () => {
    shared.settings = { ...shared.settings, allShelvesOrder: ["b"] };
    moveUp("a").props.onSelected();
    await Promise.resolve();
    expect(shared.saveSettings.mock.calls[0][0].allShelvesOrder).toEqual(["a", "b", "s1", "s2"]);
  });

  it("steps over shelves the Home does not show, which keep their places", async () => {
    shared.settings = {
      ...shared.settings,
      shelves: [shelf("a"), { ...shelf("b"), hidden: true }],
      smartShelves: [{ ...smart("s1"), hidden: true }, smart("s2")],
      allShelvesOrder: ["s1", "a", "b", "s2"],
    };
    expect(moveUp("a").props.disabled).toBe(true);
    moveUp("s2").props.onSelected();
    await Promise.resolve();
    expect(shared.saveSettings.mock.calls[0][0].allShelvesOrder).toEqual(["s1", "s2", "a", "b"]);
  });

  it("steps over a shelf with nothing to draw, by what the Home shows", async () => {
    const { publishShelf, unpublishShelf } = await import("../../features/search/shelfRegistry");
    for (const id of ["s1", "a", "b"]) publishShelf(id, id, []);
    try {
      moveUp("b").props.onSelected();
      await Promise.resolve();
      expect(shared.saveSettings.mock.calls[0][0].allShelvesOrder).toEqual(["s1", "b", "a", "s2"]);
    } finally {
      for (const id of ["s1", "a", "b"]) unpublishShelf(id);
    }
  });

  it("keeps the per-kind lists when the unified list is off", async () => {
    shared.settings = { ...shared.settings, unifiedListEnabled: false };
    expect(moveUp("a").props.disabled).toBe(true);
    moveDown("a").props.onSelected();
    await Promise.resolve();
    expect(shared.saveSettings.mock.calls[0][0].shelves.map((s: any) => s.id)).toEqual(["b", "a"]);
  });
});
