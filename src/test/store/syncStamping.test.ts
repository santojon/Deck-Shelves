import { describe, it, expect } from "vitest";
import { stampChanges } from "../../store/settingsStore";
import { defaultSettings } from "../../domain/defaults";
import type { Settings } from "../../types";

const sh = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: id, enabled: true, hidden: false, limit: 20,
  source: { type: "filter", filter: {} }, ...extra,
});

const mk = (o: Record<string, unknown>): Settings => ({
  ...defaultSettings(),
  shelves: [], smartShelves: [], savedFilters: [], savedSmartFilters: [], profiles: [],
  syncTombstones: {}, preferencesUpdatedAt: 0, ...o,
}) as unknown as Settings;

describe("saveSettings sync-stamping (stampChanges)", () => {
  it("stamps a fresh clock on a new or changed entity", () => {
    const prev = mk({ shelves: [sh("a", { updatedAt: 100 })] });
    const next = mk({ shelves: [sh("a", { updatedAt: 100, title: "renamed" }), sh("b")] });
    const out = stampChanges(prev, next) as any;
    const a = out.shelves.find((s: any) => s.id === "a");
    const b = out.shelves.find((s: any) => s.id === "b");
    expect(a.updatedAt).toBeGreaterThan(100); // changed → bumped
    expect(typeof b.updatedAt).toBe("number"); // new → stamped
    expect(out.syncTombstones).toEqual({});
  });

  it("keeps the clock of an unchanged entity", () => {
    const prev = mk({ shelves: [sh("a", { updatedAt: 100 })] });
    const next = mk({ shelves: [{ ...sh("a", { updatedAt: 100 }) }] });
    const out = stampChanges(prev, next) as any;
    expect(out.shelves[0].updatedAt).toBe(100);
  });

  it("tombstones a removed id and clears it when re-created", () => {
    const prev = mk({ shelves: [sh("a", { updatedAt: 100 }), sh("b", { updatedAt: 100 })] });
    const removed = stampChanges(prev, mk({ shelves: [sh("a", { updatedAt: 100 })] })) as any;
    expect(removed.syncTombstones.b).toBeGreaterThan(0);
    const readded = stampChanges(removed, mk({ shelves: removed.shelves.concat([sh("b")]), syncTombstones: removed.syncTombstones })) as any;
    expect("b" in readded.syncTombstones).toBe(false);
    expect(readded.shelves.map((s: any) => s.id).sort()).toEqual(["a", "b"]);
  });

  it("bumps preferencesUpdatedAt only when a scalar changed", () => {
    const prev = mk({ enabled: true, preferencesUpdatedAt: 50 });
    const noScalar = stampChanges(prev, mk({ enabled: true, preferencesUpdatedAt: 50, shelves: [sh("a")] })) as any;
    expect(noScalar.preferencesUpdatedAt).toBe(50);
    const scalar = stampChanges(prev, mk({ enabled: false, preferencesUpdatedAt: 50 })) as any;
    expect(scalar.preferencesUpdatedAt).toBeGreaterThan(50);
  });
});
