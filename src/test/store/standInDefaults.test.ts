import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../../domain/defaults";

const backend = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock("../../runtime/host/decky", () => ({ call: backend.call }));

const CACHE_KEY = "deck-shelves-settings-cache-v3";
const SHARED_STATE_KEY = "__DECK_SHELVES_SHARED_SETTINGS__";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

describe("refreshSettings with no backend and no cache", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    delete (globalThis as any)[SHARED_STATE_KEY];
    backend.call.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (globalThis as any)[SHARED_STATE_KEY];
  });

  it("shows the defaults without persisting them, then persists the saved settings from the retry", async () => {
    const saved = { ...defaultSettings(), enabled: true, shelves: [] };
    backend.call.mockRejectedValueOnce(new Error("backend not ready"));
    backend.call.mockResolvedValue(saved);

    const store = await import("../../store/settingsStore");
    const seen: Array<{ enabled: boolean }> = [];
    store.subscribeSettings((s) => seen.push(s));

    const shown = await store.refreshSettings();
    expect(shown.enabled).toBe(defaultSettings().enabled);
    expect(seen).toHaveLength(1);
    expect(seen[0].enabled).toBe(defaultSettings().enabled);
    expect(storage.getItem(CACHE_KEY)).toBeNull();
    expect((globalThis as any)[SHARED_STATE_KEY]).toBeUndefined();

    await vi.advanceTimersByTimeAsync(500);

    expect(seen[seen.length - 1].enabled).toBe(true);
    expect(JSON.parse(storage.getItem(CACHE_KEY) as string).enabled).toBe(true);
    expect((globalThis as any)[SHARED_STATE_KEY].enabled).toBe(true);
  });

  it("keeps the stand-in unpersisted across a second refresh while the backend is still down", async () => {
    backend.call.mockRejectedValue(new Error("backend not ready"));

    const store = await import("../../store/settingsStore");
    await store.refreshSettings();
    await store.refreshSettings();
    await vi.advanceTimersByTimeAsync(0);

    expect(storage.getItem(CACHE_KEY)).toBeNull();
    expect((globalThis as any)[SHARED_STATE_KEY]).toBeUndefined();
  });
});
