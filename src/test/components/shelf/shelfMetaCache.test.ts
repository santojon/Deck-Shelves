// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

import { readShelfMetaCache, writeShelfMetaCache } from "../../../components/shelf/shelfMetaCache";
import { SHELF_CACHE_TTL_MS } from "../../../components/shelf/shelfViewHelpers";

const KEY = "ds-shelf-cache-s_test-recent-r0-r0";

// jsdom's opaque-origin document has no usable localStorage; an in-memory
// stand-in with the same surface is enough for the cache module.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

describe("shelfMetaCache — card meta persisted beside the id cache", () => {
  beforeEach(() => { store.clear(); vi.useRealTimers(); });

  it("round-trips the slim card fields for the cached ids, in id order", () => {
    const items = new Map<number, any>([
      [10, { appid: 10, name: "Ten", installed: true, playtimeMinutes: 42, description: "long text" }],
      [20, { appid: 20, name: "Twenty", portraitUrl: "p.jpg" }],
    ]);
    writeShelfMetaCache(KEY, [10, 20, 30], items);
    const read = readShelfMetaCache(KEY, [20, 10, 30]);
    expect(read?.size).toBe(2);
    expect(read?.get(10)).toEqual({ appid: 10, name: "Ten", installed: true, playtimeMinutes: 42 });
    expect(read?.get(20)?.portraitUrl).toBe("p.jpg");
    expect(read?.has(30)).toBe(false);
  });

  it("returns null when nothing usable is cached or the entry expired", () => {
    expect(readShelfMetaCache(KEY, [1])).toBeNull();
    writeShelfMetaCache(KEY, [1], new Map([[1, { appid: 1, name: "One" }]]));
    expect(readShelfMetaCache(KEY, [2])).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + SHELF_CACHE_TTL_MS + 1000);
    expect(readShelfMetaCache(KEY, [1])).toBeNull();
  });

  it("writes nothing for ids without meta and caps the entry count", () => {
    writeShelfMetaCache(KEY, [1, 2], new Map());
    expect(localStorage.getItem(KEY + "-meta")).toBeNull();
    const ids = Array.from({ length: 80 }, (_, i) => i + 1);
    writeShelfMetaCache(KEY, ids, new Map(ids.map((id) => [id, { appid: id, name: `G${id}` }])));
    expect(readShelfMetaCache(KEY, ids)?.size).toBe(60);
  });

  it("shares the id-cache prefix so the same sweeper expires it", () => {
    writeShelfMetaCache(KEY, [1], new Map([[1, { appid: 1, name: "One" }]]));
    expect(Array.from(store.keys())).toEqual([KEY + "-meta"]);
    expect(JSON.parse(localStorage.getItem(KEY + "-meta")!).ts).toBeGreaterThan(0);
  });
});
