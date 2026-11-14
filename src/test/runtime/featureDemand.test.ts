import { describe, it, expect } from "vitest";
import { settingsNeedFriends, settingsNeedShortcutTags, settingsMentionAny } from "../../runtime/featureDemand";

const base = (over: any = {}) => ({ shelves: [], smartShelves: [], savedFilters: [], profiles: [], ...over }) as any;

describe("featureDemand", () => {
  it("nothing configured → no demand", () => {
    expect(settingsNeedFriends(null)).toBe(false);
    expect(settingsNeedFriends(base())).toBe(false);
    expect(settingsNeedShortcutTags(base())).toBe(false);
  });

  it("friends_playing smart shelf demands friends state", () => {
    expect(settingsNeedFriends(base({ smartShelves: [{ id: "x", mode: "friends_playing" }] }))).toBe(true);
  });

  it("a friends-based sort on a regular shelf demands friends state", () => {
    expect(settingsNeedFriends(base({ shelves: [{ id: "x", sort: "friends_playing_now", source: { type: "filter" } }] }))).toBe(true);
  });

  it("the overlay flag demands friends state only when true", () => {
    expect(settingsNeedFriends(base({ shelves: [{ id: "x", friendsPlayingOverlay: false }] }))).toBe(false);
    expect(settingsNeedFriends(base({ shelves: [{ id: "x", friendsPlayingOverlay: true }] }))).toBe(true);
    expect(settingsNeedFriends(base({ globalFriendsPlayingOverlay: true }))).toBe(true);
  });

  it("a shelf merely titled Friends does not demand friends state", () => {
    expect(settingsNeedFriends(base({ shelves: [{ id: "x", title: "Friends", source: { type: "filter" } }] }))).toBe(false);
  });

  it("the parser-categories condition demands the shortcut tags", () => {
    const group = { mode: "and", items: [{ type: "parserCategories", params: { tags: ["rpg"] } }] };
    expect(settingsNeedShortcutTags(base({ shelves: [{ id: "x", source: { type: "filter", filter: { filterGroup: group } } }] }))).toBe(true);
  });

  it("settingsMentionAny matches whole quoted strings only", () => {
    const s = base({ shelves: [{ id: "x", source: { id: "heroic_library_v2" } }] });
    expect(settingsMentionAny(s, ["heroic_library"])).toBe(false);
    expect(settingsMentionAny(s, ["heroic_library_v2"])).toBe(true);
  });
});
