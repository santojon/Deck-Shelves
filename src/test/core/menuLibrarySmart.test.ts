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

import { buildLibraryAddToShelfItems } from "../../core/menu/itemBuilders";

const R = { createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, key: props?.key ?? null, props: { ...props, children } }) };
const dfl = { MenuItem: "MenuItem", MenuGroup: "MenuGroup" };

const freshSettings = () => ({
  shelves: [{ id: "reg", title: "Regular", enabled: true, source: { type: "collection", collectionId: "c" }, manualOrder: [] }],
  smartShelves: [
    { id: "smart_manual", title: "Hand-picked", mode: "random_pick", enabled: true, limit: 10, sort: "manual", manualOrder: [7] },
    { id: "smart_rules", title: "By rule", mode: "spare_time", enabled: true, limit: 10 },
  ],
});

const group = (items: any[], key: string) => items.find((g: any) => g?.key === key);
const childKeys = (g: any): string[] => (g?.props?.children ?? []).map((c: any) => c.key);
const select = (g: any, key: string) => g.props.children.find((c: any) => c.key === key).props.onSelected();
const savedAt = (call: number) => shared.saveSettings.mock.calls[call][0];

describe("library card menu: smart shelves with a manual order", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    shared.settings = freshSettings();
    shared.saveSettings.mockReset();
    shared.saveSettings.mockImplementation((next: any) => { shared.settings = next; return Promise.resolve(true); });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("offers the smart shelf that keeps a manual order, not the rule-only one", () => {
    const add = group(buildLibraryAddToShelfItems(8, dfl, R), "ds-lib-add-shelf");
    expect(childKeys(add)).toEqual(["ds-lib-add-reg", "ds-lib-add-smart_manual"]);
  });

  it("adds the game to the smart shelf's manual order, leaving the regular list alone", () => {
    const before = shared.settings;
    select(group(buildLibraryAddToShelfItems(8, dfl, R), "ds-lib-add-shelf"), "ds-lib-add-smart_manual");
    expect(shared.saveSettings).toHaveBeenCalledTimes(1);
    expect(savedAt(0).smartShelves[0].manualOrder).toEqual([7, 8]);
    expect(savedAt(0).smartShelves[0].sort).toBe("manual");
    expect(savedAt(0).shelves).toBe(before.shelves);
  });

  it("removes the game from the smart shelf's manual order", () => {
    const rm = group(buildLibraryAddToShelfItems(7, dfl, R), "ds-lib-remove-shelf");
    expect(childKeys(rm)).toEqual(["ds-lib-rm-smart_manual"]);
    select(rm, "ds-lib-rm-smart_manual");
    expect(savedAt(0).smartShelves[0].manualOrder).toEqual([]);
  });

  it("still adds to a regular shelf through the regular list", () => {
    select(group(buildLibraryAddToShelfItems(8, dfl, R), "ds-lib-add-shelf"), "ds-lib-add-reg");
    expect(savedAt(0).shelves[0].manualOrder).toEqual([8]);
    expect(savedAt(0).shelves[0].sort).toBe("manual");
  });
});
