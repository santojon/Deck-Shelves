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

type RefreshListener = () => void;

const listeners = new Set<RefreshListener>();
let pollId: ReturnType<typeof setInterval> | null = null;
let suspended = false;

function emit(): void {
  if (suspended) return;
  for (const listener of listeners) {
    try { listener(); } catch {}
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

/** Trigger an immediate refresh of all subscribed shelves (e.g. after cache invalidation). */
export function triggerShelfRefresh(): void {
  emit();
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
