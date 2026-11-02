import i18next from "i18next";
import { notify } from "../../components/notify";
import { confirmAction } from "../../components/qam/modals/ConfirmActionModal";
import { openSnapshotPicker } from "../../components/qam/modals/RestoreSnapshotModal";
import { isCloudSyncHeldForAccount } from "../../runtime/steamAccount";

// Explains the switch (settings belong to the device) and leads to the snapshots.
function openAccountSwitchDialog(): void {
  const body = i18next.t("account_switch_body");
  confirmAction({
    title: i18next.t("account_switch_title"),
    body: isCloudSyncHeldForAccount() ? `${body} ${i18next.t("account_switch_sync_paused")}` : body,
    okText: i18next.t("account_switch_view_snapshots"),
    cancelText: i18next.t("close"),
    onConfirm: () => openSnapshotPicker(),
  });
}

export function notifyAccountSwitch(): void {
  notify("warning", { body: i18next.t("account_switch_toast"), onClick: openAccountSwitchDialog });
}
