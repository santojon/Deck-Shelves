import { getCurrentSettings, saveSettings, subscribeSettings } from '../store/settingsStore';
import { subscribeDeviceState } from './deviceState';
import { subscribeSessionState } from './sessionState';
import { resolveTriggeredProfile, nextProfileTriggerFlip } from '../steam/smartShelves';
import { notifyUser } from './notify';
import { defaultSettings } from '../domain/defaults';
import { keepShelfFields, FACTORY_PROFILE_ID, FACTORY_PROFILE_NAME } from '../features/settings/controller/profiles';
import i18n from '../i18n';
import type { Settings } from '../types';

/* Profile auto-switch triggers, installed at boot so they run in the BACKGROUND
   on the home — not only while the QAM/settings controller is mounted (the old
   bug: the effect lived in useSettingsController, which unmounts when the panel
   closes, so triggers never fired on the home). Transition-based (applies only
   when the resolved profile changes, never loops), event/clock-driven, no polling. */

let _lastTriggered: string | null | undefined = undefined;
/* Deep copy of the FULL settings before a trigger took over, restored verbatim
   when the trigger is denied ("temporary override"). Stored as settings, not a
   profile name, so revert works even with no named profile active — the common
   case (a "when charging" trigger firing over the plain live config) that the
   old name-based baseline couldn't restore. In memory, not a persisted snapshot. */
let _baselineSettings: Settings | null = null;
let _flipTimer: ReturnType<typeof setTimeout> | null = null;
let _installed = false;

function currentContext(): { profiles: any[]; active: unknown } | null {
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
  return { profiles, active: s.activeProfileName };
}

function triggerToast(name: string): void {
  const msg = i18n.t('profile_trigger_toast', { name });
  notifyUser(i18n.t('plugin_name'), msg && msg !== 'profile_trigger_toast' ? msg : `Switched to profile: ${name}`, 'profile');
}

// Key-order-independent serialization, so a restored/applied settings object
// that is semantically identical to the live one compares equal.
function stableStringify(o: unknown): string {
  return JSON.stringify(o, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v))
    ? Object.keys(v as any).sort().reduce((a: any, k) => { a[k] = (v as any)[k]; return a; }, {}) : v);
}

/* Persist + notify only when it is a REAL change. If applying/restoring would
   leave the settings identical (e.g. the pre-trigger baseline WAS the triggered
   profile), do nothing — no save, no toast. */
function saveIfChanged(next: Settings, onChanged: () => void): void {
  if (stableStringify(next) === stableStringify(getCurrentSettings())) return;
  void saveSettings(next);
  onChanged();
}

/* Apply the synthetic Default profile: reset config to defaults, keep the master
   toggle on, and keep shelves (a background trigger must never silently wipe the
   user's shelves — the destructive reset stays a manual, confirmed action). */
function applyFactory(): void {
  const s = getCurrentSettings() as any;
  if (!s) return;
  const next = { ...defaultSettings(), enabled: true, profiles: s.profiles ?? [], activeProfileName: FACTORY_PROFILE_NAME } as Settings;
  keepShelfFields(next, s);
  saveIfChanged(next, () => triggerToast(FACTORY_PROFILE_NAME));
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
    saveIfChanged({ ...(target.snapshot as any), profiles, activeProfileName: target.name } as Settings, () => triggerToast(name));
  }
}

function captureBaseline(): void {
  try { _baselineSettings = JSON.parse(JSON.stringify(getCurrentSettings())) as Settings; }
  catch { _baselineSettings = null; }
}

function revertToBaseline(deactivated: string): void {
  const baseline = _baselineSettings;
  _baselineSettings = null;
  if (!baseline) return;
  /* Restore the exact pre-trigger state, but keep the live profiles list so a
     profile saved during the trigger window isn't dropped. Only notifies when
     the restore is a real change (mirrors the activation toast, naming the
     profile that was just deactivated). */
  const live = getCurrentSettings() as any;
  saveIfChanged({ ...baseline, profiles: live?.profiles ?? (baseline as any).profiles } as Settings, () => {
    const msg = i18n.t('profile_trigger_deactivated', { name: deactivated });
    notifyUser(i18n.t('plugin_name'), (msg && msg !== 'profile_trigger_deactivated') ? msg : `Profile deactivated: ${deactivated}`, 'profile');
  });
}

function applyTransition(resolved: string | null, prevTriggered: string | null | undefined, active: unknown): void {
  if (resolved) {
    // Trigger became active: snapshot the user's baseline the first time we take
    // over (prevTriggered null/undefined = we weren't already triggered).
    if (prevTriggered == null) captureBaseline();
    if (resolved !== active) applyByName(resolved);
  } else if (typeof prevTriggered === "string") {
    // Trigger denied after having taken over: restore the pre-trigger state.
    revertToBaseline(prevTriggered);
  }
}

function applyTriggeredProfile(): void {
  const ctx = currentContext();
  if (!ctx) { _lastTriggered = undefined; _baselineSettings = null; return; }
  let resolved: string | null = null;
  try { resolved = resolveTriggeredProfile(ctx.profiles); } catch { return; }
  scheduleFlip(ctx.profiles); // re-arm the clock timer for time-based triggers
  if (resolved === _lastTriggered) return; // only act on a transition
  const prevTriggered = _lastTriggered;
  _lastTriggered = resolved;
  applyTransition(resolved, prevTriggered, ctx.active);
}

export function installProfileTriggers(): () => void {
  if (_installed) return () => {};
  _installed = true;
  const unSettings = subscribeSettings(() => applyTriggeredProfile());
  const unDevice = subscribeDeviceState(() => applyTriggeredProfile());
  const unSession = subscribeSessionState(() => applyTriggeredProfile());
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
    if (_flipTimer) { clearTimeout(_flipTimer); _flipTimer = null; }
  };
}
