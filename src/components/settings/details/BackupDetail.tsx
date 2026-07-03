import { DialogButton, Focusable } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { openManagedModal } from "../../qam/common/openManagedModal";
import { ExportModal } from "../../qam/modals/ExportModal";
import { ImportModal } from "../../qam/modals/ImportModal";
import { ExportAllModal } from "../../qam/modals/ExportAllModal";
import { ImportAllModal } from "../../qam/modals/ImportAllModal";
import { getUserDownloadsDir, joinDownloads } from "../../../core/userPaths";
import { SettingsSection } from "../../ui/SettingsSection";
import { DownloadIcon, UploadIcon } from "../../icons";
import { BTN_COMPACT_STYLE } from "../../ui/buttonStyles";
import { getExternalExportHandlers, getExternalImportHandlers } from "../../../core/pluginApi";


export interface BackupDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

export function BackupDetail({ controller, t }: BackupDetailProps) {
  const exportFor = (scope: "shelves" | "smart" | "all") => () => {
    openManagedModal((close) => (
      <ExportModal closeModal={close} controller={controller} folderPath={getUserDownloadsDir()} scope={scope} />
    ));
  };
  const importFor = (scope: "shelves" | "smart" | "all", filename: string) => () => {
    openManagedModal((close) => (
      <ImportModal closeModal={close} controller={controller} initialPath={joinDownloads(filename)} scope={scope} />
    ));
  };
  const exportCustom = () => openManagedModal((close) => (
    <ExportAllModal closeModal={close} controller={controller} folderPath={getUserDownloadsDir()} />
  ));
  const importCustom = () => openManagedModal((close) => (
    <ImportAllModal closeModal={close} controller={controller} initialPath={joinDownloads("deck-shelves.json")} />
  ));
  // Third-party export / import formats registered through the Plugin API.
  const exportHandlers = getExternalExportHandlers();
  const importHandlers = getExternalImportHandlers();
  const exportViaHandler = (id: string, label: string, ext?: string) => () => openManagedModal((close) => (
    <ExportModal closeModal={close} controller={controller} folderPath={getUserDownloadsDir()} handlerId={id} handlerLabel={label} fileExt={ext} />
  ));
  const importViaHandler = (id: string, label: string, ext?: string) => () => openManagedModal((close) => (
    <ImportModal closeModal={close} controller={controller} initialPath={joinDownloads(`deck-shelves.${ext || "json"}`)} handlerId={id} handlerLabel={label} />
  ));

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 11, opacity: 0.55, padding: "0 4px 8px" }}>
        {t("settings_backup_path_hint").replace("{{path}}", getUserDownloadsDir())}
      </div>
      <BackupGroup
        title={t("settings_backup_shelves_title")}
        description={t("settings_backup_shelves_desc")}
        exportLabel={t("settings_backup_export")}
        importLabel={t("settings_backup_import")}
        onExport={exportFor("shelves")}
        onImport={importFor("shelves", "deck-shelves-shelves.json")}
      />
      <BackupGroup
        title={t("settings_backup_smart_title")}
        description={t("settings_backup_smart_desc")}
        exportLabel={t("settings_backup_export")}
        importLabel={t("settings_backup_import")}
        onExport={exportFor("smart")}
        onImport={importFor("smart", "deck-shelves-smart-shelves.json")}
      />
      <BackupGroup
        title={t("settings_backup_all_title")}
        description={t("settings_backup_all_desc")}
        exportLabel={t("settings_backup_export")}
        importLabel={t("settings_backup_import")}
        onExport={exportFor("all")}
        onImport={importFor("all", "deck-shelves.json")}
      />
      <BackupGroup
        title={t("settings_backup_custom_title")}
        description={t("settings_backup_custom_desc")}
        exportLabel={t("settings_backup_export")}
        importLabel={t("settings_backup_import")}
        onExport={exportCustom}
        onImport={importCustom}
      />
      {exportHandlers.map((h) => (
        <BackupGroup
          key={`exp-${h.id}`}
          title={h.displayName}
          description={`.${h.fileExtension || "json"}`}
          exportLabel={t("settings_backup_export")}
          importLabel={t("settings_backup_import")}
          onExport={exportViaHandler(h.id, h.displayName, h.fileExtension)}
        />
      ))}
      {importHandlers.map((h) => (
        <BackupGroup
          key={`imp-${h.id}`}
          title={h.displayName}
          description={`.${h.fileExtension || "json"}`}
          exportLabel={t("settings_backup_export")}
          importLabel={t("settings_backup_import")}
          onImport={importViaHandler(h.id, h.displayName, h.fileExtension)}
        />
      ))}
    </Focusable>
  );
}

function BackupGroup({
  title, description, exportLabel, importLabel, onExport, onImport,
}: {
  title: string;
  description: string;
  exportLabel: string;
  importLabel: string;
  onExport?: () => void;
  onImport?: () => void;
}) {
  return (
    <SettingsSection
      title={title}
      description={description}
      trailing={
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
          {onExport && (
            <DialogButton onClick={onExport} onOKButton={onExport} style={BTN_COMPACT_STYLE}>
              <UploadIcon size={12} />
              <span>{exportLabel}</span>
            </DialogButton>
          )}
          {onImport && (
            <DialogButton onClick={onImport} onOKButton={onImport} style={BTN_COMPACT_STYLE}>
              <DownloadIcon size={12} />
              <span>{importLabel}</span>
            </DialogButton>
          )}
        </Focusable>
      }
    >
      {null}
    </SettingsSection>
  );
}
