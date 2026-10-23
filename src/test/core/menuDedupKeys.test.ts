import { describe, it, expect, vi } from "vitest";

vi.mock("../../core/shelfRefresh", () => ({ triggerShelfRefresh: () => {} }));
const settings = {
  shelves: [
    { id: "s1", title: "Pinned", enabled: true, source: { type: "builtin", sourceId: "pinned_games" } },
    { id: "s2", title: "Manual", enabled: true, source: { type: "filter", filter: {} }, manualOrder: [5] },
  ],
  smartShelves: [],
  savedFilters: [{ name: "Tags", group: { mode: "and", items: [{ type: "customTags" }] } }],
};
vi.mock("../../store/settingsStore", () => ({ getCurrentSettings: () => settings, saveSettings: vi.fn() }));

import { buildDeckShelvesMenuItems, buildLibraryAddToShelfItems } from "../../core/menu/itemBuilders";
import { DS_ROOT_KEYS } from "../../core/menu/menuContext";

const R = { createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, key: props?.key ?? null, props: { ...props, children } }) };
const dfl = { MenuItem: "MenuItem", MenuGroup: "MenuGroup" };
const DEDUP_PREFIXES = /^ds-(lib-add-|lib-rm-|card-add-|card-rm-)/;
const deduped = (key: string) => DS_ROOT_KEYS.has(key) || DEDUP_PREFIXES.test(key);

describe("game menu dedupe keys", () => {
  it("covers every top-level entry the shelf-card menu emits, the Lists group included", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const items = buildDeckShelvesMenuItems("s1", dfl, R, 5);
    const keys = items.map((i: any) => i.key);
    expect(keys).toContain("ds-lists");
    expect(keys).toContain("ds-shelf-root");
    for (const k of keys) expect(deduped(k), `top-level menu key ${k} is not deduped between renders`).toBe(true);
  });

  it("covers every top-level entry the library-card menu emits", () => {
    const items = buildLibraryAddToShelfItems(5, dfl, R);
    const keys = items.map((i: any) => i.key);
    expect(keys).toContain("ds-lib-lists");
    for (const k of keys) expect(deduped(k), `top-level library menu key ${k} is not deduped between renders`).toBe(true);
  });
});
