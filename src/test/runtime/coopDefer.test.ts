import { describe, it, expect, beforeEach, vi } from "vitest";
import { compareVersions, shouldDeferToHost, publishDeferSignal, readDeferSignal, clearDeferSignal, markHostBundleBooted, hostBundleBooted, DEFER_GLOBAL, HOST_BUNDLE_BOOTED_GLOBAL, DEFER_FALLBACK_MS } from "../../runtime/host/coopDefer";

const hs = (caps: Record<string, boolean>, bundleVersion?: string): any => ({ hostKind: "shelveshub", hostVersion: "0.6.0", hostApiVersion: "1.4.0", capabilities: caps, bundleVersion });

// The renderer's storage, where the host leaves its offer (the test runtime has none).
const stored = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => { stored.set(k, String(v)); },
  removeItem: (k: string) => { stored.delete(k); },
};

describe("coopDefer — the loader copy stands down for a newer-or-equal host bundle", () => {
  beforeEach(() => { delete (globalThis as any)[DEFER_GLOBAL]; delete (globalThis as any)[HOST_BUNDLE_BOOTED_GLOBAL]; });

  it("compares numeric versions, ignoring a v prefix and pre-release tails", () => {
    expect(compareVersions("3.4.0", "3.3.4")).toBeGreaterThan(0);
    expect(compareVersions("v3.4.0", "3.4.0")).toBe(0);
    expect(compareVersions("3.4.0-beta.1", "3.4.0")).toBe(0);
    expect(compareVersions("3.3.10", "3.3.9")).toBeGreaterThan(0);
    expect(compareVersions("2.9.9", "3.0.0")).toBeLessThan(0);
  });

  it("defers only under cooperative force, with the capability and a bundle at least as new", () => {
    expect(shouldDeferToHost({ forced: true, handshake: hs({ coopBundle: true }, "3.4.0"), ownVersion: "3.4.0" })).toBe(true);
    expect(shouldDeferToHost({ forced: true, handshake: hs({ coopBundle: true }, "3.5.0"), ownVersion: "3.4.0" })).toBe(true);
    expect(shouldDeferToHost({ forced: true, handshake: hs({ coopBundle: true }, "3.3.4"), ownVersion: "3.4.0" })).toBe(false);
    expect(shouldDeferToHost({ forced: true, handshake: hs({ coopBundle: false }, "3.5.0"), ownVersion: "3.4.0" })).toBe(false);
    expect(shouldDeferToHost({ forced: true, handshake: hs({ coopBundle: true }), ownVersion: "3.4.0" })).toBe(false);
    expect(shouldDeferToHost({ forced: false, handshake: hs({ coopBundle: true }, "3.5.0"), ownVersion: "3.4.0" })).toBe(false);
    expect(shouldDeferToHost({ forced: true, handshake: null, ownVersion: "3.4.0" })).toBe(false);
  });

  it("publishes and clears the defer signal, and sees the host bundle arrive", () => {
    publishDeferSignal({ loaderVersion: "3.4.0", hostBundleVersion: "3.5.0", at: 1 });
    expect(readDeferSignal()?.hostBundleVersion).toBe("3.5.0");
    expect(hostBundleBooted()).toBe(false);
    markHostBundleBooted("3.5.0");
    expect(hostBundleBooted()).toBe(true);
    clearDeferSignal();
    expect(readDeferSignal()).toBeNull();
  });

  it("tryDeferToHost: the host's own copy only announces itself; a loader copy defers once and falls back if nothing boots", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const mod = await import("../../runtime/host/coopDefer");
      const fallback = vi.fn();
      expect(mod.tryDeferToHost({ loaderLaunched: false, forced: true, handshake: hs({ coopBundle: true }, "3.5.0"), ownVersion: "3.4.0", onFallback: fallback })).toBe(false);
      expect(mod.hostBundleBooted()).toBe(true);
      delete (globalThis as any)[HOST_BUNDLE_BOOTED_GLOBAL];

      const base = { loaderLaunched: true, forced: true, handshake: hs({ coopBundle: true }, "3.5.0"), ownVersion: "3.4.0", onFallback: fallback };
      expect(mod.tryDeferToHost(base)).toBe(true);
      expect(mod.readDeferSignal()?.hostBundleVersion).toBe("3.5.0");
      // A second call in the same session never defers again (the fallback boot re-enters here).
      expect(mod.tryDeferToHost(base)).toBe(false);
      vi.advanceTimersByTime(DEFER_FALLBACK_MS);
      expect(fallback).toHaveBeenCalledTimes(1);
      expect(mod.readDeferSignal()).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it("stands down on the host's stored offer at a cold start, and stamps it when the host never comes", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const mod = await import("../../runtime/host/coopDefer");
      const fallback = vi.fn();
      localStorage.setItem(mod.COOP_OFFER_KEY, JSON.stringify({ bundleVersion: "v3.4.0", hostVersion: "0.6.0", at: 1 }));
      const base = { loaderLaunched: true, forced: false, handshake: null, ownVersion: "3.4.0", onFallback: fallback };
      expect(mod.tryDeferToHost(base)).toBe(true);
      expect(mod.readDeferSignal()?.hostBundleVersion).toBe("v3.4.0");
      // The stored offer waits the longer, cold-start window.
      vi.advanceTimersByTime(DEFER_FALLBACK_MS);
      expect(fallback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(mod.OFFER_FALLBACK_MS - DEFER_FALLBACK_MS);
      expect(fallback).toHaveBeenCalledTimes(1);
      expect(mod.readDeferSignal()).toBeNull();
      expect(mod.readCoopOffer()?.fallbackAt).toBeTypeOf("number");
    } finally { vi.useRealTimers(); localStorage.removeItem("shelveshub-coop-bundle"); }
  });

  it("ignores a stored offer that is older than this copy, answered by a fallback, or beside a live handshake", async () => {
    vi.resetModules();
    const mod = await import("../../runtime/host/coopDefer");
    const base = { loaderLaunched: true, forced: false, handshake: null, ownVersion: "3.4.0", onFallback: vi.fn() };
    localStorage.setItem(mod.COOP_OFFER_KEY, JSON.stringify({ bundleVersion: "3.3.4" }));
    expect(mod.tryDeferToHost(base)).toBe(false);
    localStorage.setItem(mod.COOP_OFFER_KEY, JSON.stringify({ bundleVersion: "3.5.0", fallbackAt: 5 }));
    expect(mod.tryDeferToHost(base)).toBe(false);
    localStorage.setItem(mod.COOP_OFFER_KEY, JSON.stringify({ bundleVersion: "3.5.0" }));
    expect(mod.tryDeferToHost({ ...base, forced: true, handshake: hs({ coopBundle: false }, "3.5.0") })).toBe(false);
    localStorage.removeItem(mod.COOP_OFFER_KEY);
  });

  it("a reloaded loader copy stands down while the host's copy is running", async () => {
    vi.resetModules();
    const mod = await import("../../runtime/host/coopDefer");
    mod.markHostBundleBooted("3.4.0");
    expect(mod.tryDeferToHost({ loaderLaunched: true, forced: false, handshake: null, ownVersion: "3.5.0", onFallback: vi.fn() })).toBe(true);
    expect(mod.readDeferSignal()).toBeNull();
  });

  it("tryDeferToHost: no fallback boot once the host bundle has announced itself", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const mod = await import("../../runtime/host/coopDefer");
      const fallback = vi.fn();
      expect(mod.tryDeferToHost({ loaderLaunched: true, forced: true, handshake: hs({ coopBundle: true }, "3.4.0"), ownVersion: "3.4.0", onFallback: fallback })).toBe(true);
      mod.markHostBundleBooted("3.4.0");
      vi.advanceTimersByTime(DEFER_FALLBACK_MS + 1);
      expect(fallback).not.toHaveBeenCalled();
      expect(mod.readDeferSignal()?.loaderVersion).toBe("3.4.0");
    } finally { vi.useRealTimers(); }
  });
});
