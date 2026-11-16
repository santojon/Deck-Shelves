import { createElement } from "react";
import { call } from "../shims/host-api";
import { notifyUser } from "./notify";
import { openReleaseUrl, type UpdateCheckResult } from "../core/updateNotifier";
import i18n from "../i18n";
import { logInfo } from "./logger";
import { getHostApi } from "../index";
import { openManagedModal } from "../components/qam/common/openManagedModal";
import { UpdateInstallingModal } from "../components/update/UpdateInstallingModal";

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

async function downloadUpdate(result: UpdateCheckResult | null | undefined): Promise<void> {
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

export function canSelfInstallUpdate(): boolean {
  try { return !!getHostApi().updates?.canSelfInstall?.(); } catch { return false; }
}

type InstallOutcome = "installed" | "busy" | "failed";

async function runInstall(result: UpdateCheckResult): Promise<InstallOutcome> {
  try {
    await getHostApi().updates!.applyUpdate({
      version: result.latestVersion ?? "",
      assetUrl: result.assetUrl ?? undefined,
      assetName: result.assetName ?? undefined,
    });
    return "installed";
  } catch (e) {
    logInfo("UPDATE", "applyUpdate threw", String(e));
    // A `busy: ` rejection means the host can't take the install right now, not that it failed.
    return /(?:^|:\s)busy: /.test(String(e)) ? "busy" : "failed";
  }
}

export async function installOrDownloadUpdate(result: UpdateCheckResult | null | undefined): Promise<void> {
  if (!result) return;
  if (!canSelfInstallUpdate()) { await downloadUpdate(result); return; }

  const { latestVersion } = result;
  // The host swaps the bundle in place without a reload, so close the modal on either outcome.
  const closeModal = openManagedModal((close) =>
    createElement(UpdateInstallingModal, { version: latestVersion ?? undefined, closeModal: close }),
  );
  notifyUser(i18n.t("plugin_name"), i18n.t("update_installing", { version: latestVersion ?? "" }), "update", "update");
  const outcome = await runInstall(result);
  try { closeModal(); } catch {}
  if (outcome === "installed") {
    notifyUser(i18n.t("plugin_name"), i18n.t("update_installed", { version: latestVersion ?? "" }), "success", "update");
    return;
  }
  if (outcome === "busy") {
    notifyUser(i18n.t("plugin_name"), i18n.t("update_install_busy"), "update", "update");
    return;
  }
  notifyUser(i18n.t("plugin_name"), i18n.t("update_install_failed"), "error", "update");
  await downloadUpdate(result);
}
