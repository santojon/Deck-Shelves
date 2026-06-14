
import { logInfo } from './logger';

export type BatteryState = {
  hasBattery: boolean;
  state: 'unknown' | 'discharging' | 'charging' | 'full';
  level: number;
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

export function getBatteryState(): BatteryState | null {
  return _state;
}

export function isLowBattery(thresholdFraction = 0.3): boolean {
  const s = _state;
  if (!s || !s.hasBattery) return false;
  if (s.state !== 'discharging') return false;
  return s.level > 0 && s.level <= thresholdFraction;
}
