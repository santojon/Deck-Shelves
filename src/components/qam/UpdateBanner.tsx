import { useEffect, useRef, useState } from "react";
import { DialogButton, Focusable } from "../../runtime/host/decky";
import type { SettingsController } from "../../features/settings/controller";
import { checkForUpdate, __resetUpdateCheckCache, type UpdateCheckResult } from "../../core/updateNotifier";
import { installOrDownloadUpdate } from "../../runtime/updateDownload";
import { isOnline } from "../../core/connectivity";
import { logInfo } from "../../runtime/logger";

const BOX_STYLE = { margin: "8px 16px", padding: "12px 14px", background: "rgba(74,144,226,0.12)", border: "1px solid rgba(74,144,226,0.5)", borderRadius: 6 };
const TITLE_STYLE = { fontWeight: 700, fontSize: 14, marginBottom: 12 };
const UPDATE_BUTTON_STYLE = { flex: 1, minWidth: 0, padding: "10px 8px" };

export function UpdateBanner({ controller }: { controller: SettingsController }) {
  const { t, settings, actions } = controller;
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  const enabled = settings?.updateNotifyEnabled ?? true;
  const dismissed = settings?.updateNotifyDismissedVersion;

  const prevEnabledRef = useRef<boolean>(enabled);
  useEffect(() => {
    if (!enabled) { prevEnabledRef.current = false; return; }
    const wasOff = !prevEnabledRef.current;
    prevEnabledRef.current = true;
    let cancelled = false;
    void (async () => {
      if (wasOff) {
        try { if (await isOnline()) __resetUpdateCheckCache(); } catch {}
      }
      try {
        const r = await checkForUpdate();
        if (!cancelled) setResult(r);
      } catch (e) { logInfo("UPDATE", "banner check failed", String(e)); }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  if (!enabled) return null;
  if (!result?.hasUpdate || !result.latestVersion) return null;
  if (dismissed && dismissed === result.latestVersion) return null;

  const open = () => { void installOrDownloadUpdate(result); };
  const dismiss = () => { if (result.latestVersion) void actions.dismissUpdateNotice(result.latestVersion); };

  return (
    <div data-ds-update-banner="1" style={BOX_STYLE}>
      <div style={TITLE_STYLE}>{t("update_available", { version: result.latestVersion })}</div>
      <Focusable flow-children="row" style={{ display: "flex", gap: 8 }}>
        <DialogButton onClick={open} style={UPDATE_BUTTON_STYLE}>{t("download_update_short")}</DialogButton>
        <DialogButton onClick={dismiss} style={UPDATE_BUTTON_STYLE}>{t("dismiss")}</DialogButton>
      </Focusable>
    </div>
  );
}
