import { useMemo, useState } from "react";
import { DialogButton, TextField, openFilePicker } from "../../../runtime/host/decky";
import { notify } from "../../notify";
import type { SettingsController } from "../../../features/settings/controller";
import { textFromDeckyChange, tryPickerCalls, splitPath, joinPath } from "./modalUtils";
import { SelectItemsModal } from "./SelectItemsModal";
import {
  SETTINGS_CATEGORIES,
  detectCategoriesInPayload,
  mergeCategoriesIntoSettings,
} from "../../../features/settings/settingsCategories";
import { saveSettings, getCurrentSettings, migrate, createPreImportSnapshot } from "../../../settingsStore";
import { ImportFileStatus, useImportRead } from "./ImportFileStatus";
import type { ImportRead } from "../../../features/settings/importFile";

// Why an import of everything cannot run: no file, not an export, or nothing in it (never "failed to save").
function importAllProblem(read: ImportRead | null): string {
  if (read?.kind === "empty") return "import_error_empty_all";
  return read?.kind === "invalid" ? "import_error_invalid" : "import_error_not_found";
}

async function pickJsonFile(startPath: string) {
  return await tryPickerCalls([
    async () => openFilePicker(0, startPath, true, true, undefined, ["json"], false, false),
    async () => openFilePicker(0, startPath),
  ]);
}

export function ImportAllModal({ closeModal, controller, initialPath }: { closeModal?: () => void; controller: SettingsController; initialPath: string }) {
  const { t } = controller;
  const init = splitPath(initialPath);
  const [folder, setFolder] = useState(init.dir);
  const [name, setName] = useState(init.base);
  const path = joinPath(folder, name);
  const [browseBusy, setBrowseBusy] = useState(false);
  // The picked file, checked on every path change so the toggle list always
  // reflects what's available in it (and the header says why when nothing is).
  const read = useImportRead(path, "all");
  const payload = read?.kind === "ok" ? read.payload : null;
  const present = useMemo(() => (payload ? detectCategoriesInPayload(payload) : new Set<string>()), [payload]);
  const browse = async () => {
    setBrowseBusy(true);
    try {
      const picked = await pickJsonFile(path);
      if (picked) { const s = splitPath(picked); setFolder(s.dir); setName(s.base); }
    } catch (e) {
      notify("error", { body: String(e) });
    } finally { setBrowseBusy(false); }
  };

  const items = SETTINGS_CATEGORIES.map((c) => ({
    id: c.id,
    label: t(c.labelKey as any),
    defaultChecked: true,
    hidden: !present.has(c.id),
  }));

  const header = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
      {/* Picking the file comes first: the name below is only a suggestion. */}
      <DialogButton autoFocus onClick={browse} onOKButton={browse}>{browseBusy ? t("loading") : t("import_choose_file" as any)}</DialogButton>
      <div>
        <div style={{ paddingBottom: 4 }}>{t("file_name")}</div>
        <TextField value={name} onChange={(value: unknown) => setName(textFromDeckyChange(value))} />
      </div>
      <ImportFileStatus path={path} read={read} t={t as any} />
    </div>
  );

  return (
    <SelectItemsModal
      closeModal={closeModal}
      title={t("import_settings")}
      items={items}
      confirmLabel={t("import_settings")}
      cancelLabel={t("cancel")}
      header={header}
      onConfirm={async (selectedIds) => {
        const cur = getCurrentSettings();
        if (!cur || !payload) {
          notify("error", { body: (t as any)(importAllProblem(read), { path }) });
          return;
        }
        // Safety net before the merge overwrites live settings — best-effort,
        // never blocks the import itself.
        await createPreImportSnapshot();
        const merged = mergeCategoriesIntoSettings(cur, payload, selectedIds);
        const next = migrate(merged);
        const ok = await saveSettings(next);
        notify(ok ? "import" : "error", { body: ok ? `${t("toast_imported")}: ${path}` : t("toast_failed_save") });
        if (ok) closeModal?.();
      }}
    />
  );
}
