// Syncs through RoamingStorage because Steam Cloud is per-appid; local storage stays the source of truth.

import { getCurrentSettings, saveSettings, subscribeSettings } from "../store/settingsStore";
import { mergeSettings, LOCAL_ONLY_FIELDS } from "../domain/settingsMerge";
import { takeSnapshot } from "../features/settings/controller/profiles";
import { notifyUser } from "./notify";
import { qaOverrideActive } from "../qa/harness";
import { accountReady, isCloudSyncHeldForAccount, markCloudSyncedAccount, onCloudSyncResumed } from "./steamAccount";
import i18n from "../i18n";
import type { Settings } from "../types";

// Stored as a string: Steam's object serializer PascalCases keys like `enabled`.
const CLOUD_KEY = "deck-shelves-settings-sync-v2";
const PUSH_DEBOUNCE_MS = 4000;
// RoamingStorage may only surface another device's snapshot on a Steam lifecycle event, so poll.
const PULL_INTERVAL_MS = 3 * 60 * 1000;

type CloudPayload = { updatedAt: number; settings: Record<string, unknown> };
// Sent as information only; each device activates its own profile.
const ACTIVE_PROFILE_KEY = "syncActiveProfile";
type Remote = { settings: Settings; active: string | null } | null;

function activeNameOf(settings: Settings | null): string | null {
  const n = (settings as any)?.activeProfileName;
  return typeof n === "string" && n ? n : null;
}

function isFeatureEnabled(settings: Settings | null): boolean {
  return (settings as any)?.cloudSyncEnabled === true;
}

export function hasCloudSyncSupport(): boolean {
  try {
    const rs = (globalThis as any).SteamClient?.RoamingStorage;
    return typeof rs?.SetString === "function" && typeof rs?.GetString === "function";
  } catch { return false; }
}

function stripNullish(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullish);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined) continue;
      out[k] = stripNullish(v);
    }
    return out;
  }
  return value;
}

function preparePayload(settings: Settings, active: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(settings as any) };
  for (const key of LOCAL_ONLY_FIELDS) delete out[key];
  delete out[ACTIVE_PROFILE_KEY];
  const payload = stripNullish(out) as Record<string, unknown>;
  if (active) payload[ACTIVE_PROFILE_KEY] = active;
  return payload;
}

function payloadJson(settings: Settings, active: string | null): string {
  return JSON.stringify(preparePayload(settings, active));
}

const CLOCK_KEYS = new Set(["rev", "updatedAt", "preferencesUpdatedAt", "syncTombstones"]);

// False and empty values read the same as an absent field (the backend sanitizer drops them).
function isEmpty(v: unknown): boolean {
  if (v === false) return true;
  if (Array.isArray(v)) return v.every((x) => x === false);
  return !!v && typeof v === "object" && Object.keys(v).length === 0;
}

// Sorted keys, no clocks and no false or empty values: the same content always gives the same text.
function withoutClocks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutClocks);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[k];
    if (!CLOCK_KEYS.has(k) && !isEmpty(v)) out[k] = withoutClocks(v);
  }
  return out;
}

// Clocks and key order move on every merge; only a change the user can see is worth a toast.
function visibleChange(before: Settings, after: Settings, active: string | null): boolean {
  return JSON.stringify(withoutClocks(preparePayload(before, active))) !== JSON.stringify(withoutClocks(preparePayload(after, active)));
}

function remoteOf(cloud: CloudPayload | null): Remote {
  // A copy pushed by a QA build holds fixture data, so it is never merged.
  if (!cloud || (cloud.settings as any).__dsQaOverride === true) return null;
  const settings = { ...cloud.settings } as any;
  const active = typeof settings[ACTIVE_PROFILE_KEY] === "string" ? settings[ACTIVE_PROFILE_KEY] as string : null;
  delete settings[ACTIVE_PROFILE_KEY];
  return { settings: settings as Settings, active };
}

async function readCloud(): Promise<CloudPayload | null> {
  try {
    const raw = await (globalThis as any).SteamClient.RoamingStorage.GetString(CLOUD_KEY);
    if (typeof raw !== "string" || !raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.updatedAt !== "number" || typeof parsed.settings !== "object") return null;
    return parsed as CloudPayload;
  } catch { return null; }
}

async function writeCloud(settings: Settings, active: string | null): Promise<number | null> {
  const updatedAt = Date.now();
  try {
    const rs = (globalThis as any).SteamClient.RoamingStorage;
    await rs.SetString(CLOUD_KEY, JSON.stringify({ updatedAt, settings: preparePayload(settings, active) }));
    const confirmed = await readCloud();
    return confirmed?.updatedAt === updatedAt ? updatedAt : null;
  } catch { return null; }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A plain save can lose the patch to a concurrent save, so rebuild and verify on every retry.
async function patchSettingsVerified(
  patch: Record<string, unknown>, verify: (s: Settings) => boolean, attempts = 5,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const s = getCurrentSettings();
    if (!s) return false;
    await saveSettings({ ...s, ...patch } as Settings);
    await delay(200);
    const after = getCurrentSettings();
    if (after && verify(after)) return true;
  }
  return false;
}

const SYNC_CLOCKS = new Set(["preferencesUpdatedAt", "syncTombstones"]);

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (!SYNC_CLOCKS.has(k) && JSON.stringify(after[k]) !== JSON.stringify(before[k])) out[k] = after[k];
  }
  return out;
}

// Adopted values go into the active profile too, so its next re-apply doesn't roll them back.
function foldIntoActiveProfile(local: Settings, merged: Settings): Settings {
  const m = merged as any;
  const profiles: any[] = Array.isArray(m.profiles) ? m.profiles : [];
  const idx = profiles.findIndex((p) => p && p.name === m.activeProfileName);
  if (idx < 0) return merged;
  const adopted = changedFields(takeSnapshot(local), takeSnapshot(merged));
  if (Object.keys(adopted).length === 0) return merged;
  const next = [...profiles];
  next[idx] = { ...profiles[idx], snapshot: { ...profiles[idx].snapshot, ...adopted }, updatedAt: Date.now() };
  return { ...m, profiles: next } as Settings;
}

// Scalar settings are adopted only between devices running the same profile, or none.
type Plan = { merged: Settings; toPublish: Settings; publishActive: string | null; localActive: string | null };
function planSync(local: Settings, remote: Remote): Plan {
  const localActive = activeNameOf(local);
  if (!remote) return { merged: local, toPublish: local, publishActive: localActive, localActive };
  if (remote.active === localActive) {
    const merged = foldIntoActiveProfile(local, mergeSettings(local, remote.settings));
    return { merged, toPublish: merged, publishActive: localActive, localActive };
  }
  const merged = mergeSettings(local, remote.settings, { scalars: "keepLocal" });
  const toPublish = mergeSettings(remote.settings, merged, { scalars: "keepLocal" });
  return { merged, toPublish, publishActive: remote.active, localActive };
}

export function installCloudSync(): () => void {
  // QA builds never touch the account's cloud copy.
  if (qaOverrideActive) return () => {};
  let disposed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastKnownJson: string | null = null;
  let wasEnabled = false;
  let unsub: (() => void) | null = null;

  // Merges per entity, never a whole-document overwrite.
  // An empty snapshot is usually the cold-boot default: never push it or adopt an empty merge.
  function isReal(s: Settings): boolean {
    return ((s as any).shelves?.length ?? 0) > 0 || ((s as any).smartShelves?.length ?? 0) > 0;
  }

  function canSync(): boolean {
    return !disposed && hasCloudSyncSupport() && !isCloudSyncHeldForAccount();
  }

  async function publish(toPublish: Settings, active: string | null, cloud: CloudPayload | null, remote: Remote): Promise<number | null> {
    if (cloud && remote && payloadJson(toPublish, active) === payloadJson(remote.settings, remote.active)) return cloud.updatedAt;
    return writeCloud(toPublish, active);
  }

  async function syncOnce(local: Settings): Promise<void> {
    if (!canSync()) return;
    const cloud = await readCloud();
    const remote = remoteOf(cloud);
    const plan = planSync(local, remote);
    const merged = plan.merged;
    if (!isReal(merged)) return;
    const mergedPayload = payloadJson(merged, plan.localActive);
    const adopted = mergedPayload !== payloadJson(local, plan.localActive);
    if (adopted) {
      lastKnownJson = mergedPayload; // suppress the re-entrant push from the adopt save
      await saveSettings(merged, { fromSync: true });
      if (visibleChange(local, merged, plan.localActive)) notifyUser(i18n.t("plugin_name"), i18n.t("cloud_sync_applied"), "import", "cloudSync");
    }
    const at = await publish(plan.toPublish, plan.publishActive, cloud, remote);
    if (!at) return;
    lastKnownJson = mergedPayload;
    markCloudSyncedAccount();
    if (adopted || at !== cloud?.updatedAt) {
      await patchSettingsVerified({ cloudSyncLastSyncedAt: at }, (s) => (s as any).cloudSyncLastSyncedAt === at);
    }
  }

  function schedulePush(s: Settings): void {
    if (disposed || !hasCloudSyncSupport()) return;
    const json = payloadJson(s, activeNameOf(s));
    if (json === lastKnownJson) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void syncOnce(s);
    }, PUSH_DEBOUNCE_MS);
  }

  function onSettingsChange(live: Settings): void {
    const enabled = isFeatureEnabled(live);
    if (enabled && !wasEnabled) {
      wasEnabled = true;
      void syncOnce(live);
      return;
    }
    wasEnabled = enabled;
    if (!enabled) return;
    schedulePush(live);
  }

  const unResume = onCloudSyncResumed(() => {
    const live = getCurrentSettings();
    if (live && isFeatureEnabled(live)) void syncOnce(live);
  });

  void (async () => {
    await accountReady();
    if (disposed) return;
    const local = getCurrentSettings();
    if (local && isFeatureEnabled(local)) {
      wasEnabled = true;
      await syncOnce(local);
    }
    if (disposed) return;
    unsub = subscribeSettings(onSettingsChange);
  })();

  const pullTimer = setInterval(() => {
    if (disposed) return;
    const live = getCurrentSettings();
    if (live && isFeatureEnabled(live)) void syncOnce(live);
  }, PULL_INTERVAL_MS);

  return () => {
    disposed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    clearInterval(pullTimer);
    unResume();
    unsub?.();
  };
}
