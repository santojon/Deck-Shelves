import { getCurrentSettings, saveSettings, snapshotOnNextSave, subscribeSettings } from '../store/settingsStore';
import { subscribeDeviceState } from './deviceState';
import { subscribeSessionState } from './sessionState';
import { subscribePerfState } from './perfState';
import { subscribePeripheralsState } from './peripheralsState';
import { resolveTriggeredProfile, nextProfileTriggerFlip } from '../steam/smartShelves';
import { notifyUser } from './notify';
import { qaOverrideActive } from '../qa/harness';
import { defaultSettings } from '../domain/defaults';
import { keepShelfFields, keepDeviceLocalFields, stickyShowcaseSeen, FACTORY_PROFILE_ID, FACTORY_PROFILE_NAME } from '../features/settings/controller/profiles';
import i18n from '../i18n';
import type { Settings } from '../types';

let _lastTriggered: string | null | undefined = undefined;
// Stored as settings rather than a profile name so revert works with no named profile active.
let _baselineSettings: Settings | null = null;
// What the trigger last wrote; live fields that differ from it are the user's own edits.
let _appliedSettings: Settings | null = null;
let _carryEdits: Record<string, unknown> | null = null;
const BASELINE_KEY = 'ds-trigger-baseline-v1';
const NOT_EDITS = new Set(['preferencesUpdatedAt', 'syncTombstones']);

function persistTriggerState(name: string): void {
  // QA builds use fixture data, so the copy a normal boot reverts to is left alone.
  if (qaOverrideActive) return;
  try {
    if (!_baselineSettings) globalThis.localStorage?.removeItem(BASELINE_KEY);
    else globalThis.localStorage?.setItem(BASELINE_KEY, JSON.stringify({ name, settings: _baselineSettings, applied: _appliedSettings }));
  } catch {}
}

function clearTriggerState(): void {
  _baselineSettings = null;
  _appliedSettings = null;
  if (qaOverrideActive) return;
  try { globalThis.localStorage?.removeItem(BASELINE_KEY); } catch {}
}

// A copy left by a QA build holds fixture data, so a normal boot never reverts to it.
function isQaLeftover(v: any): boolean {
  return !qaOverrideActive && (v?.settings?.__dsQaOverride === true || v?.applied?.__dsQaOverride === true);
}

function storedTriggerState(name: string): { settings: Settings; applied: Settings | null } | null {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(BASELINE_KEY) ?? 'null');
    if (isQaLeftover(v)) return null;
    return v && v.name === name && v.settings ? { settings: v.settings as Settings, applied: (v.applied ?? null) as Settings | null } : null;
  } catch { return null; }
}
let _flipTimer: ReturnType<typeof setTimeout> | null = null;
let _installed = false;

function currentContext(): { profiles: any[] } | null {
  const s = getCurrentSettings() as any;
  if (!s || s.profileTriggersEnabled !== true) return null;
  const profiles = Array.isArray(s.profiles) ? [...s.profiles] : [];
  // Default is checked last so a saved-profile trigger wins ties.
  const ft = s.factoryProfileTrigger;
  if (ft && Array.isArray(ft.rules) && ft.rules.length > 0) {
    profiles.push({ id: FACTORY_PROFILE_ID, name: FACTORY_PROFILE_NAME, trigger: ft });
  }
  if (profiles.length === 0) return null;
  return { profiles };
}

function shownProfileName(name: string): string {
  if (name !== FACTORY_PROFILE_NAME) return name;
  const factory = i18n.t('profile_factory_name');
  return factory && factory !== 'profile_factory_name' ? factory : 'Default';
}

function triggerToast(name: string): void {
  const shown = shownProfileName(name);
  const msg = i18n.t('profile_trigger_toast', { name: shown });
  notifyUser(i18n.t('plugin_name'), msg && msg !== 'profile_trigger_toast' ? msg : `Switched to profile: ${shown}`, 'profile', 'triggers');
}

// Key-order-independent, so semantically equal settings compare equal.
function stableStringify(o: unknown, skipClocks = false): string {
  return JSON.stringify(o, (k, v) => {
    if (skipClocks && k === 'updatedAt') return undefined;
    return (v && typeof v === 'object' && !Array.isArray(v))
      ? Object.keys(v as any).sort().reduce((a: any, key) => { a[key] = (v as any)[key]; return a; }, {}) : v;
  });
}

function saveIfChanged(next: Settings, onChanged: () => void, snapshot = false): void {
  if (stableStringify(next) === stableStringify(getCurrentSettings())) return;
  if (snapshot) snapshotOnNextSave("profile");
  void saveSettings(next);
  onChanged();
}

function keepTriggerFields(next: Settings, from: Settings): void {
  (next as any).profileTriggersEnabled = (from as any).profileTriggersEnabled;
  (next as any).factoryProfileTrigger = (from as any).factoryProfileTrigger;
}

// Keeps the shelves: a background trigger must never wipe them.
function applyFactory(): void {
  const s = getCurrentSettings() as any;
  if (!s) return;
  const defaults = defaultSettings();
  const next = { ...defaults, enabled: true, profiles: s.profiles ?? [], activeProfileName: FACTORY_PROFILE_NAME, showcaseSeen: stickyShowcaseSeen(s, defaults as any), ...takeCarriedEdits() } as Settings;
  keepShelfFields(next, s);
  keepDeviceLocalFields(next, s);
  keepTriggerFields(next, s);
  saveIfChanged(next, () => triggerToast(FACTORY_PROFILE_NAME), true);
  rememberApplied(FACTORY_PROFILE_NAME, next);
}

function scheduleFlip(profiles: any[]): void {
  if (_flipTimer) { clearTimeout(_flipTimer); _flipTimer = null; }
  let next: number | null = null;
  try { next = nextProfileTriggerFlip(profiles); } catch { next = null; }
  if (next == null) return;
  _flipTimer = setTimeout(() => { _flipTimer = null; applyTriggeredProfile(); }, Math.max(1000, next - Date.now()));
}

function applyByName(name: string): void {
  if (name === FACTORY_PROFILE_NAME) { applyFactory(); return; }
  const s = getCurrentSettings() as any;
  const profiles = Array.isArray(s?.profiles) ? s.profiles : [];
  const target = profiles.find((p: any) => p && p.name === name);
  if (target && target.id && target.snapshot) {
    const showcaseSeen = stickyShowcaseSeen(s, target.snapshot as any);
    const next = { ...(target.snapshot as any), profiles, activeProfileName: target.name, showcaseSeen, ...takeCarriedEdits() } as Settings;
    if (!target.linkShelves) keepShelfFields(next, s);
    keepDeviceLocalFields(next, s);
    keepTriggerFields(next, s);
    saveIfChanged(next, () => triggerToast(name), true);
    rememberApplied(name, next);
  }
}

function takeCarriedEdits(): Record<string, unknown> {
  const edits = _carryEdits ?? {};
  _carryEdits = null;
  return edits;
}

function rememberApplied(name: string, applied: Settings): void {
  try { _appliedSettings = JSON.parse(JSON.stringify(applied)) as Settings; }
  catch { _appliedSettings = null; }
  persistTriggerState(name);
}

function editsSince(applied: Settings | null): Record<string, unknown> {
  const live = getCurrentSettings() as any;
  const edits: Record<string, unknown> = {};
  if (!applied || !live) return edits;
  for (const k of Object.keys(live)) {
    if (!NOT_EDITS.has(k) && stableStringify(live[k], true) !== stableStringify((applied as any)[k], true)) edits[k] = live[k];
  }
  return edits;
}

function foldEditsIntoBaseline(): void {
  if (_baselineSettings) _baselineSettings = { ..._baselineSettings, ...editsSince(_appliedSettings) } as Settings;
}

function captureBaseline(name: string): void {
  const s = getCurrentSettings() as any;
  const stored = s?.activeProfileName === name ? storedTriggerState(name) : null;
  if (stored) {
    _carryEdits = editsSince(stored.applied);
    _baselineSettings = { ...stored.settings, ..._carryEdits } as Settings;
  } else {
    try { _baselineSettings = JSON.parse(JSON.stringify(s)) as Settings; }
    catch { _baselineSettings = null; }
  }
  persistTriggerState(name);
}

function revertToBaseline(deactivated: string): void {
  foldEditsIntoBaseline();
  const baseline = _baselineSettings;
  clearTriggerState();
  if (!baseline) return;
  const live = getCurrentSettings() as any;
  const keep = { profiles: live?.profiles ?? (baseline as any).profiles, profileTriggersEnabled: live?.profileTriggersEnabled, factoryProfileTrigger: live?.factoryProfileTrigger };
  saveIfChanged({ ...baseline, ...keep } as Settings, () => {
    const msg = i18n.t('profile_trigger_deactivated', { name: deactivated });
    notifyUser(i18n.t('plugin_name'), (msg && msg !== 'profile_trigger_deactivated') ? msg : `Profile deactivated: ${deactivated}`, 'profile', 'triggers');
  });
}

function applyTransition(resolved: string | null, prevTriggered: string | null | undefined): void {
  if (resolved) {
    if (prevTriggered == null) captureBaseline(resolved);
    else { foldEditsIntoBaseline(); persistTriggerState(resolved); }
    // Always apply: a cross-device sync can set the name without the values matching.
    applyByName(resolved);
  } else if (typeof prevTriggered === "string") {
    revertToBaseline(prevTriggered);
  }
}

function endTriggering(): void {
  const was = _lastTriggered;
  _lastTriggered = undefined;
  if (typeof was === 'string') { revertToBaseline(was); return; }
  _baselineSettings = null;
  _appliedSettings = null;
}

function applyTriggeredProfile(): void {
  const ctx = currentContext();
  if (!ctx) { endTriggering(); return; }
  let resolved: string | null = null;
  try { resolved = resolveTriggeredProfile(ctx.profiles); } catch { return; }
  scheduleFlip(ctx.profiles);
  if (resolved === _lastTriggered) return;
  const prevTriggered = _lastTriggered;
  _lastTriggered = resolved;
  applyTransition(resolved, prevTriggered);
}

export function installProfileTriggers(): () => void {
  if (_installed) return () => {};
  _installed = true;
  const unSettings = subscribeSettings(() => applyTriggeredProfile());
  const unDevice = subscribeDeviceState(() => applyTriggeredProfile());
  const unSession = subscribeSessionState(() => applyTriggeredProfile());
  const unPerf = subscribePerfState(() => applyTriggeredProfile());
  const unPeripherals = subscribePeripheralsState(() => applyTriggeredProfile());
  applyTriggeredProfile();
  return () => {
    _installed = false;
    _lastTriggered = undefined;
    _baselineSettings = null;
    try { unSettings(); } catch {}
    try { unDevice(); } catch {}
    try { unSession(); } catch {}
    try { unPerf(); } catch {}
    try { unPeripherals(); } catch {}
    if (_flipTimer) { clearTimeout(_flipTimer); _flipTimer = null; }
  };
}
