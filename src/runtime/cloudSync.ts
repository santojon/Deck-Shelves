/* Cross-device settings sync via `SteamClient.RoamingStorage` — the same
   per-account cloud mechanism Steam's own UI uses, NOT real Steam Cloud
   (`ISteamRemoteStorage` is per-appid; a plugin has no appid of its own).
   Local storage stays the source of truth; this is a third mirror, same
   LWW-by-timestamp idea the dual-host canonical/loader mirror uses. */

import { getCurrentSettings, saveSettings, subscribeSettings } from "../store/settingsStore";
import { mergeSettings } from "../domain/settingsMerge";
import { isHomeOwner } from "./host/ownerGuard";
import { notifyUser } from "./notify";
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

/* Fields describing THIS machine's own local state, never synced: the
   cloud-sync bookkeeping fields themselves, and the screensaver's cached
   backup of this specific Deck's native idle-timeout value — meaningless,
   and actively wrong, if transplanted onto another device. */
const LOCAL_ONLY_FIELDS: readonly string[] = [
  "cloudSyncEnabled", "cloudSyncLastSyncedAt",
  "screensaverIdleBackupAcSec", "screensaverIdleBackupBatterySec",
];

type CloudPayload = { updatedAt: number; settings: Record<string, unknown> };

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

function preparePayload(settings: Settings): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(settings as any) };
  for (const key of LOCAL_ONLY_FIELDS) delete out[key];
  return stripNullish(out) as Record<string, unknown>;
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
async function writeCloud(settings: Settings): Promise<number | null> {
  const updatedAt = Date.now();
  try {
    const rs = (globalThis as any).SteamClient.RoamingStorage;
    await rs.SetString(CLOUD_KEY, JSON.stringify({ updatedAt, settings: preparePayload(settings) }));
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

export function installCloudSync(): () => void {
  let disposed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastKnownJson: string | null = null;
  let wasEnabled = false;
  let unsub: (() => void) | null = null;

  // Apply a merged snapshot locally WITHOUT re-stamping it — it already carries
  // the authoritative per-entity clocks from the merge (see settingsStore.saveSettings).
  async function applyMerged(merged: Settings): Promise<void> {
    await saveSettings(merged, { fromSync: true });
  }

  /* One sync pass: merge the local snapshot with the cloud copy per-entity
     (settingsMerge), adopt the result locally if it changed, and push the merge
     back so the cloud converges too. Runs at boot, on every debounced local
     change, and on the periodic pull. Never a whole-doc overwrite — a device's
     unique shelves survive and deletions propagate via tombstones. */
  /* A snapshot with no shelves AND no smart shelves is almost always the
     transient cold-boot default, not a real "user deleted everything" state.
     Never sync it — pushing it would poison the cloud, and adopting a merge
     that came out empty would wipe a healthy device. */
  function isReal(s: Settings): boolean {
    return ((s as any).shelves?.length ?? 0) > 0 || ((s as any).smartShelves?.length ?? 0) > 0;
  }

  function canSync(local: Settings): boolean {
    return !disposed && isHomeOwner() && hasCloudSyncSupport() && isReal(local);
  }

  async function syncOnce(local: Settings): Promise<void> {
    if (!canSync(local)) return;
    const cloud = await readCloud();
    const remote = cloud ? (cloud.settings as unknown as Settings) : null;
    const merged = remote ? mergeSettings(local, remote) : local;
    if (!isReal(merged)) return;
    const mergedPayload = JSON.stringify(preparePayload(merged));
    if (mergedPayload !== JSON.stringify(preparePayload(local))) {
      lastKnownJson = mergedPayload; // suppress the re-entrant push from applyMerged
      await applyMerged(merged);
      notifyUser(i18n.t("plugin_name"), i18n.t("cloud_sync_applied"), "import", "cloudSync");
    }
    // Cloud already holds the merged result → nothing to push.
    if (remote && mergedPayload === JSON.stringify(preparePayload(remote))) { lastKnownJson = mergedPayload; return; }
    const at = await writeCloud(merged);
    if (!at) return;
    lastKnownJson = mergedPayload;
    await patchSettingsVerified({ cloudSyncLastSyncedAt: at }, (s) => (s as any).cloudSyncLastSyncedAt === at);
  }

  function schedulePush(s: Settings): void {
    if (disposed || !hasCloudSyncSupport() || !isHomeOwner()) return;
    const json = JSON.stringify(preparePayload(s));
    if (json === lastKnownJson) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void syncOnce(getCurrentSettings() ?? s);
    }, PUSH_DEBOUNCE_MS);
  }

  function onSettingsChange(s: Settings): void {
    const enabled = isFeatureEnabled(s);
    if (enabled && !wasEnabled) {
      wasEnabled = true;
      void syncOnce(s);
      return;
    }
    wasEnabled = enabled;
    if (!enabled) return;
    schedulePush(s);
  }

  void (async () => {
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
    const s = getCurrentSettings();
    if (s && isFeatureEnabled(s)) void syncOnce(s);
  }, PULL_INTERVAL_MS);

  return () => {
    disposed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    clearInterval(pullTimer);
    unsub?.();
  };
}
