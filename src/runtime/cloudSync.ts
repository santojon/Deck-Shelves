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

function stripLocalOnly(settings: Settings): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(settings as any) };
  for (const key of LOCAL_ONLY_FIELDS) delete out[key];
  return out;
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

async function writeCloud(settings: Settings): Promise<number | null> {
  const updatedAt = Date.now();
  try {
    await (globalThis as any).SteamClient.RoamingStorage.SetObject(CLOUD_KEY, { updatedAt, settings: stripLocalOnly(settings) });
    return updatedAt;
  } catch { return null; }
}

function patchSyncMark(updatedAt: number): void {
  const s = getCurrentSettings();
  if (!s) return;
  void saveSettings({ ...s, cloudSyncLastSyncedAt: updatedAt } as any);
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
      const merged = { ...local, ...cloud.settings, cloudSyncLastSyncedAt: cloud.updatedAt } as Settings;
      lastKnownJson = JSON.stringify(stripLocalOnly(merged));
      await saveSettings(merged);
      notifyUser(i18n.t("plugin_name"), i18n.t("cloud_sync_applied"), "import", "cloudSync");
      return;
    }
    const at = await writeCloud(local);
    if (at) { lastKnownJson = JSON.stringify(stripLocalOnly(local)); patchSyncMark(at); }
  }

  function schedulePush(s: Settings): void {
    if (disposed || !hasCloudSyncSupport() || !isHomeOwner()) return;
    const json = JSON.stringify(stripLocalOnly(s));
    if (json === lastKnownJson) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void writeCloud(s).then((at) => { if (at) { lastKnownJson = json; patchSyncMark(at); } });
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
