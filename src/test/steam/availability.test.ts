import { describe, it, expect } from "vitest";
import { unavailableReason } from "../../steam/availability";
import { unsupportedFilterType } from "../../steam/filterEval";
import { isSupportedSortKey } from "../../steam/sorting";
import type { ShelfSource } from "../../types";

const filterSource = (items: any[], sort?: string | string[]): ShelfSource =>
  ({ type: "filter", filter: { filterGroup: { mode: "and", items }, ...(sort ? { sort } : {}) } }) as ShelfSource;

describe("unsupportedFilterType", () => {
  it("accepts every known type at any depth", () => {
    const group = { mode: "or" as const, items: [
      { type: "installed", params: {} },
      { type: "merge", params: { mode: "and", items: [{ type: "genres", params: { genres: ["rpg"] } }] } },
    ] };
    expect(unsupportedFilterType(group)).toBeNull();
  });

  it("names a retired or unknown type, even when it is nested or negated", () => {
    expect(unsupportedFilterType({ mode: "and", items: [{ type: "launchCount", params: {} }] })).toBe("launchCount");
    const nested = { mode: "and" as const, items: [
      { type: "installed", params: {} },
      { type: "merge", inverted: true, params: { mode: "or", items: [{ type: "avgSessionMinutes", params: { min: 1 } }] } },
    ] };
    expect(unsupportedFilterType(nested)).toBe("avgSessionMinutes");
    expect(unsupportedFilterType({ mode: "and", items: [{ type: "", params: {} } as any] })).toBe("(empty)");
  });
});

describe("isSupportedSortKey", () => {
  it("knows the built-in keys and refuses retired ones", () => {
    for (const key of ["alphabetical", "recent", "size_on_disk", "price_low", "random", "manual", "friends_playing_now", "owned_games", "completion_percent", "most_friends_owning"]) {
      expect(isSupportedSortKey(key)).toBe(true);
    }
    for (const key of ["most_launched", "ssd_priority", "weighted_random", "nope"]) expect(isSupportedSortKey(key)).toBe(false);
  });
});

describe("unavailableReason", () => {
  it("is null for a query the plugin can run", () => {
    expect(unavailableReason(filterSource([{ type: "installed", params: {} }], "recent"), undefined)).toBeNull();
    expect(unavailableReason({ type: "collection", collectionId: "uc-1" }, ["playtime", "alphabetical"])).toBeNull();
    expect(unavailableReason({ type: "builtin", sourceId: "pinned_games" }, "added")).toBeNull();
    expect(unavailableReason({ type: "smart", mode: "quick_play" } as any, "recent")).toBeNull();
  });

  it("refuses a retired sort at the shelf level and inside a filter source", () => {
    expect(unavailableReason({ type: "tab", tab: "all" }, "most_launched")).toBe("sort most_launched");
    expect(unavailableReason({ type: "tab", tab: "all" }, ["recent", "oldest_installed"])).toBe("sort oldest_installed");
    expect(unavailableReason(filterSource([], "largest_install"), undefined)).toBe("sort largest_install");
  });

  it("refuses a retired condition wherever it sits", () => {
    expect(unavailableReason(filterSource([{ type: "launchOptionTags", params: {} }]), undefined)).toBe("condition launchOptionTags");
    expect(unavailableReason({ type: "collection", collectionId: "uc-1", childFilter: { mode: "and", items: [{ type: "dlcOwned", params: {} }] } }, undefined)).toBe("condition dlcOwned");
    const composite: ShelfSource = { type: "composite", combine: "union", sources: [
      { type: "tab", tab: "all" },
      { type: "wishlist", childFilter: { mode: "or", items: [{ type: "executableType", params: {} }] } },
    ] };
    expect(unavailableReason(composite, undefined)).toBe("condition executableType");
  });

  it("refuses a retired built-in source and a retired smart mode", () => {
    expect(unavailableReason({ type: "builtin", sourceId: "heroic_library" }, undefined)).toBe("source heroic_library");
    expect(unavailableReason({ type: "smart", mode: "never_touched_classics" } as any, undefined)).toBe("smart mode never_touched_classics");
    expect(unavailableReason({ type: "smart", mode: "quick_play", compositeModes: ["monthly_spotlight"] } as any, undefined)).toBe("smart mode monthly_spotlight");
    expect(unavailableReason({ type: "smart", mode: "custom", filterGroup: { mode: "and", items: [{ type: "storageDevice", params: {} }] } } as any, undefined)).toBe("condition storageDevice");
  });
});
