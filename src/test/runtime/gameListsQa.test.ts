import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const qa = vi.hoisted(() => ({ active: false }));
vi.mock("../../qa/harness", () => ({ get qaOverrideActive() { return qa.active; } }));
vi.mock("../../core/shelfRefresh", () => ({ triggerShelfRefresh: () => {} }));

describe("game lists in a QA build", () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    vi.resetModules();
    mem = new Map([["ds-pinned-games-v1", "[10]"]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } });
  });
  afterEach(() => { qa.active = false; vi.unstubAllGlobals(); });

  it("reads the device's lists but keeps its own edits in memory", async () => {
    qa.active = true;
    const lists = await import("../../runtime/gameLists");
    expect(lists.pinnedIds()).toEqual([10]);
    lists.togglePinned(20);
    expect(lists.pinnedIds()).toEqual([10, 20]);
    expect(mem.get("ds-pinned-games-v1")).toBe("[10]");
  });

  it("a normal build stores the edit", async () => {
    const lists = await import("../../runtime/gameLists");
    lists.togglePinned(20);
    expect(mem.get("ds-pinned-games-v1")).toBe("[10,20]");
  });
});
