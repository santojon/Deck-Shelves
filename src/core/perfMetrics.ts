import { mark, measure } from "./perf";

/* Lightweight, pure in-memory registry for the Diagnostics -> Performance
   panel. Additive instrumentation only — counters are bumped at existing
   timer/observer/subscription create+dispose sites; nothing here changes
   control flow or behaviour. No polling: the panel reads a snapshot on
   manual refresh, same pattern as DiagnosticsSection. */

// --- Boot + mount timing -----------------------------------------------------

let bootCriticalMs: number | null = null;
export function markBootStart(): void { mark('ds.boot:start'); }
export function recordBootCritical(): void { bootCriticalMs = measure('ds.boot.critical', 'ds.boot:start'); }

let mountMs: number | null = null;
/* `mountStarted` records that the Home actually began rendering (HomeShelves
   mounted). The startup watchdog needs it to tell "injection is stuck" apart
   from "the user simply hasn't opened Home yet" — only the former is a fault. */
let mountStarted = false;
export function markMountStart(): void { mountStarted = true; mark('ds.mount:start'); }
export function recordMountDone(): void { mountMs = measure('ds.mount', 'ds.mount:start'); }
export function hasMountStarted(): boolean { return mountStarted; }

// --- Home-layer timer/observer/subscription counters -------------------------
// Tracks the Home mount/patch layer (HomeInject + homePatch), not every
// timer in the plugin — per-shelf/per-card observers aren't wired here yet.

let activeTimers = 0;
let activeObservers = 0;
let activeSubscriptions = 0;

export function timerCreated(): void { activeTimers++; }
export function timerDisposed(): void { activeTimers = Math.max(0, activeTimers - 1); }
export function observerCreated(): void { activeObservers++; }
export function observerDisposed(): void { activeObservers = Math.max(0, activeObservers - 1); }
export function subscriptionCreated(): void { activeSubscriptions++; }
export function subscriptionDisposed(): void { activeSubscriptions = Math.max(0, activeSubscriptions - 1); }

// --- Rolling per-minute rate counters -----------------------------------------

const RATE_WINDOW_MS = 60_000;
const reconcileLog: number[] = [];
const domCallbackLog: number[] = [];
const renderLog: number[] = [];

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

// A "reconcile" is one Home mount/state re-sync pass (HomeInject's
// updateMount, triggered by route change, DOM mutation or the fallback poll).
export function recordReconcile(): void { bump(reconcileLog); }
// A DOM-driven callback tick (MutationObserver fire, focus-divergence check).
export function recordDomCallback(): void { bump(domCallbackLog); }
export function recordRender(): void { bump(renderLog); }

// --- Mount-cycle counters (reset at each mount start) -------------------------

let mountCardsProcessed = 0;
let mountFetches = 0;
export function resetMountCounters(): void { mountCardsProcessed = 0; mountFetches = 0; }
export function recordMountFetch(): void { mountFetches++; }
export function recordMountCardsProcessed(n: number): void { mountCardsProcessed += n; }

// --- Remount-retry counter (homePatch fallback-render loop) -------------------

let remountTries = 0;
export function recordRemountTry(): void { remountTries++; }

// --- Long tasks ----------------------------------------------------------------
// Feature-detected: not every host webview exposes `longtask` entries.

let longTaskCount = 0;
let longTaskTotalMs = 0;
let longTaskObserverStarted = false;

function ensureLongTaskObserver(): void {
  if (longTaskObserverStarted) return;
  longTaskObserverStarted = true;
  try {
    const PO = (globalThis as any).PerformanceObserver;
    if (!PO) return;
    const obs = new PO((list: any) => {
      for (const entry of list.getEntries()) {
        longTaskCount++;
        longTaskTotalMs += entry.duration ?? 0;
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
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
  longTaskCount: number;
  longTaskTotalMs: number;
  usedJSHeapMB: number | null;
  totalJSHeapMB: number | null;
};

// `performance.memory` is a non-standard Chromium extension — present in
// this CEF-based webview, feature-detected rather than assumed. Read fresh
// on every snapshot (a live gauge, not something to track deltas of).
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
    bootCriticalMs, mountMs, mountCardsProcessed, mountFetches, remountTries,
    activeTimers, activeObservers, activeSubscriptions,
    reconcilesPerMin: rateOf(reconcileLog),
    domCallbacksPerMin: rateOf(domCallbackLog),
    rendersPerMin: rateOf(renderLog),
    longTaskCount, longTaskTotalMs,
    ...readHeap(),
  };
}

// Dev-only: an external CDP driver (perf:bench, the back-nav gate)
// read the same snapshot the Performance panel shows. Tree-shaken in release.
if (__DEV__) {
  try { (globalThis as any).__ds_perf_snapshot = getPerfSnapshot; } catch {}
}

// Test-only reset — keeps vitest cases isolated from module-level state.
export function __resetPerfMetricsForTest(): void {
  bootCriticalMs = null;
  mountMs = null;
  mountStarted = false;
  activeTimers = 0;
  activeObservers = 0;
  activeSubscriptions = 0;
  reconcileLog.length = 0;
  domCallbackLog.length = 0;
  renderLog.length = 0;
  mountCardsProcessed = 0;
  mountFetches = 0;
  remountTries = 0;
  longTaskCount = 0;
  longTaskTotalMs = 0;
  longTaskObserverStarted = false;
}
