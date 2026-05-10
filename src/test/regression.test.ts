import { describe, it, expect } from "vitest";
import { SettingsSchema } from "../types";
import { canBeInverted } from "../components/filter/utils";
import { evaluateFilterGroup, type AppOverview } from "../steam";

/**
 * Regression coverage for the 2.1.2 → 2.2.0 batch.
 * Each test pins a recently-fixed bug so future edits can't silently
 * reintroduce it.
 */

describe("SettingsSchema — Python sanitizer compatibility", () => {
  // Reproduces the bug report: "after the changes nothing saves anymore,
  // shelves on home get deactivated". Root cause was Zod rejecting `null`
  // for the new `updateNotify*` fields (main.py emits `null` when unset),
  // failing the entire safeParse and falling back to defaults — wiping the
  // user's shelves on every load.
  it("accepts null for updateNotifyEnabled (sanitizer default)", () => {
    const parsed = SettingsSchema.safeParse({
      enabled: true, shelves: [], smartShelves: [],
      updateNotifyEnabled: null,
      updateNotifyDismissedVersion: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // The schema transforms null → true so callers always see a boolean.
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

describe("Filter editor — invertibility (#56)", () => {
  it("collection filter is invertible after #56 fix", () => {
    expect(canBeInverted("collection")).toBe(true);
  });

  // Pin the rest so a future edit removing them is caught.
  it.each(["favorites", "deckCompatibility", "shortcutType", "appStatus", "playedWithinDays", "playtimeRange", "nameIncludes", "nameRegex", "developer", "publisher", "cloudAvailable", "controllerSupport"] as const)(
    "%s remains invertible",
    (type) => { expect(canBeInverted(type as any)).toBe(true); },
  );

  // Types whose evaluator semantics make negation meaningless or trivially
  // expressible without a flag.
  it.each(["installed", "nonSteam", "hidden", "updatePending", "merge"] as const)(
    "%s is intentionally not invertible",
    (type) => { expect(canBeInverted(type as any)).toBe(false); },
  );
});

describe("Collection filter — Bazzite #55 fix", () => {
  const apps: AppOverview[] = [
    { appid: 100, display_name: "Game A" } as any,
    { appid: 200, display_name: "Game B" } as any,
    { appid: 300, display_name: "Game C" } as any,
  ];

  it("excludes everything when collectionId is non-empty but lookup is missing", () => {
    // Repro of #55: previously, a missing/empty lookup result silently
    // passed every app through, making the shelf appear to leak the entire
    // library. Now: empty lookup → exclude all.
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
  // Pinning the compareSemver behavior because the update banner's hasUpdate
  // logic depends on it; an off-by-one here would either spam or hide updates.
  it("ignores leading 'v' and pre-release suffixes", async () => {
    const { compareSemver } = await import("../core/updateNotifier");
    expect(compareSemver("v2.2.0", "2.1.1")).toBe(1);
    expect(compareSemver("2.1.1", "v2.2.0")).toBe(-1);
    expect(compareSemver("2.1.0", "2.1.0")).toBe(0);
    expect(compareSemver("2.1.0-beta.1", "2.1.0")).toBe(0);
    expect(compareSemver("3.0.0", "2.99.99")).toBe(1);
    expect(compareSemver("2.10.0", "2.9.0")).toBe(1);
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
      expect(calls).toBe(1); // single-flight + TTL cache
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
