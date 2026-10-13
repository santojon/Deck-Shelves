/* Shared bridge for Steam Deck controller buttons. The host page (BP)
   does NOT receive DOM keydown for D-pad / face buttons — Steam routes
   those through `SteamClient.Input.RegisterForControllerInputMessages`.
   This helper exposes a single subscribe-based stream so multiple
   features can listen without each one re-registering with Steam. */

import { getSessionState } from "./sessionState";
import { devStamp, devTrace } from "./devStamps";
import { dispatchHomeKey } from "./homeInputBus";

const DPAD_UP = 20;
const DPAD_DOWN = 21;
const DPAD_LEFT = 22;
const DPAD_RIGHT = 23;
const BUTTON_A = 0;
const BUTTON_B = 1;
const BUTTON_X = 2;
const BUTTON_Y = 3;
// Steam Deck Big Picture raw button IDs verified live via the in-app raw-id
/* surface in the bindings capture screen (SteamClient.Input.RegisterForControllerInputMessages).
   Numbers below are the live deck values; the older 4-9 range was wrong
   (those slots correspond to other internal events). Back-grip buttons
   (L4/L5/R4/R5) and stick clicks (L3/R3) also surface here so users can
   bind any physical button. */
const L1 = 30;
const R1 = 31;
const L2 = 28;
const R2 = 29;
const L3 = 25;
const R3 = 41;
const L4 = 44;
const R4 = 45;
const L5 = 32;
const R5 = 33;
const VIEW = 35;
const MENU = 36;

export const Button = {
  DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT,
  A: BUTTON_A, B: BUTTON_B, X: BUTTON_X, Y: BUTTON_Y,
  L1, R1, L2, R2, L3, R3, L4, R4, L5, R5, VIEW, MENU,
} as const;

export interface ControllerEvent {
  button: number;
  pressed: boolean;
  slot: number;
}

type Listener = (e: ControllerEvent) => void;

const listeners = new Set<Listener>();
let installed = false;
let unregister: (() => void) | null = null;

// Expose a debug bus for CDP probes. Tests can push a fake event and
// observe what each subscriber does without needing a real controller.
function publishToDebugBus(ev: ControllerEvent): void {
  devStamp("__ds_input_last", ev);
  devTrace("__ds_input_log", ev, 50);
}

function exposeSubscribersForDebug(): void {
  devStamp("__ds_input_bus", Array.from(listeners));
}

const inputApiOf = (owner: any) => owner?.SteamClient?.Input;

const homeView = (g: any) => g.document?.getElementById?.('deck-shelves-home-root')?.ownerDocument?.defaultView;

/* Every place Steam may expose a `SteamClient.Input`, in priority order, as
   lazy probes — each one evaluated (and guarded) on its own. */
function inputProbes(g: any): Array<[string, () => any]> {
  const probes: Array<[string, () => any]> = [
    ['self', () => inputApiOf(g)],
    ['opener', () => inputApiOf(g.opener)],
    ['gamepadMain', () => inputApiOf(g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow)],
  ];
  let wins: any;
  try { wins = g.SteamUIStore?.WindowStore?.SteamUIWindows; } catch {}
  if (Array.isArray(wins)) wins.forEach((entry: any, i: number) => probes.push(['ui[' + i + ']', () => inputApiOf(entry?.BrowserWindow)]));
  probes.push(['focused', () => inputApiOf(g.SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow)]);
  probes.push(['home.view', () => inputApiOf(homeView(g))]);
  probes.push(['home.opener', () => inputApiOf(homeView(g)?.opener)]);
  return probes;
}

function getAllInputApis(): any[] {
  const g = globalThis as any;
  const seen = new Set<any>();
  const candidates: any[] = [];
  const tryPush = (v: any, label: string) => {
    const fn = v?.RegisterForControllerInputMessages;
    if (!fn || seen.has(fn)) return;
    seen.add(fn);
    candidates.push(v);
    devTrace("__ds_input_sources", label, 50);
  };
  for (const [label, get] of inputProbes(g)) {
    try { tryPush(get(), label); } catch {}
  }
  return candidates;
}

let unregisterAll: Array<() => void> = [];
/* Steam exposes the same controller stream through several Input objects
   (self, gamepadMain, BP injection) — registering on each yields the same
   event N times within ~1 ms. Drop duplicate (slot, button, pressed)
   triples seen within DEDUP_WINDOW_MS so subscribers see one event per
   physical press. */
const DEDUP_WINDOW_MS = 40;
let lastEvKey = "";
let lastEvAt = 0;
function dispatch(ev: ControllerEvent): void {
  const key = `${ev.slot}:${ev.button}:${ev.pressed ? 1 : 0}`;
  const now = Date.now();
  if (key === lastEvKey && (now - lastEvAt) < DEDUP_WINDOW_MS) return;
  lastEvKey = key;
  lastEvAt = now;
  publishToDebugBus(ev);
  for (const l of listeners) {
    try { l(ev); } catch {}
  }
}

let pollTimer: number | null = null;

// Injects a tiny registration script into the host (BP) document so
/* `RegisterForControllerInputMessages` runs IN BP's JS context — that's
   where Steam actually dispatches controller events. SharedJSContext
   callbacks are silently dropped. The BP script writes events to
   `view.__ds_bp_input_log`; we poll it and forward into the listeners
   here. */
// The BP-side windows that may own a `SteamClient.Input` (the first one
// exposing `RegisterForControllerInputMessages` wins).
function collectBrowserWindows(g: any): any[] {
  const candidates: any[] = [];
  const push = (get: () => any) => { try { candidates.push(get()); } catch {} };
  push(() => g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow);
  try {
    const wins = g.SteamUIStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(wins)) for (const w of wins) candidates.push(w?.BrowserWindow);
  } catch {}
  push(() => g.SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow);
  return candidates;
}

function installBPInjection(): boolean {
  const g = globalThis as any;
  const candidates = collectBrowserWindows(g);
  const view = candidates.find((c) => c?.SteamClient?.Input?.RegisterForControllerInputMessages) ?? null;
  devStamp("__ds_bp_diag", {
    cand: candidates.length,
    hasView: !!view,
    hasFunction: !!view?.Function,
    hasDocument: !!view?.document,
    typeofView: typeof view,
  });
  if (!view) return false;
  installBPKeydownLogger(view);
  if (view.__ds_bp_input_installed) {
    g.__ds_input_bp_view = view;
    return true;
  }
  return installBPInputRegistration(view, g);
}

/* Also install a global keydown listener IN BP context to capture keyboard
   typing on the home (matches Big Picture's native "type to filter" UX). BP
   captures these even when no input has focus, but the events only fire in
   BP's JS context. */
function installBPKeydownLogger(view: any): void {
  try {
    const kbBody = [
      "if (this.__ds_bp_keydown_installed) return;",
      "this.__ds_bp_keydown_installed = true;",
      "this.__ds_bp_keydown_log = [];",
      "var _klog = this.__ds_bp_keydown_log;",
      "this.document.addEventListener('keydown', function (e) {",
      "  try {",
      "    _klog.push({ key: e.key, code: e.code, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, tag: e.target && e.target.tagName, t: Date.now() });",
      "    if (_klog.length > 100) _klog.shift();",
      "  } catch (err) {}",
      "}, true);",
    ].join("\n");
    const kbFn = new view.Function(kbBody);
    kbFn.call(view);
  } catch (e) {
    devStamp("__ds_bp_keydown_err", String(e).slice(0, 200));
  }
}

function installBPInputRegistration(view: any, g: any): boolean {
  try {
    const body = [
      "if (this.__ds_bp_input_installed) return;",
      "this.__ds_bp_input_installed = true;",
      "this.__ds_bp_input_log = [];",
      "this.__ds_bp_input_regs = [];",
      "var _log = this.__ds_bp_input_log;",
      "var _regs = this.__ds_bp_input_regs;",
      "var _seen = new Set();",
      "var _tryReg = function (Input, tag) {",
      "  if (!Input) return;",
      "  ['RegisterForControllerInputMessages','RegisterForControllerCommandMessages','RegisterForTouchMenuInputMessages'].forEach(function (m) {",
      "    var fn = Input[m];",
      "    if (typeof fn !== 'function') return;",
      "    if (_seen.has(fn)) return;",
      "    _seen.add(fn);",
      "    try {",
      "      var reg = fn.call(Input, function () {",
      "        var args = Array.prototype.slice.call(arguments);",
      "        _log.push({ src: tag + '.' + m, args: args.map(function (a) { return (typeof a === 'object' && a) ? Object.keys(a).slice(0, 8) : a; }), t: Date.now() });",
      "        if (_log.length > 200) _log.shift();",
      "      });",
      "      _regs.push({ tag: tag, method: m, reg: !!reg });",
      "    } catch (e) { _regs.push({ tag: tag, method: m, err: String(e).slice(0, 100) }); }",
      "  });",
      "};",
      "_tryReg(this.SteamClient && this.SteamClient.Input, 'self');",
      "_tryReg(this.opener && this.opener.SteamClient && this.opener.SteamClient.Input, 'opener');",
      "try {",
      "  var ui = this.SteamUIStore || (this.opener && this.opener.SteamUIStore);",
      "  if (ui) {",
      "    var f = ui.GetFocusedWindowInstance && ui.GetFocusedWindowInstance();",
      "    _tryReg(f && f.BrowserWindow && f.BrowserWindow.SteamClient && f.BrowserWindow.SteamClient.Input, 'focused');",
      "    var ws = ui.WindowStore && ui.WindowStore.SteamUIWindows;",
      "    if (Array.isArray(ws)) ws.forEach(function (w, i) {",
      "      _tryReg(w && w.BrowserWindow && w.BrowserWindow.SteamClient && w.BrowserWindow.SteamClient.Input, 'ui[' + i + ']');",
      "    });",
      "    var gm = ui.WindowStore && ui.WindowStore.GamepadUIMainWindowInstance && ui.WindowStore.GamepadUIMainWindowInstance.BrowserWindow;",
      "    _tryReg(gm && gm.SteamClient && gm.SteamClient.Input, 'gamepadMain');",
      "  }",
      "} catch (e) { _regs.push({ tag: 'walk-err', err: String(e).slice(0, 200) }); }",
    ].join("\n");
    const installFn = new view.Function(body);
    installFn.call(view);
    g.__ds_input_bp_view = view;
    return true;
  } catch (e) {
    devStamp("__ds_input_bp_err", String(e).slice(0, 200));
    return false;
  }
}

/* The injected logger records `{ src, args, t }`. Controller-input messages
   carry (slot, button, pressed) and are forwarded only while no direct
   registration has delivered (so one press never arrives twice); other messages
   are forwarded as before, button-less, so idle detection still sees activity. */
let directInputSeen = false;
function inputArgsOf(entry: any): any[] | null {
  const isInput = typeof entry?.src === "string" && entry.src.endsWith(".RegisterForControllerInputMessages");
  return isInput && Array.isArray(entry.args) && typeof entry.args[1] === "number" ? entry.args : null;
}
function bpEntryToEvent(entry: any): ControllerEvent | null {
  const args = inputArgsOf(entry);
  if (!args) return { slot: entry?.s, button: entry?.b, pressed: entry?.p };
  return directInputSeen ? null : { slot: Number(args[0]), button: args[1], pressed: !!args[2] };
}

// Drain the logs (the injected side caps them with shift(), so a growing read
// cursor would stall once a cap is reached).
function drain(log: unknown): any[] {
  return Array.isArray(log) && log.length ? log.splice(0, log.length) : [];
}

// Behind a running game nothing here needs these; drop them so no stale presses
// fire once the game ends.
function drainLogs(view: any, discard: boolean): void {
  for (const entry of drain(view?.__ds_bp_input_log)) {
    const ev = entry && !discard ? bpEntryToEvent(entry) : null;
    if (ev) dispatch(ev);
  }
  for (const entry of drain(view?.__ds_bp_keydown_log)) if (entry && !discard) dispatchHomeKey(entry);
}

function startPolling(): void {
  if (pollTimer != null) return;
  const g = globalThis as any;
  pollTimer = g.setInterval?.(() => {
    try {
      drainLogs(g.__ds_input_bp_view, getSessionState().gameRunning);
    } catch {}
  }, 30);
}

function ensureInstalled(): void {
  if (installed) return;
  // Path A: inject into BP context (the only path Steam actually
  // dispatches controller events to for our home tree). This is the
  // primary mechanism — without it the rest is a no-op.
  const bpOk = installBPInjection();
  // Path B: SharedJSContext-side registrations as a fallback. Helpful
  // for desktop testing and for OS variants where SharedJSContext does
  // see controller events.
  const apis = getAllInputApis();
  devStamp("__ds_input_api", apis.length);
  for (let i = 0; i < apis.length; i++) {
    const Input = apis[i];
    try {
      const reg = Input.RegisterForControllerInputMessages((slot: number, button: number, pressed: boolean) => {
        directInputSeen = true;
        dispatch({ slot, button, pressed });
      });
      unregisterAll.push(() => { try { reg?.unregister?.(); } catch {} });
    } catch (e) {
      devStamp("__ds_input_err", String(e).slice(0, 200));
    }
  }
  if (bpOk || unregisterAll.length > 0) {
    startPolling();
    unregister = () => {
      for (const fn of unregisterAll) try { fn(); } catch {}
      unregisterAll = [];
      try { if (pollTimer != null) (globalThis as any).clearInterval?.(pollTimer); } catch {}
      pollTimer = null;
    };
    installed = true;
    devStamp("__ds_input_installed", { sharedJs: unregisterAll.length, bp: bpOk });
  }
}

// Try to install on every browser tick until SteamClient.Input is
// reachable. The bridge runs in BP where the Input API IS exposed, but
// the global may not be ready when this module first loads.
function pollUntilInstalled(): void {
  if (installed) return;
  ensureInstalled();
  if (installed) return;
  const g = globalThis as any;
  let tries = 0;
  const timer = g.setInterval?.(() => {
    if (installed) { try { g.clearInterval?.(timer); } catch {} return; }
    tries++;
    ensureInstalled();
    if (installed || tries > 40) { try { g.clearInterval?.(timer); } catch {} }
  }, 250);
}
try { pollUntilInstalled(); } catch {}

export function subscribeControllerInput(cb: Listener): () => void {
  ensureInstalled();
  listeners.add(cb);
  exposeSubscribersForDebug();
  return () => {
    listeners.delete(cb);
    exposeSubscribersForDebug();
    if (listeners.size === 0 && unregister) {
      unregister();
      unregister = null;
      installed = false;
    }
  };
}
