
import type { DepKind } from '../domain/shelfDeps';
import { getBatteryState } from '../runtime/batteryState';

/* `deps` names the data a signal says changed (see domain/shelfDeps); a shelf
   whose result doesn't depend on it skips the re-resolve. Untagged = everything. */
export type RefreshOptions = { manual?: boolean; shelfId?: string; deps?: DepKind[] };
type RefreshListener = (opts?: RefreshOptions) => void;

const listeners = new Set<RefreshListener>();
let pollId: ReturnType<typeof setTimeout> | null = null;
let suspended = false;

import { mark, measure } from './perf';

/* Battery-aware pacing: on battery the burst window and the fallback poll
   stretch, so idle-on-battery costs fewer resolves (plugged in = unchanged). */
function onBattery(): boolean {
  try { const b = getBatteryState(); return !!b && b.hasBattery && b.state === 'discharging'; } catch { return false; }
}
function coalesceWindowMs(): number { return onBattery() ? 2000 : EMIT_COALESCE_MS; }
function pollIntervalMs(): number { return onBattery() ? 60000 : 30000; }

/* Global emit coalescing. Steam fires overview/download-tick events in bursts,
   and re-resolving shelves can itself provoke more of them — without a floor
   the resolver storms (dozens of re-resolves/sec, metadata refetches, visible
   flicker). Non-manual emits coalesce to at most one per window with a trailing
   emit so the final state always lands; manual (user) refreshes fire at once. */
const EMIT_COALESCE_MS = 700;
let lastEmitAt = 0;
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;

const STAGGER_CHUNK = 2;

/* Non-manual emits fan out two listeners per task: each shelf's resolve then
   runs in its own task instead of every shelf's filter/sort pass landing in
   one long task (measured 280–360 ms per shelf at boot). Manual refreshes
   stay synchronous so the user's click is answered at once. */
function runEmit(opts?: RefreshOptions): void {
  if (suspended) return;
  const list = Array.from(listeners);
  if (opts?.manual) {
    mark('shelfRefresh.emit:start');
    for (const listener of list) { try { listener(opts); } catch {} }
    measure('shelfRefresh.emit', 'shelfRefresh.emit:start');
    return;
  }
  let i = 0;
  const step = () => {
    if (suspended) return;
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
  if (suspended) return;
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
  /* A user-driven refresh must bypass the online (wishlist/store) stale-while-
     revalidate cache, otherwise "Refresh" would just re-serve what's cached.
     Lazy import avoids a core/ ↔ steam/ circular dep. */
  if (opts?.manual) {
    import("../steam").then(({ invalidateOnlineResolveCache }) => {
      try { invalidateOnlineResolveCache(); } catch {}
    }).catch(() => {});
  }
  emit(opts);
}

// AppOverviewChanges throttle (5 s leading + 1 trailing). Steam fires this
// on every download tick — without the throttle, a long download flooded
// the resolver.
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

// GameActionStart debounce: Steam fires multiple events per launch
// (initiated → started → ready). Coalesce to one invalidate + emit.
function installGameActionStartDebounce(): (() => void) | null {
  try {
    const client = (globalThis as any).SteamClient ?? (window as any).SteamClient;
    let gameActionTimer: ReturnType<typeof setTimeout> | null = null;
    const onGameAction = () => {
      if (gameActionTimer !== null) clearTimeout(gameActionTimer);
      gameActionTimer = setTimeout(() => {
        gameActionTimer = null;
        // Lazy import avoids a core/↔steam/ circular dep; invalidate
        // so the next read sees the live display_status.
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

// First window whose collectionStore also exposes an `.on` subscribe
// method (a store present but without `.on` doesn't count — keep looking).
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

// Subscribe to collection store changes (favorites, user collections).
// collectionStore may expose a MobX-style reaction or onChange callback.
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

  // Single global fallback poll (30 s plugged in, 60 s on battery) — untagged,
  // so it still reaches every shelf and bounds any staleness the tags miss.
  const schedulePoll = () => {
    pollId = setTimeout(() => { pollId = null; emit(); schedulePoll(); }, pollIntervalMs());
  };
  schedulePoll();
  cleanups.push(() => {
    if (pollId !== null) { clearTimeout(pollId); pollId = null; }
  });

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
