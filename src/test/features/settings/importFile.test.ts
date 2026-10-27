import { describe, expect, it } from "vitest";
import { findAlternativeImport, hasDataForScope, readImportFile } from "../../../features/settings/importFile";
import { mergeCategoriesIntoSettings } from "../../../features/settings/settingsCategories";
import { categoryIdsForScope } from "../../../features/settings/categoryScope";
import { defaultSettings } from "../../../domain/defaults";

const DIR = "/home/deck/Downloads";
const shelf = { id: "s1", title: "One", source: { type: "tab", tab: "all" }, limit: 5, enabled: true, hidden: false };
const smart = { id: "m1", title: "Smart", mode: "on_deck", enabled: true };
// What "Export all" writes (deck-shelves.json): the whole settings document under `state`.
const fullBackup = JSON.stringify({ state: { ...defaultSettings(), shelves: [shelf], smartShelves: [smart] } });

function disk(files: Record<string, string>) {
  return async (path: string) => files[path] ?? null;
}

describe("reading an import file", () => {
  it("takes the shelves out of a full backup for a shelves-only import", async () => {
    const read = await readImportFile(`${DIR}/deck-shelves.json`, "shelves", disk({ [`${DIR}/deck-shelves.json`]: fullBackup }));
    expect(read.kind).toBe("ok");
    const live = { ...defaultSettings(), shelves: [], smartShelves: [{ id: "keep" }] } as any;
    const next = mergeCategoriesIntoSettings(live, (read as any).payload, categoryIdsForScope("shelves"));
    expect(next.shelves.map((s: any) => s.id)).toEqual(["s1"]);
    expect((next.smartShelves as any[]).map((s) => s.id)).toEqual(["keep"]);
  });

  it("tells a missing file, a file that is not JSON, and a file with nothing for the scope apart", async () => {
    const files = disk({ "/a.json": "{ not json", "/b.json": JSON.stringify({ state: { smartShelves: [smart] } }) });
    expect((await readImportFile("/missing.json", "shelves", files)).kind).toBe("not_found");
    expect((await readImportFile("/a.json", "shelves", files)).kind).toBe("invalid");
    expect((await readImportFile("/b.json", "shelves", files)).kind).toBe("empty");
    expect((await readImportFile("/b.json", "smart", files)).kind).toBe("ok");
  });

  it("counts an empty list as nothing to import", () => {
    expect(hasDataForScope({ shelves: [] }, "shelves")).toBe(false);
    expect(hasDataForScope({ smartShelves: [] }, "smart")).toBe(false);
    expect(hasDataForScope({}, "all")).toBe(false);
  });
});

describe("when the named file is missing", () => {
  it("finds the full backup in the same folder for a shelves import", async () => {
    const found = await findAlternativeImport(`${DIR}/deck-shelves-shelves.json`, "shelves", disk({ [`${DIR}/deck-shelves.json`]: fullBackup }));
    expect(found).toBe(`${DIR}/deck-shelves.json`);
  });

  it("skips a file that does not hold what the scope imports, and gives up when nothing fits", async () => {
    const onlySmart = JSON.stringify({ state: { smartShelves: [smart] } });
    const files = disk({ [`${DIR}/deck-shelves-smart-shelves.json`]: onlySmart, [`${DIR}/other.json`]: fullBackup });
    expect(await findAlternativeImport(`${DIR}/deck-shelves-shelves.json`, "shelves", files)).toBeNull();
    expect(await findAlternativeImport(`${DIR}/deck-shelves.json`, "smart", files)).toBe(`${DIR}/deck-shelves-smart-shelves.json`);
  });
});
