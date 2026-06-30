import { describe, expect, it } from "vitest";
import {
  BTN,
  DEFAULT_BINDINGS,
  createMatcherState,
  findCollisions,
  formatComboForDisplay,
  matchEvent,
  parseCombo,
  resolveBindings,
  validateCombo,
} from "../../runtime/buttonBindings";

describe("parseCombo", () => {
  it("parses a single token", () => {
    expect(parseCombo("X")).toEqual({ kind: "single", btn: BTN.SECONDARY });
    expect(parseCombo("VIEW")).toEqual({ kind: "single", btn: BTN.VIEW });
    expect(parseCombo("SELECT")).toEqual({ kind: "single", btn: BTN.VIEW });
  });
  it("parses a chord", () => {
    expect(parseCombo("L1+R1")).toEqual({ kind: "chord", btns: [BTN.L1, BTN.R1] });
  });
  it("parses a double-tap as same token twice", () => {
    expect(parseCombo("L1+L1")).toEqual({ kind: "double", btn: BTN.L1, windowMs: 300 });
  });
  it("rejects reserved tokens", () => {
    expect(parseCombo("A")).toBeNull();
    expect(parseCombo("B")).toBeNull();
    expect(parseCombo("MENU")).toBeNull();
    expect(parseCombo("L1+A")).toBeNull();
    expect(parseCombo("STEAM")).toBeNull();
  });
  it("rejects empty / null", () => {
    expect(parseCombo(null)).toBeNull();
    expect(parseCombo("")).toBeNull();
  });
  it("is case-insensitive on tokens", () => {
    expect(parseCombo("l1+r1")).toEqual({ kind: "chord", btns: [BTN.L1, BTN.R1] });
  });
});

describe("validateCombo", () => {
  it("accepts valid combos", () => {
    expect(validateCombo("X")).toEqual({ ok: true });
    expect(validateCombo("L1+R1")).toEqual({ ok: true });
    expect(validateCombo("VIEW")).toEqual({ ok: true });
  });
  it("rejects reserved", () => {
    expect(validateCombo("A")).toEqual({ ok: false, reason: "reserved" });
    expect(validateCombo("L1+B")).toEqual({ ok: false, reason: "reserved" });
  });
  it("rejects unknown tokens", () => {
    expect(validateCombo("XYZ")).toEqual({ ok: false, reason: "unknown" });
  });
  it("rejects empty when allowNull is not set", () => {
    expect(validateCombo("")).toEqual({ ok: false, reason: "empty" });
    expect(validateCombo(null)).toEqual({ ok: false, reason: "empty" });
  });
  it("accepts null when allowNull", () => {
    expect(validateCombo(null, { allowNull: true })).toEqual({ ok: true });
  });
});

describe("matchEvent", () => {
  it("fires for matching single", () => {
    const state = createMatcherState();
    const combo = parseCombo("X")!;
    expect(matchEvent({ button: BTN.SECONDARY }, combo, state)).toBe(true);
  });
  it("ignores non-matching single", () => {
    const state = createMatcherState();
    const combo = parseCombo("X")!;
    expect(matchEvent({ button: BTN.OPTIONS }, combo, state)).toBe(false);
  });
  it("fires on second tap within window for double", () => {
    const state = createMatcherState();
    const combo = parseCombo("L1+L1")!;
    expect(matchEvent({ button: BTN.L1 }, combo, state, 1000)).toBe(false);
    expect(matchEvent({ button: BTN.L1 }, combo, state, 1200)).toBe(true);
  });
  it("does not fire if second tap is outside window", () => {
    const state = createMatcherState();
    const combo = parseCombo("L1+L1")!;
    matchEvent({ button: BTN.L1 }, combo, state, 1000);
    expect(matchEvent({ button: BTN.L1 }, combo, state, 1500)).toBe(false);
  });
  it("fires on chord when both buttons pressed in window", () => {
    const state = createMatcherState();
    const combo = parseCombo("L1+R1")!;
    expect(matchEvent({ button: BTN.L1 }, combo, state, 1000)).toBe(false);
    expect(matchEvent({ button: BTN.R1 }, combo, state, 1100)).toBe(true);
  });
  it("does not fire on chord when only one button matches", () => {
    const state = createMatcherState();
    const combo = parseCombo("L1+R1")!;
    expect(matchEvent({ button: BTN.L1 }, combo, state)).toBe(false);
    expect(matchEvent({ button: BTN.SECONDARY }, combo, state)).toBe(false);
  });
  it("returns false when combo is null", () => {
    const state = createMatcherState();
    expect(matchEvent({ button: BTN.SECONDARY }, null, state)).toBe(false);
  });
  it("accepts Decky-style nested detail", () => {
    const state = createMatcherState();
    const combo = parseCombo("Y")!;
    expect(matchEvent({ detail: { button: BTN.OPTIONS } }, combo, state)).toBe(true);
  });
});

describe("findCollisions", () => {
  it("flags duplicates across fields", () => {
    const collisions = findCollisions({
      cardHideRemove: "X",
      cardHighlightToggle: "X",
      cardQuickLaunch: "VIEW",
      navSearch: "L1+R1",
      navSideNav: "L1+L1",
    });
    expect(collisions.length).toBe(1);
    expect(collisions[0]).toEqual(expect.arrayContaining(["cardHideRemove", "cardHighlightToggle"]));
  });
  it("returns empty when all distinct", () => {
    expect(findCollisions(DEFAULT_BINDINGS)).toEqual([]);
  });
  it("ignores null/empty bindings in collision check", () => {
    expect(findCollisions({
      cardHideRemove: null,
      cardHighlightToggle: null,
      cardQuickLaunch: "VIEW",
      navSearch: "L1+R1",
      navSideNav: "L1+L1",
    })).toEqual([]);
  });
});

describe("formatComboForDisplay", () => {
  it("renders single token verbatim", () => {
    expect(formatComboForDisplay("X")).toBe("X");
    expect(formatComboForDisplay("view")).toBe("VIEW");
  });
  it("renders chord with separator", () => {
    expect(formatComboForDisplay("L1+R1")).toBe("L1 + R1");
  });
  it("renders double-tap with ×2", () => {
    expect(formatComboForDisplay("L1+L1")).toBe("L1 ×2");
  });
  it("returns empty for null / empty", () => {
    expect(formatComboForDisplay(null)).toBe("");
    expect(formatComboForDisplay("")).toBe("");
    expect(formatComboForDisplay(undefined)).toBe("");
  });
});

describe("resolveBindings", () => {
  it("returns defaults when nothing stored", () => {
    expect(resolveBindings(null)).toEqual(DEFAULT_BINDINGS);
    expect(resolveBindings(undefined)).toEqual(DEFAULT_BINDINGS);
    expect(resolveBindings({})).toEqual(DEFAULT_BINDINGS);
  });
  it("respects nullable explicit disable", () => {
    const r = resolveBindings({ cardHideRemove: null });
    expect(r.cardHideRemove).toBeNull();
    expect(r.cardHighlightToggle).toBe(DEFAULT_BINDINGS.cardHighlightToggle);
  });
  it("falls back to default for nav fields when empty string", () => {
    const r = resolveBindings({ navSearch: "" });
    expect(r.navSearch).toBe(DEFAULT_BINDINGS.navSearch);
  });
  it("respects custom bindings", () => {
    const r = resolveBindings({ cardQuickLaunch: "L2" });
    expect(r.cardQuickLaunch).toBe("L2");
  });
});
