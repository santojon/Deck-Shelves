import { describe, it, expect } from "vitest";
import { mergeSettings } from "../../domain/settingsMerge";
import { defaultSettings } from "../../domain/defaults";
import type { Settings } from "../../types";

const sh = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({
  id, updatedAt, title: id, enabled: true, hidden: false, limit: 20,
  source: { type: "filter", filter: {} }, ...extra,
});

const mk = (o: Record<string, unknown>): Settings => ({
  ...defaultSettings(),
  shelves: [], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [],
  syncTombstones: {}, preferencesUpdatedAt: 0, ...o,
}) as unknown as Settings;

describe("mergeSettings — cross-device convergence", () => {
  it("is idempotent on synced fields: merge(x,x) equals x", () => {
    const x = mk({ shelves: [sh("a", 5), sh("b", 3)], preferencesUpdatedAt: 10 });
    const out = mergeSettings(x, x);
    expect(out.shelves.map((s) => s.id)).toEqual(["a", "b"]);
    expect(out.shelves).toEqual(x.shelves);
    expect((out as any).preferencesUpdatedAt).toBe(10);
  });

  it("converges symmetrically: merge(a,b) equals merge(b,a) on shelves", () => {
    const a = mk({ shelves: [sh("a", 5), sh("only_a", 2)], preferencesUpdatedAt: 7 });
    const b = mk({ shelves: [sh("a", 9), sh("only_b", 4)], preferencesUpdatedAt: 3 });
    const ab = mergeSettings(a, b);
    const ba = mergeSettings(b, a);
    expect(ab.shelves).toEqual(ba.shelves);
    // per-id LWW keeps the newer "a" (updatedAt 9), union keeps both uniques.
    expect(ab.shelves.map((s) => s.id)).toEqual(["a", "only_a", "only_b"]);
    expect((ab.shelves.find((s) => s.id === "a") as any).updatedAt).toBe(9);
  });

  it("preserves device-unique shelves via union", () => {
    const out = mergeSettings(mk({ shelves: [sh("x", 1)] }), mk({ shelves: [sh("y", 1)] }));
    expect(out.shelves.map((s) => s.id).sort()).toEqual(["x", "y"]);
  });

  it("keeps the active profile device-local — a merge never adopts the other device's", () => {
    // This device is handheld (no profile); the other pushed a 'Showcase' profile.
    // The merge must keep THIS device's activeProfileName, not cross it over.
    const local = mk({ shelves: [sh("a", 5)], activeProfileName: null });
    const remote = mk({ shelves: [sh("a", 9)], activeProfileName: "Showcase" });
    expect((mergeSettings(local, remote) as any).activeProfileName).toBe(null);
    // And symmetrically from the other side: the device on 'Showcase' keeps it.
    expect((mergeSettings(remote, local) as any).activeProfileName).toBe("Showcase");
    // Shelves still converge (per-id LWW) regardless of the local-only field.
    expect((mergeSettings(local, remote).shelves.find((s) => s.id === "a") as any).updatedAt).toBe(9);
  });

  it("a tombstone hides a deleted id and a delete beats a stale edit", () => {
    const local = mk({ shelves: [sh("a", 5)] });
    const remote = mk({ shelves: [], syncTombstones: { a: 8 } });
    const out = mergeSettings(local, remote);
    expect(out.shelves.map((s) => s.id)).toEqual([]);
    expect((out as any).syncTombstones.a).toBe(8);
    // symmetric
    expect(mergeSettings(remote, local).shelves.map((s) => s.id)).toEqual([]);
  });

  it("an edit newer than the delete revives the entity", () => {
    const local = mk({ shelves: [sh("a", 12)] });
    const remote = mk({ shelves: [], syncTombstones: { a: 8 } });
    expect(mergeSettings(local, remote).shelves.map((s) => s.id)).toEqual(["a"]);
    expect(mergeSettings(remote, local).shelves.map((s) => s.id)).toEqual(["a"]);
  });

  it("the scalar bag comes whole from the higher preferencesUpdatedAt", () => {
    const a = mk({ enabled: true, preferencesUpdatedAt: 2 });
    const b = mk({ enabled: false, preferencesUpdatedAt: 9 });
    expect((mergeSettings(a, b) as any).enabled).toBe(false);
    expect((mergeSettings(b, a) as any).enabled).toBe(false);
    expect((mergeSettings(a, b) as any).preferencesUpdatedAt).toBe(9);
  });

  it("device-local fields always come from the local (first) argument", () => {
    const a = mk({ cloudSyncLastSyncedAt: 111, preferencesUpdatedAt: 1 });
    const b = mk({ cloudSyncLastSyncedAt: 999, preferencesUpdatedAt: 9 });
    expect((mergeSettings(a, b) as any).cloudSyncLastSyncedAt).toBe(111);
    expect((mergeSettings(b, a) as any).cloudSyncLastSyncedAt).toBe(999);
  });
});
