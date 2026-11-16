// Signals are re-read on every read, so a change that fires no event is caught on the next one.
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

// Both signals: the store alone can list a failed launch, the event set alone can miss a stop.
function gameRunning(): boolean {
  try { return isGameRunningByEvent() && getSessionState().gameRunning; } catch { return false; }
}

// Some launchers run games the running-apps store never sees; Steam's own window reports appid 769.
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

// The window URL can't tell (desktop Big Picture stays on /index.html), so ask the router.
export function homeRouteCovered(): boolean {
  try {
    const path = mainWindow()?.m_history?.location?.pathname;
    return typeof path === "string" && !path.startsWith("/library/home");
  } catch { return false; }
}

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

// Events only: the initial visibility value isn't trusted.
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

function listenHistory(history: any): void {
  if (typeof history?.listen !== "function") return;
  try {
    const off = history.listen(onSignal);
    if (typeof off === "function") hostUnsubs.push(() => { try { off(); } catch {} });
  } catch {}
}

// `hidden` comes from events only: a document hidden from the start would hold every task.
function wireHost(): void {
  const { win, doc, history } = hostTargets();
  if (win === wiredWin && doc === wiredDoc && history === wiredHistory) return;
  unwireHost();
  wiredWin = win; wiredDoc = doc; wiredHistory = history;
  listen(hostUnsubs, win, "popstate", onSignal);
  listen(hostUnsubs, win, "hashchange", onSignal);
  // An unloading document reports hidden, which is not the Home hiding.
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
  for (const t of Array.from(tasks)) { stopTask(t); tasks.delete(t); }
}

export function installPowerGate(): () => void {
  if (installed) return disposePowerGate;
  installed = true;
  signalUnsubs.push(subscribeSessionState(onSignal));
  wireSuspend();
  wireGameWindows();
  wireScreen();
  wireHost();
  getPowerState();
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
