
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

export function installShelfRefreshEmitter(): () => void {
  const cleanups: Array<() => void> = [];

  // Single global fallback poll at 30s
  pollId = setInterval(emit, 30000);
  cleanups.push(() => {
    if (pollId !== null) { clearInterval(pollId); pollId = null; }
  });

  // AppOverviewChanges throttle (5 s leading + 1 trailing).
  // Steam fires this on every download tick — without the throttle,
  // a long download flooded the resolver (#66).
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
    if (typeof reg?.unregister === 'function') {
      cleanups.push(() => { try { reg.unregister(); } catch {} });
    }
    cleanups.push(() => { if (trailingTimer !== null) { clearTimeout(trailingTimer); trailingTimer = null; } });
  } catch {}

  // GameActionStart debounce: Steam fires multiple events per launch
  // (initiated → started → ready). Coalesce to one invalidate + emit.
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
