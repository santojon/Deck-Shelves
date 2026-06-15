import React, { useEffect, useState } from "react";
import { DialogButton, Focusable } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { openManagedModal } from "../../qam/common/openManagedModal";
import { ResetAllModal } from "../../qam/modals/ResetAllModal";
import { SettingsSection } from "../../ui/SettingsSection";
import {
  type DiagnosticEntry,
  clearDiagnostics,
  subscribeDiagnostics,
} from "../../../runtime/diagnostics";
import { TrashIcon } from "../../icons";
import { BTN_COMPACT_STYLE } from "../../ui/buttonStyles";


export interface AdvancedDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

const LEVEL_COLOR: Record<DiagnosticEntry["level"], string> = {
  info:  "var(--gpSystemLighterStill, rgba(120, 180, 255, 0.85))",
  warn:  "rgba(255, 200, 90, 0.9)",
  error: "rgba(255, 110, 110, 0.95)",
};

export function AdvancedDetail({ controller, t }: AdvancedDetailProps) {
  const [diags, setDiags] = useState<DiagnosticEntry[]>([]);
  useEffect(() => subscribeDiagnostics(setDiags), []);

  const handleResetShelves = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} scope='shelves' />);
  const handleResetSmart   = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} scope='smart' />);
  const handleResetAll     = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} />);

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <SettingsSection title={t("settings_advanced_reset_title")} description={t("settings_advanced_reset_desc")}>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <DialogButton onClick={handleResetShelves} onOKButton={handleResetShelves} style={BTN_COMPACT_STYLE}>
            <TrashIcon size={12} /><span>{t("settings_advanced_reset_shelves")}</span>
          </DialogButton>
          <DialogButton onClick={handleResetSmart} onOKButton={handleResetSmart} style={BTN_COMPACT_STYLE}>
            <TrashIcon size={12} /><span>{t("settings_advanced_reset_smart")}</span>
          </DialogButton>
          <DialogButton onClick={handleResetAll} onOKButton={handleResetAll} style={BTN_COMPACT_STYLE}>
            <TrashIcon size={12} /><span>{t("settings_advanced_reset_all")}</span>
          </DialogButton>
        </Focusable>
      </SettingsSection>
      <SettingsSection
        title={t("settings_advanced_logs_title")}
        description={t("settings_advanced_logs_desc")}
        trailing={
          <DialogButton
            onClick={clearDiagnostics}
            onOKButton={clearDiagnostics}
            disabled={diags.length === 0}
            style={BTN_COMPACT_STYLE}
          >
            <TrashIcon size={12} /><span>{t("settings_advanced_logs_clear")}</span>
          </DialogButton>
        }
      >
        {diags.length === 0 ? (
          <div style={{ opacity: 0.55, padding: 12, fontStyle: "italic" }}>
            {t("settings_advanced_logs_empty")}
          </div>
        ) : (
          <div
            style={{
              maxHeight: 320, overflowY: "auto",
              background: "var(--ds-surface-row, rgba(0,0,0,0.18))",
              borderRadius: 6,
              padding: 8,
            }}
          >
            <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {diags.map((entry) => (
                <Focusable
                  key={entry.id}
                  onActivate={() => { /* leaf — focus only */ }}
                  onOKActionDescription={t("settings_advanced_logs_view")}
                  className="ds-log-row"
                  style={{
                    display: "flex", gap: 10, padding: "6px 8px", borderRadius: 4,
                    background: "var(--ds-surface-row, rgba(255,255,255,0.03))",
                  }}
                >
                  <div style={{ width: 64, opacity: 0.55, fontSize: 11, fontFamily: "monospace" }}>
                    {new Date(entry.time).toLocaleTimeString(undefined, { hour12: false })}
                  </div>
                  <div style={{
                    width: 52, fontSize: 11, fontWeight: 600,
                    color: LEVEL_COLOR[entry.level],
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}>{t(`settings_advanced_logs_level_${entry.level}`)}</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--ds-text, rgba(255,255,255,0.85))" }}>
                    <div>{entry.message}</div>
                    {entry.context ? (
                      <div style={{ opacity: 0.55, fontSize: 11, marginTop: 2, wordBreak: "break-word" }}>
                        {entry.context}
                      </div>
                    ) : null}
                  </div>
                </Focusable>
              ))}
            </Focusable>
          </div>
        )}
      </SettingsSection>
    </Focusable>
  );
}
