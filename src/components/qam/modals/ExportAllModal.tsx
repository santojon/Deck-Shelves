import { useState } from "react";
import { DialogButton, TextField, openFilePicker } from "../../../runtime/host/decky";
import { notify } from "../../notify";
import type { SettingsController } from "../../../features/settings/controller";
import { textFromDeckyChange, filenameWithJson, tryPickerCalls } from "./modalUtils";
import { SelectItemsModal } from "./SelectItemsModal";
import {
  SETTINGS_CATEGORIES,
  pickCategoriesFromSettings,
} from "../../../features/settings/settingsCategories";
import { writeJsonFile, getCurrentSettings } from "../../../settingsStore";

async function pickFolder(startPath: string) {
  return await tryPickerCalls([
    async () => openFilePicker(1, startPath, false, true, undefined, undefined, false, false),
    async () => openFilePicker(1, startPath),
  ]);
}

export function ExportAllModal({ closeModal, controller, folderPath }: { closeModal?: () => void; controller: SettingsController; folderPath: string }) {
  const { t } = controller;
  const [name, setName] = useState("deck-shelves");
  const [folder, setFolder] = useState(folderPath);
  const [browseBusy, setBrowseBusy] = useState(false);

  const items = SETTINGS_CATEGORIES.map((c) => ({
    id: c.id,
    label: t(c.labelKey as any),
    defaultChecked: true,
  }));

  const header = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 }}>
      <div>
        <div style={{ paddingBottom: 4 }}>{t("file_name")}</div>
        <TextField value={name} onChange={(value: unknown) => setName(textFromDeckyChange(value))} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, fontSize: 12, color: "var(--ds-text-dim, rgba(255,255,255,0.65))" }}>{folder}</div>
        <DialogButton
          onClick={async () => {
            setBrowseBusy(true);
            try {
              const picked = await pickFolder(folder);
              if (picked) setFolder(picked);
            } catch (e) {
              notify("error", { body: String(e) });
            } finally { setBrowseBusy(false); }
          }}
        >{browseBusy ? t("loading") : t("browse")}</DialogButton>
      </div>
    </div>
  );

  return (
    <SelectItemsModal
      closeModal={closeModal}
      title={t("export_settings")}
      description={t("settings_export_pick_desc")}
      items={items}
      confirmLabel={t("save")}
      cancelLabel={t("cancel")}
      header={header}
      onConfirm={async (selectedIds) => {
        const s = getCurrentSettings();
        if (!s) return;
        const payload = pickCategoriesFromSettings(s, selectedIds);
        // Never write an empty export (no categories selected) — that produced
        // a `{ "state": {} }` file that looked broken to the user.
        if (Object.keys(payload).length === 0) {
          notify("error", { body: t("toast_failed_export") });
          return;
        }
        const target = `${folder}/${filenameWithJson(name)}`;
        const ok = await writeJsonFile(target, JSON.stringify({ state: payload }, null, 2));
        notify(ok ? "export" : "error", { body: ok ? t("toast_exported_file") : t("toast_failed_export") });
        if (ok) closeModal?.();
      }}
    />
  );
}
