import { describe, it, expect } from "vitest";
import { settingsNeedFriends, settingsNeedLaunchers, settingsMentionAny } from "../../runtime/featureDemand";

const base = (over: any = {}) => ({ shelves: [], smartShelves: [], savedFilters: [], profiles: [], ...over }) as any;

describe("featureDemand", () => {
  it("nothing configured → no demand", () => {
    expect(settingsNeedFriends(null)).toBe(false);
    expect(settingsNeedFriends(base())).toBe(false);
    expect(settingsNeedLaunchers(base())).toBe(false);
  });

  it("friends_playing smart shelf demands friends state", () => {
    expect(settingsNeedFriends(base({ smartShelves: [{ id: "x", mode: "friends_playing" }] }))).toBe(true);
  });

  it("a friends-based sort on a regular shelf demands friends state", () => {
    expect(settingsNeedFriends(base({ shelves: [{ id: "x", sort: "most_friends_owning", source: { type: "filter" } }] }))).toBe(true);
  });

  it("the overlay flag demands friends state only when true", () => {
    expect(settingsNeedFriends(base({ shelves: [{ id: "x", friendsPlayingOverlay: false }] }))).toBe(false);
    expect(settingsNeedFriends(base({ shelves: [{ id: "x", friendsPlayingOverlay: true }] }))).toBe(true);
    expect(settingsNeedFriends(base({ globalFriendsPlayingOverlay: true }))).toBe(true);
  });

  it("a shelf merely titled Friends does not demand friends state", () => {
    expect(settingsNeedFriends(base({ shelves: [{ id: "x", title: "Friends", source: { type: "filter" } }] }))).toBe(false);
  });

  it("launcher-backed sources demand the launcher cache", () => {
    expect(settingsNeedLaunchers(base({ shelves: [{ id: "x", source: { type: "v3", id: "heroic_library" } }] }))).toBe(true);
    expect(settingsNeedLaunchers(base({ smartShelves: [{ id: "x", source: "lutris_library" }] }))).toBe(true);
    expect(settingsNeedLaunchers(base({ shelves: [{ id: "x", source: { type: "collection", collectionId: "heroic" } }] }))).toBe(false);
  });

  it("settingsMentionAny matches whole quoted strings only", () => {
    const s = base({ shelves: [{ id: "x", source: { id: "heroic_library_v2" } }] });
    expect(settingsMentionAny(s, ["heroic_library"])).toBe(false);
    expect(settingsMentionAny(s, ["heroic_library_v2"])).toBe(true);
  });
});
