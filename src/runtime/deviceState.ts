import { getBatteryState, isLowBattery, subscribeBattery } from './batteryState';
import { getCurrentSettings } from '../store/settingsStore';
import { call } from './host/decky';
import { subscribeControllerInput } from './controllerInput';
import { getHostHandshake } from './hostHandshake';
import { deriveDeviceProfile, type DeviceProfile } from '../domain/deviceProfile';

function isOfflineModeOn(): boolean {
  return (getCurrentSettings() as any)?.offlineModeEnabled === true;
}

// Screen size comes from the Big Picture window; the shared context reports 1.

const ULTRAWIDE_RATIO = 2.0;

const _listeners = new Set<() => void>();

let _screen: { w: number; h: number } | null = null;
let _external: boolean | null = null;

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
    return _external;
  }
}

function screenChanged(a: { w: number; h: number } | null, b: { w: number; h: number } | null): boolean {
  const aw = a ? a.w : 0, ah = a ? a.h : 0;
  const bw = b ? b.w : 0, bh = b ? b.h : 0;
  return aw !== bw || ah !== bh;
}

// Display events don't fire for changes made while suspended, so resume forces a read.
export async function refreshDisplay(): Promise<void> {
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
      // No hotplug event exists for library mounts, so dock/undock re-checks them.
      _displayDebounce = setTimeout(() => { _displayDebounce = null; void refreshDisplay(); void refreshLibraryLocations(); }, 600);
    });
    if (reg && typeof reg.unregister === 'function') {
      _displayUnsub = () => { try { reg.unregister(); } catch {} };
    }
  } catch {}
}

export type LibraryEntry = {
  id: string;
  label: string;
  path: string;
  category: 'internal' | 'external' | 'network';
  mounted: boolean;
  /** The label came from Steam or the volume, not from the folder name. */
  named: boolean;
  sdCard: boolean;
};

let _libraries: LibraryEntry[] = [];
let _appLibrary: Map<number, string> = new Map();
let _librarySupported = false;

function normalizeLibraryCategory(raw: unknown): LibraryEntry['category'] {
  return raw === 'internal' || raw === 'network' ? raw : 'external';
}

function libraryFlags(l: any): Pick<LibraryEntry, 'mounted' | 'named' | 'sdCard'> {
  return { mounted: l?.mounted === true, named: l?.named !== false, sdCard: l?.sdCard === true };
}

function parseLibraryEntry(l: any): LibraryEntry | null {
  const id = String(l?.id ?? '');
  if (!id) return null;
  const label = String(l?.label ?? id);
  const path = String(l?.path ?? '');
  return { id, label, path, category: normalizeLibraryCategory(l?.category), ...libraryFlags(l) };
}

function parseLibraryEntries(raw: unknown): LibraryEntry[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map(parseLibraryEntry).filter((l): l is LibraryEntry => l !== null);
}

function parseAppLibraryMap(raw: unknown): Map<number, string> {
  const appLibrary = new Map<number, string>();
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  for (const key of Object.keys(obj)) {
    const appid = Number(key);
    if (Number.isFinite(appid) && typeof obj[key] === 'string') appLibrary.set(appid, obj[key] as string);
  }
  return appLibrary;
}

function parseLibraryResponse(res: any): { supported: boolean; libraries: LibraryEntry[]; appLibrary: Map<number, string> } {
  if (!res || res.supported === false) return { supported: false, libraries: [], appLibrary: new Map() };
  return { supported: true, libraries: parseLibraryEntries(res.libraries), appLibrary: parseAppLibraryMap(res.appLibrary) };
}

const libraryFingerprint = (libs: LibraryEntry[]): string => libs.map((l) => `${l.id}:${l.mounted}`).join(',');

let _libraryInFlight: Promise<void> | null = null;
let _libraryFetchedOnce = false;

export async function refreshLibraryLocations(): Promise<void> {
  if (_libraryInFlight) return _libraryInFlight;
  _libraryInFlight = (async () => {
    try {
      const res = await call<[], any>('get_library_locations');
      const parsed = parseLibraryResponse(res);
      const changed = libraryFingerprint(parsed.libraries) !== libraryFingerprint(_libraries);
      _libraries = parsed.libraries;
      _appLibrary = parsed.appLibrary;
      _librarySupported = parsed.supported;
      _libraryFetchedOnce = true;
      if (changed) notify();
    } catch {
    } finally {
      _libraryInFlight = null;
    }
  })();
  return _libraryInFlight;
}

export function isLibraryLocationsWarm(): boolean {
  return _libraryFetchedOnce;
}

/** Never fetches; await `refreshLibraryLocations` first for a fresh read. */
export function getLibraries(): LibraryEntry[] {
  return _libraries;
}

export function getLibraryCategoryOf(appid: number): LibraryEntry['category'] | null {
  const libId = _appLibrary.get(appid);
  if (!libId) return null;
  return _libraries.find((l) => l.id === libId)?.category ?? null;
}

export function getLibraryIdOf(appid: number): string | null {
  return _appLibrary.get(appid) ?? null;
}

function evalLibraryAvailable(rule: any): boolean {
  if (!_librarySupported) return true;
  const libraryId = rule?.libraryId ? String(rule.libraryId) : null;
  const category = String(rule?.category ?? 'external');
  const matches = libraryId ? _libraries.filter((l) => l.id === libraryId) : _libraries.filter((l) => l.category === category);
  if (!matches.length) return false;
  return matches.some((l) => l.mounted);
}

// The built-in gamepad is the single primary entry, so any extra or unbound controller is external.
let _externalController = false;
const _controllerUnsub: Array<() => void> = [];

function toControllerArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v.values === 'function') { try { return [...v.values()]; } catch {} }
  return [];
}

function readExternalController(): boolean {
  try {
    const cs = (globalThis as any).ControllerStore;
    if (!cs) return _externalController;
    const bound = toControllerArray(cs.GetControllers?.());
    const unbound = toControllerArray(cs.GetUnboundControllers?.());
    return bound.length > 1 || unbound.length > 0;
  } catch { return _externalController; }
}

function refreshController(): void {
  const next = readExternalController();
  if (next !== _externalController) { _externalController = next; notify(); }
}

// Connections made while suspended fire no event, so resume forces this read.
export function refreshControllerState(): void {
  refreshController();
}

function subscribeControllers(): void {
  const input = (globalThis as any).SteamClient?.Input;
  for (const name of ['RegisterForUnboundControllerListChanges', 'RegisterForActiveControllerChanges'] as const) {
    try {
      const reg = input?.[name]?.(() => refreshController());
      if (reg && typeof reg.unregister === 'function') _controllerUnsub.push(() => { try { reg.unregister(); } catch {} });
    } catch {}
  }
  refreshController();
}

// Only `deck` is classified with confidence; other kinds stay `unknown` rather than guess.
export type DeviceKind = 'deck' | 'machine' | 'frame' | 'desktop' | 'handheld-arm' | 'unknown';

export interface DeviceIdentity {
  device: DeviceKind;
  arch: string | null;
  model: string | null;
}

const UNKNOWN_IDENTITY: DeviceIdentity = { device: 'unknown', arch: null, model: null };

let _identity: DeviceIdentity = UNKNOWN_IDENTITY;
let _identityPrimed = false;
let _simulatedDevice: DeviceKind | null = null;

function classifyDevice(osVariant: string | null, vendor: string | null, product: string | null): DeviceKind {
  if ((osVariant ?? '').toLowerCase() === 'steamdeck') return 'deck';
  const v = (vendor ?? '').toLowerCase();
  const p = (product ?? '').toLowerCase();
  if (v.includes('valve') && (p === 'jupiter' || p === 'galileo')) return 'deck';
  return 'unknown';
}

async function readOSVariant(): Promise<string | null> {
  try {
    const sc = (globalThis as any).SteamClient;
    const info = await sc?.System?.GetSystemInfo?.();
    const v = info?.sOSVariantId;
    return typeof v === 'string' && v.length ? v : null;
  } catch { return null; }
}

const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : null);

async function fetchDeviceIdentity(): Promise<[string | null, any]> {
  return Promise.all([readOSVariant(), call<[], any>('get_device_identity').catch(() => null)]);
}

export async function primeDeviceIdentity(): Promise<void> {
  if (_identityPrimed) return;
  _identityPrimed = true;
  const [variant, hw] = await fetchDeviceIdentity();
  _identity = {
    device: classifyDevice(variant, hw?.vendor ?? null, hw?.product ?? null),
    arch: strOrNull(hw?.arch),
    model: strOrNull(hw?.model),
  };
  notify();
}

function resolvedIdentity(): DeviceIdentity {
  const hs = getHostHandshake()?.device;
  if (!hs) return _identity;
  const device = hs.kind && hs.kind !== 'unknown' ? hs.kind : _identity.device;
  return { device, arch: strOrNull(hs.arch) ?? _identity.arch, model: strOrNull(hs.model) ?? _identity.model };
}

export function getDeviceIdentity(): DeviceIdentity {
  const base = resolvedIdentity();
  return _simulatedDevice ? { ...base, device: _simulatedDevice } : base;
}

export function setSimulatedDevice(kind: DeviceKind | null): void {
  if (kind === _simulatedDevice) return;
  _simulatedDevice = kind;
  notify();
}
export function getSimulatedDevice(): DeviceKind | null {
  return _simulatedDevice;
}

// Steam has no current-input-mode getter, so it's tracked from real input events.
export type InputMode = 'gamepad' | 'pointer';

let _inputMode: InputMode = 'gamepad';
let _simulatedInputMode: InputMode | null = null;

function setInputMode(mode: InputMode): void {
  if (mode === _inputMode) return;
  _inputMode = mode;
  notify();
}

function subscribeInputMode(): () => void {
  const onPointer = () => setInputMode('pointer');
  const unControllerInput = subscribeControllerInput(() => setInputMode('gamepad'));
  try {
    document.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('pointerdown', onPointer, { passive: true });
  } catch {}
  return () => {
    try { unControllerInput(); } catch {}
    try {
      document.removeEventListener('pointermove', onPointer);
      document.removeEventListener('pointerdown', onPointer);
    } catch {}
  };
}

export function getInputMode(): InputMode {
  return _simulatedInputMode ?? _inputMode;
}

export function setSimulatedInputMode(mode: InputMode | null): void {
  if (mode === _simulatedInputMode) return;
  _simulatedInputMode = mode;
  notify();
}
export function getSimulatedInputMode(): InputMode | null {
  return _simulatedInputMode;
}

let _inputModeUnsub: (() => void) | null = null;

export function installDeviceState(): () => void {
  const unsubBattery = subscribeBattery(notify);
  subscribeDisplayManager();
  subscribeControllers();
  _inputModeUnsub = subscribeInputMode();
  void refreshDisplay();
  void refreshLibraryLocations();
  void primeDeviceIdentity();
  return () => {
    try { unsubBattery(); } catch {}
    if (_displayUnsub) { try { _displayUnsub(); } catch {} _displayUnsub = null; }
    if (_displayDebounce) { clearTimeout(_displayDebounce); _displayDebounce = null; }
    for (const u of _controllerUnsub.splice(0)) { try { u(); } catch {} }
    if (_inputModeUnsub) { try { _inputModeUnsub(); } catch {} _inputModeUnsub = null; }
  };
}

export type DeviceState = {
  batteryLevel: number | null; // 0–1, null when no battery
  charging: boolean;
  offline: boolean;
  external: boolean | null;
  screen: { w: number; h: number } | null;
  controllerConnected: boolean;
};

// Family comes from identity signals only, never from the CPU architecture.
export function getDeviceProfile(): DeviceProfile {
  const b = getBatteryState();
  return deriveDeviceProfile(getDeviceIdentity(), {
    hasBattery: b ? b.hasBattery : null,
    external: _external,
    controllerConnected: _externalController,
    xr: getHostHandshake()?.capabilities?.xr ?? null,
  });
}

export function getDeviceState(): DeviceState {
  const b = getBatteryState();
  return {
    batteryLevel: b && b.hasBattery ? b.level : null,
    charging: !!b && (b.state === 'charging' || b.state === 'full'),
    offline: isOfflineModeOn(),
    external: _external,
    screen: _screen,
    controllerConnected: _externalController,
  };
}

function evalResolution(rule: any, width: number): boolean {
  const min = Number(rule?.minWidth);
  return Number.isFinite(min) ? width >= min : true;
}

// Unknown state fails open so an unanswerable signal never hides a shelf.
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

function evalDeviceKindRule(rule: any): boolean {
  return getDeviceIdentity().device === String(rule?.value ?? 'deck');
}

function evalInputModeRule(rule: any): boolean {
  return getInputMode() === String(rule?.value ?? 'pointer');
}

/** Unknown kinds fail open. */
export function evalDeviceRule(rule: any): boolean {
  const kind = String(rule && rule.kind || '');
  if (kind === 'battery') return evalBattery(rule);
  if (kind === 'charging') return getDeviceState().charging;
  if (kind === 'offline') return getDeviceState().offline;
  if (kind === 'controllerConnected') return getDeviceState().controllerConnected;
  if (kind === 'libraryAvailable') return evalLibraryAvailable(rule);
  if (kind === 'device') return evalDeviceKindRule(rule);
  if (kind === 'inputMode') return evalInputModeRule(rule);
  return evalDisplayRule(rule);
}

// A trigger must not switch profiles on a guess, so this needs a real probe answer.
export function deviceRuleHasData(rule: any): boolean {
  if (String(rule?.kind ?? '') === 'externalDisplay') return getDeviceState().external != null;
  return true;
}

const DEVICE_RULE_KINDS = [
  'battery', 'charging', 'offline', 'externalDisplay', 'resolution', 'ultrawide',
  'controllerConnected', 'libraryAvailable', 'device', 'inputMode',
] as const;
export function isDeviceRuleKind(kind: string): boolean {
  return (DEVICE_RULE_KINDS as readonly string[]).includes(kind);
}
