import { mark, measure } from "./perf";
import { registerDisposer } from "../runtime/runtimeDisposer";
import { isHomeOwner } from "../runtime/host/ownerGuard";

// The module ships in more than one chunk, so every copy counts into one record on globalThis.
type State = {
  bootCriticalMs: number | null;
  mountMs: number | null;
  mountStarted: boolean;
  activeTimers: number;
  activeObservers: number;
  activeSubscriptions: number;
  reconcileLog: number[];
  domCallbackLog: number[];
  renderLog: number[];
  cardRenderLog: number[];
  cardRendersTotal: number;
  mountCardsProcessed: number;
  mountFetches: number;
  remountTries: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  longTaskOver200Count: number;
  longTaskOver200Ms: number;
  longTaskObserverStarted: boolean;
  bootStartAt: number | null;
  bootOrigin: BootOrigin | null;
  bootPhases: BootPhase[];
  bootWatchdog: string | null;
  disposedKinds: Record<string, boolean>;
};

export type BootOrigin = 'cold' | 'warm' | 'hot-swap';
// One boot phase: when it began (ms after boot start) and how long it ran (null while open).
export type BootPhase = { name: string; atMs: number; durationMs: number | null };

function freshState(): State {
  return {
    bootCriticalMs: null, mountMs: null, mountStarted: false,
    activeTimers: 0, activeObservers: 0, activeSubscriptions: 0,
    reconcileLog: [], domCallbackLog: [], renderLog: [], cardRenderLog: [], cardRendersTotal: 0,
    mountCardsProcessed: 0, mountFetches: 0, remountTries: 0,
    longTaskCount: 0, longTaskTotalMs: 0, longTaskOver200Count: 0, longTaskOver200Ms: 0, longTaskObserverStarted: false,
    bootStartAt: null, bootOrigin: null, bootPhases: [], bootWatchdog: null, disposedKinds: {},
  };
}

const S: State = ((globalThis as any).__ds_perf_state ??= freshState());
// A copy from an earlier build may have left its record behind; give it the fields it lacks.
for (const [key, value] of Object.entries(freshState())) {
  if (!(key in S)) (S as any)[key] = value;
}

function nowMs(): number {
  try { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); } catch { return Date.now(); }
}

// The record is shared by every copy in this JS context, so a boot lands in it
// only at the end of the critical path and only from the copy that owns the renderer.
type StagedBoot = { startAt: number; prior: Record<string, boolean>; watchdog: string | null };
let staged: StagedBoot | null = null;

export function markBootStart(): void {
  mark('ds.boot:start');
  staged = { startAt: nowMs(), prior: snapshotPriorInstances(), watchdog: null };
}
export function recordBootCritical(): void {
  const critical = measure('ds.boot.critical', 'ds.boot:start');
  const boot = staged ?? { startAt: nowMs(), prior: {}, watchdog: null };
  staged = null;
  const kind = ownInstanceKind();
  // The shared record is the owner's: a copy that stood down keeps its number to itself.
  if (isHomeOwner()) { S.bootCriticalMs = critical; commitBoot(boot, kind); }
  trackInstance(kind);
  // From here on, so the long tasks of the Home's first mount are counted too.
  ensureLongTaskObserver();
}

function commitBoot(boot: StagedBoot, kind: string | null): void {
  S.bootStartAt = boot.startAt;
  S.bootPhases = [{ name: 'critical', atMs: 0, durationMs: Math.max(0, Math.round(nowMs() - boot.startAt)) }];
  S.bootOrigin = classifyBootOrigin(boot.prior, kind);
  S.bootWatchdog = boot.watchdog;
}

// Lets the startup watchdog tell a stuck injection apart from Home not being opened yet.
export function markMountStart(): void { S.mountStarted = true; mark('ds.mount:start'); beginBootPhase('mount'); }
export function recordMountDone(): void { S.mountMs = measure('ds.mount', 'ds.mount:start'); endBootPhase('mount'); }
export function hasMountStarted(): boolean { return S.mountStarted; }

// Kept per boot, first occurrence wins: Home mounts again on every return.

export function beginBootPhase(name: string): void {
  if (S.bootPhases.some((p) => p.name === name)) return;
  const at = S.bootStartAt === null ? 0 : Math.max(0, nowMs() - S.bootStartAt);
  S.bootPhases.push({ name, atMs: Math.round(at), durationMs: null });
}

export function endBootPhase(name: string): void {
  const phase = S.bootPhases.find((p) => p.name === name);
  if (!phase || phase.durationMs !== null || S.bootStartAt === null) return;
  phase.durationMs = Math.max(0, Math.round(nowMs() - S.bootStartAt - phase.atMs));
}

export function recordBootWatchdog(outcome: string): void {
  if (staged) staged.watchdog = outcome; else S.bootWatchdog = outcome;
}

// 'cold' = no earlier instance of this kind, 'warm' = it was already dismounted,
// 'hot-swap' = it was still live and had to be disposed here.
// An instance stashed by a build that never flagged its dismount counts as live.
function snapshotPriorInstances(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  try {
    for (const kind of Object.keys((globalThis as any).__DECK_SHELVES_INSTANCES__ ?? {})) out[kind] = S.disposedKinds[kind] === true;
  } catch {}
  return out;
}

function ownInstanceKind(): string | null {
  try {
    const kind = (globalThis as any).__DECK_SHELVES_INSTANCE__?.kind;
    return typeof kind === 'string' ? kind : null;
  } catch { return null; }
}

function classifyBootOrigin(prior: Record<string, boolean>, kind: string | null): BootOrigin {
  const kinds = kind === null ? Object.keys(prior) : Object.keys(prior).filter((k) => k === kind);
  if (!kinds.length) return 'cold';
  return kinds.some((k) => !prior[k]) ? 'hot-swap' : 'warm';
}

// Liveness of this instance, by kind, for the next boot's origin; runs once the entry has stashed it.
function trackInstance(kind: string | null): void {
  if (kind === null) return;
  S.disposedKinds[kind] = false;
  registerDisposer(() => { S.disposedKinds[kind] = true; });
}

// Per-row observers are not counted.

export function timerCreated(): void { S.activeTimers++; }
export function timerDisposed(): void { S.activeTimers = Math.max(0, S.activeTimers - 1); }
export function observerCreated(): void { S.activeObservers++; }
export function observerDisposed(): void { S.activeObservers = Math.max(0, S.activeObservers - 1); }
export function subscriptionCreated(): void { S.activeSubscriptions++; }
export function subscriptionDisposed(): void { S.activeSubscriptions = Math.max(0, S.activeSubscriptions - 1); }

const RATE_WINDOW_MS = 60_000;

function trim(log: number[], now: number): void {
  const cutoff = now - RATE_WINDOW_MS;
  while (log.length && log[0] < cutoff) log.shift();
}

function bump(log: number[]): void {
  const now = Date.now();
  log.push(now);
  trim(log, now);
}

function rateOf(log: number[]): number {
  trim(log, Date.now());
  return log.length;
}

// One Home mount/state re-sync pass.
export function recordReconcile(): void { bump(S.reconcileLog); }
// A DOM-driven callback tick (MutationObserver fire, focus-divergence check).
export function recordDomCallback(): void { bump(S.domCallbackLog); }
export function recordRender(): void { bump(S.renderLog); }
// Bumped only in dev builds.
export function recordCardRender(): void { S.cardRendersTotal++; bump(S.cardRenderLog); }

export function resetMountCounters(): void { S.mountCardsProcessed = 0; S.mountFetches = 0; }
export function recordMountFetch(): void { S.mountFetches++; }
export function recordMountCardsProcessed(n: number): void { S.mountCardsProcessed += n; }

export function recordRemountTry(): void { S.remountTries++; }

// Feature-detected: not every host webview exposes `longtask` entries.

// Above this a task is felt as a stutter; counted apart from the 50 ms ones.
const LONG_TASK_SEVERE_MS = 200;

function ensureLongTaskObserver(): void {
  if (S.longTaskObserverStarted) return;
  S.longTaskObserverStarted = true;
  try {
    const PO = (globalThis as any).PerformanceObserver;
    if (!PO) return;
    const obs = new PO((list: any) => {
      for (const entry of list.getEntries()) {
        const duration = entry.duration ?? 0;
        S.longTaskCount++;
        S.longTaskTotalMs += duration;
        if (duration > LONG_TASK_SEVERE_MS) { S.longTaskOver200Count++; S.longTaskOver200Ms += duration; }
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
    // Disconnected with this instance; the shared flag lets the next one restart it.
    registerDisposer(() => { try { obs.disconnect(); } catch {} S.longTaskObserverStarted = false; });
  } catch {}
}

export type PerfSnapshot = {
  bootCriticalMs: number | null;
  mountMs: number | null;
  mountCardsProcessed: number;
  mountFetches: number;
  remountTries: number;
  activeTimers: number;
  activeObservers: number;
  activeSubscriptions: number;
  reconcilesPerMin: number;
  domCallbacksPerMin: number;
  rendersPerMin: number;
  cardRendersPerMin: number;
  cardRendersTotal: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  longTaskOver200Count: number;
  longTaskOver200Ms: number;
  usedJSHeapMB: number | null;
  totalJSHeapMB: number | null;
  bootOrigin: BootOrigin | null;
  bootPhases: BootPhase[];
  bootWatchdog: string | null;
};

// `performance.memory` is Chromium-only, so it's feature-detected.
function readHeap(): { usedJSHeapMB: number | null; totalJSHeapMB: number | null } {
  try {
    const mem = (performance as any).memory;
    if (!mem) return { usedJSHeapMB: null, totalJSHeapMB: null };
    return {
      usedJSHeapMB: +(mem.usedJSHeapSize / 1048576).toFixed(1),
      totalJSHeapMB: +(mem.totalJSHeapSize / 1048576).toFixed(1),
    };
  } catch {
    return { usedJSHeapMB: null, totalJSHeapMB: null };
  }
}

export function getPerfSnapshot(): PerfSnapshot {
  ensureLongTaskObserver();
  return {
    bootCriticalMs: S.bootCriticalMs, mountMs: S.mountMs,
    mountCardsProcessed: S.mountCardsProcessed, mountFetches: S.mountFetches, remountTries: S.remountTries,
    activeTimers: S.activeTimers, activeObservers: S.activeObservers, activeSubscriptions: S.activeSubscriptions,
    reconcilesPerMin: rateOf(S.reconcileLog),
    domCallbacksPerMin: rateOf(S.domCallbackLog),
    rendersPerMin: rateOf(S.renderLog),
    cardRendersPerMin: rateOf(S.cardRenderLog),
    cardRendersTotal: S.cardRendersTotal,
    longTaskCount: S.longTaskCount, longTaskTotalMs: S.longTaskTotalMs,
    longTaskOver200Count: S.longTaskOver200Count, longTaskOver200Ms: S.longTaskOver200Ms,
    ...readHeap(),
    bootOrigin: S.bootOrigin,
    bootPhases: S.bootPhases.map((p) => ({ ...p })),
    bootWatchdog: S.bootWatchdog,
  };
}

export function __resetPerfMetricsForTest(): void {
  staged = null;
  Object.assign(S, freshState());
}
