import { describe, expect, it } from "vitest";
import { installOwnQamTab, evaluateBreaker } from "../../runtime/ownQamTab";

const STALE_ARM_MS = 15_000;

// The one invariant cheaply testable outside a real Steam renderer: when the
// feature reads disabled at call time, installOwnQamTab must never touch
// `window` (no localStorage read, no module discovery) — "truly inert"
// means never touching Steam internals with nothing to add. Everything else
// here (the actual QAM patch) needs a real Steam webpack graph and is only
// verifiable on-device.
describe("installOwnQamTab", () => {
  it("returns a no-op cleanup and touches nothing when disabled", () => {
    expect(() => {
      const dispose = installOwnQamTab({
        title: "Deck Shelves",
        icon: null,
        renderPanel: () => null,
        isEnabled: () => false,
      });
      expect(typeof dispose).toBe("function");
      expect(() => dispose()).not.toThrow();
    }).not.toThrow();
  });
});

// The breaker must survive a ONE-OFF stale arm (a reload / host switch before
// the first healthy render) instead of latching until a manual localStorage
// clear — the regression that hid the tab after coexist↔Decky-only churn.
describe("evaluateBreaker (own-tab crash breaker)", () => {
  const now = 1_000_000_000;
  it("passes when there is no prior state", () => {
    expect(evaluateBreaker(null, now).decision).toBe("ok");
  });
  it("latches once tripped", () => {
    expect(evaluateBreaker(`tripped:${now - 1}`, now)).toEqual({ decision: "tripped", next: null });
  });
  it("leaves a recent arm alone (normal boot re-inject)", () => {
    const recent = now - (STALE_ARM_MS - 1);
    expect(evaluateBreaker(`armed:${recent}:0`, now)).toEqual({ decision: "ok", next: null });
  });
  it("treats the FIRST stale arm as transient — retries and records a strike, does NOT trip", () => {
    const stale = now - (STALE_ARM_MS + 1);
    const r = evaluateBreaker(`armed:${stale}:0`, now);
    expect(r.decision).toBe("ok");
    expect(r.next).toBe(`armed:${now}:1`);
  });
  it("trips only when a stale arm reaches MAX_STALE_STRIKES (a real crash-loop)", () => {
    const stale = now - (STALE_ARM_MS + 1);
    const r = evaluateBreaker(`armed:${stale}:1`, now); // strike would become 2 = MAX
    expect(r.decision).toBe("tripped");
    expect(r.next).toBe(`tripped:${now}`);
  });
});
