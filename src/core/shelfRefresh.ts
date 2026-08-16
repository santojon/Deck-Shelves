
export type RefreshOptions = { manual?: boolean; shelfId?: string };
type RefreshListener = (opts?: RefreshOptions) => void;

const listeners = new Set<RefreshListener>();
let pollId: ReturnType<typeof setInterval> | null = null;
let suspended = false;

import { mark, measure } from './perf';

/* Global emit coalescing. Steam fires overview/download-tick events in bursts,
   and re-resolving shelves can itself provoke more of them — without a floor
   the resolver storms (dozens of re-resolves/sec, metadata refetches, visible
   flicker). Non-manual emits coalesce to at most one per window with a trailing
   emit so the final state always lands; manual (user) refreshes fire at once. */
const EMIT_COALESCE_MS = 700;
let lastEmitAt = 0;
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;

function runEmit(opts?: RefreshOptions): void {
  if (suspended) return;
  try {
    mark('shelfRefresh.emit:start');
    for (const listener of listeners) {
      try { listener(opts); } catch {}
    }
  } finally {
    measure('shelfRefresh.emit', 'shelfRefresh.emit:start');
  }
}

function emit(opts?: RefreshOptions): void {
  if (suspended) return;
  if (opts?.manual) { lastEmitAt = Date.now(); runEmit(opts); return; }
  const elapsed = Date.now() - lastEmitAt;
  if (elapsed >= EMIT_COALESCE_MS) { lastEmitAt = Date.now(); runEmit(opts); return; }
  if (coalesceTimer === null) {
    coalesceTimer = setTimeout(() => { coalesceTimer = null; lastEmitAt = Date.now(); runEmit(); }, EMIT_COALESCE_MS - elapsed);
  }
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
  emit(opts);
}

// AppOverviewChanges throttle (5 s leading + 1 trailing). Steam fires this
// on every download tick — without the throttle, a long download flooded
// the resolver (#66).
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
        emit();
        return;
      }
      if (trailingTimer === null) {
        trailingTimer = setTimeout(() => {
          trailingTimer = null;
          lastEmitAt = Date.now();
          emit();
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
          emit();
        }).catch(() => emit());
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
    const handler = () => emit();
    store.on('change', handler);
    return () => { try { store.off?.('change', handler); } catch {} };
  } catch { return null; }
}

export function installShelfRefreshEmitter(): () => void {
  const cleanups: Array<() => void> = [];

  // Single global fallback poll at 30s
  pollId = setInterval(emit, 30000);
  cleanups.push(() => {
    if (pollId !== null) { clearInterval(pollId); pollId = null; }
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
