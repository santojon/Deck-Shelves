/**
 * Battery state runtime probe.
 *
 * Subscribes to `SteamClient.System.RegisterForBatteryStateChanges` when the
 * API is exposed (Steam Deck handheld mode). Caches the latest battery
 * snapshot module-level so smart-shelf resolvers can consult it without
 * re-registering per call.
 *
 * Graceful degradation: when the API is unavailable (older SteamOS, desktop
 * Steam, dev environment) `getBatteryState()` returns `null` and callers
 * fall back to their non-battery-aware heuristics.
 *
 * Battery event shape varies across SteamOS versions but typically carries:
 *   - `bHasBattery`: boolean
 *   - `eBatteryState`: 0=unknown, 1=discharging, 2=charging, 3=full
 *   - `flLevel`: 0..1 (fraction of full charge)
 *
 * We normalise into a stable `BatteryState` shape so callers don't have to
 * deal with the raw event surface.
 */

import { logInfo } from './logger';

export type BatteryState = {
  /** True when the device reports a battery (handheld); false for desktop / docked-without-battery. */
  hasBattery: boolean;
  /** Charging-state enum. 'unknown' when the source field is missing or zero. */
  state: 'unknown' | 'discharging' | 'charging' | 'full';
  /** Fraction in [0, 1]. NaN/missing → 0. */
  level: number;
  /** Last-update timestamp (ms since epoch). */
  ts: number;
};

let _state: BatteryState | null = null;
let _cleanup: (() => void) | null = null;

function getSteamClient(): any {
  return (globalThis as any).SteamClient ?? (window as any).SteamClient;
}

function normalize(event: any): BatteryState {
  const eState = Number(event?.eBatteryState ?? 0);
  const stateMap: Record<number, BatteryState['state']> = {
    0: 'unknown',
    1: 'discharging',
    2: 'charging',
    3: 'full',
  };
  const level = Number(event?.flLevel ?? 0);
  return {
    hasBattery: !!event?.bHasBattery,
    state: stateMap[eState] ?? 'unknown',
    level: Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0,
    ts: Date.now(),
  };
}

/**
 * Installs the battery-state subscription. Idempotent: calling twice replaces
 * the previous registration. Returns a cleanup function that unregisters and
 * clears the cached state.
 */
export function installBatteryState(): () => void {
  if (_cleanup) {
    try { _cleanup(); } catch {}
    _cleanup = null;
  }
  try {
    const client = getSteamClient();
    const reg = client?.System?.RegisterForBatteryStateChanges?.((event: any) => {
      try {
        _state = normalize(event);
      } catch {}
    });
    if (typeof reg?.unregister === 'function') {
      _cleanup = () => {
        try { reg.unregister(); } catch {}
        _state = null;
      };
      logInfo('RUNTIME', 'battery state subscription installed');
    } else {
      _cleanup = () => { _state = null; };
    }
  } catch {
    _cleanup = () => { _state = null; };
  }
  return () => {
    if (_cleanup) _cleanup();
    _cleanup = null;
  };
}

/** Returns the latest cached battery state, or `null` when the API isn't
 *  available or no event has fired yet. */
export function getBatteryState(): BatteryState | null {
  return _state;
}

/** Convenience: true when the device is on battery (discharging) below the
 *  threshold (default 30%). Returns `false` when battery state is unknown
 *  or device is charging / not on battery — so callers can fail-closed
 *  (a "low battery" shelf only surfaces when we KNOW the battery is low). */
export function isLowBattery(thresholdFraction = 0.3): boolean {
  const s = _state;
  if (!s || !s.hasBattery) return false;
  if (s.state !== 'discharging') return false;
  return s.level > 0 && s.level <= thresholdFraction;
}
