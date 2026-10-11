import { describe, it, expect } from "vitest";
import { createDefaultSmartShelf, createDefaultShelf } from "../../domain/defaults";

describe("createDefaultSmartShelf", () => {
  it("excludes hidden games by default via a visible, removable filter condition", () => {
    const shelf = createDefaultSmartShelf("on_deck", "On Deck");
    expect(shelf.filterGroup).toEqual({
      mode: "and",
      items: [{ type: "hidden", inverted: false, params: { mode: "exclude" } }],
    });
  });

  it("still applies mode-specific defaults alongside the hidden-games filter", () => {
    const shelf = createDefaultSmartShelf("friends_playing", "Friends Playing");
    expect((shelf as any).friendsPlayingOverlay).toBe(true);
    expect(shelf.filterGroup?.items).toContainEqual({ type: "hidden", inverted: false, params: { mode: "exclude" } });
  });
});

describe("createDefaultShelf", () => {
  it("does not get the smart-shelf hidden-games default (manual shelves are unaffected)", () => {
    const shelf = createDefaultShelf();
    expect((shelf as any).filterGroup).toBeUndefined();
  });
});
