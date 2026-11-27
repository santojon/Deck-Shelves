import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mergeSettings, TOMBSTONE_TTL_MS } from "../../domain/settingsMerge";
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

// The clocks below are small numbers; the merge's "now" sits right after them.
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(100); });
afterAll(() => { vi.useRealTimers(); });

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
    expect(ab.shelves.map((s) => s.id)).toEqual(["a", "only_a", "only_b"]);
    expect((ab.shelves.find((s) => s.id === "a") as any).updatedAt).toBe(9);
  });

  it("between same-clock copies that differ only in false or empty fields, the sanitized one wins either way", () => {
    const sanitized = sh("s1", 5);
    const explicit = sh("s1", 5, { heroEnabled: false, highlightRandom: false, sortReverse: [false, false] });
    const a = mk({ shelves: [sanitized] });
    const b = mk({ shelves: [explicit] });
    expect((mergeSettings(a, b) as any).shelves[0]).toEqual(sanitized);
    expect((mergeSettings(b, a) as any).shelves[0]).toEqual(sanitized);
  });

  it("preserves device-unique shelves via union", () => {
    const out = mergeSettings(mk({ shelves: [sh("x", 1)] }), mk({ shelves: [sh("y", 1)] }));
    expect(out.shelves.map((s) => s.id).sort()).toEqual(["x", "y"]);
  });

  it("keeps the active profile device-local — a merge never adopts the other device's", () => {
    const local = mk({ shelves: [sh("a", 5)], activeProfileName: null });
    const remote = mk({ shelves: [sh("a", 9)], activeProfileName: "Showcase" });
    expect((mergeSettings(local, remote) as any).activeProfileName).toBe(null);
    expect((mergeSettings(remote, local) as any).activeProfileName).toBe("Showcase");
    expect((mergeSettings(local, remote).shelves.find((s) => s.id === "a") as any).updatedAt).toBe(9);
  });

  it("keeps showcaseSeen and dev/debug fields device-local — a merge never adopts the other device's", () => {
    const local = mk({ shelves: [sh("a", 5)], showcaseSeen: false, devModeEnabled: false, debugOverlayEnabled: false });
    const remote = mk({ shelves: [sh("a", 9)], showcaseSeen: true, devModeEnabled: true, debugOverlayEnabled: true });
    const out = mergeSettings(local, remote) as any;
    expect(out.showcaseSeen).toBe(false);
    expect(out.devModeEnabled).toBe(false);
    expect(out.debugOverlayEnabled).toBe(false);
    const outRev = mergeSettings(remote, local) as any;
    expect(outRev.showcaseSeen).toBe(true);
    expect(outRev.devModeEnabled).toBe(true);
  });

  it("a tombstone hides a deleted id and a delete beats a stale edit", () => {
    const local = mk({ shelves: [sh("a", 5)] });
    const remote = mk({ shelves: [], syncTombstones: { a: 8 } });
    const out = mergeSettings(local, remote);
    expect(out.shelves.map((s) => s.id)).toEqual([]);
    expect((out as any).syncTombstones.a).toBe(8);
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

describe("mergeSettings — scalars:keepLocal (profile override active)", () => {
  it("keeps the local scalar bag even when the remote clock is newer", () => {
    const local = mk({ showcaseModeEnabled: false, preferencesUpdatedAt: 1 });
    const remote = mk({ showcaseModeEnabled: true, preferencesUpdatedAt: 9 });
    const out = mergeSettings(local, remote, { scalars: "keepLocal" });
    expect((out as any).showcaseModeEnabled).toBe(false);
    expect((out as any).preferencesUpdatedAt).toBe(1);
  });

  it("still merges the per-entity lists while the scalar bag stays local", () => {
    const local = mk({ showcaseModeEnabled: false, preferencesUpdatedAt: 1, shelves: [sh("a", 5)] });
    const remote = mk({ showcaseModeEnabled: true, preferencesUpdatedAt: 9, shelves: [sh("a", 9), sh("b", 4)] });
    const out = mergeSettings(local, remote, { scalars: "keepLocal" });
    expect((out as any).showcaseModeEnabled).toBe(false);
    expect(out.shelves.map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect((out.shelves.find((s) => s.id === "a") as any).updatedAt).toBe(9);
  });
});

describe("mergeSettings — schema version", () => {
  it("keeps the higher schemaVersion even when the other device's scalar bag wins", () => {
    const migrated = mk({ schemaVersion: 2, preferencesUpdatedAt: 1 });
    const older = mk({ schemaVersion: 1, preferencesUpdatedAt: 9 });
    expect((mergeSettings(migrated, older) as any).schemaVersion).toBe(2);
    expect((mergeSettings(older, migrated) as any).schemaVersion).toBe(2);
    expect((mergeSettings(older, migrated, { scalars: "keepLocal" }) as any).schemaVersion).toBe(2);
  });

  it("adds no schemaVersion when neither side carries one", () => {
    const out = mergeSettings(mk({ preferencesUpdatedAt: 1 }), mk({ preferencesUpdatedAt: 2 }));
    expect("schemaVersion" in (out as any)).toBe(false);
  });
});

describe("mergeSettings — expired tombstones", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 200 * DAY;

  it("drops a mark older than the lifetime even when only the other copy still has it", () => {
    vi.setSystemTime(NOW);
    const local = mk({ syncTombstones: { fresh: NOW - DAY } });
    const remote = mk({ syncTombstones: { old: NOW - TOMBSTONE_TTL_MS - 1, fresh: NOW - DAY } });
    expect(mergeSettings(local, remote).syncTombstones).toEqual({ fresh: NOW - DAY });
    expect(mergeSettings(remote, local).syncTombstones).toEqual({ fresh: NOW - DAY });
  });

  it("a copy merged with one that still carries expired marks equals the pruned copy, so a sync settles", () => {
    vi.setSystemTime(NOW);
    const local = mk({ shelves: [sh("a", NOW - 2 * DAY)], syncTombstones: {} });
    const remote = mk({ shelves: [sh("a", NOW - 2 * DAY)], syncTombstones: { gone: NOW - TOMBSTONE_TTL_MS - 5 } });
    const merged = mergeSettings(local, remote);
    expect(merged.syncTombstones).toEqual(local.syncTombstones);
    expect(mergeSettings(merged, remote).syncTombstones).toEqual({});
  });

  it("keeps a mark inside the lifetime and its deletion", () => {
    vi.setSystemTime(NOW);
    const local = mk({ shelves: [] , syncTombstones: { a: NOW - DAY } });
    const remote = mk({ shelves: [sh("a", NOW - 3 * DAY)], syncTombstones: {} });
    const merged = mergeSettings(local, remote);
    expect(merged.syncTombstones).toEqual({ a: NOW - DAY });
    expect(merged.shelves.map((s: any) => s.id)).toEqual([]);
  });
});
