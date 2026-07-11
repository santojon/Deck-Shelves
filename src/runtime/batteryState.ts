
import { logInfo } from './logger';

export type BatteryState = {
  hasBattery: boolean;
  state: 'unknown' | 'discharging' | 'charging' | 'full';
  level: number;
  ts: number;
};

let _state: BatteryState | null = null;
let _cleanup: (() => void) | null = null;
const _listeners = new Set<() => void>();

/* Notify on battery change so device-state visibility rules re-evaluate
   promptly (no polling — driven by the Steam battery event). */
export function subscribeBattery(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

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
        const next = normalize(event);
        /* The Steam battery event also churns on `nSecondsRemaining` every tick;
           only notify listeners on a MEANINGFUL change (charge-state flip or a
           ≥5% level bucket) so device-state visibility rules don't re-render on
           every tick. */
        const prev = _state;
        const meaningful = !prev
          || prev.state !== next.state
          || Math.round(prev.level * 20) !== Math.round(next.level * 20);
        _state = next;
        if (meaningful) for (const l of _listeners) { try { l(); } catch {} }
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
