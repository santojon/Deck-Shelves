import { describe, it, expect, beforeEach } from "vitest";
import { claimHomeOwnership, isHomeOwner, getOwnerKind } from "../../runtime/host/ownerGuard";

function scope(): any {
  const g = globalThis as any;
  return g.window ?? g;
}

describe("ownerGuard", () => {
  beforeEach(() => {
    const w = scope();
    delete w.__DECK_SHELVES_OWNER__;
    delete w.__SHELVES_FORCE_OWNER__;
  });

  it("a single install always owns (first claim wins)", () => {
    expect(claimHomeOwnership("decky")).toBe(true);
    expect(isHomeOwner()).toBe(true);
    expect(getOwnerKind()).toBe("decky");
    expect(scope().__DECK_SHELVES_OWNER__).toBe("decky");
  });

  it("the second instance stands down when another already claimed", () => {
    expect(claimHomeOwnership("decky")).toBe(true); // first
    expect(claimHomeOwnership("shelveshub")).toBe(false); // second stands down
    expect(scope().__DECK_SHELVES_OWNER__).toBe("decky");
  });

  it("SHELVES_FORCE_OWNER hands the claim to ShelvesHub", () => {
    scope().__SHELVES_FORCE_OWNER__ = "shelveshub";
    expect(claimHomeOwnership("decky")).toBe(false); // loader yields
    expect(claimHomeOwnership("shelveshub")).toBe(true); // ShelvesHub owns
    expect(scope().__DECK_SHELVES_OWNER__).toBe("shelveshub");
  });

  it("force-owner overrides an earlier loader claim", () => {
    expect(claimHomeOwnership("decky")).toBe(true);
    scope().__SHELVES_FORCE_OWNER__ = "shelveshub";
    expect(claimHomeOwnership("shelveshub")).toBe(true);
    expect(scope().__DECK_SHELVES_OWNER__).toBe("shelveshub");
  });
});
