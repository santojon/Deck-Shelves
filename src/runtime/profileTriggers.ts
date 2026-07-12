import { getCurrentSettings, saveSettings, subscribeSettings } from '../store/settingsStore';
import { subscribeDeviceState } from './deviceState';
import { subscribeSessionState } from './sessionState';
import { resolveTriggeredProfile, nextProfileTriggerFlip } from '../steam/smartShelves';
import type { Settings } from '../types';

/* Profile auto-switch triggers, installed at boot so they run in the BACKGROUND
   on the home — not only while the QAM/settings controller is mounted (the old
   bug: the effect lived in useSettingsController, which unmounts when the panel
   closes, so triggers never fired on the home). Transition-based (applies only
   when the resolved profile changes, never loops), event/clock-driven, no polling. */

let _lastTriggered: string | null | undefined = undefined;
let _flipTimer: ReturnType<typeof setTimeout> | null = null;
let _installed = false;

function currentContext(): { profiles: any[]; active: unknown } | null {
  const s = getCurrentSettings() as any;
  if (!s || s.profileTriggersEnabled !== true) return null;
  const profiles = s.profiles;
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  return { profiles, active: s.activeProfileName };
}

function scheduleFlip(profiles: any[]): void {
  if (_flipTimer) { clearTimeout(_flipTimer); _flipTimer = null; }
  let next: number | null = null;
  try { next = nextProfileTriggerFlip(profiles); } catch { next = null; }
  if (next == null) return;
  _flipTimer = setTimeout(() => { _flipTimer = null; applyTriggeredProfile(); }, Math.max(1000, next - Date.now()));
}

function applyByName(profiles: any[], name: string): void {
  const target = profiles.find((p: any) => p && p.name === name);
  if (target && target.id && target.snapshot) {
    void saveSettings({ ...(target.snapshot as any), profiles, activeProfileName: target.name } as Settings);
  }
}

function applyTriggeredProfile(): void {
  const ctx = currentContext();
  if (!ctx) { _lastTriggered = undefined; return; }
  let resolved: string | null = null;
  try { resolved = resolveTriggeredProfile(ctx.profiles); } catch { return; }
  scheduleFlip(ctx.profiles); // re-arm the clock timer for time-based triggers
  if (resolved === _lastTriggered) return; // only act on a transition
  _lastTriggered = resolved;
  if (resolved && resolved !== ctx.active) applyByName(ctx.profiles, resolved);
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
    try { unSettings(); } catch {}
    try { unDevice(); } catch {}
    try { unSession(); } catch {}
    if (_flipTimer) { clearTimeout(_flipTimer); _flipTimer = null; }
  };
}
