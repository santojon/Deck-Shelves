import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pruneShelfCaches, SHELF_CACHE_PREFIX, SHELF_CACHE_TTL_MS } from "../../components/shelf/shelfViewHelpers";

const NOW = 1_800_000_000_000;

/* Minimal Storage stand-in: the prune reads `globalThis.localStorage` and only
   uses length/key/getItem/removeItem, and this environment provides no real one. */
function makeStore(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() { return map.size; },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
  } as unknown as Storage & { map: Map<string, string> };
}

let store: ReturnType<typeof makeStore>;
const g = globalThis as any;
let original: unknown;

describe("pruneShelfCaches", () => {
  beforeEach(() => {
    original = g.localStorage;
    store = makeStore();
    g.localStorage = store;
  });
  afterEach(() => { g.localStorage = original; });

  const put = (key: string, value: unknown) => store.setItem(key, JSON.stringify(value));

  it("drops entries past the read-expiry window", () => {
    put(`${SHELF_CACHE_PREFIX}old`, { ts: NOW - SHELF_CACHE_TTL_MS - 1, ids: [1] });
    expect(pruneShelfCaches(NOW)).toBe(1);
    expect(store.getItem(`${SHELF_CACHE_PREFIX}old`)).toBeNull();
  });

  it("keeps entries still inside the window", () => {
    put(`${SHELF_CACHE_PREFIX}fresh`, { ts: NOW - 1000, ids: [1, 2] });
    expect(pruneShelfCaches(NOW)).toBe(0);
    expect(store.getItem(`${SHELF_CACHE_PREFIX}fresh`)).not.toBeNull();
  });

  it("drops entries with a missing or unparseable timestamp", () => {
    put(`${SHELF_CACHE_PREFIX}nots`, { ids: [1] });
    store.setItem(`${SHELF_CACHE_PREFIX}garbage`, "not json");
    expect(pruneShelfCaches(NOW)).toBe(2);
  });

  // The real-world leak: throwaway benchmark shelves nothing ever reads again.
  it("clears stale benchmark keys while leaving other plugin keys untouched", () => {
    for (let i = 0; i < 5; i++) {
      put(`${SHELF_CACHE_PREFIX}qa_perf_${i}-alphabetical`, { ts: NOW - SHELF_CACHE_TTL_MS * 2, ids: [i] });
    }
    put("ds-price-cache-v1", { 440: 1 });
    store.setItem("ds-adaptive-timeout-v1", "keep");

    expect(pruneShelfCaches(NOW)).toBe(5);
    expect(store.getItem("ds-price-cache-v1")).not.toBeNull();
    expect(store.getItem("ds-adaptive-timeout-v1")).toBe("keep");
  });

  it("is a no-op on an empty store", () => {
    expect(pruneShelfCaches(NOW)).toBe(0);
  });

  it("survives a store that throws on access", () => {
    g.localStorage = { get length(): number { throw new Error("blocked"); } };
    expect(pruneShelfCaches(NOW)).toBe(0);
  });
});
