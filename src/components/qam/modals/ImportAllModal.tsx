import { useEffect, useState } from "react";
import { DialogButton, TextField, openFilePicker } from "../../../runtime/host/decky";
import { notify } from "../../notify";
import type { SettingsController } from "../../../features/settings/controller";
import { textFromDeckyChange, tryPickerCalls, splitPath, joinPath } from "./modalUtils";
import { SelectItemsModal } from "./SelectItemsModal";
import {
  SETTINGS_CATEGORIES,
  detectCategoriesInPayload,
  mergeCategoriesIntoSettings,
  unwrapPayload,
} from "../../../features/settings/settingsCategories";
import { readJsonFile, saveSettings, getCurrentSettings } from "../../../settingsStore";

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
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Parse the picked file on every path change so the toggle list always
  // reflects what's available in the currently-selected file.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const raw = await readJsonFile(path);
        if (cancelled) return;
        if (!raw) { setPayload(null); setPresent(new Set()); return; }
        const parsed = JSON.parse(raw);
        setPayload(parsed);
        setPresent(detectCategoriesInPayload(parsed));
      } catch (e) {
        if (cancelled) return;
        setPayload(null);
        setPresent(new Set());
        setLoadError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [path]);

  const items = SETTINGS_CATEGORIES.map((c) => ({
    id: c.id,
    label: t(c.labelKey as any),
    defaultChecked: true,
    hidden: !present.has(c.id),
  }));

  const header = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 }}>
      <div>
        <div style={{ paddingBottom: 4 }}>{t("file_name")}</div>
        <TextField value={name} onChange={(value: unknown) => setName(textFromDeckyChange(value))} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, fontSize: 12, color: "var(--ds-text-dim, rgba(255,255,255,0.65))" }}>
          {loadError ? loadError : (payload ? folder : t("loading"))}
        </div>
        <DialogButton
          onClick={async () => {
            setBrowseBusy(true);
            try {
              const picked = await pickJsonFile(path);
              if (picked) { const s = splitPath(picked); setFolder(s.dir); setName(s.base); }
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
      title={t("import_settings")}
      items={items}
      confirmLabel={t("import_settings")}
      cancelLabel={t("cancel")}
      header={header}
      onConfirm={async (selectedIds) => {
        const cur = getCurrentSettings();
        if (!cur || !payload) {
          notify("error", { body: t("toast_failed_save") });
          return;
        }
        const next = mergeCategoriesIntoSettings(cur, unwrapPayload(payload), selectedIds);
        const ok = await saveSettings(next);
        notify(ok ? "import" : "error", { body: ok ? `${t("toast_imported")}: ${path}` : t("toast_failed_save") });
        if (ok) closeModal?.();
      }}
    />
  );
}
