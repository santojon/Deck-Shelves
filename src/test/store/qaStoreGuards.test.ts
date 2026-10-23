import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../../domain/defaults";

const backend = vi.hoisted(() => ({ call: vi.fn() }));
const qa = vi.hoisted(() => ({ active: false }));

vi.mock("../../runtime/host/decky", () => ({ call: backend.call }));
// A QA flag whose override leaves the payload untagged (forced errors, update states, a faked device).
vi.mock("../../qa/harness", () => ({
  get qaOverrideActive() { return qa.active; },
  applyQASettingsOverride: (s: any) => s,
  qaSeedActive: () => false,
}));

const CACHE_KEY = "deck-shelves-settings-cache-v3";
const SHARED_STATE_KEY = "__DECK_SHELVES_SHARED_SETTINGS__";
const REAL_BACKUPS = [{ name: "settings-real.json" }];

describe("settings store and QA builds", () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    vi.resetModules();
    mem = new Map();
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); } });
    delete (globalThis as any)[SHARED_STATE_KEY];
    backend.call.mockReset();
    backend.call.mockImplementation(async (method: string) => (method === "list_backups" ? { backups: REAL_BACKUPS } : { ok: true, state: defaultSettings(), backups: [] }));
  });
  afterEach(() => {
    qa.active = false;
    vi.unstubAllGlobals();
    delete (globalThis as any)[SHARED_STATE_KEY];
  });

  it("a QA build caches its edits tagged, so a normal boot refuses them", async () => {
    qa.active = true;
    const store = await import("../../store/settingsStore");
    await store.saveSettings({ ...defaultSettings(), enabled: true, shelves: [] } as any);
    expect(JSON.parse(mem.get(CACHE_KEY)!).__dsQaOverride).toBe(true);
    expect((globalThis as any)[SHARED_STATE_KEY].__dsQaOverride).toBe(true);
    expect(backend.call.mock.calls.map((c) => c[0])).not.toContain("set_settings");
  });

  it("a QA build never restores, creates, imports, deletes or clears real backups", async () => {
    qa.active = true;
    const store = await import("../../store/settingsStore");
    expect(await store.restoreBackup("settings-real.json")).toBeNull();
    expect(await store.createSnapshot()).toEqual(REAL_BACKUPS);
    await store.createPreImportSnapshot();
    expect(await store.deleteBackup("settings-real.json")).toBeNull();
    expect(await store.clearBackups()).toEqual(REAL_BACKUPS);
    expect(await store.importBackupFromFile("/home/deck/backup.json")).toBeNull();
    expect(backend.call.mock.calls.map((c) => c[0]).filter((m) => m !== "list_backups")).toEqual([]);
  });

  it("a normal build caches untagged and runs the backup actions", async () => {
    const store = await import("../../store/settingsStore");
    await store.saveSettings({ ...defaultSettings(), enabled: true, shelves: [] } as any);
    expect(JSON.parse(mem.get(CACHE_KEY)!).__dsQaOverride).toBeUndefined();
    await store.createSnapshot();
    expect(backend.call.mock.calls.map((c) => c[0])).toContain("create_backup");
  });

  it("a normal build drops the QA tag from what it loads and what it saves", async () => {
    const tagged = { ...defaultSettings(), enabled: true, shelves: [], __dsQaOverride: true };
    backend.call.mockImplementation(async (method: string) => (method === "get_settings" ? tagged : true));
    const store = await import("../../store/settingsStore");
    const loaded = await store.refreshSettings();
    expect((loaded as any).__dsQaOverride).toBeUndefined();
    expect((store.getCurrentSettings() as any).__dsQaOverride).toBeUndefined();
    // e.g. a profile snapshot written by an older QA build, applied by a trigger
    await store.saveSettings({ ...defaultSettings(), enabled: false, shelves: [], __dsQaOverride: true } as any);
    const sent = backend.call.mock.calls.filter((c) => c[0] === "set_settings").map((c) => (c[1] as any).settings);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.some((x) => x.__dsQaOverride !== undefined)).toBe(false);
    expect(JSON.parse(mem.get(CACHE_KEY)!).__dsQaOverride).toBeUndefined();
  });
});
