import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const refresh = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../core/shelfRefresh", () => ({ triggerShelfRefresh: () => { refresh.count++; } }));

import {
  cleanTags, customTagsFor, historyIds, noteLaunch, pinnedIds, sessionQueueIds, setCustomTags,
  temporaryQueueIds, togglePinned, toggleSessionQueue, toggleTemporaryQueue,
} from "../../runtime/gameLists";

describe("game lists", () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    mem = new Map();
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } });
    const g = globalThis as any;
    delete g.__ds_session_queue; delete g.__ds_temp_queue; delete g.__ds_custom_tags_v1;
    refresh.count = 0;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("toggles pinned games in storage and refreshes shelves", () => {
    togglePinned(10);
    togglePinned(20);
    expect(pinnedIds()).toEqual([10, 20]);
    togglePinned(10);
    expect(pinnedIds()).toEqual([20]);
    expect(JSON.parse(mem.get("ds-pinned-games-v1")!)).toEqual([20]);
    expect(refresh.count).toBe(3);
  });

  it("keeps the session queue in memory only", () => {
    toggleSessionQueue(5);
    expect(sessionQueueIds()).toEqual([5]);
    expect([...mem.keys()]).toEqual([]);
  });

  it("a launch goes to the front of the history (no repeats, bounded) and leaves the temporary queue", () => {
    toggleTemporaryQueue(7);
    toggleTemporaryQueue(8);
    noteLaunch(1);
    noteLaunch(7);
    noteLaunch(1);
    expect(historyIds()).toEqual([1, 7]);
    expect(temporaryQueueIds()).toEqual([8]);
    expect(JSON.parse(mem.get("ds-temp-queue-v1")!)).toEqual([8]);
    for (let i = 100; i < 260; i++) noteLaunch(i);
    expect(historyIds().length).toBe(100);
    expect(historyIds()[0]).toBe(259);
  });

  it("reloads the temporary queue and tags from storage when the globals are empty", () => {
    mem.set("ds-temp-queue-v1", JSON.stringify([3]));
    mem.set("ds-custom-tags-v1", JSON.stringify({ "3": ["co-op"] }));
    expect(temporaryQueueIds()).toEqual([3]);
    expect(customTagsFor(3)).toEqual(["co-op"]);
  });

  it("cleans tags and clears them when the list is empty", () => {
    expect(cleanTags([" RPG ", "rpg", "", "Co-op"])).toEqual(["RPG", "Co-op"]);
    setCustomTags(9, ["RPG", " co-op "]);
    expect(customTagsFor(9)).toEqual(["RPG", "co-op"]);
    setCustomTags(9, ["  "]);
    expect(customTagsFor(9)).toEqual([]);
    expect(JSON.parse(mem.get("ds-custom-tags-v1")!)).toEqual({});
  });
});
