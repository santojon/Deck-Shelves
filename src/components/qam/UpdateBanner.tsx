import { useEffect, useRef, useState } from "react";
import { DialogButton, Focusable } from "../../runtime/host/decky";
import type { SettingsController } from "../../features/settings/controller";
import { checkForUpdate, __resetUpdateCheckCache, type UpdateCheckResult } from "../../core/updateNotifier";
import { installOrDownloadUpdate, canSelfInstallUpdate } from "../../runtime/updateDownload";
import { isOnline } from "../../core/connectivity";
import { logInfo } from "../../runtime/logger";
import { flowChildrenProps } from "../../core/steamOSVersion";

// Not inlined into the render ternary — keeps that decision out of
// UpdateBanner's own complexity count (see DeckQAMSettings's shouldRenderSidecar).
function updateActionKey(): "update_install" | "download_update" {
  return canSelfInstallUpdate() ? "update_install" : "download_update";
}

export function UpdateBanner({ controller }: { controller: SettingsController }) {
  const { t, settings, actions } = controller;
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  const enabled = settings?.updateNotifyEnabled ?? true;
  const dismissed = settings?.updateNotifyDismissedVersion;

  // Track the previous toggle value to detect a within-session OFF → ON flip;
  // on that edge, reset the stored update result before probing.
  /* Every mount checks once: `checkForUpdate` asks the release feed when
     online (sharing an in-flight request) and falls back to the stored
     result offline. The boot-time probe is `installUpdateProbes`
     (runtime/bootPhases.ts). */
  const prevEnabledRef = useRef<boolean>(enabled);
  useEffect(() => {
    if (!enabled) { prevEnabledRef.current = false; return; }
    // A self-install host already polls this same release feed and shows
    // its own update notice — skip the duplicate check (see bootPhases.ts).
    if (canSelfInstallUpdate()) return;
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
  const actionLabel = t(updateActionKey());

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
      <Focusable style={{ display: "flex", gap: 6 }} {...flowChildrenProps("horizontal")}>
        <DialogButton
          onClick={open}
          style={{ flex: 1, padding: "4px 8px", fontSize: 12, minWidth: 0 }}
        >
          {actionLabel}
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
