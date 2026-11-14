import { describe, it, expect, vi } from "vitest";

/* The filter group on a wishlist or store shelf combines its conditions like the library's: and/or,
   inversion, and a personal condition that says nothing about a game the user does not own. */

vi.mock("../../runtime/logger", () => ({ logInfo: () => {}, logWarn: () => {} }));
vi.mock("../../store/settingsStore", () => ({ getCurrentSettings: () => null }));
vi.mock("../../core/onlineStore", () => ({ getPriceMap: async () => new Map() }));
vi.mock("../../steam/localLibrary", () => ({ getLocalLibraryAppIds: () => new Set<number>() }));

import { matchesWishlistChildFilter } from "../../steam/onlineResolvers";

const installed = { type: "installed" };
const notInstalled = { type: "installed", inverted: true };
const owned = { appid: 10, installed: true } as any;
const ownedOff = { appid: 11, installed: false } as any;

describe("wishlist filter group", () => {
  it("needs every condition with and, one with or", () => {
    const items = [installed, notInstalled];
    expect(matchesWishlistChildFilter({ mode: "and", items }, 10, owned)).toBe(false);
    expect(matchesWishlistChildFilter({ mode: "or", items }, 10, owned)).toBe(true);
  });

  it("applies inversion", () => {
    expect(matchesWishlistChildFilter({ mode: "and", items: [notInstalled] }, 11, ownedOff)).toBe(true);
    expect(matchesWishlistChildFilter({ mode: "and", items: [notInstalled] }, 10, owned)).toBe(false);
  });

  it("lets a personal condition neither pass nor fail a game the user does not own", () => {
    expect(matchesWishlistChildFilter({ mode: "and", items: [installed] }, 99, undefined)).toBe(true);
    expect(matchesWishlistChildFilter({ mode: "and", items: [notInstalled] }, 99, undefined)).toBe(true);
    const withCatalog = [installed, { type: "genres", params: { genres: ["__none__"] } }];
    expect(matchesWishlistChildFilter({ mode: "or", items: withCatalog }, 99, undefined)).toBe(false);
  });
});
