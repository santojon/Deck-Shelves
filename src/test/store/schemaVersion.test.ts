import { describe, it, expect } from "vitest";
import { migrate, SCHEMA_VERSION } from "../../store/settingsStore";
import { defaultSettings } from "../../domain/defaults";

const base = () => ({ ...defaultSettings() });

describe("settings schemaVersion migration (§4B)", () => {
  it("stamps the current version on an unversioned document", () => {
    const out = migrate(base() as any);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("leaves a same-version document's version unchanged", () => {
    const out = migrate({ ...base(), schemaVersion: SCHEMA_VERSION } as any);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("NEVER downgrades a newer document (higher schemaVersion is preserved)", () => {
    const newer = { ...base(), schemaVersion: SCHEMA_VERSION + 5 } as any;
    const out = migrate(newer);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION + 5);
    expect(out).toBe(newer); // returned untouched, no migration applied
  });

  it("still applies forward migrations for an older document", () => {
    const old = { ...base(), schemaVersion: 0, shelves: [{ id: "a", title: "A", enabled: true, source: { type: "tab", tab: "recent" } }] } as any;
    const out = migrate(old);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect((out.shelves[0].source as any).type).toBe("filter");
  });
});
