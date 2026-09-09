import { describe, expect, it } from "vitest";
import { installOwnQamTab } from "../../runtime/ownQamTab";

// The one invariant cheaply testable outside a real Steam renderer: when the
// feature reads disabled at call time, installOwnQamTab must never touch
// `window` (no localStorage read, no module discovery) — "truly inert"
// means never touching Steam internals with nothing to add. Everything else
// here (the actual QAM patch) needs a real Steam webpack graph and is only
// verifiable on-device (see .roadmaps/ROADMAP.md, Sprint 24).
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
