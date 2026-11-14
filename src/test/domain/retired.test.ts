import { describe, it, expect } from "vitest";
import { migrateRetiredIds, migrateRetiredSource } from "../../domain/retired";
import { defaultSettings } from "../../domain/defaults";
import type { Settings } from "../../types";

function withShelf(shelf: any, extra: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), shelves: [shelf], ...extra } as Settings;
}

describe("migrateRetiredIds", () => {
  it("returns the same object when nothing is retired", () => {
    const s = withShelf({ id: "a", title: "A", enabled: true, sort: "recent", source: { type: "filter", filter: { sort: "added" } } });
    expect(migrateRetiredIds(s)).toBe(s);
  });

  it("rewrites a retired sort key and flips the direction where the alias was reversed", () => {
    const s = withShelf({ id: "a", title: "A", enabled: true, sort: "most_ignored", sortReverse: false, source: { type: "tab", tab: "all" } });
    const out = migrateRetiredIds(s).shelves[0] as any;
    expect(out.sort).toBe("recent");
    expect(out.sortReverse).toBe(true);
  });

  it("rewrites retired keys inside a chain, flipping only their own direction", () => {
    const s = withShelf({ id: "a", title: "A", enabled: true, sort: ["largest_install", "smallest_install", "playtime"], sortReverse: true, source: { type: "tab", tab: "all" } });
    const out = migrateRetiredIds(s).shelves[0] as any;
    expect(out.sort).toEqual(["size_on_disk", "size_on_disk", "playtime"]);
    expect(out.sortReverse).toEqual([true, false, true]);
  });

  it("rewrites the sort of a filter source where it lives", () => {
    const s = withShelf({ id: "a", title: "A", enabled: true, source: { type: "filter", filter: { sort: "newest_purchased", filterGroup: { mode: "and", items: [] } } } });
    const out = migrateRetiredIds(s).shelves[0] as any;
    expect(out.source.filter.sort).toBe("added");
  });

  it("rewrites retired conditions to their equivalents at any depth", () => {
    const group = {
      mode: "or",
      items: [
        { type: "demo", inverted: false, params: {} },
        { type: "merge", inverted: false, params: { mode: "and", items: [
          { type: "recentlyAbandoned", inverted: true, params: { minDaysAgo: 10, maxDaysAgo: 90 } },
          { type: "exclusionGroup", inverted: false, params: { children: [{ type: "demo", inverted: false, params: {} }] } },
        ] } },
        { type: "installed", inverted: false, params: {} },
      ],
    };
    const s = withShelf({ id: "a", title: "A", enabled: true, source: { type: "filter", filter: { filterGroup: group } } });
    const items = (migrateRetiredIds(s).shelves[0] as any).source.filter.filterGroup.items;
    expect(items[0]).toEqual({ type: "shortcutType", inverted: false, params: { kinds: ["demo"] } });
    const inner = items[1].params.items;
    expect(inner[0]).toEqual({ type: "merge", inverted: true, params: { mode: "and", items: [
      { type: "neglected", inverted: false, params: { days: 10 } },
      { type: "playedWithinDays", inverted: false, params: { days: 90 } },
    ] } });
    expect(inner[1]).toEqual({ type: "exclusionGroup", inverted: false, params: { children: [{ type: "shortcutType", inverted: false, params: { kinds: ["demo"] } }] } });
    expect(items[2]).toEqual({ type: "installed", inverted: false, params: {} });
  });

  it("leaves a retired condition without an equivalent as it was", () => {
    const group = { mode: "and", items: [{ type: "launchCount", inverted: false, params: { min: 3 } }] };
    const s = withShelf({ id: "a", title: "A", enabled: true, source: { type: "filter", filter: { filterGroup: group } } });
    expect(migrateRetiredIds(s)).toBe(s);
  });

  it("turns a retired built-in source into the filter that produces the same games, keeping the order", () => {
    const s = withShelf({ id: "a", title: "A", enabled: true, sort: "recent", sortReverse: true, source: { type: "builtin", sourceId: "dlc_source" } });
    const out = migrateRetiredIds(s).shelves[0] as any;
    expect(out.source.type).toBe("filter");
    expect(out.source.filter.filterGroup.items).toEqual([{ type: "shortcutType", inverted: false, params: { kinds: ["dlc"] } }]);
    expect(out.source.filter.sort).toBe("recent");
    expect(out.source.filter.sortReverse).toBe(true);
  });

  it("rewrites duplicate smart modes to the mode they duplicated, carrying the rotation length", () => {
    const smart = [
      { id: "s1", title: "S1", mode: "long_session_night", enabled: true, hidden: false },
      { id: "s2", title: "S2", mode: "seasonal_rotation", enabled: true, hidden: false, smartParams: { minDeckLevel: 2 } },
      { id: "s3", title: "S3", mode: "monthly_spotlight", enabled: true, hidden: false, smartParams: { rotateEveryDays: 45 } },
      { id: "s4", title: "S4", mode: "hidden_gems", enabled: true, hidden: false, compositeModes: ["never_touched_classics"], compositeCombine: "union" },
    ];
    const out = migrateRetiredIds({ ...defaultSettings(), smartShelves: smart } as unknown as Settings).smartShelves as any[];
    expect(out[0].mode).toBe("long_session");
    expect(out[1]).toMatchObject({ mode: "weekly_rotation", smartParams: { minDeckLevel: 2, rotateEveryDays: 90 } });
    expect(out[2]).toMatchObject({ mode: "weekly_rotation", smartParams: { rotateEveryDays: 45 } });
    expect(out[3]).toMatchObject({ mode: "hidden_gems", compositeModes: ["forgotten"] });
  });

  it("keeps a retired mode without an equivalent, so the shelf survives as unavailable", () => {
    const smart = [{ id: "s1", title: "S1", mode: "almost_finished", enabled: true, hidden: false }];
    const s = { ...defaultSettings(), smartShelves: smart } as unknown as Settings;
    expect(migrateRetiredIds(s)).toBe(s);
  });

  it("also rewrites saved filters and the shelves inside a profile snapshot", () => {
    const s = {
      ...defaultSettings(),
      savedFilters: [{ id: "f", name: "F", group: { mode: "and", items: [{ type: "compatDataQuality", inverted: false, params: {} }] } }],
      profiles: [{ id: "p", name: "P", snapshot: { shelves: [{ id: "a", title: "A", enabled: true, sort: "rediscovered_recently", source: { type: "tab", tab: "all" } }] } }],
    } as unknown as Settings;
    const out = migrateRetiredIds(s) as any;
    expect(out.savedFilters[0].group.items[0]).toEqual({ type: "deckCompatibility", inverted: false, params: { levels: ["verified", "playable", "unsupported"] } });
    expect(out.profiles[0].snapshot.shelves[0].sort).toBe("recent");
  });
});

describe("migrateRetiredSource", () => {
  it("maps a retired built-in source and leaves a live one alone", () => {
    const live = { type: "builtin", sourceId: "pinned_games" } as any;
    expect(migrateRetiredSource(live)).toBe(live);
    expect(migrateRetiredSource({ type: "builtin", sourceId: "controller_specific_source" } as any)).toEqual({
      type: "filter", filter: { filterGroup: { mode: "and", items: [{ type: "controllerSupport", inverted: false, params: { min: 2 } }] } },
    });
  });
});
