import { describe, it, expect } from "vitest";
import { SettingsSchema } from "../../types";
import {
  SETTINGS_CATEGORIES,
  detectCategoriesInPayload,
  unwrapPayload,
  buildExportPayload,
} from "../../features/settings/settingsCategories";

describe("SETTINGS_CATEGORIES coverage", () => {
  it("covers every SettingsSchema field exactly once", () => {
    const schemaKeys = Object.keys(SettingsSchema.shape);
    const owner = new Map<string, string>();
    for (const cat of SETTINGS_CATEGORIES) {
      for (const k of cat.keys) {
        expect(owner.has(k), `"${k}" claimed by both "${owner.get(k)}" and "${cat.id}"`).toBe(false);
        owner.set(k, cat.id);
      }
    }
    const missing = schemaKeys.filter((k) => !owner.has(k));
    expect(missing).toEqual([]);
  });
});

describe("Export All wrapper (CRITICAL-NOW.md item 6)", () => {
  it("a pre-wrapper export (bare { state }, no format/version) still detects and unwraps", () => {
    const legacy = { state: { shelves: [{ id: "a" }], enabled: true } };
    const present = detectCategoriesInPayload(legacy);
    expect(present.has("shelves")).toBe(true);
    expect(present.has("behaviour")).toBe(true);
    expect(unwrapPayload(legacy)).toEqual(legacy.state);
  });

  it("the versioned wrapper's extra fields don't interfere with detection/unwrap", () => {
    const wrapped = buildExportPayload(
      { shelves: [{ id: "a" }], enabled: true },
      ["shelves", "behaviour"],
      { appVersion: "3.3.2", schemaVersion: 1 },
    );
    expect(wrapped.format).toBe("deck-shelves-settings");
    expect(wrapped.formatVersion).toBe(1);
    expect(wrapped.appVersion).toBe("3.3.2");
    expect(wrapped.schemaVersion).toBe(1);
    expect(typeof wrapped.createdAt).toBe("string");
    expect(wrapped.scope).toEqual(["shelves", "behaviour"]);

    const present = detectCategoriesInPayload(wrapped);
    expect(present.has("shelves")).toBe(true);
    expect(present.has("behaviour")).toBe(true);
    expect(unwrapPayload(wrapped)).toEqual({ shelves: [{ id: "a" }], enabled: true });
  });
});
