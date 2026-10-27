import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../../domain/defaults";

const backend = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../../runtime/host/decky", () => ({ call: backend.call }));

const doc = () => ({ ...defaultSettings(), enabled: true, shelves: [] });

describe("a save that switches a profile", () => {
  let sets: any[];

  beforeEach(() => {
    vi.resetModules();
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, String(v)); },
      removeItem: (k: string) => { data.delete(k); },
    });
    sets = [];
    backend.call.mockReset();
    backend.call.mockImplementation(async (method: string, args: any) => {
      if (method === "get_settings") return doc();
      if (method === "set_settings") { sets.push(args); return true; }
      return null;
    });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("asks the backend for a safety snapshot with that write, and only that one", async () => {
    const store = await import("../../store/settingsStore");
    await store.refreshSettings();
    await vi.waitFor(() => expect(store.isSettingsFileRead()).toBe(true));
    store.snapshotOnNextSave("profile");
    await store.saveSettings({ ...store.getCurrentSettings()!, theme: "a" } as any);
    await store.saveSettings({ ...store.getCurrentSettings()!, theme: "b" } as any);
    expect(sets.map((s) => s.snapshot)).toEqual(["profile", undefined]);
    expect(sets[0].settings.theme).toBe("a");
  });
});
