// D-pad and face buttons never arrive as DOM keydown; Steam routes them through controller input messages.

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

function publishToDebugBus(ev: ControllerEvent): void {
  devStamp("__ds_input_last", ev);
  devTrace("__ds_input_log", ev, 50);
}

function exposeSubscribersForDebug(): void {
  devStamp("__ds_input_bus", Array.from(listeners));
}

const inputApiOf = (owner: any) => owner?.SteamClient?.Input;

const homeView = (g: any) => g.document?.getElementById?.('deck-shelves-home-root')?.ownerDocument?.defaultView;

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
// Steam delivers the same press once per Input object, so drop duplicates within DEDUP_WINDOW_MS.
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

// Registration has to run in Big Picture's context; callbacks registered from the shared context are dropped.
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

// Keydown for type-to-filter only fires in Big Picture's context.
function installBPKeydownLogger(view: any): void {
  try {
    const kbBody = [
      "if (this.__ds_bp_keydown_installed) return;",
      "this.__ds_bp_keydown_installed = true;",
      "this.__ds_bp_keydown_log = [];",
      "var _klog = this.__ds_bp_keydown_log;",
      "this.document.addEventListener('keydown', function (e) {",
      "  try {",
      "    _klog.push({ key: e.key, code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey, alt: e.altKey, tag: e.target && e.target.tagName, t: Date.now() });",
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

// Controller messages are forwarded only while no direct registration has delivered, so a press never arrives twice.
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

// The injected side caps the logs with shift(), so drain them instead of keeping a read cursor.
function drain(log: unknown): any[] {
  return Array.isArray(log) && log.length ? log.splice(0, log.length) : [];
}

// Dropped behind a running game so stale presses don't fire when it ends.
function drainLogs(view: any, discard: boolean): void {
  for (const entry of drain(view?.__ds_bp_input_log)) {
    const ev = entry && !discard ? bpEntryToEvent(entry) : null;
    if (ev) dispatch(ev);
  }
  for (const entry of drain(view?.__ds_bp_keydown_log)) if (entry && !discard) dispatchHomeKey(entry);
}

const DRAIN_MS = 30;
// What is drained during a game is discarded, so it can wait longer.
const DRAIN_IN_GAME_MS = 250;
let pollChain: { cancelled: boolean } | null = null;

function startPolling(): void {
  if (pollChain) return;
  const g = globalThis as any;
  const chain = { cancelled: false };
  pollChain = chain;
  const arm = (delay: number): void => {
    if (!chain.cancelled) pollTimer = g.setTimeout?.(tick, delay) ?? null;
  };
  const tick = (): void => {
    let inGame = false;
    try {
      inGame = getSessionState().gameRunning;
      drainLogs(g.__ds_input_bp_view, inGame);
    } catch {} finally {
      arm(inGame ? DRAIN_IN_GAME_MS : DRAIN_MS);
    }
  };
  arm(DRAIN_MS);
}

function stopPolling(): void {
  if (pollChain) pollChain.cancelled = true;
  pollChain = null;
  try { if (pollTimer != null) (globalThis as any).clearTimeout?.(pollTimer); } catch {}
  pollTimer = null;
}

function ensureInstalled(): void {
  if (installed) return;
  const bpOk = installBPInjection();
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
      stopPolling();
    };
    installed = true;
    devStamp("__ds_input_installed", { sharedJs: unregisterAll.length, bp: bpOk });
  }
}

// The Input global may not be ready when this module loads.
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
