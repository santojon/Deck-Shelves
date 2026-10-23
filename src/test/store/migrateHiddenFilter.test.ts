import { describe, it, expect } from "vitest";
import { migrate, SCHEMA_VERSION } from "../../store/settingsStore";
import { createDefaultSmartShelf, createHiddenGamesExcludeItem, defaultSettings } from "../../domain/defaults";
import { mergeSettings } from "../../domain/settingsMerge";
import { SettingsSchema, type FilterGroup, type Settings } from "../../types";
import { evaluateFilterGroup } from "../../steam/filterEval";
import type { AppOverview } from "../../steam";
import smartShelvesFixture from "../fixtures/v2.0.0/smart-shelves.json";

/* Smart shelves made before the hidden-games default have no `hidden` filter
   item, so Steam-hidden games keep surfacing on them. migrate() appends the
   same item a new smart shelf gets, once per document: a later removal by the
   user sticks, and the migrated copy wins a cloud-sync merge against the old one. */

const HIDDEN_EXCLUDE = createHiddenGamesExcludeItem();
const INSTALLED = { type: "installed", inverted: false, params: {} };
const FAVORITES = { type: "favorites", inverted: false, params: {} };

function smart(id: string, extra: Record<string, unknown> = {}): Record<string, any> {
  return { id, title: id, mode: "on_deck", enabled: true, hidden: false, ...extra };
}

function doc(smartShelves: unknown[], extra: Record<string, unknown> = {}): Settings {
  return { ...defaultSettings(), smartShelves, ...extra } as Settings;
}

const smartOf = (out: Settings, id: string) => (out.smartShelves as any[]).find((s) => s.id === id);
const hiddenItemsOf = (sh: any) => ((sh?.filterGroup?.items ?? []) as any[]).filter((it) => it.type === "hidden");

function app(overrides: Partial<AppOverview> & { appid: number }): AppOverview {
  return { display_name: `App ${overrides.appid}`, ...overrides } as AppOverview;
}

describe("migrate(): hidden-games filter on old smart shelves", () => {
  it("gives a smart shelf without a filter group the same group a new smart shelf gets", () => {
    const out = migrate(doc([smart("old")]));
    expect(smartOf(out, "old").filterGroup).toEqual(createDefaultSmartShelf("on_deck", "x").filterGroup);
  });

  it("appends the item to an `and` group, keeping the existing items in order", () => {
    const items = [INSTALLED, FAVORITES];
    const out = migrate(doc([smart("and", { filterGroup: { mode: "and", items } })]));
    expect(smartOf(out, "and").filterGroup).toEqual({ mode: "and", items: [...items, HIDDEN_EXCLUDE] });
  });

  it("folds an `or` group into a merge item so the exclusion applies on top of it", () => {
    const items = [{ type: "isNew", inverted: false, params: {} }, { type: "updatePending", inverted: false, params: {} }];
    const out = migrate(doc([smart("or", { filterGroup: { mode: "or", items } })]));
    const group = smartOf(out, "or").filterGroup as FilterGroup;
    expect(group).toEqual({
      mode: "and",
      items: [{ type: "merge", inverted: false, params: { mode: "or", items } }, HIDDEN_EXCLUDE],
    });
    const apps = [
      app({ appid: 1, update_pending: true }),
      app({ appid: 2, update_pending: true, is_hidden: true } as any),
      app({ appid: 3, update_pending: false }),
    ];
    expect(evaluateFilterGroup(group, apps).map((a) => a.appid)).toEqual([1]);
  });

  it("leaves a smart shelf that already has a hidden item alone, whatever its mode", () => {
    const only = smart("only", { filterGroup: { mode: "and", items: [{ type: "hidden", inverted: false, params: { mode: "only" } }] } });
    const any = smart("any", { filterGroup: { mode: "or", items: [{ type: "hidden", inverted: false, params: { mode: "any" } }, FAVORITES] } });
    const nested = smart("nested", { filterGroup: { mode: "and", items: [{ type: "merge", inverted: false, params: { mode: "or", items: [{ type: "hidden", inverted: false, params: { mode: "only" } }] } }] } });
    const out = migrate(doc([only, any, nested]));
    expect(smartOf(out, "only").filterGroup).toEqual(only.filterGroup);
    expect(smartOf(out, "any").filterGroup).toEqual(any.filterGroup);
    expect(smartOf(out, "nested").filterGroup).toEqual(nested.filterGroup);
  });

  it("runs once: a document already at the current version keeps a shelf without the item", () => {
    // The user removed the condition and saved — it must stay removed on the next load.
    const edited = smart("edited", { updatedAt: 1234, filterGroup: { mode: "and", items: [INSTALLED] } });
    const out = migrate(doc([edited], { schemaVersion: SCHEMA_VERSION }));
    expect(smartOf(out, "edited")).toEqual(edited);
  });

  it("is idempotent: a second pass changes nothing and keeps a single hidden item", () => {
    const once = migrate(doc([smart("a"), smart("b", { filterGroup: { mode: "or", items: [FAVORITES] } })]));
    const twice = migrate(once);
    expect(twice).toEqual(once);
    for (const sh of twice.smartShelves as any[]) expect(hiddenItemsOf(sh)).toHaveLength(1);
  });

  it("adds nothing twice when a document is dragged back to an older version", () => {
    const once = migrate(doc([smart("a"), smart("b", { filterGroup: { mode: "or", items: [INSTALLED] } })]));
    const again = migrate({ ...once, schemaVersion: SCHEMA_VERSION - 1 } as Settings);
    expect(again.smartShelves).toEqual(once.smartShelves);
  });

  it("never touches regular shelves, even one with a filter group of its own", () => {
    const shelves = [{ id: "r", title: "R", enabled: true, hidden: false, limit: 20, updatedAt: 5, source: { type: "filter", filter: { filterGroup: { mode: "and", items: [INSTALLED] } } } }];
    const out = migrate(doc([smart("s")], { shelves }));
    expect(out.shelves).toEqual(shelves);
  });

  it("moves the shelf's clock one tick up and keeps the rest of its fields", () => {
    const out = migrate(doc([smart("s", { updatedAt: 1234, limit: 7, sort: "recent", visibleDaysOfWeek: [0, 6] })]));
    const sh = smartOf(out, "s");
    expect(sh.updatedAt).toBe(1235);
    expect(sh.limit).toBe(7);
    expect(sh.sort).toBe("recent");
    expect(sh.visibleDaysOfWeek).toEqual([0, 6]);
  });

  it("gives a never-edited shelf the tick above the backfill epoch", () => {
    expect(smartOf(migrate(doc([smart("fresh")])), "fresh").updatedAt).toBe(2);
  });

  it("wins a cloud-sync merge against the un-migrated copy, whichever side is local", () => {
    const original = doc([
      smart("none", { updatedAt: 1234 }),
      smart("and", { updatedAt: 1234, filterGroup: { mode: "and", items: [INSTALLED] } }),
      smart("or", { updatedAt: 1234, filterGroup: { mode: "or", items: [INSTALLED, FAVORITES] } }),
    ]);
    const migrated = migrate(original);
    for (const merged of [mergeSettings(migrated, original), mergeSettings(original, migrated)]) {
      for (const id of ["none", "and", "or"]) expect(hiddenItemsOf(smartOf(merged, id))).toHaveLength(1);
    }
  });

  it("still loses to a real edit of the same shelf", () => {
    const original = doc([smart("s", { updatedAt: 1234 })]);
    const migrated = migrate(original);
    const edited = { ...original, smartShelves: [smart("s", { updatedAt: Date.now(), title: "Renamed" })] } as Settings;
    expect(smartOf(mergeSettings(migrated, edited), "s").title).toBe("Renamed");
  });

  it("leaves a malformed filter group alone instead of throwing", () => {
    const bad = smart("bad", { updatedAt: 1234, filterGroup: { mode: "and", items: {} } });
    const out = migrate(doc([bad]));
    expect(smartOf(out, "bad")).toEqual(bad);
  });

  it("still never touches a document written by a newer version", () => {
    const newer = doc([smart("old")], { schemaVersion: SCHEMA_VERSION + 1 });
    expect(migrate(newer)).toBe(newer);
  });

  it("upgrades every smart shelf of the v2.0.0 fixture, including its `or` group", () => {
    const parsed = SettingsSchema.safeParse(smartShelvesFixture);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    const out = migrate(parsed.data);
    expect(out.smartShelves).toHaveLength(smartShelvesFixture.smartShelves.length);
    for (const sh of out.smartShelves as any[]) {
      expect(sh.filterGroup.items).toContainEqual(HIDDEN_EXCLUDE);
    }
    const mix = smartOf(out, "sm_33333333").filterGroup as FilterGroup;
    expect(mix.mode).toBe("and");
    expect(mix.items[0].type).toBe("merge");
    expect(mix.items[0].params?.mode).toBe("or");
    expect(mix.items[0].params?.items).toHaveLength(2);
  });
});
