import { describe, it, expect, beforeEach, vi } from "vitest";
import { compareVersions, shouldDeferToHost, publishDeferSignal, readDeferSignal, clearDeferSignal, markHostBundleBooted, hostBundleBooted, DEFER_GLOBAL, HOST_BUNDLE_BOOTED_GLOBAL, DEFER_FALLBACK_MS } from "../../runtime/host/coopDefer";

const hs = (caps: Record<string, boolean>, bundleVersion?: string): any => ({ hostKind: "shelveshub", hostVersion: "0.6.0", hostApiVersion: "1.4.0", capabilities: caps, bundleVersion });

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
