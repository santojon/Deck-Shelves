import { mark, measure } from "./perf";

/* Lightweight, pure in-memory registry for the Diagnostics -> Performance
   panel. Additive instrumentation only — counters are bumped at existing
   timer/observer/subscription create+dispose sites; nothing here changes
   control flow or behaviour. No polling: the panel reads a snapshot on
   manual refresh, same pattern as DiagnosticsSection. */

/* The bundle carries this module in more than one chunk (Home code and the
   Settings page import it from different entry points), and each copy used to
   own its counters — the panel then read a copy nobody bumped (`null`/0 on a
   live session). One shared record on globalThis makes every copy count into
   the same place. */
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
  longTaskObserverStarted: boolean;
};

function freshState(): State {
  return {
    bootCriticalMs: null, mountMs: null, mountStarted: false,
    activeTimers: 0, activeObservers: 0, activeSubscriptions: 0,
    reconcileLog: [], domCallbackLog: [], renderLog: [], cardRenderLog: [], cardRendersTotal: 0,
    mountCardsProcessed: 0, mountFetches: 0, remountTries: 0,
    longTaskCount: 0, longTaskTotalMs: 0, longTaskObserverStarted: false,
  };
}

const S: State = ((globalThis as any).__ds_perf_state ??= freshState());

// --- Boot + mount timing -----------------------------------------------------

export function markBootStart(): void { mark('ds.boot:start'); }
export function recordBootCritical(): void { S.bootCriticalMs = measure('ds.boot.critical', 'ds.boot:start'); }

/* `mountStarted` records that the Home actually began rendering (HomeShelves
   mounted). The startup watchdog needs it to tell "injection is stuck" apart
   from "the user simply hasn't opened Home yet" — only the former is a fault. */
export function markMountStart(): void { S.mountStarted = true; mark('ds.mount:start'); }
export function recordMountDone(): void { S.mountMs = measure('ds.mount', 'ds.mount:start'); }
export function hasMountStarted(): boolean { return S.mountStarted; }

// --- Timer/observer/subscription counters ------------------------------------
// The Home mount/patch layer (HomeInject + homePatch) plus the shared per-card
// input registry and the shelf viewport gate; per-row observers are not counted.

export function timerCreated(): void { S.activeTimers++; }
export function timerDisposed(): void { S.activeTimers = Math.max(0, S.activeTimers - 1); }
export function observerCreated(): void { S.activeObservers++; }
export function observerDisposed(): void { S.activeObservers = Math.max(0, S.activeObservers - 1); }
export function subscriptionCreated(): void { S.activeSubscriptions++; }
export function subscriptionDisposed(): void { S.activeSubscriptions = Math.max(0, S.activeSubscriptions - 1); }

// --- Rolling per-minute rate counters -----------------------------------------

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

// A "reconcile" is one Home mount/state re-sync pass (HomeInject's
// updateMount, triggered by route change, DOM mutation or the fallback poll).
export function recordReconcile(): void { bump(S.reconcileLog); }
// A DOM-driven callback tick (MutationObserver fire, focus-divergence check).
export function recordDomCallback(): void { bump(S.domCallbackLog); }
export function recordRender(): void { bump(S.renderLog); }
// One GameCard render (dev builds only bump it) — the S6 "a focus move must
// not re-render many cards" check reads the per-minute rate.
export function recordCardRender(): void { S.cardRendersTotal++; bump(S.cardRenderLog); }

// --- Mount-cycle counters (reset at each mount start) -------------------------

export function resetMountCounters(): void { S.mountCardsProcessed = 0; S.mountFetches = 0; }
export function recordMountFetch(): void { S.mountFetches++; }
export function recordMountCardsProcessed(n: number): void { S.mountCardsProcessed += n; }

// --- Remount-retry counter (homePatch fallback-render loop) -------------------

export function recordRemountTry(): void { S.remountTries++; }

// --- Long tasks ----------------------------------------------------------------
// Feature-detected: not every host webview exposes `longtask` entries.

function ensureLongTaskObserver(): void {
  if (S.longTaskObserverStarted) return;
  S.longTaskObserverStarted = true;
  try {
    const PO = (globalThis as any).PerformanceObserver;
    if (!PO) return;
    const obs = new PO((list: any) => {
      for (const entry of list.getEntries()) {
        S.longTaskCount++;
        S.longTaskTotalMs += entry.duration ?? 0;
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
  cardRendersPerMin: number;
  cardRendersTotal: number;
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
    bootCriticalMs: S.bootCriticalMs, mountMs: S.mountMs,
    mountCardsProcessed: S.mountCardsProcessed, mountFetches: S.mountFetches, remountTries: S.remountTries,
    activeTimers: S.activeTimers, activeObservers: S.activeObservers, activeSubscriptions: S.activeSubscriptions,
    reconcilesPerMin: rateOf(S.reconcileLog),
    domCallbacksPerMin: rateOf(S.domCallbackLog),
    rendersPerMin: rateOf(S.renderLog),
    cardRendersPerMin: rateOf(S.cardRenderLog),
    cardRendersTotal: S.cardRendersTotal,
    longTaskCount: S.longTaskCount, longTaskTotalMs: S.longTaskTotalMs,
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
  Object.assign(S, freshState());
}
