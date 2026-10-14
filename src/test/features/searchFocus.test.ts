// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const fr = vi.hoisted(() => ({ saved: [] as Array<[number, string | undefined]>, loops: 0, focused: [] as HTMLElement[] }));
vi.mock("../../core/focusRestore", () => ({
  focusElement: (el: HTMLElement) => { fr.focused.push(el); return true; },
  saveFocusTarget: (appid: number, shelfId?: string) => { fr.saved.push([appid, shelfId]); },
  beginFocusRestoreLoop: () => { fr.loops++; },
}));
vi.mock("../../runtime/steamHost", () => ({ getPreferredSteamDocument: () => document }));
vi.mock("../../settingsStore", () => ({ getCurrentSettings: () => ({}) }));
vi.mock("../../runtime/devStamps", () => ({ devStamp: () => {}, devCount: () => {} }));

import { BUILT_IN_SHELF_SEARCH } from "../../features/search/builtInProvider";
import { publishShelf, unpublishShelf } from "../../features/search/shelfRegistry";

describe("Quick Search landing on a card", () => {
  beforeEach(() => {
    fr.saved = []; fr.loops = 0; fr.focused = [];
    document.body.innerHTML = `
      <div class="ds-shelf" data-shelfid="s1">
        <div class="ds-row-scroll"><div class="ds-card" data-appid="1" data-shelfid="s1"></div></div>
      </div>`;
    publishShelf("s1", "Shelf", [{ appid: 1, name: "Pony Island" }, { appid: 2, name: "Dave the Diver" }]);
  });

  it("focuses a mounted card directly", async () => {
    const hits = await BUILT_IN_SHELF_SEARCH.search("pony", 30);
    expect(hits.map((h) => h.appid)).toEqual([1]);
    hits[0].onActivate?.();
    expect(fr.focused[0]).toBe(document.querySelector('[data-appid="1"]'));
    expect(fr.saved).toEqual([]);
    expect(fr.loops).toBe(0);
  });

  it("makes a card the row left out the pending focus target, re-windows the row and starts the restore loop", async () => {
    const row = document.querySelector<HTMLElement>(".ds-row-scroll")!;
    let scrolled = 0;
    row.addEventListener("scroll", () => { scrolled++; });
    const hits = await BUILT_IN_SHELF_SEARCH.search("dave", 30);
    expect(hits.map((h) => h.appid)).toEqual([2]);
    hits[0].onActivate?.();
    expect(fr.focused).toEqual([]);
    expect(fr.saved).toEqual([[2, "s1"]]);
    expect(scrolled).toBe(1);
    expect(fr.loops).toBe(1);
    unpublishShelf("s1");
  });

  it("does nothing for a shelf that is not on the page", async () => {
    publishShelf("s2", "Elsewhere", [{ appid: 9, name: "Ghost Game" }]);
    const hits = await BUILT_IN_SHELF_SEARCH.search("ghost", 30);
    hits[0].onActivate?.();
    expect(fr.saved).toEqual([]);
    expect(fr.loops).toBe(0);
    unpublishShelf("s2");
  });
});
