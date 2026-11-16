
import { invalidateAppOverviewCache } from '../steam';
import { pauseShelfRefresh, resumeShelfRefresh } from '../core/shelfRefresh';
import { refreshDisplay, refreshControllerState } from './deviceState';
import { forceBatteryRefresh } from './batteryState';
import { requestPeripheralsRefresh } from './peripheralsState';
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
    resumeShelfRefresh();
    // None of these fire for changes made while asleep, so force fresh reads.
    void refreshDisplay();
    refreshControllerState();
    forceBatteryRefresh();
    // Bluetooth has no change event either.
    requestPeripheralsRefresh();
  };

  // The event shape varies across SteamOS versions.
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
    if (isSuspended) resumeShelfRefresh();
  };
}
