import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../../domain/defaults";

const backend = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock("../../runtime/host/decky", () => ({ call: backend.call }));

const CACHE_KEY = "deck-shelves-settings-cache-v3";
const SAVE_OK_KEY = "deck-shelves-last-save-ok";
const SHARED_STATE_KEY = "__DECK_SHELVES_SHARED_SETTINGS__";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

// The settings file and the local copy disagree: the file has the newer value (the local cache
// reaches disk lazily, so a Steam restart right after a change can leave it behind).
const file = () => ({ ...defaultSettings(), enabled: true, shelves: [], ownQamTabEnabled: true });
const stale = () => ({ ...file(), ownQamTabEnabled: false });

describe("a save made as the plugin starts, before the settings file is read", () => {
  let storage: ReturnType<typeof memoryStorage>;
  let writes: any[];

  beforeEach(() => {
    vi.resetModules();
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    delete (globalThis as any)[SHARED_STATE_KEY];
    writes = [];
    backend.call.mockReset();
    backend.call.mockImplementation(async (method: string, args: any) => {
      if (method === "get_settings") return file();
      if (method === "set_settings") { writes.push(args.settings); return true; }
      return null;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (globalThis as any)[SHARED_STATE_KEY];
  });

  // Like the profile triggers: the first time settings show up, apply a profile and save.
  async function startWithBootWriter() {
    const store = await import("../../store/settingsStore");
    let applied = false;
    store.subscribeSettings((s) => {
      if (applied) return;
      applied = true;
      void store.saveSettings({ ...s, activeProfileName: "Handheld" } as any);
    });
    return store;
  }

  it("keeps the file's newer values: only the fields the save changed are laid over the file", async () => {
    storage.setItem(CACHE_KEY, JSON.stringify(stale()));
    const store = await startWithBootWriter();
    await store.refreshSettings(); // shows the cached copy, reads the file in the background
    await vi.waitFor(() => expect(store.getCurrentSettings()?.activeProfileName).toBe("Handheld"));
    await vi.waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes.every((w) => w.ownQamTabEnabled === true)).toBe(true);
    expect(writes.at(-1)).toMatchObject({ ownQamTabEnabled: true, activeProfileName: "Handheld" });
    expect(store.getCurrentSettings()).toMatchObject({ ownQamTabEnabled: true, activeProfileName: "Handheld" });
  });

  it("a reloaded plugin with an older in-memory copy reads the file before its first write", async () => {
    (globalThis as any)[SHARED_STATE_KEY] = stale();
    const store = await import("../../store/settingsStore");
    const ok = await store.saveSettings({ ...store.getCurrentSettings()!, activeProfileName: "Handheld" } as any);
    expect(ok).toBe(true);
    expect(writes.every((w) => w.ownQamTabEnabled === true)).toBe(true);
    expect(writes.at(-1).activeProfileName).toBe("Handheld");
  });

  it("after a failed save the local copy is the newer one and is written as it is", async () => {
    storage.setItem(CACHE_KEY, JSON.stringify(stale()));
    storage.setItem(SAVE_OK_KEY, "0");
    const store = await import("../../store/settingsStore");
    await store.refreshSettings();
    await vi.waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(writes[0].ownQamTabEnabled).toBe(false);
  });

  it("is written as it is when the file does not answer in time", async () => {
    vi.useFakeTimers();
    storage.setItem(CACHE_KEY, JSON.stringify(stale()));
    backend.call.mockImplementation(async (method: string, args: any) => {
      if (method === "get_settings") throw new Error("backend not ready");
      if (method === "set_settings") { writes.push(args.settings); return true; }
      return null;
    });
    const store = await startWithBootWriter();
    await store.refreshSettings();
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(writes.at(-1)).toMatchObject({ activeProfileName: "Handheld" });
  });

  it("once the file is read, a save goes straight to it", async () => {
    storage.setItem(CACHE_KEY, JSON.stringify(stale()));
    const store = await import("../../store/settingsStore");
    await store.refreshSettings();
    await vi.waitFor(() => expect(store.getCurrentSettings()?.ownQamTabEnabled).toBe(true));
    const reads = backend.call.mock.calls.filter((c) => c[0] === "get_settings").length;
    const ok = await store.saveSettings({ ...store.getCurrentSettings()!, ownQamTabEnabled: false } as any);
    expect(ok).toBe(true);
    expect(writes.at(-1).ownQamTabEnabled).toBe(false);
    expect(backend.call.mock.calls.filter((c) => c[0] === "get_settings").length).toBe(reads);
  });

  it("a save a listener makes in answer to an early save is laid over it, not under it", async () => {
    storage.setItem(CACHE_KEY, JSON.stringify(stale()));
    const pendingReads: Array<() => void> = [];
    backend.call.mockImplementation(async (method: string, args: any) => {
      if (method === "get_settings") { await new Promise<void>((r) => pendingReads.push(r)); return file(); }
      if (method === "set_settings") { writes.push(args.settings); return true; }
      return null;
    });
    const store = await import("../../store/settingsStore");
    // Like a profile trigger, which acts on a change only once: a save that switches to one profile
    // is answered by the profile the trigger picks.
    let answered = false;
    store.subscribeSettings((s) => {
      if (answered || s.activeProfileName !== "Desk") return;
      answered = true;
      void store.saveSettings({ ...s, activeProfileName: "Handheld" } as any);
    });
    await store.refreshSettings();
    void store.saveSettings({ ...store.getCurrentSettings()!, activeProfileName: "Desk" } as any);
    expect(store.getCurrentSettings()?.activeProfileName).toBe("Handheld");
    pendingReads.forEach((release) => release());
    await vi.waitFor(() => expect(writes.length).toBeGreaterThan(0));
    expect(store.getCurrentSettings()).toMatchObject({ activeProfileName: "Handheld", ownQamTabEnabled: true });
    expect(writes.at(-1)).toMatchObject({ activeProfileName: "Handheld", ownQamTabEnabled: true });
  });

  it("a reader can ask for the file itself: one read, the file's values, and the file-read listeners told", async () => {
    storage.setItem(CACHE_KEY, JSON.stringify(stale()));
    const store = await import("../../store/settingsStore");
    const seen = vi.fn();
    store.onSettingsFileRead(seen);
    store.requestSettingsFileRead();
    store.requestSettingsFileRead();
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    expect(store.isSettingsFileRead()).toBe(true);
    expect(store.getCurrentSettings()?.ownQamTabEnabled).toBe(true);
    expect(backend.call.mock.calls.filter((c) => c[0] === "get_settings")).toHaveLength(1);
    expect(writes).toEqual([]);
  });

  it("asking for the file starts no wait of its own: a save made long after still waits for the file", async () => {
    vi.useFakeTimers();
    storage.setItem(CACHE_KEY, JSON.stringify(stale()));
    let answering = false;
    backend.call.mockImplementation(async (method: string, args: any) => {
      if (method === "get_settings") { if (!answering) throw new Error("backend not ready"); return file(); }
      if (method === "set_settings") { writes.push(args.settings); return true; }
      return null;
    });
    const store = await import("../../store/settingsStore");
    await store.refreshSettings();
    store.requestSettingsFileRead();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(store.isSettingsFileRead()).toBe(false);
    void store.saveSettings({ ...store.getCurrentSettings()!, activeProfileName: "Handheld" } as any);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(writes).toEqual([]);
    answering = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(writes.at(-1)).toMatchObject({ ownQamTabEnabled: true, activeProfileName: "Handheld" });
  });

  it("with no local copy, a read sent before the file was read does not undo a save made after it was read", async () => {
    const pending: Array<() => void> = [];
    backend.call.mockImplementation(async (method: string, args: any) => {
      if (method === "get_settings") { const doc = file(); await new Promise<void>((r) => pending.push(r)); return doc; }
      if (method === "set_settings") { writes.push(args.settings); return true; }
      return null;
    });
    const store = await import("../../store/settingsStore");
    store.requestSettingsFileRead(); // the own tab, at start
    const refreshing = store.refreshSettings(); // the Home, with nothing cached
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[0]();
    await vi.waitFor(() => expect(store.isSettingsFileRead()).toBe(true));
    await store.saveSettings({ ...store.getCurrentSettings()!, activeProfileName: "Handheld" } as any);
    pending[1](); // the Home's read, answered with the file from before the save
    await refreshing;
    expect(store.getCurrentSettings()?.activeProfileName).toBe("Handheld");
    expect(writes.at(-1).activeProfileName).toBe("Handheld");
  });

  it("a background read sent while an early save waited, answered after the file was read, does not undo it", async () => {
    storage.setItem(CACHE_KEY, JSON.stringify(file())); // the local copy matches the file
    const pending: Array<() => void> = [];
    backend.call.mockImplementation(async (method: string, args: any) => {
      if (method === "get_settings") { const doc = file(); await new Promise<void>((r) => pending.push(r)); return doc; }
      if (method === "set_settings") { writes.push(args.settings); return true; }
      return null;
    });
    const store = await import("../../store/settingsStore");
    expect(store.getCurrentSettings()).not.toBeNull(); // read when the store loads
    const saved = store.saveSettings({ ...store.getCurrentSettings()!, activeProfileName: "Handheld" } as any);
    await store.refreshSettings();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[0]();
    expect(await saved).toBe(true);
    pending[1]();
    await vi.waitFor(() => expect(backend.call.mock.calls.filter((c) => c[0] === "get_settings")).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getCurrentSettings()?.activeProfileName).toBe("Handheld");
    expect(writes.at(-1).activeProfileName).toBe("Handheld");
  });

  it("tells when the file has been read, also when it matches what was shown", async () => {
    storage.setItem(CACHE_KEY, JSON.stringify(file()));
    const store = await import("../../store/settingsStore");
    const seen = vi.fn();
    store.onSettingsFileRead(seen);
    expect(store.isSettingsFileRead()).toBe(false);
    await store.refreshSettings();
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    expect(store.isSettingsFileRead()).toBe(true);
  });
});
