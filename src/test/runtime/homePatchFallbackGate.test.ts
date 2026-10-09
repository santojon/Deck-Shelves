import { describe, it, expect } from "vitest";
import {
  createBridgeGateState, noteFallbackTick, bridgeGraceActive, hrefOf,
  BRIDGE_FALLBACK_GRACE_MS, BRIDGE_ENTRY_GRACE_MS, BRIDGE_UNPROVEN_ENTRY_GRACE_MS,
} from "../../runtime/homePatchFallbackGate";

describe("homePatch fallback gate", () => {
  it("no registered bridge → no grace at all", () => {
    const s = createBridgeGateState(1000);
    noteFallbackTick(s, true, false, 1001, false);
    expect(bridgeGraceActive(s, 1001)).toBe(false);
  });

  it("registered bridge that never filled: install-time grace, plus a short per-entry grace", () => {
    const s = createBridgeGateState(1000);
    s.bridgeRegistered = true;
    expect(bridgeGraceActive(s, 1000 + BRIDGE_FALLBACK_GRACE_MS - 1)).toBe(true);
    expect(bridgeGraceActive(s, 1000 + BRIDGE_FALLBACK_GRACE_MS)).toBe(false);
    // Cold boot: Home first appears long after install — an unproven bridge still
    // gets a short window from that first home tick, then the fallback steps in.
    noteFallbackTick(s, true, false, 50_000, false);
    expect(bridgeGraceActive(s, 50_000 + BRIDGE_UNPROVEN_ENTRY_GRACE_MS - 1)).toBe(true);
    expect(bridgeGraceActive(s, 50_000 + BRIDGE_UNPROVEN_ENTRY_GRACE_MS)).toBe(false);
    // Once a panel is in the root the entry is resolved; no grace while it stays filled.
    noteFallbackTick(s, true, true, 60_000, false);
    expect(bridgeGraceActive(s, 60_100)).toBe(false);
  });

  it("bridge that filled once: a fresh grace window on every Home entry (href home, no root yet)", () => {
    const s = createBridgeGateState(1000);
    s.bridgeRegistered = true;
    noteFallbackTick(s, true, true, 2000, true);        // steady state: bridge filled, root present
    expect(s.bridgeFilledOnce).toBe(true);
    noteFallbackTick(s, false, false, 50_000, true);    // away on a detail page, root gone
    expect(bridgeGraceActive(s, 50_100)).toBe(false);
    noteFallbackTick(s, true, false, 51_000, true);     // back on /library/home, root not created yet
    expect(bridgeGraceActive(s, 51_000 + BRIDGE_ENTRY_GRACE_MS - 1)).toBe(true);
    expect(bridgeGraceActive(s, 51_000 + BRIDGE_ENTRY_GRACE_MS)).toBe(false);
    noteFallbackTick(s, true, true, 52_000, true);      // root appeared → entry resolved
    expect(bridgeGraceActive(s, 52_100)).toBe(false);
    noteFallbackTick(s, false, false, 80_000, true);
    noteFallbackTick(s, true, false, 80_500, true);     // next return starts a new window
    expect(bridgeGraceActive(s, 80_600)).toBe(true);
  });

  it("the fill signal is sticky; a panel in the root alone is not proof", () => {
    const s = createBridgeGateState(1000);
    s.bridgeRegistered = true;
    noteFallbackTick(s, true, true, 2000, false);
    expect(s.bridgeFilledOnce).toBe(false);
    noteFallbackTick(s, true, true, 3000, true);
    noteFallbackTick(s, true, true, 4000, false);
    expect(s.bridgeFilledOnce).toBe(true);
  });

  it("repeated ticks while still waiting do not restart the entry window", () => {
    const s = createBridgeGateState(1000);
    s.bridgeRegistered = true;
    noteFallbackTick(s, true, true, 2000, true);
    noteFallbackTick(s, true, false, 10_000, true);
    noteFallbackTick(s, true, false, 15_000, true);
    expect(s.entryAt).toBe(10_000);
    expect(bridgeGraceActive(s, 10_000 + BRIDGE_ENTRY_GRACE_MS + 1)).toBe(false);
  });

  it("hrefOf lower-cases path+hash and tolerates a missing window", () => {
    expect(hrefOf({ location: { pathname: "/Library/Home", hash: "#X" } } as any)).toBe("/library/home#x");
    expect(hrefOf(null)).toBe("");
  });
});
