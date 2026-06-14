
import { invalidateAppOverviewCache } from '../steam';
import { pauseShelfRefresh, resumeShelfRefresh } from '../core/shelfRefresh';
import { logInfo } from './logger';

function getSteamClient(): any {
  return (globalThis as any).SteamClient ?? (window as any).SteamClient;
}

export function installSystemEvents(): () => void {
  const cleanups: Array<() => void> = [];
  let isSuspended = false;

  const onSuspend = () => {
    if (isSuspended) return;
    isSuspended = true;
    logInfo('RUNTIME', 'system suspend detected — pausing shelf refresh');
    pauseShelfRefresh();
  };

  const onResume = () => {
    if (!isSuspended) return;
    isSuspended = false;
    logInfo('RUNTIME', 'system resume detected — invalidating cache and resuming refresh');
    invalidateAppOverviewCache();
    resumeShelfRefresh(); // triggers immediate refresh of all subscribed shelves
  };

  // Primary: SteamClient.System.RegisterForSuspendResumeEvents
  // The event object shape varies across SteamOS versions; we detect suspend
  // by the presence of bSuspending, eSuspendType, or type === 'suspend'.
  try {
    const client = getSteamClient();
    const reg = client?.System?.RegisterForSuspendResumeEvents?.((event: any) => {
      try {
        const suspending =
          event?.bSuspending === true ||
          event?.type === 'suspend' ||
          (event?.eSuspendType !== undefined && event?.bSuspending !== false);
        if (suspending) {
          onSuspend();
        } else {
          onResume();
        }
      } catch {}
    });
    if (typeof reg?.unregister === 'function') {
      cleanups.push(() => { try { reg.unregister(); } catch {} });
    }
  } catch {}

  // Fallback: Page Visibility API (fires when device screen turns off/on)
  // Less reliable than the Steam API but works without it.
  try {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        onSuspend();
      } else if (document.visibilityState === 'visible') {
        onResume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    cleanups.push(() => document.removeEventListener('visibilitychange', handleVisibility));
  } catch {}

  return () => {
    for (const fn of cleanups) fn();
    // Ensure refresh is resumed on dismount so no dangling paused state
    if (isSuspended) resumeShelfRefresh();
  };
}
