import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The client's friend store: a friend list and one fetch per friend returning the apps they own.
function friendStore(owned: Record<number, number[]>, failing: number[] = []) {
  const fetches: number[] = [];
  return {
    fetches,
    allFriends: Object.keys(owned).map((id) => ({ accountid: Number(id) })),
    FetchOwnedGames: async (accountid: number) => {
      fetches.push(accountid);
      if (failing.includes(accountid)) throw new Error("private");
      return { setApps: new Set(owned[accountid]) };
    },
  };
}

let mod: typeof import("../../steam/friendsOwned");

beforeEach(async () => {
  vi.resetModules();
  mod = await import("../../steam/friendsOwned");
});

afterEach(() => vi.unstubAllGlobals());

describe("friendsOwned", () => {
  it("counts the friends owning each app, overall and among given friends", async () => {
    vi.stubGlobal("friendStore", friendStore({ 1: [100, 200], 2: [100], 3: [300] }));
    expect(mod.friendsOwningCount(100)).toBe(0);
    await mod.loadFriendsOwned();
    expect(mod.friendsOwningCount(100)).toBe(2);
    expect(mod.friendsOwningCount(200)).toBe(1);
    expect(mod.friendsOwningCount(999)).toBe(0);
    expect(mod.friendsOwningCount(100, [2, 3])).toBe(1);
    expect(mod.friendsOwningCount(100, [3])).toBe(0);
  });

  it("skips a friend whose library cannot be read and loads once while fresh", async () => {
    const fs = friendStore({ 1: [100], 2: [100] }, [2]);
    vi.stubGlobal("friendStore", fs);
    await Promise.all([mod.loadFriendsOwned(), mod.loadFriendsOwned()]);
    await mod.loadFriendsOwned();
    expect(fs.fetches).toEqual([1, 2]);
    expect(mod.friendsOwningCount(100)).toBe(1);
  });

  it("does nothing without a friend store", async () => {
    await mod.loadFriendsOwned();
    expect(mod.friendsOwningCount(100)).toBe(0);
  });
});
