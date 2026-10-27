import { describe, expect, it } from "vitest";
import {
  ACCOUNT_FIELDS, LEGACY_BUCKET, assignOwner, chooseForAccount, decideAccount, otherAccountCount,
  restoreAccount, setPerAccount,
} from "../../domain/accountBuckets";
import { defaultSettings } from "../../domain/defaults";
import { DEVICE_LOCAL_FIELDS, LOCAL_ONLY_FIELDS } from "../../domain/settingsMerge";
import { takeSnapshot } from "../../features/settings/controller/profiles";

const A = "aaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbb";
const shelf = (id: string) => ({ id, title: id });

function doc(extra: Record<string, unknown> = {}): any {
  return { ...defaultSettings(), theme: "dark", shelves: [shelf("a1")], profiles: [{ id: "p", name: "A's" }], ...extra };
}

describe("whose settings a signed-in account gets", () => {
  it("nothing to do for the owner, or when the settings are shared", () => {
    expect(decideAccount(doc({ accountSettings: { owner: A } }), A, A)).toBe("none");
    expect(decideAccount(doc({ accountSettings: { mode: "shared", owner: A } }), B, A)).toBe("none");
  });

  it("settings from before: taken only by the account that last used the device, else asked", () => {
    expect(decideAccount(doc(), A, A)).toBe("assign");
    expect(decideAccount(doc(), A, undefined)).toBe("ask-legacy");
    expect(decideAccount(doc(), A, B)).toBe("ask-legacy");
  });

  it("another account: its own settings come back, or it is asked when it has none", () => {
    expect(decideAccount(doc({ accountSettings: { owner: A, buckets: { [B]: {} } } }), B, A)).toBe("restore");
    expect(decideAccount(doc({ accountSettings: { owner: A } }), B, A)).toBe("ask-new");
  });
});

describe("moving settings between accounts", () => {
  it("restoring swaps only the account's own fields; the look stays with the device", () => {
    const s = doc({ accountSettings: { owner: A, buckets: { [B]: { shelves: [shelf("b1")], profiles: [] } } } });
    const next: any = restoreAccount(s, B);
    expect(next.shelves.map((x: any) => x.id)).toEqual(["b1"]);
    expect(next.profiles).toEqual([]);
    expect(next.theme).toBe("dark");
    expect(next.accountSettings.owner).toBe(B);
    expect(next.accountSettings.buckets[A].shelves.map((x: any) => x.id)).toEqual(["a1"]);
    expect(next.accountSettings.buckets[B]).toBeUndefined();
    // And back again, nothing lost.
    const back: any = restoreAccount(next, A);
    expect(back.shelves.map((x: any) => x.id)).toEqual(["a1"]);
    expect(back.accountSettings.buckets[B].shelves.map((x: any) => x.id)).toEqual(["b1"]);
  });

  it("a new account keeping a copy leaves the previous owner its own", () => {
    const next: any = chooseForAccount(doc({ accountSettings: { owner: A } }), B, "keep");
    expect(next.shelves.map((x: any) => x.id)).toEqual(["a1"]);
    expect(next.accountSettings.owner).toBe(B);
    expect(next.accountSettings.buckets[A].shelves.map((x: any) => x.id)).toEqual(["a1"]);
  });

  it("starting fresh puts what was shown away: for its owner, or as the device's earlier settings", () => {
    const fresh: any = chooseForAccount(doc({ accountSettings: { owner: A } }), B, "fresh");
    expect(fresh.shelves).toEqual([]);
    expect(fresh.profiles).toEqual([]);
    expect(fresh.accountSettings.buckets[A].shelves.map((x: any) => x.id)).toEqual(["a1"]);
    const legacy: any = chooseForAccount(doc(), A, "fresh");
    expect(legacy.accountSettings.buckets[LEGACY_BUCKET].shelves.map((x: any) => x.id)).toEqual(["a1"]);
    expect(legacy.accountSettings.owner).toBe(A);
    const kept: any = chooseForAccount(doc(), A, "keep");
    expect(kept.accountSettings.buckets ?? {}).toEqual({});
    expect(kept.shelves.map((x: any) => x.id)).toEqual(["a1"]);
  });

  it("sharing keeps everything; turning it back on gives what is shown to the signed-in account", () => {
    const shared: any = setPerAccount(doc({ accountSettings: { owner: A, buckets: { [B]: {} } } }), false, A);
    expect(shared.accountSettings).toEqual({ owner: A, buckets: { [B]: {} }, mode: "shared" });
    const back: any = setPerAccount(shared, true, A);
    expect(back.accountSettings.mode).toBeUndefined();
    expect(back.accountSettings.owner).toBe(A);
    expect(otherAccountCount(back)).toBe(1);
    expect(otherAccountCount(setPerAccount(shared, true, B))).toBe(0); // the owner is not "another" account
    expect(assignOwner(doc(), A)).toMatchObject({ accountSettings: { owner: A } });
  });
});

describe("the other accounts' settings stay on the device", () => {
  it("are device-local: never in a profile, never synced", () => {
    expect(DEVICE_LOCAL_FIELDS).toContain("accountSettings");
    expect(LOCAL_ONLY_FIELDS).toContain("accountSettings");
    expect(takeSnapshot(doc({ accountSettings: { owner: A } }) as any)).not.toHaveProperty("accountSettings");
  });

  it("only lists and shelf references belong to an account", () => {
    expect([...ACCOUNT_FIELDS].sort()).toEqual(
      ["activeProfileName", "allShelvesOrder", "profiles", "savedFilters", "savedSmartFilters", "shelves", "showcaseShelfIds", "smartShelves", "syncTombstones"],
    );
  });
});
