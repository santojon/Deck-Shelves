import { describe, it, expect } from "vitest";
import { SettingsSchema, ShelfSourceSchema } from "../types";
import { evaluateFilterGroup, type AppOverview } from "../steam";

describe("SettingsSchema — Python sanitizer compatibility", () => {
  it("accepts null for updateNotifyEnabled (sanitizer default)", () => {
    const parsed = SettingsSchema.safeParse({
      enabled: true, shelves: [], smartShelves: [],
      updateNotifyEnabled: null,
      updateNotifyDismissedVersion: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.updateNotifyEnabled).toBe(true);
      expect(parsed.data.updateNotifyDismissedVersion).toBeNull();
    }
  });

  it("accepts missing updateNotify* fields (legacy settings.json)", () => {
    const parsed = SettingsSchema.safeParse({ enabled: true, shelves: [], smartShelves: [] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.updateNotifyEnabled).toBe(true);
    }
  });

  it("preserves shelves when updateNotify* fields are null", () => {
    const shelves = [
      { id: "shelf-1", title: "T", source: { type: "tab", tab: "favorites" }, limit: 10 },
    ];
    const parsed = SettingsSchema.safeParse({
      enabled: true, shelves, smartShelves: [],
      updateNotifyEnabled: null,
      updateNotifyDismissedVersion: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.shelves).toHaveLength(1);
      expect(parsed.data.shelves[0].id).toBe("shelf-1");
    }
  });

  it("accepts updateNotifyDismissedVersion as a real string", () => {
    const parsed = SettingsSchema.safeParse({
      enabled: true, shelves: [], smartShelves: [],
      updateNotifyDismissedVersion: "2.2.0",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.updateNotifyDismissedVersion).toBe("2.2.0");
    }
  });
});

describe("Collection filter — Bazzite #55 fix", () => {
  const apps: AppOverview[] = [
    { appid: 100, display_name: "Game A" } as any,
    { appid: 200, display_name: "Game B" } as any,
    { appid: 300, display_name: "Game C" } as any,
  ];

  it("excludes everything when collectionId is non-empty but lookup is missing", () => {
    const result = evaluateFilterGroup(
      { mode: "and", items: [{ type: "collection", inverted: false, params: { collectionId: "uc-rpg" } }] },
      apps,
      { collectionAppIds: new Map() } as any,
    );
    expect(result).toHaveLength(0);
  });

  it("excludes when lookup returned empty Set (lookup happened with 0 hits)", () => {
    const result = evaluateFilterGroup(
      { mode: "and", items: [{ type: "collection", inverted: false, params: { collectionId: "uc-rpg" } }] },
      apps,
      { collectionAppIds: new Map([["uc-rpg", new Set<number>()]]) } as any,
    );
    expect(result).toHaveLength(0);
  });

  it("includes only apps in the collection when lookup is populated", () => {
    const result = evaluateFilterGroup(
      { mode: "and", items: [{ type: "collection", inverted: false, params: { collectionId: "uc-rpg" } }] },
      apps,
      { collectionAppIds: new Map([["uc-rpg", new Set([100, 300])]]) } as any,
    );
    expect(result.map((a) => a.appid).sort()).toEqual([100, 300]);
  });

  it("passes through (no-op) when collectionId is empty (UI half-configured)", () => {
    const result = evaluateFilterGroup(
      { mode: "and", items: [{ type: "collection", inverted: false, params: { collectionId: "" } }] },
      apps,
      { collectionAppIds: new Map() } as any,
    );
    expect(result).toHaveLength(3);
  });

  it("inverted: true returns the complement (Bazzite #56 — negate collection)", () => {
    const result = evaluateFilterGroup(
      { mode: "and", items: [{ type: "collection", inverted: true, params: { collectionId: "uc-rpg" } }] },
      apps,
      { collectionAppIds: new Map([["uc-rpg", new Set([100])]]) } as any,
    );
    expect(result.map((a) => a.appid).sort()).toEqual([200, 300]);
  });
});

describe("Update notifier — semver compare", () => {
  it("ignores leading 'v', compares numeric core, and is pre-release aware", async () => {
    const { compareSemver } = await import("../core/updateNotifier");
    expect(compareSemver("v2.2.0", "2.1.1")).toBe(1);
    expect(compareSemver("2.1.1", "v2.2.0")).toBe(-1);
    expect(compareSemver("2.1.0", "2.1.0")).toBe(0);
    expect(compareSemver("3.0.0", "2.99.99")).toBe(1);
    expect(compareSemver("2.10.0", "2.9.0")).toBe(1);
    expect(compareSemver("2.1.0-beta.1", "2.1.0")).toBe(-1);
    expect(compareSemver("3.0.0", "3.0.0-rc.1")).toBe(1);
    expect(compareSemver("3.0.0-beta.2", "3.0.0-beta.1")).toBe(1);
    expect(compareSemver("3.0.0-rc.1", "3.0.0-beta.5")).toBe(1);
    expect(compareSemver("3.0.0-alpha.1", "3.0.0-beta.1")).toBe(-1);
    expect(compareSemver("3.0.0-beta.2", "3.0.0-beta.2")).toBe(0);
    expect(compareSemver("3.0.0-beta.2+abc1234", "3.0.0-beta.2")).toBe(0);
  });
});

describe("Connectivity helper — TTL cache", () => {
  it("re-using the cache within TTL skips a second probe", async () => {
    const mod = await import("../core/connectivity");
    mod.__resetConnectivityCache();
    let calls = 0;
    const realFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => { calls++; return { ok: true } as Response; };
    try {
      const a = await mod.isOnline();
      const b = await mod.isOnline();
      expect(a).toBe(true);
      expect(b).toBe(true);
      expect(calls).toBe(1);
    } finally {
      (globalThis as any).fetch = realFetch;
      mod.__resetConnectivityCache();
    }
  });

  it("returns false on fetch rejection without throwing", async () => {
    const mod = await import("../core/connectivity");
    mod.__resetConnectivityCache();
    const realFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => { throw new Error("offline"); };
    try {
      const result = await mod.isOnline();
      expect(result).toBe(false);
    } finally {
      (globalThis as any).fetch = realFetch;
      mod.__resetConnectivityCache();
    }
  });
});

describe("Online sort/filter gating", () => {
  it("online-only sorts carry requiresOnline=true", async () => {
    const { SORT_OPTIONS } = await import("../components/qam/modals/editShelf/constants");
    const online = SORT_OPTIONS.filter((o) => (o as any).requiresOnline).map((o) => o.value).sort();
    expect(online).toEqual(["discount_high", "most_friends_owning", "original_price_high", "price_low", "trending_among_friends"]);
  });

  it("isOnlineFilterType returns true only for discount/priceRange", async () => {
    const { isOnlineFilterType } = await import("../components/conditions/utils");
    expect(isOnlineFilterType("discount" as any)).toBe(true);
    expect(isOnlineFilterType("priceRange" as any)).toBe(true);
    expect(isOnlineFilterType("friendsPlayingNow" as any)).toBe(false);
    expect(isOnlineFilterType("friendsPlayedRecently" as any)).toBe(false);
    expect(isOnlineFilterType("installed" as any)).toBe(false);
    expect(isOnlineFilterType("favorites" as any)).toBe(false);
    expect(isOnlineFilterType("playtimeRange" as any)).toBe(false);
  });

  it("isOnlineFeatureFilterType returns true only for genres/categories/franchise", async () => {
    const { isOnlineFeatureFilterType } = await import("../components/conditions/utils");
    expect(isOnlineFeatureFilterType("genres" as any)).toBe(true);
    expect(isOnlineFeatureFilterType("categories" as any)).toBe(true);
    expect(isOnlineFeatureFilterType("franchise" as any)).toBe(true);
    expect(isOnlineFeatureFilterType("multiplayerType" as any)).toBe(false);
    expect(isOnlineFeatureFilterType("vrSupport" as any)).toBe(false);
    expect(isOnlineFeatureFilterType("discount" as any)).toBe(false);
    expect(isOnlineFeatureFilterType("installed" as any)).toBe(false);
  });
});

describe("ShelfSourceSchema — online sources accept excludeOwned", () => {
  it("wishlist source accepts excludeOwned=true", () => {
    const parsed = ShelfSourceSchema.safeParse({ type: "wishlist", excludeOwned: true });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "wishlist") {
      expect((parsed.data as any).excludeOwned).toBe(true);
    }
  });

  it("store source accepts excludeOwned=true alongside childFilter", () => {
    const parsed = ShelfSourceSchema.safeParse({
      type: "store",
      excludeOwned: true,
      childFilter: { mode: "and", items: [] },
    });
    expect(parsed.success).toBe(true);
  });

  it("wishlist source without excludeOwned still parses (back-compat)", () => {
    const parsed = ShelfSourceSchema.safeParse({ type: "wishlist" });
    expect(parsed.success).toBe(true);
  });

  it("non-online sources are unaffected by excludeOwned (extra fields stripped)", () => {
    const parsed = ShelfSourceSchema.safeParse({ type: "tab", tab: "favorites" });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "tab") {
      expect((parsed.data as any).excludeOwned).toBeUndefined();
    }
  });
});
