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

/* Exported so a system-resume handler can force a fresh read: display-change
   events don't fire for anything that happened while suspended (nothing runs
   during sleep), so a dock/undock while asleep leaves `_external` stale until
   something else re-checks it. */
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
      // Dock/undock also re-checks removable-library mount state — no
      // hotplug event exists here, so this piggybacks on one that fires.
      _displayDebounce = setTimeout(() => { _displayDebounce = null; void refreshDisplay(); void refreshLibraryLocations(); }, 600);
    });
    if (reg && typeof reg.unregister === 'function') {
      _displayUnsub = () => { try { reg.unregister(); } catch {} };
    }
  } catch {}
}

/* Steam Library Location — reads `libraryfolders.vdf` via the backend
   (filesystem-level, so it can't run in the renderer) to know which library
   (Internal / External / Network) each installed app lives in, and whether
   each library is currently mounted. Powers the `libraryLocation` filter
   (steam/index.ts) and the `libraryAvailable` trigger/visibility kind below. */
export type LibraryEntry = {
  id: string;
  label: string;
  path: string;
  category: 'internal' | 'external' | 'network';
  mounted: boolean;
};

let _libraries: LibraryEntry[] = [];
let _appLibrary: Map<number, string> = new Map();
let _librarySupported = false;

function normalizeLibraryCategory(raw: unknown): LibraryEntry['category'] {
  return raw === 'internal' || raw === 'network' ? raw : 'external';
}

function parseLibraryEntry(l: any): LibraryEntry | null {
  const id = String(l?.id ?? '');
  if (!id) return null;
  const label = String(l?.label ?? id);
  const path = String(l?.path ?? '');
  return { id, label, path, category: normalizeLibraryCategory(l?.category), mounted: l?.mounted === true };
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
      // keep previous cached state on RPC failure
    } finally {
      _libraryInFlight = null;
    }
  })();
  return _libraryInFlight;
}

/** True once `refreshLibraryLocations` has completed at least once — lets a
 *  one-off caller (the `libraryLocation` filter's shelf-resolve prefetch)
 *  skip an extra RPC call when `installDeviceState`'s own refresh already
 *  warmed the cache, instead of re-fetching on every resolve. */
export function isLibraryLocationsWarm(): boolean {
  return _libraryFetchedOnce;
}

/** Synchronous — reads whatever `refreshLibraryLocations` has already
 *  cached. Never fetches; callers that need a fresh read must await
 *  `refreshLibraryLocations` first. */
export function getLibraries(): LibraryEntry[] {
  return _libraries;
}

export function getLibraryCategoryOf(appid: number): LibraryEntry['category'] | null {
  const libId = _appLibrary.get(appid);
  if (!libId) return null;
  return _libraries.find((l) => l.id === libId)?.category ?? null;
}

/** The specific library id (not just category) an app is installed in —
 *  powers the `libraryLocation` filter's multi-library selection, so a
 *  shelf can mix e.g. "this SD card" + "that USB drive" instead of only
 *  the coarser internal/external/network bucket. */
export function getLibraryIdOf(appid: number): string | null {
  return _appLibrary.get(appid) ?? null;
}

function evalLibraryAvailable(rule: any): boolean {
  if (!_librarySupported) return true; // fail open — unsupported platform/read failure
  const libraryId = rule?.libraryId ? String(rule.libraryId) : null;
  const category = String(rule?.category ?? 'external');
  const matches = libraryId ? _libraries.filter((l) => l.id === libraryId) : _libraries.filter((l) => l.category === category);
  if (!matches.length) return false; // configured library/category doesn't exist right now
  return matches.some((l) => l.mounted);
}

/* External controller ("controller connected", invertible). Device-agnostic so
   it works on every handheld, not just the Deck: the built-in gamepad is always
   the single primary entry, so any EXTRA bound controller — or any unbound
   (freshly connected, not yet assigned) one — means an external pad. Event-driven
   off SteamClient.Input register callbacks — no polling. */
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

/* Exported for the same reason as refreshDisplay: a controller connecting or
   disconnecting while suspended fires no event (nothing runs during sleep),
   so a resume handler needs to force this live, synchronous read itself. */
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

export function installDeviceState(): () => void {
  // Battery changes re-notify listeners so battery/charging rules re-evaluate
  // (subscribeBattery is fed by batteryState's own Steam subscription — no
  // polling). Display changes come through DisplayManager, debounced.
  const unsubBattery = subscribeBattery(notify);
  subscribeDisplayManager();
  subscribeControllers();
  void refreshDisplay();
  void refreshLibraryLocations();
  return () => {
    try { unsubBattery(); } catch {}
    if (_displayUnsub) { try { _displayUnsub(); } catch {} _displayUnsub = null; }
    if (_displayDebounce) { clearTimeout(_displayDebounce); _displayDebounce = null; }
    for (const u of _controllerUnsub.splice(0)) { try { u(); } catch {} }
  };
}

export type DeviceState = {
  batteryLevel: number | null; // 0–1, null when no battery
  charging: boolean;
  offline: boolean;
  external: boolean | null; // external display / docked; null = unknown (non-Linux)
  screen: { w: number; h: number } | null; // real display dims, null = unknown
  controllerConnected: boolean; // an external gamepad beyond the built-in one
};

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
  if (kind === 'controllerConnected') return getDeviceState().controllerConnected;
  if (kind === 'libraryAvailable') return evalLibraryAvailable(rule);
  return evalDisplayRule(rule); // externalDisplay/resolution/ultrawide + unknown→true
}

export const DEVICE_RULE_KINDS = [
  'battery', 'charging', 'offline', 'externalDisplay', 'resolution', 'ultrawide',
  'controllerConnected', 'libraryAvailable',
] as const;
export function isDeviceRuleKind(kind: string): boolean {
  return (DEVICE_RULE_KINDS as readonly string[]).includes(kind);
}
