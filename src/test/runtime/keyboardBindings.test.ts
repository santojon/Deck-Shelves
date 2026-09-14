import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBOARD_BINDINGS,
  createKeyMatcherState,
  findKeyCollisions,
  formatKeyComboForDisplay,
  isEditableKeyTarget,
  matchKeyEvent,
  parseKeyCombo,
  resolveKeyboardBindings,
  validateKeyCombo,
} from "../../runtime/keyboardBindings";

describe("parseKeyCombo", () => {
  it("parses a single token", () => {
    expect(parseKeyCombo("KeyF")).toEqual({ kind: "single", code: "KeyF" });
  });
  it("parses a chord", () => {
    expect(parseKeyCombo("ControlLeft+KeyF")).toEqual({ kind: "chord", codes: ["ControlLeft", "KeyF"] });
  });
  it("parses a double-tap as same token twice", () => {
    expect(parseKeyCombo("KeyF+KeyF")).toEqual({ kind: "double", code: "KeyF", windowMs: 300 });
  });
  it("rejects reserved tokens", () => {
    expect(parseKeyCombo("Escape")).toBeNull();
    expect(parseKeyCombo("Enter")).toBeNull();
    expect(parseKeyCombo("ControlLeft+Escape")).toBeNull();
  });
  it("rejects unknown tokens", () => {
    expect(parseKeyCombo("NotAKey")).toBeNull();
  });
  it("rejects empty / null", () => {
    expect(parseKeyCombo(null)).toBeNull();
    expect(parseKeyCombo("")).toBeNull();
  });
});

describe("validateKeyCombo", () => {
  it("accepts valid combos", () => {
    expect(validateKeyCombo("KeyF")).toEqual({ ok: true });
    expect(validateKeyCombo("ControlLeft+KeyF")).toEqual({ ok: true });
  });
  it("rejects reserved", () => {
    expect(validateKeyCombo("Escape")).toEqual({ ok: false, reason: "reserved" });
  });
  it("rejects unknown tokens", () => {
    expect(validateKeyCombo("XYZ")).toEqual({ ok: false, reason: "unknown" });
  });
  it("rejects empty when allowNull is not set", () => {
    expect(validateKeyCombo("")).toEqual({ ok: false, reason: "empty" });
    expect(validateKeyCombo(null)).toEqual({ ok: false, reason: "empty" });
  });
  it("accepts null when allowNull", () => {
    expect(validateKeyCombo(null, { allowNull: true })).toEqual({ ok: true });
  });
  it("only checks for duplicates on a 2-token combo, mirroring validateCombo", () => {
    expect(validateKeyCombo("KeyF+KeyG+KeyF")).toEqual({ ok: true });
  });
});

describe("matchKeyEvent", () => {
  it("matches a single key", () => {
    const state = createKeyMatcherState();
    const combo = parseKeyCombo("KeyF");
    expect(matchKeyEvent("KeyF", combo, state)).toBe(true);
    expect(matchKeyEvent("KeyG", combo, state)).toBe(false);
  });
  it("matches a double-tap within the window", () => {
    const state = createKeyMatcherState();
    const combo = parseKeyCombo("KeyF+KeyF");
    expect(matchKeyEvent("KeyF", combo, state, 1000)).toBe(false);
    expect(matchKeyEvent("KeyF", combo, state, 1100)).toBe(true);
  });
  it("does not match a double-tap outside the window", () => {
    const state = createKeyMatcherState();
    const combo = parseKeyCombo("KeyF+KeyF");
    expect(matchKeyEvent("KeyF", combo, state, 1000)).toBe(false);
    expect(matchKeyEvent("KeyF", combo, state, 1500)).toBe(false);
  });
  it("matches a chord when both members pressed close together", () => {
    const state = createKeyMatcherState();
    const combo = parseKeyCombo("ControlLeft+KeyF");
    expect(matchKeyEvent("ControlLeft", combo, state, 1000)).toBe(false);
    expect(matchKeyEvent("KeyF", combo, state, 1050)).toBe(true);
  });
  it("returns false for a null code or combo", () => {
    const state = createKeyMatcherState();
    expect(matchKeyEvent(null, parseKeyCombo("KeyF"), state)).toBe(false);
    expect(matchKeyEvent("KeyF", null, state)).toBe(false);
  });
});

describe("resolveKeyboardBindings", () => {
  it("defaults every field to null when nothing is set", () => {
    expect(resolveKeyboardBindings(null)).toEqual(DEFAULT_KEYBOARD_BINDINGS);
    expect(resolveKeyboardBindings(undefined)).toEqual(DEFAULT_KEYBOARD_BINDINGS);
  });
  it("carries through a set value", () => {
    expect(resolveKeyboardBindings({ cardQuickLaunch: "KeyF" }).cardQuickLaunch).toBe("KeyF");
  });
  it("nulls out a disabled key even if set", () => {
    expect(resolveKeyboardBindings({ cardQuickLaunch: "KeyF" }, ["cardQuickLaunch"]).cardQuickLaunch).toBeNull();
  });
});

describe("findKeyCollisions", () => {
  it("flags two actions sharing the same key", () => {
    const collisions = findKeyCollisions({ cardHideRemove: "KeyF", cardQuickLaunch: "KeyF" });
    expect(collisions).toEqual([["cardHideRemove", "cardQuickLaunch"]]);
  });
  it("reports nothing when all keys differ", () => {
    expect(findKeyCollisions({ cardHideRemove: "KeyF", cardQuickLaunch: "KeyG" })).toEqual([]);
  });
});

describe("formatKeyComboForDisplay", () => {
  it("formats a single letter key", () => {
    expect(formatKeyComboForDisplay("KeyF")).toBe("F");
  });
  it("formats a digit key", () => {
    expect(formatKeyComboForDisplay("Digit1")).toBe("1");
  });
  it("formats a modifier chord", () => {
    expect(formatKeyComboForDisplay("ControlLeft+KeyF")).toBe("CTRL + F");
  });
  it("formats a double-tap", () => {
    expect(formatKeyComboForDisplay("KeyF+KeyF")).toBe("F ×2");
  });
  it("returns empty string for null/empty", () => {
    expect(formatKeyComboForDisplay(null)).toBe("");
    expect(formatKeyComboForDisplay("")).toBe("");
  });
});

describe("isEditableKeyTarget", () => {
  it("flags INPUT and TEXTAREA", () => {
    expect(isEditableKeyTarget("INPUT")).toBe(true);
    expect(isEditableKeyTarget("input")).toBe(true);
    expect(isEditableKeyTarget("TEXTAREA")).toBe(true);
  });
  it("does not flag other tags", () => {
    expect(isEditableKeyTarget("DIV")).toBe(false);
    expect(isEditableKeyTarget(undefined)).toBe(false);
    expect(isEditableKeyTarget(null)).toBe(false);
  });
});
