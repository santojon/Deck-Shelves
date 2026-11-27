import { call } from "../shims/host-api";
import { notifyUser } from "./notify";
import { openReleaseUrl, type UpdateCheckResult } from "../core/updateNotifier";
import i18n from "../i18n";
import { logInfo } from "./logger";

// The backend answers a missing, unsupported or mismatched digest with a `digest_` error.
async function runDownload(url: string, filename: string, sha256: string): Promise<{ path?: string; unverified?: boolean }> {
  try {
    const res = await call<[unknown], { ok?: boolean; path?: string; error?: string }>(
      "download_release", { url, filename, sha256 },
    );
    if (res?.ok && res.path) return { path: res.path };
    const error = String(res?.error ?? "unknown");
    logInfo("UPDATE", "download_release failed", error);
    return { unverified: error.startsWith("digest_") };
  } catch (e) {
    logInfo("UPDATE", "download_release threw", String(e));
  }
  return {};
}

async function downloadUpdate(result: UpdateCheckResult | null | undefined): Promise<void> {
  if (!result) return;
  const { assetUrl, assetName, assetDigest, releaseUrl, latestVersion } = result;
  if (!assetUrl || !assetName) { openReleaseUrl(releaseUrl); return; }
  // Fail closed: an update that can't be checked against the release digest is never offered.
  if (!assetDigest) { notifyUser(i18n.t("plugin_name"), i18n.t("update_verify_failed"), "error", "update"); return; }

  notifyUser(i18n.t("plugin_name"), i18n.t("update_downloading", { version: latestVersion ?? "" }), "update", "update");
  const { path, unverified } = await runDownload(assetUrl, assetName, assetDigest);
  if (path) {
    notifyUser(i18n.t("plugin_name"), i18n.t("update_downloaded", { path }), "success", "update");
    return;
  }
  if (unverified) {
    notifyUser(i18n.t("plugin_name"), i18n.t("update_verify_failed"), "error", "update");
    return;
  }
  notifyUser(i18n.t("plugin_name"), i18n.t("update_download_failed"), "error", "update");
  openReleaseUrl(releaseUrl);
}

export async function installOrDownloadUpdate(result: UpdateCheckResult | null | undefined): Promise<void> {
  await downloadUpdate(result);
}
