// Button-binding parser + matcher used by every gamepad-driven trigger
// (card hide/highlight/quick-launch, side-nav open, quick-search toggle).
// Tokens are uppercase strings; combos are `+`-joined, e.g. "L1+R1".
// Repeated single tokens model double-taps, e.g. "L1+L1".

import type { ButtonBindings } from "../types";

// GamepadButton enum mirrored from @decky/ui (see src/shims/decky-ui.ts).
// Inlined to keep this module side-effect free.
export const BTN = {
  OK: 1, CANCEL: 2, SECONDARY: 3, OPTIONS: 4,
  L1: 5, R1: 6, L2: 7, R2: 8,
  DPAD_UP: 9, DPAD_DOWN: 10, DPAD_LEFT: 11, DPAD_RIGHT: 12,
  VIEW: 13, START: 14, LSTICK: 15, RSTICK: 16,
} as const;

// Token → numeric id. Aliases (A/X/Y/B/VIEW/MENU) accepted on parse.
// L4/L5/R4/R5 don't have Decky equivalents and DPad/A/B aren't relayed by
// the home-input bus either; the raw matcher (parseRawCombo + matchEvent
// against `{ button: rawId }`) covers anything the Decky bus doesn't see.
const TOKEN_TO_BTN: Record<string, number> = {
  A: BTN.OK, B: BTN.CANCEL, X: BTN.SECONDARY, Y: BTN.OPTIONS,
  L1: BTN.L1, R1: BTN.R1, L2: BTN.L2, R2: BTN.R2,
  DPAD_UP: BTN.DPAD_UP, DPAD_DOWN: BTN.DPAD_DOWN,
  DPAD_LEFT: BTN.DPAD_LEFT, DPAD_RIGHT: BTN.DPAD_RIGHT,
  VIEW: BTN.VIEW, SELECT: BTN.VIEW,
  MENU: BTN.START, START: BTN.START,
  LSTICK: BTN.LSTICK, RSTICK: BTN.RSTICK,
  L3: BTN.LSTICK, R3: BTN.RSTICK,
  L4: -104, L5: -105, R4: -204, R5: -205,
};

// Raw button IDs as emitted by SteamClient.Input.RegisterForControllerInputMessages.
// Verified live on a Steam Deck via the in-app capture diagnostic. These are
// completely separate from the Decky home-button bus ids in BTN above.
const TOKEN_TO_RAW: Record<string, number> = {
  A: 0, B: 1, X: 2, Y: 3,
  L1: 30, R1: 31,
  L2: 28, R2: 29,
  L3: 25, R3: 41,
  L4: 44, R4: 45,
  L5: 32, R5: 33,
  DPAD_UP: 20, DPAD_DOWN: 21, DPAD_LEFT: 22, DPAD_RIGHT: 23,
  VIEW: 35, SELECT: 35,
  MENU: 36, START: 36,
  LSTICK: 25, RSTICK: 41,
};

// Reserved at any position — the system fires the native action even
// in chord, so trying to bind these results in a stuck-state risk.
const RESERVED = new Set<string>(["A", "B", "MENU", "START", "STEAM", "SCREENSHOT"]);

export const ALLOWED_TOKENS = [
  "X", "Y", "L1", "R1", "L2", "R2", "VIEW",
  "L3", "R3", "L4", "L5", "R4", "R5",
  "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT",
  "LSTICK", "RSTICK",
] as const;

export type Combo =
  | { kind: "single"; btn: number }
  | { kind: "chord"; btns: number[] }
  | { kind: "double"; btn: number; windowMs: number };

const DOUBLE_TAP_MS = 300;

function parseComboWith(raw: string | null | undefined, table: Record<string, number>): Combo | null {
  if (!raw || typeof raw !== "string") return null;
  const tokens = raw.split("+").map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (!tokens.length) return null;
  for (const t of tokens) if (RESERVED.has(t) || !(t in table)) return null;
  if (tokens.length === 1) return { kind: "single", btn: table[tokens[0]] };
  if (tokens.length === 2 && tokens[0] === tokens[1]) {
    return { kind: "double", btn: table[tokens[0]], windowMs: DOUBLE_TAP_MS };
  }
  const btns = tokens.map((t) => table[t]);
  return { kind: "chord", btns };
}

export function parseCombo(raw: string | null | undefined): Combo | null {
  return parseComboWith(raw, TOKEN_TO_BTN);
}

// Build a Combo whose `btn` values are RAW controller IDs. Use this with
// `matchEvent({ button: rawId }, combo, state)` driven by
// `subscribeControllerInput`, which is the only stream that surfaces the
// back-grip buttons (L4/L5/R4/R5) and exposes a complete id space.
export function parseRawCombo(raw: string | null | undefined): Combo | null {
  return parseComboWith(raw, TOKEN_TO_RAW);
}

export function validateCombo(raw: string | null | undefined, opts?: { allowNull?: boolean }): {
  ok: boolean; reason?: "reserved" | "unknown" | "empty" | "duplicate";
} {
  if (raw === null || raw === undefined || raw === "") {
    return opts?.allowNull ? { ok: true } : { ok: false, reason: "empty" };
  }
  const tokens = String(raw).split("+").map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (!tokens.length) return { ok: false, reason: "empty" };
  for (const t of tokens) {
    if (RESERVED.has(t)) return { ok: false, reason: "reserved" };
    if (!(t in TOKEN_TO_BTN)) return { ok: false, reason: "unknown" };
  }
  if (tokens.length === 2 && tokens[0] !== tokens[1]) {
    if (new Set(tokens).size !== tokens.length) return { ok: false, reason: "duplicate" };
  }
  return { ok: true };
}

// Per-binding state — tracks last-press timestamps for double-tap and
// currently-held buttons for chord matching. One state object per call site.
export interface MatcherState {
  lastPress: Map<number, number>;
  held: Set<number>;
}

export function createMatcherState(): MatcherState {
  return { lastPress: new Map(), held: new Set() };
}

// Call on every button-down event. Returns true when the combo fires.
export function matchEvent(
  evt: { detail?: { button?: number } } | { button?: number } | any,
  combo: Combo | null,
  state: MatcherState,
  now: number = Date.now(),
): boolean {
  if (!combo) return false;
  const btn = typeof evt?.detail?.button === "number"
    ? evt.detail.button
    : typeof evt?.button === "number" ? evt.button : null;
  if (btn === null) return false;
  if (combo.kind === "single") {
    state.lastPress.set(btn, now);
    return btn === combo.btn;
  }
  if (combo.kind === "double") {
    if (btn !== combo.btn) return false;
    const last = state.lastPress.get(btn) ?? 0;
    state.lastPress.set(btn, now);
    return last > 0 && (now - last) <= combo.windowMs;
  }
  // chord: every member must have been pressed within a small window
  // (200ms) and the last-pressed must complete the set.
  state.lastPress.set(btn, now);
  if (!combo.btns.includes(btn)) return false;
  return combo.btns.every((b) => {
    const t = state.lastPress.get(b) ?? 0;
    return t > 0 && (now - t) <= 200;
  });
}

// Collision detector — used by the UI to flag duplicate bindings.
export function findCollisions(b: ButtonBindings): string[][] {
  const seen = new Map<string, string[]>();
  const fields: Array<keyof ButtonBindings> = [
    "cardHideRemove", "cardHighlightToggle", "cardQuickLaunch", "navSearch", "navSideNav",
  ];
  for (const f of fields) {
    const v = b[f];
    if (!v) continue;
    const key = String(v).trim().toUpperCase();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(f);
  }
  return Array.from(seen.values()).filter((arr) => arr.length > 1);
}

// Defaults — referenced by both runtime (when settings haven't loaded yet)
// and the UI's "reset" buttons.
export const DEFAULT_BINDINGS: Required<ButtonBindings> = {
  cardHideRemove: "X",
  cardHighlightToggle: "Y",
  cardQuickLaunch: "VIEW",
  navSearch: "L1+R1",
  navSideNav: "L1+L1",
};

// Render a stored combo string for display in user-facing hints.
// "L1+L1" → "L1 ×2"; "L1+R1" → "L1 + R1"; "X" → "X"; null → "" (caller decides).
export function formatComboForDisplay(combo: string | null | undefined): string {
  if (!combo) return "";
  const tokens = String(combo).split("+").map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (tokens.length === 0) return "";
  if (tokens.length === 1) return tokens[0];
  if (tokens.length === 2 && tokens[0] === tokens[1]) return `${tokens[0]} ×2`;
  return tokens.join(" + ");
}

export function resolveBindings(b: ButtonBindings | null | undefined, disabled?: ReadonlyArray<string>): Required<ButtonBindings> {
  const ds = new Set(disabled ?? []);
  const pick = <K extends keyof Required<ButtonBindings>>(key: K, raw: any, fallback: Required<ButtonBindings>[K]) => {
    if (ds.has(key as string)) return null as any;
    if (raw === undefined) return fallback;
    return raw;
  };
  if (!b) {
    return {
      cardHideRemove: pick("cardHideRemove", undefined, DEFAULT_BINDINGS.cardHideRemove),
      cardHighlightToggle: pick("cardHighlightToggle", undefined, DEFAULT_BINDINGS.cardHighlightToggle),
      cardQuickLaunch: pick("cardQuickLaunch", undefined, DEFAULT_BINDINGS.cardQuickLaunch),
      navSearch: pick("navSearch", undefined, DEFAULT_BINDINGS.navSearch),
      navSideNav: pick("navSideNav", undefined, DEFAULT_BINDINGS.navSideNav),
    };
  }
  return {
    cardHideRemove: pick("cardHideRemove", b.cardHideRemove, DEFAULT_BINDINGS.cardHideRemove),
    cardHighlightToggle: pick("cardHighlightToggle", b.cardHighlightToggle, DEFAULT_BINDINGS.cardHighlightToggle),
    cardQuickLaunch: pick("cardQuickLaunch", b.cardQuickLaunch, DEFAULT_BINDINGS.cardQuickLaunch),
    navSearch: pick("navSearch", b.navSearch || undefined, DEFAULT_BINDINGS.navSearch),
    navSideNav: pick("navSideNav", b.navSideNav || undefined, DEFAULT_BINDINGS.navSideNav),
  };
}
