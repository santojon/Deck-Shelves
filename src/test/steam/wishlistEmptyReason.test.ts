import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* An empty wishlist shelf must say why: one warn line per resolve naming the
   reason, and a fetch backoff reported once per window instead of on every refresh. */

const log = vi.hoisted(() => ({ warn: [] as string[], info: [] as string[] }));
vi.mock("../../runtime/logger", () => ({
  logInfo: (_s: string, m: string, c?: unknown) => { log.info.push(c === undefined ? m : `${m}: ${typeof c === "string" ? c : JSON.stringify(c)}`); },
  logWarn: (_s: string, m: string, c?: unknown) => { log.warn.push(c === undefined ? m : `${m}: ${typeof c === "string" ? c : JSON.stringify(c)}`); },
}));

const settings = vi.hoisted(() => ({ current: null as any }));
vi.mock("../../store/settingsStore", () => ({ getCurrentSettings: () => settings.current }));

const online = vi.hoisted(() => ({ ids: null as number[] | null, reason: null as any }));
vi.mock("../../core/onlineStore", () => ({
  getWishlistIds: async () => online.ids,
  getWishlistEmptyReason: () => online.reason,
  getPriceMap: async () => new Map(),
}));

vi.mock("../../steam/localLibrary", () => ({ getLocalLibraryAppIds: () => new Set([10, 20]) }));

// The fake backend behind the real `getWishlistIds` (second block below).
const rpc = vi.hoisted(() => ({ resp: null as any, fail: null as Error | null }));
vi.mock("../../shims/host-api", () => ({
  call: (method: string) => {
    if (method !== "get_wishlist") return Promise.resolve(null);
    return rpc.fail ? Promise.reject(rpc.fail) : Promise.resolve(rpc.resp);
  },
}));

import { _resolveWishlist } from "../../steam/onlineResolvers";

const ctx = (source: Record<string, unknown> = {}) => ({
  source: { type: "wishlist", ...source } as any,
  limit: 10, depth: 0, all: [], overShootLimit: 10, finish: (ids: number[]) => ids,
});

describe("wishlist shelf resolving empty says why", () => {
  beforeEach(() => {
    log.warn = []; log.info = [];
    settings.current = { onlineFeaturesEnabled: true, onlineWishlistEnabled: true };
    online.ids = null; online.reason = null;
  });

  it("online features off", async () => {
    settings.current = { onlineFeaturesEnabled: false };
    await expect(_resolveWishlist(ctx())).resolves.toEqual([]);
    expect(log.warn).toEqual(["resolveShelfAppIds(wishlist) empty: online off"]);
  });

  it("offline mode on", async () => {
    settings.current = { onlineFeaturesEnabled: true, offlineModeEnabled: true };
    await _resolveWishlist(ctx());
    expect(log.warn).toEqual(["resolveShelfAppIds(wishlist) empty: offline mode"]);
  });

  it("wishlist source off", async () => {
    settings.current = { onlineFeaturesEnabled: true, onlineWishlistEnabled: false };
    await _resolveWishlist(ctx());
    expect(log.warn).toEqual(["resolveShelfAppIds(wishlist) empty: wishlist off"]);
  });

  it.each([
    "no community url",
    "backend returned none",
    "backend error no steamid in loginusers.vdf",
  ])("fetch-side reason: %s", async (reason) => {
    online.reason = { reason };
    await expect(_resolveWishlist(ctx())).resolves.toEqual([]);
    expect(log.warn).toEqual([`resolveShelfAppIds(wishlist) empty: ${reason}`]);
  });

  it("falls back to a generic reason when the fetch left none", async () => {
    await _resolveWishlist(ctx());
    expect(log.warn).toEqual(["resolveShelfAppIds(wishlist) empty: no wishlist ids"]);
  });

  it("a backoff window is reported once, a new window again", async () => {
    online.reason = { reason: "backoff, retry in 118s", backoffUntil: 1000 };
    await _resolveWishlist(ctx());
    online.reason = { reason: "backoff, retry in 58s", backoffUntil: 1000 };
    await _resolveWishlist(ctx());
    await _resolveWishlist(ctx());
    expect(log.warn).toEqual(["resolveShelfAppIds(wishlist) empty: backoff, retry in 118s"]);
    online.reason = { reason: "backoff, retry in 600s", backoffUntil: 2000 };
    await _resolveWishlist(ctx());
    expect(log.warn).toHaveLength(2);
    expect(log.warn[1]).toBe("resolveShelfAppIds(wishlist) empty: backoff, retry in 600s");
  });

  it("everything filtered out (owned games hidden) is a reason too", async () => {
    online.ids = [10, 20];
    settings.current = { onlineFeaturesEnabled: true, onlineHideOwnedGames: true };
    await expect(_resolveWishlist(ctx())).resolves.toEqual([]);
    expect(log.warn).toEqual(["resolveShelfAppIds(wishlist) empty: all 2 filtered out (owned / child filter)"]);
  });

  it("a shelf with games warns nothing", async () => {
    online.ids = [10, 30];
    await expect(_resolveWishlist(ctx())).resolves.toEqual([10, 30]);
    expect(log.warn).toEqual([]);
  });
});

/* The fetch side: the reason the resolver reads after a null, through the real
   `getWishlistIds` with a fake backend. */
describe("getWishlistIds leaves the reason for a null result", () => {
  beforeEach(() => {
    vi.resetModules();
    rpc.resp = null; rpc.fail = null;
    (globalThis as any).urlStore = { m_steamUrls: { userwishlist: { url: "https://steamcommunity.com/id/x/wishlist/" } } };
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); },
      removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0,
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); delete (globalThis as any).urlStore; });

  async function load() {
    return vi.importActual<typeof import("../../core/onlineStore")>("../../core/onlineStore");
  }

  it("backend error carries the backend's message", async () => {
    rpc.resp = { ok: false, error: "no steamid" };
    const { getWishlistIds, getWishlistEmptyReason } = await load();
    await expect(getWishlistIds()).resolves.toBeNull();
    expect(getWishlistEmptyReason()).toEqual({ reason: "backend error no steamid" });
  });

  it("an ok reply with no games", async () => {
    rpc.resp = { ok: true, ids: [] };
    const { getWishlistIds, getWishlistEmptyReason } = await load();
    await expect(getWishlistIds()).resolves.toBeNull();
    expect(getWishlistEmptyReason()).toEqual({ reason: "backend returned none" });
  });

  it("no community URL in Steam's URL store", async () => {
    delete (globalThis as any).urlStore;
    const { getWishlistIds, getWishlistEmptyReason } = await load();
    await expect(getWishlistIds()).resolves.toBeNull();
    expect(getWishlistEmptyReason()).toEqual({ reason: "no community url" });
  });

  it("a failed call arms a backoff; the next call reports the window", async () => {
    rpc.fail = new Error("rpc get_wishlist timeout after 35000ms");
    const { getWishlistIds, getWishlistEmptyReason } = await load();
    await expect(getWishlistIds()).resolves.toBeNull();
    expect(getWishlistEmptyReason()).toEqual({ reason: "backend error Error: rpc get_wishlist timeout after 35000ms" });
    rpc.fail = null; rpc.resp = { ok: true, ids: [1] };
    await expect(getWishlistIds()).resolves.toBeNull();
    const again = getWishlistEmptyReason();
    expect(again?.reason).toMatch(/^backoff, retry in \d+s$/);
    expect(again?.backoffUntil).toBeGreaterThan(Date.now());
  });

  it("a successful fetch clears the reason", async () => {
    rpc.resp = { ok: true, ids: [1, 2] };
    const { getWishlistIds, getWishlistEmptyReason } = await load();
    await expect(getWishlistIds()).resolves.toEqual([1, 2]);
    expect(getWishlistEmptyReason()).toBeNull();
  });
});
