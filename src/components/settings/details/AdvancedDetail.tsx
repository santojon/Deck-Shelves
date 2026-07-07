import { useEffect, useMemo, useState } from "react";
import { DialogButton, Focusable, ToggleField } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { openManagedModal } from "../../qam/common/openManagedModal";
import { ResetAllModal } from "../../qam/modals/ResetAllModal";
import { ResetCategoriesModal } from "../../qam/modals/ResetCategoriesModal";
import { confirmAction } from "../../qam/modals/ConfirmActionModal";
import { CACHE_GROUPS, groupSizeBytes, clearGroup, clearAllCaches, formatBytes } from "../../../runtime/cacheRegistry";
import { SettingsSection } from "../../ui/SettingsSection";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import {
  type DiagnosticEntry,
  clearDiagnostics,
  subscribeDiagnostics,
} from "../../../runtime/diagnostics";
import { SCOPE_COLOR, LEVEL_BG } from "../../../runtime/logger";
import { CopyIcon, TrashIcon } from "../../icons";
import { BTN_COMPACT_STYLE, BTN_ICON_STYLE } from "../../ui/buttonStyles";
import { notify } from "../../notify";

/* Copy text to the clipboard. The async Clipboard API is the primary path — we
   AWAIT it so a rejection (no focus / permission) actually falls through
   instead of silently dropping the copy. The hidden-textarea + (deprecated)
   execCommand path is only a last resort for contexts without the API. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if ((navigator as any)?.clipboard?.writeText) {
      await (navigator as any).clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}


export interface AdvancedDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

export function AdvancedDetail({ controller, t }: AdvancedDetailProps) {
  const [diags, setDiags] = useState<DiagnosticEntry[]>([]);
  useEffect(() => subscribeDiagnostics(setDiags), []);
  const copyLogs = () => {
    if (diags.length === 0) return;
    // Oldest-first so the copied text reads top-to-bottom in chronological order
    // (the list renders newest-first); every buffered entry is included.
    const text = [...diags].reverse().map((e) => {
      const ts = new Date(e.time).toLocaleTimeString(undefined, { hour12: false });
      const scope = e.scope ? ` [${e.scope}]` : "";
      const ctx = e.context ? ` | ${e.context}` : "";
      return `${ts} ${e.level.toUpperCase()}${scope} ${e.message}${ctx}`;
    }).join("\n");
    void copyToClipboard(text).then((ok) => {
      if (ok) notify("copy", { body: t("settings_advanced_logs_copied") });
    });
  };

  const handleResetShelves = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} scope='shelves' />);
  const handleResetSmart   = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} scope='smart' />);
  const handleResetAll     = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} />);
  const handleResetCustom  = () => openManagedModal((close) => <ResetCategoriesModal closeModal={close} controller={controller} />);

  const [cacheTick, setCacheTick] = useState(0);
  const cacheSizes = useMemo(() => CACHE_GROUPS.map((g) => groupSizeBytes(g)), [cacheTick]);
  const handleClearGroup = (g: typeof CACHE_GROUPS[number]) => {
    clearGroup(g); setCacheTick((n) => n + 1); notify("copy", { body: t("cache_cleared") });
  };
  const handleClearAll = () => confirmAction({
    title: t("cache_clear_all"), body: t("cache_clear_all_confirm"),
    okText: t("confirm_continue"), cancelText: t("cancel"),
    onConfirm: () => { clearAllCaches(); setCacheTick((n) => n + 1); notify("copy", { body: t("cache_cleared") }); },
  });

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <SettingsSection title={t("settings_advanced_reset_title")} description={t("settings_advanced_reset_desc")}>
        <Focusable
          flow-children="horizontal"
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, alignItems: "center" }}
        >
          <DialogButton onClick={handleResetShelves} onOKButton={handleResetShelves} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "100%" }}>
            <TrashIcon size={12} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t("settings_advanced_reset_shelves")}</span>
          </DialogButton>
          <DialogButton onClick={handleResetSmart} onOKButton={handleResetSmart} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "100%" }}>
            <TrashIcon size={12} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t("settings_advanced_reset_smart")}</span>
          </DialogButton>
          <DialogButton onClick={handleResetAll} onOKButton={handleResetAll} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "100%" }}>
            <TrashIcon size={12} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t("settings_advanced_reset_all")}</span>
          </DialogButton>
          <DialogButton onClick={handleResetCustom} onOKButton={handleResetCustom} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "100%" }}>
            <TrashIcon size={12} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t("settings_advanced_reset_custom")}</span>
          </DialogButton>
        </Focusable>
      </SettingsSection>
      <CollapsibleSection
        id="adv-cache"
        title={t("cache_management_title")}
        count={cacheSizes.filter((n) => n > 0).length}
        headerExtra={
          <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
            <DialogButton
              onClick={handleClearAll}
              onOKButton={handleClearAll}
              disabled={cacheSizes.every((n) => n === 0)}
              style={BTN_ICON_STYLE}
              aria-label={t("cache_clear_all")}
            >
              <TrashIcon size={12} />
            </DialogButton>
          </Focusable>
        }
      >
        <div style={{ fontSize: 12, opacity: 0.6, margin: "2px 0 8px" }}>{t("cache_management_desc")}</div>
        <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CACHE_GROUPS.map((g, i) => (
            <Focusable key={g.id} flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13 }}>{t(g.labelKey)}</span>
              <span style={{ fontSize: 12, opacity: 0.7, fontVariantNumeric: "tabular-nums", minWidth: 64, textAlign: "right" }}>{formatBytes(cacheSizes[i])}</span>
              <DialogButton disabled={cacheSizes[i] === 0} onClick={() => handleClearGroup(g)} onOKButton={() => handleClearGroup(g)} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "auto" }}>{t("cache_clear")}</DialogButton>
            </Focusable>
          ))}
        </Focusable>
      </CollapsibleSection>
      <CollapsibleSection
        id="adv-logs"
        title={t("settings_advanced_logs_title")}
        count={diags.length}
        headerExtra={
          <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
            <DialogButton
              onClick={copyLogs}
              onOKButton={copyLogs}
              disabled={diags.length === 0}
              style={BTN_ICON_STYLE}
              aria-label={t("settings_advanced_logs_copy")}
            >
              <CopyIcon size={12} />
            </DialogButton>
            <DialogButton
              onClick={clearDiagnostics}
              onOKButton={clearDiagnostics}
              disabled={diags.length === 0}
              style={BTN_ICON_STYLE}
              aria-label={t("settings_advanced_logs_clear")}
            >
              <TrashIcon size={12} />
            </DialogButton>
          </Focusable>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <ToggleField
            label={t("settings_advanced_verbose_title")}
            description={t("settings_advanced_verbose_desc")}
            checked={(controller.settings as any)?.verboseLoggingEnabled === true}
            onChange={(v: boolean) => (controller.actions as any).setVerboseLoggingEnabled?.(v)}
          />
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, margin: "2px 0 8px" }}>{t("settings_advanced_logs_desc")}</div>
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
                  <div style={{ width: 64, opacity: 0.55, fontSize: 11, fontFamily: "monospace", flexShrink: 0 }}>
                    {new Date(entry.time).toLocaleTimeString(undefined, { hour12: false })}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0, marginTop: 1, alignItems: "flex-start" }}>
                    <span style={{
                      background: LEVEL_BG[entry.level.toUpperCase()] ?? "#0ea5e9",
                      color: "var(--ds-text, #fff)",
                      padding: "1px 5px", borderRadius: 3, fontSize: 10, fontWeight: 800,
                      textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1.4, alignSelf: "flex-start",
                    }}>{t(`settings_advanced_logs_level_${entry.level}`)}</span>
                    {entry.scope ? (
                      <span style={{
                        background: SCOPE_COLOR[entry.scope] ?? "rgba(255,255,255,0.18)",
                        color: "var(--ds-text, #fff)",
                        padding: "1px 5px", borderRadius: 3, fontSize: 10, fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.4, alignSelf: "flex-start",
                      }}>{entry.scope}</span>
                    ) : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                    <div style={{ color: "#93c5fd", fontWeight: 600 }}>{entry.message}</div>
                    {entry.context ? (
                      <div style={{ opacity: 0.55, fontSize: 11, marginTop: 2, wordBreak: "break-word", color: "var(--ds-text, rgba(255,255,255,0.85))" }}>
                        {entry.context}
                      </div>
                    ) : null}
                  </div>
                </Focusable>
              ))}
            </Focusable>
          </div>
        )}
      </CollapsibleSection>
    </Focusable>
  );
}
