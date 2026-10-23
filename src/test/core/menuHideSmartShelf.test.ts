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

const freshSettings = () => ({
  shelves: [{ id: "reg", title: "Regular", enabled: true, source: { type: "collection", collectionId: "c" }, hiddenAppIds: [] }],
  smartShelves: [{ id: "smart", title: "Roulette", mode: "random_pick", enabled: true, limit: 10, hiddenAppIds: [] }],
});

// The hide entry of the game menu, built for the given shelf and focused game.
function hideEntry(shelfId: string, appid: number): { label: string; select: () => void } {
  const item = buildDeckShelvesMenuItems(shelfId, dfl, R, appid).find((i: any) => i.key === "ds-card-hide");
  expect(item, "ds-card-hide entry missing").toBeTruthy();
  return { label: String(item.props.children[0]), select: () => item.props.onSelected() };
}

const savedAt = (call: number) => shared.saveSettings.mock.calls[call][0];

describe("game menu hide / show on a shelf card", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    shared.settings = freshSettings();
    shared.saveSettings.mockReset();
    shared.saveSettings.mockImplementation((next: any) => { shared.settings = next; return Promise.resolve(true); });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("smart shelf: hides into smartShelves[].hiddenAppIds and shows again, leaving the regular list alone", () => {
    const before = shared.settings;
    const hide = hideEntry("smart", 8);
    hide.select();
    expect(shared.saveSettings).toHaveBeenCalledTimes(1);
    expect(savedAt(0).smartShelves[0].hiddenAppIds).toEqual([8]);
    expect(savedAt(0).shelves).toBe(before.shelves);

    // Rebuilt from the saved settings the entry flips to "show" and removes the id.
    const show = hideEntry("smart", 8);
    expect(show.label).not.toBe(hide.label);
    show.select();
    expect(savedAt(1).smartShelves[0].hiddenAppIds).toEqual([]);
    expect(savedAt(1).shelves).toBe(before.shelves);
  });

  it("regular shelf: hides into shelves[].hiddenAppIds and shows again, leaving smartShelves alone", () => {
    const before = shared.settings;
    hideEntry("reg", 8).select();
    expect(savedAt(0).shelves[0].hiddenAppIds).toEqual([8]);
    expect(savedAt(0).smartShelves).toBe(before.smartShelves);

    hideEntry("reg", 8).select();
    expect(savedAt(1).shelves[0].hiddenAppIds).toEqual([]);
    expect(savedAt(1).smartShelves).toBe(before.smartShelves);
  });
});
