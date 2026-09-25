/* Keyboard-binding parser + matcher, mirroring runtime/buttonBindings.ts's
   combo grammar (single / double-tap / chord) but for physical keyboard
   keys ("KeyF", "Digit1", KeyboardEvent.code values). Arrow keys are
   deliberately excluded — Steam's own GamepadUI intercepts them as
   virtual D-pad navigation before a real keydown reaches the page. */

import type { KeyboardBindings } from "../types";

export const ALLOWED_KEY_TOKENS = [
  "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ",
  "KeyK", "KeyL", "KeyM", "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR", "KeyS", "KeyT",
  "KeyU", "KeyV", "KeyW", "KeyX", "KeyY", "KeyZ",
  "Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "Space", "Tab", "Backspace", "Delete", "Insert",
  "Minus", "Equal", "BracketLeft", "BracketRight", "Semicolon", "Quote",
  "Comma", "Period", "Slash", "Backslash", "Backquote",
  "ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight",
] as const;

const ALLOWED_KEY_SET = new Set<string>(ALLOWED_KEY_TOKENS);

// Reserved — Escape and Enter already carry native meaning (close/confirm)
// everywhere Steam's own UI is involved; binding them risks a stuck state.
const RESERVED_CODES = new Set<string>(["Escape", "Enter"]);

export type KeyCombo =
  | { kind: "single"; code: string }
  | { kind: "chord"; codes: string[] }
  | { kind: "double"; code: string; windowMs: number };

const DOUBLE_TAP_MS = 300;

function tokenizeKeyCombo(raw: string): string[] {
  return raw.split("+").map((t) => t.trim()).filter(Boolean);
}

function keyTokenIssue(tokens: string[]): "reserved" | "unknown" | null {
  for (const t of tokens) {
    if (RESERVED_CODES.has(t)) return "reserved";
    if (!ALLOWED_KEY_SET.has(t)) return "unknown";
  }
  return null;
}

export function parseKeyCombo(raw: string | null | undefined): KeyCombo | null {
  if (!raw || typeof raw !== "string") return null;
  const tokens = tokenizeKeyCombo(raw);
  if (!tokens.length || keyTokenIssue(tokens)) return null;
  if (tokens.length === 1) return { kind: "single", code: tokens[0] };
  if (tokens.length === 2 && tokens[0] === tokens[1]) {
    return { kind: "double", code: tokens[0], windowMs: DOUBLE_TAP_MS };
  }
  return { kind: "chord", codes: tokens };
}

export function validateKeyCombo(raw: string | null | undefined, opts?: { allowNull?: boolean }): {
  ok: boolean; reason?: "reserved" | "unknown" | "empty" | "duplicate";
} {
  if (!raw) return opts?.allowNull ? { ok: true } : { ok: false, reason: "empty" };
  const tokens = tokenizeKeyCombo(String(raw));
  if (!tokens.length) return { ok: false, reason: "empty" };
  const issue = keyTokenIssue(tokens);
  if (issue) return { ok: false, reason: issue };
  if (tokens.length === 2 && tokens[0] !== tokens[1] && new Set(tokens).size !== tokens.length) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true };
}

/* Skip binding matches while an editable element holds focus — the
   keyboard buses used for matching deliver every keydown regardless of
   focus (Home's BP-injected listener runs in the capture phase, ahead of
   a focused input's own handler), so without this a bound letter key
   would fire mid-typing in a text field. */
export function isEditableKeyTarget(tag: string | null | undefined): boolean {
  const t = (tag ?? "").toUpperCase();
  return t === "INPUT" || t === "TEXTAREA";
}

export interface KeyMatcherState {
  lastPress: Map<string, number>;
}

export function createKeyMatcherState(): KeyMatcherState {
  return { lastPress: new Map() };
}

// Call on every keydown. Returns true when the combo fires.
export function matchKeyEvent(
  code: string | null | undefined,
  combo: KeyCombo | null,
  state: KeyMatcherState,
  now: number = Date.now(),
): boolean {
  if (!combo || !code) return false;
  if (combo.kind === "single") {
    state.lastPress.set(code, now);
    return code === combo.code;
  }
  if (combo.kind === "double") {
    if (code !== combo.code) return false;
    const last = state.lastPress.get(code) ?? 0;
    state.lastPress.set(code, now);
    return last > 0 && (now - last) <= combo.windowMs;
  }
  state.lastPress.set(code, now);
  if (!combo.codes.includes(code)) return false;
  return combo.codes.every((c) => {
    const t = state.lastPress.get(c) ?? 0;
    return t > 0 && (now - t) <= 200;
  });
}

// Collision detector — mirrors findCollisions in buttonBindings.ts, scoped
// to the keyboard fields only (a keyboard combo and a gamepad combo never
// collide with each other; they're independent trigger paths by design).
export function findKeyCollisions(b: KeyboardBindings): string[][] {
  const seen = new Map<string, string[]>();
  const fields: Array<keyof KeyboardBindings> = [
    "cardHideRemove", "cardHighlightToggle", "cardQuickLaunch", "navSearch", "navSideNav", "navSidecarOpen", "navSidecarClose",
  ];
  for (const f of fields) {
    const v = b[f];
    if (!v) continue;
    const key = String(v).trim();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(f);
  }
  return Array.from(seen.values()).filter((arr) => arr.length > 1);
}

// Unlike gamepad bindings, every keyboard binding defaults to unset —
// opting a keyboard into an action is something the user turns on
// explicitly, not something that should suddenly claim a key press.
export const DEFAULT_KEYBOARD_BINDINGS: Required<KeyboardBindings> = {
  cardHideRemove: null,
  cardHighlightToggle: null,
  cardQuickLaunch: null,
  navSearch: null,
  navSideNav: null,
  navSidecarOpen: null,
  navSidecarClose: null,
};

const CARD_BINDING_KEYS = new Set(["cardHideRemove", "cardHighlightToggle", "cardQuickLaunch"]);

export function resolveKeyboardBindings(
  b: KeyboardBindings | null | undefined,
  disabled?: ReadonlyArray<string>,
  cardActionsEnabled: boolean = true,
): Required<KeyboardBindings> {
  const ds = new Set(disabled ?? []);
  const pick = (key: keyof KeyboardBindings, raw: string | null | undefined) =>
    (!cardActionsEnabled && CARD_BINDING_KEYS.has(key)) || ds.has(key) ? null : (raw ?? null);
  return {
    cardHideRemove: pick("cardHideRemove", b?.cardHideRemove),
    cardHighlightToggle: pick("cardHighlightToggle", b?.cardHighlightToggle),
    cardQuickLaunch: pick("cardQuickLaunch", b?.cardQuickLaunch),
    navSearch: pick("navSearch", b?.navSearch),
    navSideNav: pick("navSideNav", b?.navSideNav),
    navSidecarOpen: pick("navSidecarOpen", b?.navSidecarOpen),
    navSidecarClose: pick("navSidecarClose", b?.navSidecarClose),
  };
}

// Render a stored key combo for display, e.g. "KeyF" -> "F",
// "ControlLeft+KeyF" -> "CTRL + F", "KeyF+KeyF" -> "F ×2".
export function formatKeyComboForDisplay(combo: string | null | undefined): string {
  if (!combo) return "";
  const tokens = tokenizeKeyCombo(String(combo));
  if (!tokens.length) return "";
  const label = (code: string): string => {
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
    if (code.startsWith("Control")) return "CTRL";
    if (code.startsWith("Alt")) return "ALT";
    if (code.startsWith("Shift")) return "SHIFT";
    return code.toUpperCase();
  };
  if (tokens.length === 1) return label(tokens[0]);
  if (tokens.length === 2 && tokens[0] === tokens[1]) return `${label(tokens[0])} ×2`;
  return tokens.map(label).join(" + ");
}
