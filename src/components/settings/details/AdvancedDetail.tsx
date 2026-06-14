import React, { useEffect, useState } from "react";
import { DialogButton, Focusable } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { openManagedModal } from "../../qam/common/openManagedModal";
import { ResetAllModal } from "../../qam/modals/ResetAllModal";
import {
  type DiagnosticEntry,
  clearDiagnostics,
  subscribeDiagnostics,
} from "../../../runtime/diagnostics";
import { TrashIcon } from "../../icons";

const ICON_BTN_STYLE: React.CSSProperties = {
  minWidth: 0, width: 32, height: 32, padding: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const DANGER_BTN_STYLE: React.CSSProperties = {
  minWidth: 0, padding: "0 12px", height: 32,
  display: "inline-flex", alignItems: "center", gap: 6,
};

export interface AdvancedDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

const LEVEL_COLOR: Record<DiagnosticEntry["level"], string> = {
  info:  "rgba(120, 180, 255, 0.85)",
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
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Section title={t("settings_advanced_reset_title")} description={t("settings_advanced_reset_desc")}>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <DialogButton onClick={handleResetShelves} onOKButton={handleResetShelves} style={DANGER_BTN_STYLE}>
            <TrashIcon size={14} />
            <span>{t("settings_advanced_reset_shelves")}</span>
          </DialogButton>
          <DialogButton onClick={handleResetSmart} onOKButton={handleResetSmart} style={DANGER_BTN_STYLE}>
            <TrashIcon size={14} />
            <span>{t("settings_advanced_reset_smart")}</span>
          </DialogButton>
          <DialogButton onClick={handleResetAll} onOKButton={handleResetAll} style={DANGER_BTN_STYLE}>
            <TrashIcon size={14} />
            <span>{t("settings_advanced_reset_all")}</span>
          </DialogButton>
        </Focusable>
      </Section>
      <Section
        title={t("settings_advanced_logs_title")}
        description={t("settings_advanced_logs_desc")}
        trailing={
          <DialogButton
            onClick={clearDiagnostics}
            onOKButton={clearDiagnostics}
            disabled={diags.length === 0}
            style={ICON_BTN_STYLE}
            aria-label={t("settings_advanced_logs_clear")}
          >
            <TrashIcon size={16} />
          </DialogButton>
        }
      >
        {diags.length === 0 ? (
          <div style={{ opacity: 0.55, padding: 12, fontStyle: "italic" }}>
            {t("settings_advanced_logs_empty")}
          </div>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", gap: 4,
            maxHeight: 320, overflowY: "auto",
            background: "rgba(0,0,0,0.25)",
            borderRadius: 6,
            padding: 8,
          }}>
            {diags.map((entry) => (
              <div key={entry.id} style={{ display: "flex", gap: 10, padding: "6px 8px", borderRadius: 4 }}>
                <div style={{ width: 56, opacity: 0.55, fontSize: 11 }}>
                  {entry.time.slice(11, 19)}
                </div>
                <div style={{
                  width: 50, fontSize: 11, fontWeight: 600,
                  color: LEVEL_COLOR[entry.level],
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}>{entry.level}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
                  <div>{entry.message}</div>
                  {entry.context ? (
                    <div style={{ opacity: 0.55, fontSize: 11, marginTop: 2, wordBreak: "break-word" }}>
                      {entry.context}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Focusable>
  );
}

function Section({
  title, description, trailing, children,
}: {
  title: string;
  description?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      padding: "14px 16px",
      borderRadius: 8,
      background: "rgba(255, 255, 255, 0.04)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "white" }}>{title}</div>
          {description ? (
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4, lineHeight: 1.35 }}>{description}</div>
          ) : null}
        </div>
        {trailing ? <div style={{ flexShrink: 0 }}>{trailing}</div> : null}
      </div>
      {children}
    </div>
  );
}
