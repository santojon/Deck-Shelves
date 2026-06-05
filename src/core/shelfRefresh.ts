/* eslint-disable complexity */
/**
 * Global shelf refresh coordinator.
 *
 * Instead of each ShelfView maintaining its own polling timer (N timers for N
 * shelves, each firing every 3–15 seconds), this module provides a single
 * emitter that all ShelfViews subscribe to. Reduces parallel Steam API calls
 * and battery impact significantly with large shelf configurations.
 *
 * Refresh triggers:
 *  - SteamClient.Apps.RegisterForAppOverviewChanges (install/uninstall events)
 *  - collectionStore.onChange (collection membership changes)
 *  - Single global poll every 30s as fallback
 *  - Explicit pause/resume for suspend/resume cycles (via systemEvents)
 */

/** Hint from the trigger site about why the refresh fired. The auto-poll
 *  and Steam-event-driven paths run silently; user-triggered actions
 *  (refresh card, context-menu "Refresh cache", manage page) pass
 *  `manual: true` so subscribers can show a brief visual indicator —
 *  otherwise a refresh that returns identical data leaves the user
 *  wondering whether the click did anything.
 *
 *  `shelfId` scopes that visual indicator to a single shelf. Every
 *  subscribed shelf still receives the trigger (online cache clears,
 *  for example, affect every online shelf at once and they should all
 *  re-resolve), but only the matching shelf flashes — without
 *  `shelfId`, every shelf on the home would dim simultaneously and
 *  the click would look like a full-page reload. */
export type RefreshOptions = { manual?: boolean; shelfId?: string };
type RefreshListener = (opts?: RefreshOptions) => void;

const listeners = new Set<RefreshListener>();
let pollId: ReturnType<typeof setInterval> | null = null;
let suspended = false;

import { mark, measure } from './perf';

function emit(opts?: RefreshOptions): void {
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

/** Subscribe a ShelfView to the global refresh signal. Returns an unsubscribe function. */
export function subscribeShelfRefresh(listener: RefreshListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pause all shelf refreshes (used on system suspend). */
export function pauseShelfRefresh(): void {
  suspended = true;
}

/** Resume shelf refreshes and trigger an immediate refresh cycle (used on system resume). */
export function resumeShelfRefresh(): void {
  suspended = false;
  emit();
}

/** Trigger an immediate refresh of all subscribed shelves (e.g. after
 *  cache invalidation). Pass `{ manual: true }` for user-triggered
 *  refresh actions so subscribers can render a brief visual indicator. */
export function triggerShelfRefresh(opts?: RefreshOptions): void {
  emit(opts);
}

/**
 * Install the global refresh emitter. Should be called once at plugin mount.
 * Returns an uninstall function to be called at plugin dismount.
 */
export function installShelfRefreshEmitter(): () => void {
  const cleanups: Array<() => void> = [];

  // Single global fallback poll at 30s
  pollId = setInterval(emit, 30000);
  cleanups.push(() => {
    if (pollId !== null) { clearInterval(pollId); pollId = null; }
  });

  // Subscribe to Steam app overview changes (install, uninstall, update events)
  try {
    const client = (globalThis as any).SteamClient ?? (window as any).SteamClient;
    const reg = client?.Apps?.RegisterForAppOverviewChanges?.(() => emit());
    if (typeof reg?.unregister === 'function') {
      cleanups.push(() => { try { reg.unregister(); } catch {} });
    }
  } catch {}

  // Subscribe to game launches so the `appStatus = running` filter picks up
  // the new state without waiting for the 30s fallback poll. Steam fires
  // multiple events per launch (initiated → process started → ready), so
  // the work is debounced — coalescing the burst into a single invalidate +
  // emit. Without the debounce, every event triggered a full re-resolve and
  // every shelf briefly showed the cold-load spinner (visible to the user
  // as an empty gap between shelves on each launch).
  try {
    const client = (globalThis as any).SteamClient ?? (window as any).SteamClient;
    let gameActionTimer: ReturnType<typeof setTimeout> | null = null;
    const onGameAction = () => {
      if (gameActionTimer !== null) clearTimeout(gameActionTimer);
      gameActionTimer = setTimeout(() => {
        gameActionTimer = null;
        // Lazy-import keeps shelfRefresh.ts decoupled from the resolver
        // module (avoids a circular dep between core/ and steam/). Cache
        // invalidation is required so the next overview read sees the live
        // `display_status` (Running / Launching) instead of the 10s-stale
        // snapshot.
        import("../steam").then(({ invalidateAppOverviewCache }) => {
          try { invalidateAppOverviewCache(); } catch {}
          emit();
        }).catch(() => emit());
      }, 1500);
    };
    const reg = client?.Apps?.RegisterForGameActionStart?.(onGameAction);
    if (typeof reg?.unregister === 'function') {
      cleanups.push(() => { try { reg.unregister(); } catch {} });
    }
    cleanups.push(() => { if (gameActionTimer !== null) { clearTimeout(gameActionTimer); gameActionTimer = null; } });
  } catch {}

  // Subscribe to collection store changes (favorites, user collections)
  try {
    const hostWindows: any[] = [
      window,
      ...(((window as any).SteamUIStore?.WindowStore?.SteamUIWindows ?? []).map((e: any) => e?.BrowserWindow)),
    ].filter(Boolean);
    for (const win of hostWindows) {
      const store = win?.collectionStore ?? (globalThis as any).collectionStore;
      if (!store) continue;
      // collectionStore may expose MobX-style reaction or onChange callback
      if (typeof store.on === 'function') {
        const handler = () => emit();
        store.on('change', handler);
        cleanups.push(() => { try { store.off?.('change', handler); } catch {} });
        break;
      }
    }
  } catch {}

  return () => {
    for (const fn of cleanups) fn();
    listeners.clear();
    suspended = false;
  };
}
