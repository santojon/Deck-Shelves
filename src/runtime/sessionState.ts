/* Live session-state snapshot for Visibility Rules v2 session kinds (Sprint 4).
   Event-driven (Steam app-lifetime notifications) — no polling; reads are cached
   synchronous values. The home is only visible between games, so the useful
   session signals are "what you last played" (persists across the session) and
   "a game is running" (suspended in the background). */

// Non-Steam shortcuts carry this app_type; their appids are also high 32-bit.
const NON_STEAM_APP_TYPE = 1073741824;

const _listeners = new Set<() => void>();
let _lastApp: number | null = null;
let _lastNonSteam = false;

function notify(): void {
  for (const l of _listeners) { try { l(); } catch {} }
}

export function subscribeSessionState(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function isNonSteam(appid: number): boolean {
  try {
    const ov = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid);
    if (ov) return ov.app_type === NON_STEAM_APP_TYPE || ov.is_non_steam === true;
  } catch {}
  return appid > 0x7fffffff; // non-Steam shortcut appids are high 32-bit
}

function gameRunning(): boolean {
  try {
    return (((globalThis as any).SteamUIStore?.RunningApps?.length as number) ?? 0) > 0;
  } catch {
    return false;
  }
}

export type SessionState = {
  lastApp: number | null;
  lastNonSteam: boolean;
  gameRunning: boolean;
};

export function getSessionState(): SessionState {
  return { lastApp: _lastApp, lastNonSteam: _lastNonSteam, gameRunning: gameRunning() };
}

export function installSessionState(): () => void {
  // App-lifetime notifications fire on start/stop with { unAppID, bRunning };
  // a start records the last-played app + its source, any change re-notifies so
  // gameRunning re-evaluates. Event-driven — no polling.
  let unregister: (() => void) | null = null;
  try {
    const reg = (globalThis as any).SteamClient?.GameSessions?.RegisterForAppLifetimeNotifications?.((n: any) => {
      const id = Number(n?.unAppID ?? n?.appid ?? 0);
      if (n?.bRunning === true && Number.isFinite(id) && id > 0) {
        _lastApp = id;
        _lastNonSteam = isNonSteam(id);
      }
      notify();
    });
    if (reg && typeof reg.unregister === 'function') unregister = () => { try { reg.unregister(); } catch {} };
  } catch {}
  return () => { if (unregister) { unregister(); unregister = null; } };
}

/* Evaluate one session-state VisibilityRule. Unknown kinds (and unknown state)
   fail open (return true). Kinds: lastGameSource (value 'steam' | 'nonSteam'),
   gameRunning. */
export function evalSessionRule(rule: any): boolean {
  switch (String(rule?.kind || '')) {
    case 'lastGameSource': {
      if (_lastApp == null) return true;
      return _lastNonSteam === (rule?.value === 'nonSteam');
    }
    case 'gameRunning':
      return gameRunning();
    default:
      return true;
  }
}

export const SESSION_RULE_KINDS = ['lastGameSource', 'gameRunning'] as const;
export function isSessionRuleKind(kind: string): boolean {
  return (SESSION_RULE_KINDS as readonly string[]).includes(kind);
}
