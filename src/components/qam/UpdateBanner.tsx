import { useEffect, useState } from "react";
import { DialogButton, Focusable } from "@decky/ui";
import type { SettingsController } from "../../features/settings/controller";
import { checkForUpdate, type UpdateCheckResult } from "../../core/updateNotifier";
import { logInfo } from "../../runtime/logger";

/**
 * Update banner — renders inside the QAM Deck Shelves panel above the shelf
 * list when a newer GitHub release is available AND the user has not
 * dismissed it for that specific version. Hidden when the toggle is off.
 *
 * Probe is a single demand call to `checkForUpdate()` per QAM open. The
 * notifier owns its 24h cache so back-to-back QAM opens reuse the result.
 */
export function UpdateBanner({ controller }: { controller: SettingsController }) {
  const { t, settings, actions } = controller;
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  const enabled = settings?.updateNotifyEnabled ?? true;
  const dismissed = settings?.updateNotifyDismissedVersion;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    checkForUpdate().then((r) => { if (!cancelled) setResult(r); }).catch((e) => logInfo("UPDATE", "banner check failed", String(e)));
    return () => { cancelled = true; };
  }, [enabled]);

  if (!enabled) return null;
  if (!result?.hasUpdate || !result.latestVersion) return null;
  if (dismissed && dismissed === result.latestVersion) return null;

  const open = () => {
    if (!result.releaseUrl) return;
    try {
      const sc: any = (globalThis as any).SteamClient;
      if (typeof sc?.System?.OpenInSystemBrowser === "function") sc.System.OpenInSystemBrowser(result.releaseUrl);
      else (globalThis as any).window?.open?.(result.releaseUrl, "_blank");
    } catch (e) { logInfo("UPDATE", "open release failed", String(e)); }
  };
  const dismiss = () => { if (result.latestVersion) actions.dismissUpdateNotice(result.latestVersion); };

  return (
    <div
      data-ds-update-banner="1"
      style={{
        margin: "6px 8px 10px",
        padding: "8px 10px",
        boxSizing: "border-box",
        borderRadius: 6,
        background: "rgba(74, 144, 226, 0.12)",
        border: "1px solid rgba(74, 144, 226, 0.5)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.92 }}>
        {t("update_available", { version: result.latestVersion })}
      </div>
      <Focusable style={{ display: "flex", gap: 6 }} flow-children="horizontal">
        <DialogButton
          onClick={open}
          style={{ flex: 1, padding: "4px 8px", fontSize: 12, minWidth: 0 }}
        >
          {t("view_release")}
        </DialogButton>
        <DialogButton
          onClick={dismiss}
          style={{ flex: 1, padding: "4px 8px", fontSize: 12, minWidth: 0 }}
        >
          {t("dismiss")}
        </DialogButton>
      </Focusable>
    </div>
  );
}
