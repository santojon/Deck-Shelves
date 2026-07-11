import { getBatteryState, isLowBattery, subscribeBattery } from './batteryState';
import { getCurrentSettings } from '../store/settingsStore';
import { call } from './host/decky';

function isOfflineModeOn(): boolean {
  return (getCurrentSettings() as any)?.offlineModeEnabled === true;
}

/* Live device-state snapshot for Visibility Rules v2 device kinds. Reads are
   synchronous cached values; updates are event-driven — no polling. Battery /
   charging / offline come from the battery subscription + settings. */
/* Display signals (external-display / resolution / ultrawide) refresh only when
   DisplayManager reports a change (fires once on register then only on real
   changes), debounced + change-gated so a dock/undock never storms re-renders.
   External-display uses the Linux DRM backend (fail-soft off SteamOS); resolution
   /ultrawide read the Big-Picture window's real screen dims (SJC reports 1). */

const ULTRAWIDE_RATIO = 2.0;

const _listeners = new Set<() => void>();

let _screen: { w: number; h: number } | null = null;
let _external: boolean | null = null; // external display / docked; null = unknown

function notify(): void {
  for (const l of _listeners) { try { l(); } catch {} }
}

export function subscribeDeviceState(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function readBpScreen(): { w: number; h: number } | null {
  try {
    const g = globalThis as any;
    const bp = g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
    const s = bp?.screen;
    const w = Number(s?.width);
    const h = Number(s?.height);
    if (w > 1 && h > 1) return { w, h };
  } catch {}
  return null;
}

async function fetchExternal(): Promise<boolean | null> {
  try {
    const res = await call<[], { external?: unknown; supported?: unknown }>('get_display_state');
    if (res && (res as any).supported === false) return null;
    return !!(res && (res as any).external === true);
  } catch {
    return _external; // keep previous cached value on RPC failure
  }
}

function screenChanged(a: { w: number; h: number } | null, b: { w: number; h: number } | null): boolean {
  const aw = a ? a.w : 0, ah = a ? a.h : 0;
  const bw = b ? b.w : 0, bh = b ? b.h : 0;
  return aw !== bw || ah !== bh;
}

async function refreshDisplay(): Promise<void> {
  const nextScreen = readBpScreen();
  const nextExternal = await fetchExternal();
  const changed = nextExternal !== _external || screenChanged(nextScreen, _screen);
  if (nextScreen) _screen = nextScreen;
  _external = nextExternal;
  if (changed) notify();
}

let _displayUnsub: (() => void) | null = null;
let _displayDebounce: ReturnType<typeof setTimeout> | null = null;

function subscribeDisplayManager(): void {
  try {
    const dm = (globalThis as any).SteamClient?.System?.DisplayManager;
    const reg = dm?.RegisterForStateChanges?.(() => {
      if (_displayDebounce) clearTimeout(_displayDebounce);
      _displayDebounce = setTimeout(() => { _displayDebounce = null; void refreshDisplay(); }, 600);
    });
    if (reg && typeof reg.unregister === 'function') {
      _displayUnsub = () => { try { reg.unregister(); } catch {} };
    }
  } catch {}
}

export function installDeviceState(): () => void {
  // Battery changes re-notify listeners so battery/charging rules re-evaluate
  // (subscribeBattery is fed by batteryState's own Steam subscription — no
  // polling). Display changes come through DisplayManager, debounced.
  const unsubBattery = subscribeBattery(notify);
  subscribeDisplayManager();
  void refreshDisplay();
  return () => {
    try { unsubBattery(); } catch {}
    if (_displayUnsub) { try { _displayUnsub(); } catch {} _displayUnsub = null; }
    if (_displayDebounce) { clearTimeout(_displayDebounce); _displayDebounce = null; }
  };
}

export type DeviceState = {
  batteryLevel: number | null; // 0–1, null when no battery
  charging: boolean;
  offline: boolean;
  external: boolean | null; // external display / docked; null = unknown (non-Linux)
  screen: { w: number; h: number } | null; // real display dims, null = unknown
};

export function getDeviceState(): DeviceState {
  const b = getBatteryState();
  return {
    batteryLevel: b && b.hasBattery ? b.level : null,
    charging: !!b && (b.state === 'charging' || b.state === 'full'),
    offline: isOfflineModeOn(),
    external: _external,
    screen: _screen,
  };
}

function evalResolution(rule: any, width: number): boolean {
  const min = Number(rule?.minWidth);
  return Number.isFinite(min) ? width >= min : true;
}

/* Display-signal kinds. Unknown state (and unknown kinds) fail open — return
   true — so a signal this platform can't answer never wrongly hides a shelf. */
function evalDisplayRule(rule: any): boolean {
  const st = getDeviceState();
  const kind = String(rule && rule.kind || '');
  if (kind === 'externalDisplay') return st.external == null ? true : st.external;
  if (kind === 'resolution') return st.screen ? evalResolution(rule, st.screen.w) : true;
  if (kind === 'ultrawide') return st.screen ? st.screen.w / st.screen.h >= ULTRAWIDE_RATIO : true;
  return true;
}

function evalBattery(rule: any): boolean {
  const below = Number(rule?.below);
  const threshold = Number.isFinite(below) ? below / 100 : 0.2;
  return isLowBattery(threshold);
}

/* Evaluate one device-state VisibilityRule. Unknown kinds fail open (return true)
   so a rule an older build can't answer never wrongly hides a shelf. Kinds:
   battery (below %, default 20), charging, offline, externalDisplay, resolution
   (minWidth), ultrawide. */
export function evalDeviceRule(rule: any): boolean {
  const kind = String(rule && rule.kind || '');
  if (kind === 'battery') return evalBattery(rule);
  if (kind === 'charging') return getDeviceState().charging;
  if (kind === 'offline') return getDeviceState().offline;
  return evalDisplayRule(rule); // externalDisplay/resolution/ultrawide + unknown→true
}

export const DEVICE_RULE_KINDS = [
  'battery', 'charging', 'offline', 'externalDisplay', 'resolution', 'ultrawide',
] as const;
export function isDeviceRuleKind(kind: string): boolean {
  return (DEVICE_RULE_KINDS as readonly string[]).includes(kind);
}
