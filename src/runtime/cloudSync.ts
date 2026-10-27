/* Cross-device settings sync via `SteamClient.RoamingStorage` — the same
   per-account cloud mechanism Steam's own UI uses, NOT real Steam Cloud
   (`ISteamRemoteStorage` is per-appid; a plugin has no appid of its own).
   Local storage stays the source of truth; this is a third mirror, same
   LWW-by-timestamp idea the dual-host canonical/loader mirror uses. */

import { getCurrentSettings, saveSettings, subscribeSettings } from "../store/settingsStore";
import { mergeSettings, LOCAL_ONLY_FIELDS } from "../domain/settingsMerge";
import { takeSnapshot } from "../features/settings/controller/profiles";
import { isHomeOwner } from "./host/ownerGuard";
import { notifyUser } from "./notify";
import { qaOverrideActive } from "../qa/harness";
import { accountReady, isCloudSyncHeldForAccount, markCloudSyncedAccount, onCloudSyncResumed } from "./steamAccount";
import i18n from "../i18n";
import type { Settings } from "../types";

/* v2 stores the snapshot as an OPAQUE JSON STRING via SetString/GetString. The
   old SetObject/GetJSON path (v1) round-trips through Steam's object serializer,
   which PascalCases `enabled`→`Enabled` and `hidden`→`Hidden` — so an adopted
   shelf lost its lowercase `enabled` and rendered invisible, and the master
   toggle silently read as disabled. A string is stored verbatim. */
const CLOUD_KEY = "deck-shelves-settings-sync-v2";
const PUSH_DEBOUNCE_MS = 4000;
// Best-effort in-session refresh: RoamingStorage may only surface the other
// device's snapshot on a Steam lifecycle event, so a running device polls the
// cloud periodically and merges anything new in without waiting for a restart.
const PULL_INTERVAL_MS = 3 * 60 * 1000;

// Fields describing THIS machine's own state never leave it: the merge's own
// list (sync bookkeeping, the idle-timeout backup, the active profile, the tour
// flag and the device-local developer fields).

type CloudPayload = { updatedAt: number; settings: Record<string, unknown> };
/* The pusher's active profile rides along as information only (never adopted as
   the local active name): each device activates its own profile, so a receiver
   needs it to tell whether the scalar settings on the wire describe the profile
   it runs itself. */
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

/* Drop null/undefined fields before serializing. Harmless with SetString (JSON
   handles null), but it keeps the payload minimal and matches what round-trips —
   a null-valued field carries no cross-device meaning. */
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

function remoteOf(cloud: CloudPayload | null): Remote {
  // A copy an older QA build pushed holds fixture data: never merged, and the next push replaces it.
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

// Store the snapshot as an opaque JSON string (SetString) so Steam's object
// serializer never rewrites the keys; verify with a round-trip read.
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

/* A bare fire-and-forget saveSettings() here can silently lose the patch
   to a concurrent save built from a slightly older snapshot (the exact
   race screensaverInject.ts's own patchSettingsVerified already avoids
   for the same reason) — rebuild against the latest snapshot and verify
   on every retry rather than trusting a single save call. */
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

// Bookkeeping every save rewrites; never a value worth folding into a profile.
const SYNC_CLOCKS = new Set(["preferencesUpdatedAt", "syncTombstones"]);

// Top-level keys of `after` whose value differs from `before`, clocks aside.
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (!SYNC_CLOCKS.has(k) && JSON.stringify(after[k]) !== JSON.stringify(before[k])) out[k] = after[k];
  }
  return out;
}

/* While a profile is active the device keeps syncing. What a sync pass adopts
   is also written into that profile's saved snapshot, so the trigger's next
   re-apply keeps the adopted values instead of rolling them back; the active
   name itself stays device-local (LOCAL_ONLY_FIELDS). The synthetic Default
   profile has no saved snapshot, so nothing is folded for it. */
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

/* Profiles (settings + triggers) sync as entities and each device activates its
   own, so the scalar settings on the wire are the pusher's live look: adopt them
   (and fold them into the active profile) only between devices running the same
   profile, or none. Otherwise keep this device's look, merge the lists, and hand
   the other device's look back under its own profile name. */
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
  // A QA build runs on fixture data: it never reads or writes the account's cloud copy.
  if (qaOverrideActive) return () => {};
  let disposed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastKnownJson: string | null = null;
  let wasEnabled = false;
  let unsub: (() => void) | null = null;

  /* One sync pass: merge the local snapshot with the cloud copy per-entity
     (settingsMerge), adopt the result locally if it changed, and push the merge
     back so the cloud converges too. Runs at boot, on every debounced local
     change, and on the periodic pull. Never a whole-doc overwrite — a device's
     unique shelves survive and deletions propagate via tombstones. */
  /* A snapshot with no shelves AND no smart shelves is almost always the
     transient cold-boot default, not a real "user deleted everything" state.
     Never push it (it would poison the cloud) and never adopt a merge that came
     out empty (it would wipe a healthy device). An empty device still READS the
     cloud: that is how a fresh or wiped machine adopts the other devices' shelves. */
  function isReal(s: Settings): boolean {
    return ((s as any).shelves?.length ?? 0) > 0 || ((s as any).smartShelves?.length ?? 0) > 0;
  }

  // The cloud copy belongs to the signed-in account: after an account switch it waits for the user.
  function canSync(): boolean {
    return !disposed && isHomeOwner() && hasCloudSyncSupport() && !isCloudSyncHeldForAccount();
  }

  // The cloud's own stamp when it already holds what we would publish, else the stamp of our write.
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
      notifyUser(i18n.t("plugin_name"), i18n.t("cloud_sync_applied"), "import", "cloudSync");
    }
    const at = await publish(plan.toPublish, plan.publishActive, cloud, remote);
    if (!at) return;
    lastKnownJson = mergedPayload;
    markCloudSyncedAccount();
    // "Last synced" moves on a write and on an adoption; a pull that changed nothing leaves it.
    if (adopted || at !== cloud?.updatedAt) {
      await patchSettingsVerified({ cloudSyncLastSyncedAt: at }, (s) => (s as any).cloudSyncLastSyncedAt === at);
    }
  }

  function schedulePush(s: Settings): void {
    if (disposed || !hasCloudSyncSupport() || !isHomeOwner()) return;
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
