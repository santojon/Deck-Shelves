import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const qa = vi.hoisted(() => ({ active: false }));
vi.mock("../../../qa/harness", () => ({ get qaOverrideActive() { return qa.active; } }));

import { clearOwnLocalStorage } from "../../../features/settings/controller";

describe("a full reset and the device's own localStorage", () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    mem = new Map([["ds-pinned-games-v1", "[10]"], ["ds_usage_v1", "{}"], ["deck-shelves-settings-cache-v3", "{}"], ["other-plugin", "x"]]);
    vi.stubGlobal("localStorage", {
      get length() { return mem.size; },
      key: (i: number) => [...mem.keys()][i] ?? null,
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    });
  });
  afterEach(() => { qa.active = false; vi.unstubAllGlobals(); });

  it("a QA build keeps every key", () => {
    qa.active = true;
    clearOwnLocalStorage();
    expect([...mem.keys()]).toEqual(["ds-pinned-games-v1", "ds_usage_v1", "deck-shelves-settings-cache-v3", "other-plugin"]);
  });

  it("a normal build clears the plugin's own keys and leaves others", () => {
    clearOwnLocalStorage();
    expect([...mem.keys()]).toEqual(["other-plugin"]);
  });

  it("keeps the Steam account record the settings kept per account depend on", () => {
    mem.set("deck-shelves-account-v1", '{"salt":"00"}');
    clearOwnLocalStorage();
    expect([...mem.keys()]).toEqual(["other-plugin", "deck-shelves-account-v1"]);
  });
});
