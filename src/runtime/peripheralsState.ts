import { call } from './host/decky';
import { logInfo } from './logger';

export type BtDevice = { mac: string; name: string };
type BtState = { paired: BtDevice[]; connected: string[]; supported: boolean };
type AudioState = { headphones: boolean; supported: boolean };

const TTL = 30000;
const _listeners = new Set<() => void>();
let _bt: BtState | null = null;
let _audio: AudioState | null = null;
let _at = 0;
let _inflight = false;
let _loggedFail = false;

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
    if (!bt && !audio) {
      if (!_loggedFail) { _loggedFail = true; logInfo('RUNTIME', 'peripherals backend unreachable (bluetooth/audio RPC)'); }
    } else {
      _loggedFail = false;
    }
    _at = Date.now();
    notify();
  } catch {} finally {
    _inflight = false;
  }
}

function ensureFresh(): void {
  if (_inflight) return;
  if (_bt && _audio && Date.now() - _at < TTL) return;
  void refresh();
}

export function getBluetoothPaired(): BtDevice[] {
  ensureFresh();
  return _bt?.paired ?? [];
}

export function getBluetoothConnected(): string[] {
  ensureFresh();
  return _bt?.connected ?? [];
}

export function requestPeripheralsRefresh(): void {
  ensureFresh();
}

function evalBluetooth(rule: any): boolean {
  ensureFresh();
  const mac = String(rule?.mac ?? '').toUpperCase();
  if (!mac) return true;
  if (!_bt || !_bt.supported) return true;
  return _bt.connected.some((m) => String(m).toUpperCase() === mac);
}

function evalHeadphones(): boolean {
  ensureFresh();
  if (!_audio || !_audio.supported) return true;
  return _audio.headphones;
}

/** Unknown state fails open so an unanswerable signal never hides a shelf. */
export function evalPeripheralRule(rule: any): boolean {
  const kind = String(rule?.kind ?? '');
  if (kind === 'bluetoothConnected') return evalBluetooth(rule);
  if (kind === 'headphonesConnected') return evalHeadphones();
  return true;
}

export function peripheralRuleHasData(rule: any): boolean {
  ensureFresh();
  const kind = String(rule?.kind ?? '');
  if (kind === 'bluetoothConnected') return !!_bt?.supported && !!String(rule?.mac ?? '');
  if (kind === 'headphonesConnected') return !!_audio?.supported;
  return true;
}

const PERIPHERAL_RULE_KINDS = ['bluetoothConnected', 'headphonesConnected'] as const;
export function isPeripheralRuleKind(kind: string): boolean {
  return (PERIPHERAL_RULE_KINDS as readonly string[]).includes(kind);
}
