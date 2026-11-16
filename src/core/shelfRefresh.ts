
import type { DepKind } from '../domain/shelfDeps';
import { getBatteryState } from '../runtime/batteryState';
import { registerPeriodic } from '../runtime/powerGate';

/* `deps` names the data a signal says changed (see domain/shelfDeps); a shelf
   whose result doesn't depend on it skips the re-resolve. Untagged = everything. */
export type RefreshOptions = { manual?: boolean; shelfId?: string; deps?: DepKind[] };
type RefreshListener = (opts?: RefreshOptions) => void;

const listeners = new Set<RefreshListener>();
let pollId: ReturnType<typeof setTimeout> | null = null;
// Either flag drops automatic emits; a manual refresh still passes.
let suspended = false;
let gated = false;
function held(opts?: RefreshOptions): boolean {
  return suspended || (gated && !opts?.manual);
}

import { mark, measure } from './perf';

function onBattery(): boolean {
  try { const b = getBatteryState(); return !!b && b.hasBattery && b.state === 'discharging'; } catch { return false; }
}
function coalesceWindowMs(): number { return onBattery() ? 2000 : EMIT_COALESCE_MS; }
function pollIntervalMs(): number { return onBattery() ? 60000 : 30000; }

// Steam fires overview events in bursts and re-resolving can trigger more,
// so automatic emits coalesce to one per window with a trailing emit.
const EMIT_COALESCE_MS = 700;
let lastEmitAt = 0;
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;

const STAGGER_CHUNK = 2;

// Automatic emits fan out two listeners per task so each shelf resolves in its own task.
function runEmit(opts?: RefreshOptions): void {
  if (held(opts)) return;
  const list = Array.from(listeners);
  if (opts?.manual) {
    mark('shelfRefresh.emit:start');
    for (const listener of list) { try { listener(opts); } catch {} }
    measure('shelfRefresh.emit', 'shelfRefresh.emit:start');
    return;
  }
  let i = 0;
  const step = () => {
    if (suspended || gated) return;
    const end = Math.min(list.length, i + STAGGER_CHUNK);
    for (; i < end; i++) { try { if (listeners.has(list[i])) list[i](opts); } catch {} }
    if (i < list.length) setTimeout(step, 0);
  };
  step();
}

// Deps of the signals folded into one coalesced emit; null = everything.
let pendingDeps: Set<DepKind> | null = null;
function foldDeps(opts?: RefreshOptions): void {
  if (pendingDeps === null) return;
  if (!opts?.deps) { pendingDeps = null; return; }
  for (const d of opts.deps) pendingDeps.add(d);
}

function emit(opts?: RefreshOptions): void {
  if (held(opts)) return;
  if (opts?.manual) { lastEmitAt = Date.now(); runEmit(opts); return; }
  const elapsed = Date.now() - lastEmitAt;
  if (elapsed >= coalesceWindowMs()) { lastEmitAt = Date.now(); runEmit(opts); return; }
  if (coalesceTimer === null) {
    pendingDeps = opts?.deps ? new Set(opts.deps) : null;
    coalesceTimer = setTimeout(() => {
      coalesceTimer = null; lastEmitAt = Date.now();
      const deps = pendingDeps ? Array.from(pendingDeps) : undefined;
      pendingDeps = null;
      runEmit(deps ? { deps } : undefined);
    }, coalesceWindowMs() - elapsed);
    return;
  }
  foldDeps(opts);
}

export function subscribeShelfRefresh(listener: RefreshListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pauseShelfRefresh(): void {
  suspended = true;
}

export function resumeShelfRefresh(): void {
  suspended = false;
  emit();
}

export function triggerShelfRefresh(opts?: RefreshOptions): void {
  // A manual refresh must bypass the online cache. Lazy import avoids a circular dependency.
  if (opts?.manual) {
    import("../steam").then(({ invalidateOnlineResolveCache }) => {
      try { invalidateOnlineResolveCache(); } catch {}
    }).catch(() => {});
  }
  emit(opts);
}

// Steam fires this on every download tick.
function installOverviewChangesThrottle(): (() => void) | null {
  try {
    const client = (globalThis as any).SteamClient ?? (window as any).SteamClient;
    const OVERVIEW_THROTTLE_MS = 5000;
    let lastEmitAt = 0;
    let trailingTimer: ReturnType<typeof setTimeout> | null = null;
    const throttledEmit = () => {
      const now = Date.now();
      const elapsed = now - lastEmitAt;
      if (elapsed >= OVERVIEW_THROTTLE_MS) {
        lastEmitAt = now;
        emit({ deps: ['overviews'] });
        return;
      }
      if (trailingTimer === null) {
        trailingTimer = setTimeout(() => {
          trailingTimer = null;
          lastEmitAt = Date.now();
          emit({ deps: ['overviews'] });
        }, OVERVIEW_THROTTLE_MS - elapsed);
      }
    };
    const reg = client?.Apps?.RegisterForAppOverviewChanges?.(throttledEmit);
    return () => {
      if (typeof reg?.unregister === 'function') { try { reg.unregister(); } catch {} }
      if (trailingTimer !== null) { clearTimeout(trailingTimer); trailingTimer = null; }
    };
  } catch { return null; }
}

// Steam fires several events per launch; coalesce them into one.
function installGameActionStartDebounce(): (() => void) | null {
  try {
    const client = (globalThis as any).SteamClient ?? (window as any).SteamClient;
    let gameActionTimer: ReturnType<typeof setTimeout> | null = null;
    const onGameAction = () => {
      if (gameActionTimer !== null) clearTimeout(gameActionTimer);
      gameActionTimer = setTimeout(() => {
        gameActionTimer = null;
        // Lazy import avoids a circular dependency.
        import("../steam").then(({ invalidateAppOverviewCache }) => {
          try { invalidateAppOverviewCache(); } catch {}
          emit({ deps: ['session', 'overviews'] });
        }).catch(() => emit({ deps: ['session', 'overviews'] }));
      }, 1500);
    };
    const reg = client?.Apps?.RegisterForGameActionStart?.(onGameAction);
    return () => {
      if (typeof reg?.unregister === 'function') { try { reg.unregister(); } catch {} }
      if (gameActionTimer !== null) { clearTimeout(gameActionTimer); gameActionTimer = null; }
    };
  } catch { return null; }
}

function findSubscribableCollectionStore(): any {
  const hostWindows: any[] = [
    window,
    ...(((window as any).SteamUIStore?.WindowStore?.SteamUIWindows ?? []).map((e: any) => e?.BrowserWindow)),
  ].filter(Boolean);
  for (const win of hostWindows) {
    const store = win?.collectionStore ?? (globalThis as any).collectionStore;
    if (store && typeof store.on === 'function') return store;
  }
  return null;
}

function installCollectionStoreSubscription(): (() => void) | null {
  try {
    const store = findSubscribableCollectionStore();
    if (!store) return null;
    const handler = () => emit({ deps: ['collections'] });
    store.on('change', handler);
    return () => { try { store.off?.('change', handler); } catch {} };
  } catch { return null; }
}

export function installShelfRefreshEmitter(): () => void {
  const cleanups: Array<() => void> = [];

  // Untagged so it reaches every shelf and bounds staleness the tags miss.
  const schedulePoll = () => {
    pollId = setTimeout(() => { pollId = null; emit(); schedulePoll(); }, pollIntervalMs());
  };
  const clearPoll = () => {
    if (pollId !== null) { clearTimeout(pollId); pollId = null; }
  };
  // Polling and event emits run only while the Home is active; returning gets one refresh.
  gated = true;
  const unregister = registerPeriodic('shelfRefresh', {
    runIn: ['active'],
    start: () => { gated = false; if (pollId === null) schedulePoll(); },
    stop: () => { gated = true; clearPoll(); },
    onResume: () => emit(),
  });
  cleanups.push(() => { unregister(); clearPoll(); gated = false; });

  for (const install of [installOverviewChangesThrottle, installGameActionStartDebounce, installCollectionStoreSubscription]) {
    const cleanup = install();
    if (cleanup) cleanups.push(cleanup);
  }

  return () => {
    for (const fn of cleanups) fn();
    if (coalesceTimer !== null) { clearTimeout(coalesceTimer); coalesceTimer = null; }
    listeners.clear();
    suspended = false;
  };
}
