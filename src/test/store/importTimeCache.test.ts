import { afterEach, describe, expect, it, vi } from "vitest";
import { createHiddenGamesExcludeItem, defaultSettings } from "../../domain/defaults";

vi.mock("../../runtime/host/decky", () => ({ call: vi.fn(async () => null) }));

const CACHE_KEY = "deck-shelves-settings-cache-v3";
const STORE_SOURCE = import.meta.glob<string>("../../store/settingsStore.ts", { query: "?raw", import: "default", eager: true });

/* The store reads its local copy once, when the module loads. The shipped bundle turns the module's
   constants into plain assignments in source order, so whatever that read uses must be set above it:
   below it a value is still undefined in the bundle (and throws in source, which hides the read). */
describe("the local copy the store reads when it loads", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is migrated like the settings file: an old smart shelf gains the hidden-games condition", async () => {
    vi.resetModules();
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, String(v)); },
      removeItem: (k: string) => { data.delete(k); },
    });
    const old = { id: "old", title: "old", mode: "on_deck", enabled: true, filterGroup: { mode: "and", items: [] } };
    data.set(CACHE_KEY, JSON.stringify({ ...defaultSettings(), schemaVersion: 1, smartShelves: [old] }));
    const store = await import("../../store/settingsStore");
    const loaded = store.getCurrentSettings();
    expect(loaded?.schemaVersion).toBe(store.SCHEMA_VERSION);
    expect((loaded?.smartShelves as any[])[0].filterGroup.items).toContainEqual(createHiddenGamesExcludeItem());
  });

  it("comes after every constant that read uses", () => {
    const source = Object.values(STORE_SOURCE)[0];
    const read = source.indexOf("const _init = readCache()");
    expect(read).toBeGreaterThan(0);
    for (const name of ["const SCHEMA_VERSION =", "const HIDDEN_FILTER_SCHEMA_VERSION =", "const BACKFILL_EPOCH ="]) {
      expect(source.indexOf(name), name).toBeGreaterThan(-1);
      expect(source.indexOf(name), name).toBeLessThan(read);
    }
  });
});
