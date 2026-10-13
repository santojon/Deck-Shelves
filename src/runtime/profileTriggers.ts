import { getCurrentSettings, saveSettings, subscribeSettings } from '../store/settingsStore';
import { subscribeDeviceState } from './deviceState';
import { subscribeSessionState } from './sessionState';
import { subscribePerfState } from './perfState';
import { subscribePeripheralsState } from './peripheralsState';
import { resolveTriggeredProfile, nextProfileTriggerFlip } from '../steam/smartShelves';
import { notifyUser } from './notify';
import { defaultSettings } from '../domain/defaults';
import { keepShelfFields, keepDeviceLocalFields, stickyShowcaseSeen, FACTORY_PROFILE_ID, FACTORY_PROFILE_NAME } from '../features/settings/controller/profiles';
import i18n from '../i18n';
import type { Settings } from '../types';

/* Profile auto-switch triggers, installed at boot so they run in the BACKGROUND
   on the home — not only while the QAM/settings controller is mounted (the old
   bug: the effect lived in useSettingsController, which unmounts when the panel
   closes, so triggers never fired on the home). Transition-based (applies only
   when the resolved profile changes, never loops), event/clock-driven, no polling. */

let _lastTriggered: string | null | undefined = undefined;
/* Deep copy of the FULL settings before a trigger took over, restored (plus the
   user's own edits) when the trigger is denied ("temporary override"). Stored as settings, not a
   profile name, so revert works even with no named profile active — the common
   case (a "when charging" trigger firing over the plain live config). Also kept
   in localStorage (this device only), so a restart mid-trigger can revert. */
let _baselineSettings: Settings | null = null;
// What the trigger last wrote; live fields that differ from it are the user's own edits.
let _appliedSettings: Settings | null = null;
// Edits made before a restart mid-trigger, laid over the profile when it is re-applied.
let _carryEdits: Record<string, unknown> | null = null;
const BASELINE_KEY = 'ds-trigger-baseline-v1';
// Bookkeeping every save rewrites; never read as a user edit.
const NOT_EDITS = new Set(['preferencesUpdatedAt', 'syncTombstones']);

function persistTriggerState(name: string): void {
  try {
    if (!_baselineSettings) globalThis.localStorage?.removeItem(BASELINE_KEY);
    else globalThis.localStorage?.setItem(BASELINE_KEY, JSON.stringify({ name, settings: _baselineSettings, applied: _appliedSettings }));
  } catch {}
}

function clearTriggerState(): void {
  _baselineSettings = null;
  _appliedSettings = null;
  try { globalThis.localStorage?.removeItem(BASELINE_KEY); } catch {}
}

function storedTriggerState(name: string): { settings: Settings; applied: Settings | null } | null {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(BASELINE_KEY) ?? 'null');
    return v && v.name === name && v.settings ? { settings: v.settings as Settings, applied: (v.applied ?? null) as Settings | null } : null;
  } catch { return null; }
}
let _flipTimer: ReturnType<typeof setTimeout> | null = null;
let _installed = false;

function currentContext(): { profiles: any[] } | null {
  const s = getCurrentSettings() as any;
  if (!s || s.profileTriggersEnabled !== true) return null;
  const profiles = Array.isArray(s.profiles) ? [...s.profiles] : [];
  // The synthetic Default profile joins the candidate list (checked last, so a
  // saved-profile trigger wins ties) when it has its own trigger.
  const ft = s.factoryProfileTrigger;
  if (ft && Array.isArray(ft.rules) && ft.rules.length > 0) {
    profiles.push({ id: FACTORY_PROFILE_ID, name: FACTORY_PROFILE_NAME, trigger: ft });
  }
  if (profiles.length === 0) return null;
  return { profiles };
}

function triggerToast(name: string): void {
  const msg = i18n.t('profile_trigger_toast', { name });
  notifyUser(i18n.t('plugin_name'), msg && msg !== 'profile_trigger_toast' ? msg : `Switched to profile: ${name}`, 'profile', 'triggers');
}

// Key-order-independent serialization, so a restored/applied settings object
// that is semantically identical to the live one compares equal. `skipClocks`
// drops the per-entity sync clocks a save stamps.
function stableStringify(o: unknown, skipClocks = false): string {
  return JSON.stringify(o, (k, v) => {
    if (skipClocks && k === 'updatedAt') return undefined;
    return (v && typeof v === 'object' && !Array.isArray(v))
      ? Object.keys(v as any).sort().reduce((a: any, key) => { a[key] = (v as any)[key]; return a; }, {}) : v;
  });
}

/* Persist + notify only when it is a REAL change. If applying/restoring would
   leave the settings identical (e.g. the pre-trigger baseline WAS the triggered
   profile), do nothing — no save, no toast. */
function saveIfChanged(next: Settings, onChanged: () => void): void {
  if (stableStringify(next) === stableStringify(getCurrentSettings())) return;
  void saveSettings(next);
  onChanged();
}

// A profile applied BY a trigger never switches the triggers themselves off.
function keepTriggerFields(next: Settings, from: Settings): void {
  (next as any).profileTriggersEnabled = (from as any).profileTriggersEnabled;
  (next as any).factoryProfileTrigger = (from as any).factoryProfileTrigger;
}

/* Apply the synthetic Default profile: reset config to defaults, keep the master
   toggle on, and keep shelves (a background trigger must never silently wipe the
   user's shelves — the destructive reset stays a manual, confirmed action). */
function applyFactory(): void {
  const s = getCurrentSettings() as any;
  if (!s) return;
  const defaults = defaultSettings();
  const next = { ...defaults, enabled: true, profiles: s.profiles ?? [], activeProfileName: FACTORY_PROFILE_NAME, showcaseSeen: stickyShowcaseSeen(s, defaults as any), ...takeCarriedEdits() } as Settings;
  keepShelfFields(next, s);
  keepDeviceLocalFields(next, s);
  keepTriggerFields(next, s);
  saveIfChanged(next, () => triggerToast(FACTORY_PROFILE_NAME));
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
    // Shelf-link opt-in, same as the manual apply path (controller/profiles.ts):
    // unlinked profiles change everything BUT the shelves.
    if (!target.linkShelves) keepShelfFields(next, s);
    keepDeviceLocalFields(next, s);
    keepTriggerFields(next, s);
    saveIfChanged(next, () => triggerToast(name));
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

// Top-level fields the user changed by hand since the trigger wrote `applied`.
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
  /* After a restart mid-trigger the live state IS the triggered profile: reuse the
     stored copy, with the edits made since the profile was applied folded in
     (and laid over the profile again when it is re-applied). */
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
  /* Restore the pre-trigger state plus the user's own edits made during the
     trigger, and keep the live profiles list, the trigger switch and the Default
     profile's trigger. Only notifies when the restore is a real change. */
  const live = getCurrentSettings() as any;
  const keep = { profiles: live?.profiles ?? (baseline as any).profiles, profileTriggersEnabled: live?.profileTriggersEnabled, factoryProfileTrigger: live?.factoryProfileTrigger };
  saveIfChanged({ ...baseline, ...keep } as Settings, () => {
    const msg = i18n.t('profile_trigger_deactivated', { name: deactivated });
    notifyUser(i18n.t('plugin_name'), (msg && msg !== 'profile_trigger_deactivated') ? msg : `Profile deactivated: ${deactivated}`, 'profile', 'triggers');
  });
}

function applyTransition(resolved: string | null, prevTriggered: string | null | undefined): void {
  if (resolved) {
    // Trigger became active: snapshot the user's baseline the first time we take
    // over (prevTriggered null/undefined = we weren't already triggered).
    if (prevTriggered == null) captureBaseline(resolved);
    else { foldEditsIntoBaseline(); persistTriggerState(resolved); }
    /* Always go through applyByName, even if `activeProfileName` already
       names this profile — that's a synced field like any other, so a
       cross-device sync can set it without the underlying values matching
       the snapshot (label right, values not). saveIfChanged inside
       applyByName still no-ops when they already genuinely match. */
    applyByName(resolved);
  } else if (typeof prevTriggered === "string") {
    // Trigger denied after having taken over: restore the pre-trigger state.
    revertToBaseline(prevTriggered);
  }
}

/* Triggers switched off (or no profile left) while one was active: end the
   temporary override the same way a denied trigger does. */
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
  scheduleFlip(ctx.profiles); // re-arm the clock timer for time-based triggers
  if (resolved === _lastTriggered) return; // only act on a transition
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
    // Reset transition state so a later re-install starts fresh (no spurious
    // revert from a previous session's leftover _lastTriggered).
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
