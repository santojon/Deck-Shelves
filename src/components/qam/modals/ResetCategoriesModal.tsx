import { toaster } from "../../../runtime/host/decky";
import { notify } from "../../notify";
import type { SettingsController } from "../../../features/settings/controller";
import { SelectItemsModal } from "./SelectItemsModal";
import {
  SETTINGS_CATEGORIES,
  resetCategoriesInSettings,
} from "../../../features/settings/settingsCategories";
import { saveSettings, getCurrentSettings } from "../../../settingsStore";
import { defaultSettings } from "../../../domain/defaults";
import { resetMountFailed } from "../../../runtime/homePatch";

export function ResetCategoriesModal({ closeModal, controller }: { closeModal?: () => void; controller: SettingsController }) {
  const { t } = controller;

  const items = SETTINGS_CATEGORIES.map((c) => ({
    id: c.id,
    label: t(c.labelKey as any),
    defaultChecked: true,
  }));

  return (
    <SelectItemsModal
      closeModal={closeModal}
      title={t("reset_all_confirm_title")}
      description={t("settings_reset_pick_desc")}
      items={items}
      confirmLabel={t("reset_all_confirm_ok")}
      cancelLabel={t("cancel")}
      destructive
      onConfirm={async (selectedIds) => {
        const cur = getCurrentSettings();
        if (!cur) return;
        const next = resetCategoriesInSettings(cur, selectedIds, defaultSettings());
        const ok = await saveSettings(next);
        if (ok) {
          try { resetMountFailed(); } catch {}
          notify("reset", { body: t("toast_settings_reset") });
          closeModal?.();
        }
      }}
    />
  );
}
