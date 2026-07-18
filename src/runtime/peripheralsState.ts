import { call } from './host/decky';

/* Bluetooth + audio-output context for Visibility Rules, on-demand with NO
   background timer (mirrors perfState). `evalPeripheralRule` reads the last
   cached snapshot and, when stale (>30 s) with no fetch in flight, kicks one
   background refresh that updates the cache and notifies (a re-render
   re-evaluates). No consumer → never called → the backend is never hit. */

export type BtDevice = { mac: string; name: string };
type BtState = { paired: BtDevice[]; connected: string[]; supported: boolean };
type AudioState = { headphones: boolean; supported: boolean };

const TTL = 30000;
const _listeners = new Set<() => void>();
let _bt: BtState | null = null;
let _audio: AudioState | null = null;
let _at = 0;
let _inflight = false;

function notify(): void {
  for (const l of _listeners) { try { l(); } catch {} }
}

export function subscribePeripheralsState(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

async function refresh(): Promise<void> {
  _inflight = true;
  try {
    const [bt, audio] = await Promise.all([
      call<[], BtState>('get_bluetooth_state').catch(() => null),
      call<[], AudioState>('get_audio_state').catch(() => null),
    ]);
    if (bt) _bt = bt;
    if (audio) _audio = audio;
    _at = Date.now();
    notify();
  } catch { /* keep previous snapshot on RPC failure */ } finally {
    _inflight = false;
  }
}

// On-demand: refresh only when stale and nothing is already fetching.
function ensureFresh(): void {
  if (_inflight) return;
  if (_bt && _audio && Date.now() - _at < TTL) return;
  void refresh();
}

/** Paired devices for the rule editor's per-device picker. */
export function getBluetoothPaired(): BtDevice[] {
  ensureFresh();
  return _bt?.paired ?? [];
}

export function requestPeripheralsRefresh(): void {
  ensureFresh();
}

function evalBluetooth(rule: any): boolean {
  ensureFresh();
  const mac = String(rule?.mac ?? '').toUpperCase();
  if (!mac) return true;                       // unconfigured → fail open
  if (!_bt || !_bt.supported) return true;     // unknown platform → fail open
  return _bt.connected.some((m) => String(m).toUpperCase() === mac);
}

function evalHeadphones(): boolean {
  ensureFresh();
  if (!_audio || !_audio.supported) return true; // unknown → fail open
  return _audio.headphones;
}

/* Evaluate one peripheral VisibilityRule. Unknown state fails open (true) so a
   signal a platform can't answer never wrongly hides a shelf. Kinds:
   bluetoothConnected (mac param), headphonesConnected. */
export function evalPeripheralRule(rule: any): boolean {
  const kind = String(rule?.kind ?? '');
  if (kind === 'bluetoothConnected') return evalBluetooth(rule);
  if (kind === 'headphonesConnected') return evalHeadphones();
  return true;
}

export const PERIPHERAL_RULE_KINDS = ['bluetoothConnected', 'headphonesConnected'] as const;
export function isPeripheralRuleKind(kind: string): boolean {
  return (PERIPHERAL_RULE_KINDS as readonly string[]).includes(kind);
}
