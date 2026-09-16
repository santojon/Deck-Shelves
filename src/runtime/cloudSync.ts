/* Cross-device settings sync via `SteamClient.RoamingStorage` — the same
   per-account cloud mechanism Steam's own UI uses, NOT real Steam Cloud
   (`ISteamRemoteStorage` is per-appid; a plugin has no appid of its own).
   Local storage stays the source of truth; this is a third mirror, same
   LWW-by-timestamp idea the dual-host canonical/loader mirror uses. */

import { getCurrentSettings, saveSettings, subscribeSettings } from "../store/settingsStore";
import { isHomeOwner } from "./host/ownerGuard";
import { notifyUser } from "./notify";
import i18n from "../i18n";
import type { Settings } from "../types";

const CLOUD_KEY = "deck-shelves-settings-sync-v1";
const PUSH_DEBOUNCE_MS = 4000;

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
    return typeof rs?.SetObject === "function" && typeof rs?.GetJSON === "function";
  } catch { return false; }
}

/* `SetObject` silently no-ops (resolves, but the next `GetJSON` throws
   "Not found") on any payload containing `null`/`undefined` anywhere, at
   any depth — confirmed live, and every real settings snapshot has some
   (e.g. screensaverIdleBackupAcSec). Dropping those keys is the only way
   to make the payload storable; a null-valued field just doesn't sync. */
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
    const raw = await (globalThis as any).SteamClient.RoamingStorage.GetJSON(CLOUD_KEY);
    if (typeof raw !== "string" || !raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.updatedAt !== "number" || typeof parsed.settings !== "object") return null;
    return parsed as CloudPayload;
  } catch { return null; }
}

// Never trust a write without a round-trip check — SetObject's own promise
// resolving proves nothing (see stripNullish's own doc comment above).
async function writeCloud(settings: Settings): Promise<number | null> {
  const updatedAt = Date.now();
  try {
    const rs = (globalThis as any).SteamClient.RoamingStorage;
    await rs.SetObject(CLOUD_KEY, { updatedAt, settings: preparePayload(settings) });
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

  /* Runs once at boot (if already enabled) and again on every off→on
     transition — never on a bare re-render — so turning the toggle on
     mid-session always reconciles against the cloud before pushing,
     instead of blindly overwriting a possibly-newer remote copy. */
  async function reconcile(local: Settings): Promise<void> {
    if (!isHomeOwner() || !hasCloudSyncSupport()) return;
    const cloud = await readCloud();
    const lastKnownAt = (local as any).cloudSyncLastSyncedAt ?? 0;
    if (cloud && cloud.updatedAt > lastKnownAt) {
      const patch = { ...cloud.settings, cloudSyncLastSyncedAt: cloud.updatedAt };
      const ok = await patchSettingsVerified(patch, (s) => (s as any).cloudSyncLastSyncedAt === cloud.updatedAt);
      if (!ok) return;
      lastKnownJson = JSON.stringify(preparePayload(getCurrentSettings() as Settings));
      notifyUser(i18n.t("plugin_name"), i18n.t("cloud_sync_applied"), "import", "cloudSync");
      return;
    }
    const at = await writeCloud(local);
    if (!at) return;
    lastKnownJson = JSON.stringify(preparePayload(local));
    await patchSettingsVerified({ cloudSyncLastSyncedAt: at }, (s) => (s as any).cloudSyncLastSyncedAt === at);
  }

  function schedulePush(s: Settings): void {
    if (disposed || !hasCloudSyncSupport() || !isHomeOwner()) return;
    const json = JSON.stringify(preparePayload(s));
    if (json === lastKnownJson) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void writeCloud(s).then(async (at) => {
        if (!at) return;
        lastKnownJson = json;
        await patchSettingsVerified({ cloudSyncLastSyncedAt: at }, (s2) => (s2 as any).cloudSyncLastSyncedAt === at);
      });
    }, PUSH_DEBOUNCE_MS);
  }

  function onSettingsChange(s: Settings): void {
    const enabled = isFeatureEnabled(s);
    if (enabled && !wasEnabled) {
      wasEnabled = true;
      void reconcile(s);
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
      await reconcile(local);
    }
    if (disposed) return;
    unsub = subscribeSettings(onSettingsChange);
  })();

  return () => {
    disposed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    unsub?.();
  };
}
