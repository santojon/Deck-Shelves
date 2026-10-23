/* One place for everything periodic in the renderer: the refresh emitter, the
   fallback mount poll, the focused-card poll and the Home's focus effect
   register here and run only in the states they name. Event-driven, no timer
   of its own: it listens to the signals below and re-reads them on every read,
   so a change without an event (a store updating late) is caught on the next. */
import { getSessionState, isGameRunningByEvent, subscribeSessionState } from "./sessionState";
import { getPreferredSteamWindow } from "./steamHost";
import { steamUIStore } from "../steam/internals";

export type PowerState = 'active' | 'home-hidden' | 'in-game' | 'screen-off' | 'suspended';

export type PeriodicTask = {
  runIn: PowerState[];
  start: () => void;
  stop: () => void;
  // Runs after `start` on every entry but the one at registration.
  onResume?: () => void;
};

type TaskEntry = PeriodicTask & { name: string; running: boolean; starts: number; stops: number };

const tasks = new Set<TaskEntry>();
const listeners = new Set<(state: PowerState) => void>();
let current: PowerState = 'active';
let since = Date.now();
let transitions = 0;
let suspended = false;
let screenOff = false;
let hostHidden = false;
let installed = false;
let syncing = false;

// Both signals, as the focused-card poll does: the store alone can list a
// failed launch that never stops, the event set alone can miss a stop.
function gameRunning(): boolean {
  try { return isGameRunningByEvent() && getSessionState().gameRunning; } catch { return false; }
}

/* A game window in the foreground session, from the compositor's focus
   events: a shortcut or a third-party launcher can run a game that never
   reaches the running-apps store or the lifetime notifications. Steam's own
   window reports appid 769; any other window with an appid is a game's. */
const STEAM_CLIENT_APPID = 769;
let focusedGame = false;
// The focusable list still holds the game window while a menu is open over it.
let gameWindowListed = false;
let overlayGameFocused = false;

function isGameWindow(app: any): boolean {
  const id = Number(app?.appid ?? app?.unAppID ?? 0);
  if (!(id > 0) || id === STEAM_CLIENT_APPID) return false;
  return !/steamwebhelper|^steam$/i.test(String(app?.strExeName ?? ""));
}

function noteFocusChange(e: any): void {
  focusedGame = isGameWindow(e?.focusedApp ?? e);
  gameWindowListed = Array.isArray(e?.rgFocusable) && e.rgFocusable.some(isGameWindow);
  onSignal();
}

function noteOverlayGameFocus(appid: any, focused: any): void {
  overlayGameFocused = focused === true && isGameWindow({ appid });
  onSignal();
}

function inGame(): boolean {
  return gameRunning() || focusedGame || gameWindowListed || overlayGameFocused;
}

function mainWindow(): any {
  try { return steamUIStore()?.WindowStore?.GamepadUIMainWindowInstance ?? null; } catch { return null; }
}

/* Another page covers the Home, read from Steam's own router: the window URL
   cannot tell (the desktop Big Picture stays on /index.html). A client that
   does not expose the router counts as not covered. */
export function homeRouteCovered(): boolean {
  try {
    const path = mainWindow()?.m_history?.location?.pathname;
    return typeof path === "string" && !path.startsWith("/library/home");
  } catch { return false; }
}

// The Home is mounted behind a running game: no upkeep is worth doing there.
export function isHomeBehindGame(): boolean {
  return inGame() && homeRouteCovered();
}

function readState(): PowerState {
  if (suspended) return 'suspended';
  if (screenOff) return 'screen-off';
  if (inGame()) return 'in-game';
  if (hostHidden || homeRouteCovered()) return 'home-hidden';
  return 'active';
}

function startTask(t: TaskEntry, resume: boolean): void {
  if (t.running) return;
  t.running = true;
  t.starts++;
  try { t.start(); } catch {}
  if (resume) { try { t.onResume?.(); } catch {} }
}

function stopTask(t: TaskEntry): void {
  if (!t.running) return;
  t.running = false;
  t.stops++;
  try { t.stop(); } catch {}
}

function applyTransition(prev: PowerState, next: PowerState): void {
  current = next;
  since = Date.now();
  transitions++;
  for (const t of Array.from(tasks)) {
    const was = t.runIn.includes(prev);
    const now = t.runIn.includes(next);
    if (was && !now) stopTask(t);
    else if (!was && now) startTask(t, true);
  }
  for (const l of Array.from(listeners)) { try { l(next); } catch {} }
}

// Re-reads the signals; a change moves the tasks and notifies subscribers.
export function getPowerState(): PowerState {
  if (syncing) return current;
  syncing = true;
  try {
    if (installed) wireHost();
    const next = readState();
    if (next !== current) applyTransition(current, next);
  } finally { syncing = false; }
  return current;
}

export function subscribePowerState(cb: (state: PowerState) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function registerPeriodic(name: string, task: PeriodicTask): () => void {
  const entry: TaskEntry = { ...task, name, running: false, starts: 0, stops: 0 };
  tasks.add(entry);
  if (entry.runIn.includes(getPowerState())) startTask(entry, false);
  return () => {
    if (!tasks.delete(entry)) return;
    stopTask(entry);
  };
}

export type PowerGateSignals = {
  gameByEvent: boolean; gameByStore: boolean; focusedGame: boolean; gameWindowListed: boolean;
  overlayGameFocused: boolean; routeCovered: boolean; hostHidden: boolean; screenOff: boolean; suspended: boolean;
};

export type PowerGateStats = {
  state: PowerState;
  since: number;
  transitions: number;
  tasks: Record<string, { running: boolean; starts: number; stops: number }>;
  // Why the state is what it is, for the device probe.
  signals: PowerGateSignals;
};

function readSignals(): PowerGateSignals {
  let gameByStore = false;
  try { gameByStore = getSessionState().gameRunning; } catch {}
  return {
    gameByEvent: isGameRunningByEvent(), gameByStore, focusedGame, gameWindowListed, overlayGameFocused,
    routeCovered: homeRouteCovered(), hostHidden, screenOff, suspended,
  };
}

// For diagnostics and the device energy probe.
export function getPowerGateStats(): PowerGateStats {
  const out: PowerGateStats['tasks'] = {};
  for (const t of tasks) {
    const s = (out[t.name] ??= { running: false, starts: 0, stops: 0 });
    s.running = s.running || t.running;
    s.starts += t.starts;
    s.stops += t.stops;
  }
  return { state: current, since, transitions, tasks: out, signals: readSignals() };
}

// ---- signals ----

const signalUnsubs: Array<() => void> = [];
const hostUnsubs: Array<() => void> = [];
let wiredWin: Window | null = null;
let wiredDoc: Document | null = null;
let wiredHistory: any = null;
let unloading = false;

function onSignal(): void { getPowerState(); }

function steamClient(): any {
  return (globalThis as any).SteamClient ?? (globalThis as any).window?.SteamClient;
}

function register(call: () => any): void {
  try {
    const reg = call();
    if (typeof reg?.unregister === "function") signalUnsubs.push(() => { try { reg.unregister(); } catch {} });
  } catch {}
}

// The same three registrations systemEvents / recentsReplace already rely on.
function wireSuspend(): void {
  const sys = steamClient()?.System;
  register(() => sys?.RegisterForOnSuspendRequest?.(() => { suspended = true; onSignal(); }));
  register(() => sys?.RegisterForOnResumeFromSuspend?.(() => { suspended = false; onSignal(); }));
  register(() => sys?.RegisterForSuspendResumeEvents?.((event: any) => {
    suspended = event?.bSuspending === true || event?.type === 'suspend'
      || (event?.eSuspendType !== undefined && event?.bSuspending !== false);
    onSignal();
  }));
}

// The compositor's focus events: which window has the focus, and which exist.
function wireGameWindows(): void {
  const ui = steamClient()?.System?.UI;
  register(() => ui?.RegisterForFocusChangeEvents?.(noteFocusChange));
  register(() => ui?.RegisterForOverlayGameWindowFocusChanged?.(noteOverlayGameFocus));
}

function listen(bag: Array<() => void>, target: { addEventListener: Function; removeEventListener: Function } | null | undefined, type: string, cb: () => void): void {
  if (!target) return;
  try {
    target.addEventListener(type, cb);
    bag.push(() => { try { target.removeEventListener(type, cb); } catch {} });
  } catch {}
}

/* The plugin realm's own document (the shared context on the Deck) reports
   the display going dark through visibilitychange, as the suspend fallback
   next to it already relies on. Events only: its initial value is not trusted. */
function wireScreen(): void {
  const doc = (globalThis as any).document as Document | undefined;
  listen(signalUnsubs, doc, "visibilitychange", () => { screenOff = !!doc?.hidden; onSignal(); });
}

function unwireHost(): void {
  for (const u of hostUnsubs.splice(0)) u();
  wiredWin = null; wiredDoc = null; wiredHistory = null;
  hostHidden = false; unloading = false;
}

function hostTargets(): { win: Window | null; doc: Document | null; history: any } {
  const inst = mainWindow();
  let win: Window | null = null;
  let doc: Document | null = null;
  try { win = inst?.BrowserWindow ?? getPreferredSteamWindow(); } catch {}
  try { doc = win?.document ?? null; } catch {}
  return { win, doc, history: inst?.m_history ?? null };
}

// The router's own `listen` (a history object), when the client exposes one.
function listenHistory(history: any): void {
  if (typeof history?.listen !== "function") return;
  try {
    const off = history.listen(onSignal);
    if (typeof off === "function") hostUnsubs.push(() => { try { off(); } catch {} });
  } catch {}
}

/* The Big Picture window carries the route (`popstate` / `hashchange`, the
   router's `listen`) and the Home's visibility on a desktop host. Re-attached
   whenever that window, its document or its router is a new object (renderer
   reload, window appearing after install). `hidden` is taken from the events
   only: a document reporting hidden from the start would hold every task. */
function wireHost(): void {
  const { win, doc, history } = hostTargets();
  if (win === wiredWin && doc === wiredDoc && history === wiredHistory) return;
  unwireHost();
  wiredWin = win; wiredDoc = doc; wiredHistory = history;
  listen(hostUnsubs, win, "popstate", onSignal);
  listen(hostUnsubs, win, "hashchange", onSignal);
  // A document on its way out (renderer reload) reports hidden as it unloads;
  // that is not the Home hiding. The document replacing it is wired on the next read.
  listen(hostUnsubs, win, "pagehide", () => { unloading = true; hostHidden = false; onSignal(); });
  listen(hostUnsubs, doc, "visibilitychange", () => { if (unloading) return; hostHidden = !!doc?.hidden; onSignal(); });
  listenHistory(history);
}

function disposePowerGate(): void {
  if (!installed) return;
  installed = false;
  for (const u of signalUnsubs.splice(0)) u();
  unwireHost();
  suspended = false; screenOff = false;
  focusedGame = false; gameWindowListed = false; overlayGameFocused = false;
  // Owners unregister on their own teardown; anything left behind stops here.
  for (const t of Array.from(tasks)) { stopTask(t); tasks.delete(t); }
}

// Wires the signals once; idempotent. Returns the dispose.
export function installPowerGate(): () => void {
  if (installed) return disposePowerGate;
  installed = true;
  signalUnsubs.push(subscribeSessionState(onSignal));
  wireSuspend();
  wireGameWindows();
  wireScreen();
  wireHost();
  getPowerState();
  // Dev builds: the live stats for an on-device probe over the debugger.
  if (__DEV__) { try { (globalThis as any).__ds_power_gate = getPowerGateStats; } catch {} }
  return disposePowerGate;
}

export function __resetPowerGateForTest(): void {
  disposePowerGate();
  tasks.clear();
  listeners.clear();
  current = 'active';
  since = Date.now();
  transitions = 0;
  hostHidden = false;
}
