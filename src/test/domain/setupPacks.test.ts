import { describe, it, expect } from "vitest";
import { SETUP_PACKS, setupPackById, previewSetupPack, applySetupPack, revertSetupApply, recommendedPackIds } from "../../domain/setupPacks";
import { SHELF_TEMPLATES, ONLINE_SHELF_TEMPLATES } from "../../domain/templates";
import { SmartShelfModeSchema, type Settings } from "../../types";
import { defaultSettings } from "../../domain/defaults";

const titles = { template: (tpl: any) => `T:${tpl.id}`, smart: (mode: string) => `S:${mode}` };

describe("setup packs — definitions", () => {
  it("every pack references real templates and smart modes, with unique ids", () => {
    const tplIds = new Set([...SHELF_TEMPLATES, ...ONLINE_SHELF_TEMPLATES].map((t) => t.id));
    const modes = new Set(SmartShelfModeSchema.options);
    const ids = new Set<string>();
    for (const p of SETUP_PACKS) {
      expect(ids.has(p.id)).toBe(false); ids.add(p.id);
      for (const t of p.templates) expect(tplIds.has(t)).toBe(true);
      for (const m of p.smart) expect(modes.has(m)).toBe(true);
    }
    expect(setupPackById("backlog_rescue")?.group).toBe("pack");
  });
});

describe("setup packs — preview, apply, revert", () => {
  it("applies non-destructively, enables the plugin and smart shelves, and records what it did", () => {
    const base = defaultSettings();
    const pack = setupPackById("backlog_rescue")!;
    const preview = previewSetupPack(base, pack);
    expect(preview.shelves.every((s) => !s.already)).toBe(true);
    expect(preview.settings.map((c) => c.key)).toEqual(["smartShelvesEnabled"]);
    const { next, record } = applySetupPack(base, pack, titles, 123);
    expect(next.enabled).toBe(true);
    expect(next.smartShelvesEnabled).toBe(true);
    expect(next.shelves.map((s) => s.title)).toEqual(["T:never_played"]);
    expect((next.smartShelves ?? []).map((s) => s.mode)).toEqual(["backlog_rescue", "best_unplayed"]);
    expect(record).toMatchObject({ packId: "backlog_rescue", at: 123, prevSettings: { enabled: false, smartShelvesEnabled: false } });
    expect(record.addedShelfIds.length).toBe(1);
    expect(record.addedSmartIds.length).toBe(2);
    expect((next as any).lastSetupApply).toEqual(record);
  });

  it("skips templates and smart modes the user already has", () => {
    const base = defaultSettings();
    const first = applySetupPack(base, setupPackById("portable_deck")!, titles).next;
    const again = previewSetupPack(first, setupPackById("portable_deck")!);
    expect(again.shelves.every((s) => s.already)).toBe(true);
    expect(again.smart.every((s) => s.already)).toBe(true);
    const twice = applySetupPack(first, setupPackById("portable_deck")!, titles).next;
    expect(twice.shelves.length).toBe(first.shelves.length);
    expect(twice.smartShelves?.length).toBe(first.smartShelves?.length);
  });

  it("reverts exactly the apply: added shelves go, moved settings come back, later user shelves stay", () => {
    const base: Settings = { ...defaultSettings(), enabled: true };
    const { next, record } = applySetupPack(base, setupPackById("living_room")!, titles);
    expect(next.shelfHeroBackground).toBe(true);
    expect(next.globalHeroEnabled).toBe(true);
    expect(next.globalFullPageShelf).toBe(true);
    expect(next.globalEnableLogo).toBe(true);
    const withUserShelf: Settings = { ...next, shelves: [...next.shelves, { ...next.shelves[0], id: "user-1", title: "Mine" }] };
    const reverted = revertSetupApply(withUserShelf, record);
    expect(reverted.shelves.map((s) => s.id)).toEqual(["user-1"]);
    expect(reverted.smartShelves ?? []).toEqual([]);
    expect(reverted.shelfHeroBackground).toBe(false);
    expect(reverted.globalHighlightFirst).toBe(false);
    // Optional keys come back as they were — unset — not as an explicit false.
    expect(reverted.globalHeroEnabled).toBeFalsy();
    expect(reverted.globalFullPageShelf).toBeFalsy();
    expect(reverted.smartShelvesEnabled).toBe(false);
    expect((reverted as any).lastSetupApply).toBeNull();
  });

  it("recommends packs from the suggestion hints and the empty-library case", () => {
    expect(recommendedPackIds([], false)).toEqual(["essential"]);
    expect(recommendedPackIds([{ templateId: "never_played" }, { smartMode: "rediscover" }], true)).toEqual(["backlog_rescue", "rediscover"]);
  });
});
