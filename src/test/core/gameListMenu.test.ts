import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("../../core/shelfRefresh", () => ({ triggerShelfRefresh: () => {} }));

import { gameListEntries } from "../../core/menu/itemBuilders";
import { togglePinned } from "../../runtime/gameLists";

describe("game menu Lists entries", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows only the lists some configuration uses, with a check on the ones holding the game", () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: () => {} });
    expect(gameListEntries({ shelves: [{ source: { type: "steam" } }] }, 5)).toEqual([]);
    const settings = { shelves: [{ source: { type: "v3", id: "pinned_games" } }], savedFilters: [{ filterGroup: { filters: [{ type: "customTags" }] } }] };
    togglePinned(5);
    const entries = gameListEntries(settings, 5);
    expect(entries.map((e) => e.key)).toEqual(["ds-list-pinned", "ds-list-tags"]);
    expect(entries[0].label.startsWith("✓ ")).toBe(true);
    expect(gameListEntries(settings, 6)[0].label.startsWith("✓ ")).toBe(false);
    expect(gameListEntries(settings, 0)).toEqual([]);
  });
});
