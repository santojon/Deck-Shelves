import { call } from "../shims/decky-api";
import { notifyUser } from "./notify";
import { openReleaseUrl, type UpdateCheckResult } from "../core/updateNotifier";
import i18n from "../i18n";
import { logInfo } from "./logger";

/* Manual-update download: hand the release .zip URL to the backend, which saves
   it to ~/Downloads (per-OS equivalent) for the user to install by hand — there
   is no auto-install. Branded toasts report progress/result. When a release has
   no packaged .zip asset, fall back to opening the release page so the user can
   still grab it. Best-effort; never throws. */
/* Run the backend download RPC; returns the saved path, or null on any failure
   (logged). Kept separate so `downloadUpdate` stays simple. */
async function runDownload(url: string, filename: string): Promise<string | null> {
  try {
    const res = await call<[unknown], { ok?: boolean; path?: string; error?: string }>(
      "download_release", { url, filename },
    );
    if (res?.ok && res.path) return res.path;
    logInfo("UPDATE", "download_release failed", String(res?.error ?? "unknown"));
  } catch (e) {
    logInfo("UPDATE", "download_release threw", String(e));
  }
  return null;
}

export async function downloadUpdate(result: UpdateCheckResult | null | undefined): Promise<void> {
  if (!result) return;
  const { assetUrl, assetName, releaseUrl, latestVersion } = result;
  if (!assetUrl || !assetName) { openReleaseUrl(releaseUrl); return; }

  notifyUser(i18n.t("plugin_name"), i18n.t("update_downloading", { version: latestVersion ?? "" }), "update", "update");
  const path = await runDownload(assetUrl, assetName);
  if (path) {
    notifyUser(i18n.t("plugin_name"), i18n.t("update_downloaded", { path }), "success", "update");
    return;
  }
  notifyUser(i18n.t("plugin_name"), i18n.t("update_download_failed"), "error", "update");
  openReleaseUrl(releaseUrl);
}
