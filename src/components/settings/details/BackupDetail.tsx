import React from "react";
import { DialogButton, Focusable } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { openManagedModal } from "../../qam/common/openManagedModal";
import { ExportModal } from "../../qam/modals/ExportModal";
import { ImportModal } from "../../qam/modals/ImportModal";
import { getUserDownloadsDir, joinDownloads } from "../../../core/userPaths";
import { DownloadIcon, UploadIcon } from "../../icons";

const ICON_BTN_STYLE: React.CSSProperties = {
  minWidth: 0, width: 32, height: 32, padding: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};

export interface BackupDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

export function BackupDetail({ controller, t }: BackupDetailProps) {
  const exportFor = (scope: "shelves" | "smart" | "all", filename: string) => () => {
    openManagedModal((close) => (
      <ExportModal
        closeModal={close}
        controller={controller}
        folderPath={getUserDownloadsDir()}
        scope={scope}
      />
    ));
    // Filename hint shows up via ExportModal's defaultNameFor — kept
    // here as a destination clue for the placeholder text below.
    void filename;
  };
  const importFor = (scope: "shelves" | "smart" | "all", filename: string) => () => {
    openManagedModal((close) => (
      <ImportModal
        closeModal={close}
        controller={controller}
        initialPath={joinDownloads(filename)}
        scope={scope}
      />
    ));
  };

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <BackupGroup
        title={t("settings_backup_shelves_title")}
        description={t("settings_backup_shelves_desc")}
        exportLabel={t("settings_backup_export")}
        importLabel={t("settings_backup_import")}
        onExport={exportFor("shelves", "deck-shelves-shelves.json")}
        onImport={importFor("shelves", "deck-shelves-shelves.json")}
      />
      <BackupGroup
        title={t("settings_backup_smart_title")}
        description={t("settings_backup_smart_desc")}
        exportLabel={t("settings_backup_export")}
        importLabel={t("settings_backup_import")}
        onExport={exportFor("smart", "deck-shelves-smart-shelves.json")}
        onImport={importFor("smart", "deck-shelves-smart-shelves.json")}
      />
      <BackupGroup
        title={t("settings_backup_all_title")}
        description={t("settings_backup_all_desc")}
        exportLabel={t("settings_backup_export")}
        importLabel={t("settings_backup_import")}
        onExport={exportFor("all", "deck-shelves.json")}
        onImport={importFor("all", "deck-shelves.json")}
      />
      <div style={{ fontSize: 12, opacity: 0.55, padding: "4px 4px 16px" }}>
        {t("settings_backup_path_hint").replace("{{path}}", getUserDownloadsDir())}
      </div>
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
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <Focusable
      flow-children="horizontal"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 16px",
        borderRadius: 8,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "white" }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, lineHeight: 1.35 }}>{description}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <DialogButton onClick={onExport} onOKButton={onExport} style={ICON_BTN_STYLE} aria-label={exportLabel}>
          <DownloadIcon size={16} />
        </DialogButton>
        <DialogButton onClick={onImport} onOKButton={onImport} style={ICON_BTN_STYLE} aria-label={importLabel}>
          <UploadIcon size={16} />
        </DialogButton>
      </div>
    </Focusable>
  );
}
