import { useEffect, useState } from "react";
import { DialogButton } from "../../runtime/host/decky";
import { confirmAction } from "../../components/qam/modals/ConfirmActionModal";
import { isCloudSyncHeldForAccount, onCloudSyncResumed, resumeCloudSyncForAccount } from "../../runtime/steamAccount";

/* Under the cloud sync status: after a Steam account switch the sync waits until
   the user agrees to sync this device's settings with this account's cloud copy. */
export function CloudSyncAccountHold({ t, indent }: { t: (key: string) => string; indent: number }) {
  const [held, setHeld] = useState(isCloudSyncHeldForAccount);
  useEffect(() => onCloudSyncResumed(() => setHeld(false)), []);
  if (!held) return null;
  const ask = () => confirmAction({
    title: t("cloud_sync_account_title"),
    body: t("cloud_sync_account_question"),
    okText: t("cloud_sync_account_resume"),
    cancelText: t("cancel"),
    onConfirm: () => resumeCloudSyncForAccount(),
  });
  return (
    <div style={{ paddingLeft: indent, paddingRight: 8, paddingBottom: 6, fontSize: 11, lineHeight: 1.4 }}>
      <div style={{ opacity: 0.75, marginBottom: 6 }}>{t("cloud_sync_account_paused")}</div>
      <DialogButton onClick={ask} onOKButton={ask}>{t("cloud_sync_account_resume")}</DialogButton>
    </div>
  );
}
