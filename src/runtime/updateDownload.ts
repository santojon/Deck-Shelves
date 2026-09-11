import { createElement } from "react";
import { call } from "../shims/host-api";
import { notifyUser } from "./notify";
import { openReleaseUrl, type UpdateCheckResult } from "../core/updateNotifier";
import i18n from "../i18n";
import { logInfo } from "./logger";
import { getHostApi } from "../index";
import { openManagedModal } from "../components/qam/common/openManagedModal";
import { UpdateInstallingModal } from "../components/update/UpdateInstallingModal";

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

/* Host-parametric install: a self-install host (a neutral host) obtains the
   release and swaps it in directly; a host without that surface (Decky) has
   no mechanism beyond handing the user a file, so this always falls back to
   the manual download above. Best-effort — never throws. */

/** Whether the resolved host can self-install updates — drives the button
    label ("Install" vs "Download"). False before boot or on any host without
    the optional `updates` surface. */
export function canSelfInstallUpdate(): boolean {
  try { return !!getHostApi().updates?.canSelfInstall?.(); } catch { return false; }
}

async function runInstall(result: UpdateCheckResult): Promise<boolean> {
  try {
    await getHostApi().updates!.applyUpdate({
      version: result.latestVersion ?? "",
      assetUrl: result.assetUrl ?? undefined,
      assetName: result.assetName ?? undefined,
    });
    return true;
  } catch (e) {
    logInfo("UPDATE", "applyUpdate threw", String(e));
    return false;
  }
}

export async function installOrDownloadUpdate(result: UpdateCheckResult | null | undefined): Promise<void> {
  if (!result) return;
  if (!canSelfInstallUpdate()) { await downloadUpdate(result); return; }

  const { latestVersion } = result;
  // A blocking spinner modal makes the download+swap+reload step explicit (self-
  // install ends by reloading the renderer — the reload closes this modal). The
  // toast stays as a fallback if the reload is slow.
  const closeModal = openManagedModal((close) =>
    createElement(UpdateInstallingModal, { version: latestVersion ?? undefined, closeModal: close }),
  );
  notifyUser(i18n.t("plugin_name"), i18n.t("update_installing", { version: latestVersion ?? "" }), "update", "update");
  if (await runInstall(result)) {
    notifyUser(i18n.t("plugin_name"), i18n.t("update_installed", { version: latestVersion ?? "" }), "success", "update");
    return;
  }
  try { closeModal(); } catch {}
  notifyUser(i18n.t("plugin_name"), i18n.t("update_install_failed"), "error", "update");
  await downloadUpdate(result);
}
