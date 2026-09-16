import { describe, it, expect } from "vitest";
import { migrate, SCHEMA_VERSION } from "../../store/settingsStore";
import { SettingsSchema } from "../../types";
import minimal from "../fixtures/v2.0.0/minimal.json";
import complex from "../fixtures/v2.0.0/complex.json";
import smartShelves from "../fixtures/v2.0.0/smart-shelves.json";
import manyShelves from "../fixtures/v2.0.0/many-shelves.json";
import customFilters from "../fixtures/v2.0.0/custom-filters.json";

/* Golden fixtures captured against the real v2.0.0 schema (SettingsSchema at
   git tag v2.0.0, before `schemaVersion` existed) — a store-upgrade regression
   test for the exact failure mode that once wiped a user's real shelves (see
   the settings-wipe incident): a document that parses fine on disk must never
   lose shelves/smart shelves/saved filters when the CURRENT normalize/migrate
   pipeline runs on it, no matter how old or unusual its shape. */
const FIXTURES = {
  minimal,
  complex,
  "smart-shelves": smartShelves,
  "many-shelves": manyShelves,
  "custom-filters": customFilters,
} as const;

function loadAndMigrate(raw: unknown) {
  const parsed = SettingsSchema.safeParse(raw);
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw parsed.error;
  return migrate(parsed.data);
}

describe("v2.0.0 → current settings upgrade path", () => {
  for (const [name, raw] of Object.entries(FIXTURES)) {
    it(`${name}.json parses and migrates without data loss`, () => {
      const before = raw as any;
      const out = loadAndMigrate(raw);

      expect(out.schemaVersion).toBe(SCHEMA_VERSION);
      expect(out.shelves).toHaveLength(before.shelves.length);
      expect(out.shelves.map((s: any) => s.id)).toEqual(before.shelves.map((s: any) => s.id));
      expect(out.smartShelves).toHaveLength(before.smartShelves.length);
      expect(out.smartShelves.map((s: any) => s.id)).toEqual(before.smartShelves.map((s: any) => s.id));
      expect(out.savedFilters).toHaveLength(before.savedFilters.length);
      expect(out.savedFilters.map((f: any) => f.id)).toEqual(before.savedFilters.map((f: any) => f.id));
    });
  }

  it("migrates the legacy 'recent' tab source (custom-filters.json) to the filter+sort form", () => {
    const out = loadAndMigrate(customFilters);
    const shelf = out.shelves.find((s) => s.id === "s_recent01") as any;
    expect(shelf.source).toEqual({ type: "filter", filter: { sort: "recent" } });
  });

  it("many-shelves.json (40 shelves) survives at scale", () => {
    const out = loadAndMigrate(manyShelves);
    expect(out.shelves).toHaveLength(40);
  });
});
