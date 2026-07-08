import { useEffect, useState } from "react";
import { DialogButton, Dropdown, Focusable, ToggleField, type SingleDropdownOption } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { SourceResolverInspector } from "./SourceResolverInspector";
import { type DiagnosticEntry, clearDiagnostics, subscribeDiagnostics } from "../../../runtime/diagnostics";
import { SCOPE_COLOR, LEVEL_BG } from "../../../runtime/logger";
import { CopyIcon, TrashIcon, DocsIcon } from "../../icons";
import { BTN_ICON_STYLE } from "../../ui/buttonStyles";
import { copyToClipboard } from "../../ui/clipboard";
import { notify } from "../../notify";

export interface DeveloperDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

/** Live config for the on-home debug overlay: corner, orientation and which
    parts to render (fps / stats / per-shelf / focus chain / render outlines). */
function OverlayConfig({ controller, t }: DeveloperDetailProps) {
  const o = (controller.settings ?? {}) as any;
  const setOpt = (key: string, value: boolean | string) => (controller.actions as any).setDebugOverlayOption?.(key, value);
  const cornerOptions: SingleDropdownOption[] = [
    { data: "tl", label: t("dev_overlay_corner_tl") },
    { data: "tr", label: t("dev_overlay_corner_tr") },
    { data: "bl", label: t("dev_overlay_corner_bl") },
    { data: "br", label: t("dev_overlay_corner_br") },
  ];
  const cornerValue = ["tl", "tr", "bl", "br"].includes(o.debugOverlayCorner) ? o.debugOverlayCorner : "br";
  return (
    <div style={{ paddingLeft: 14, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
        <span style={{ flex: 1, fontSize: 13 }}>{t("dev_overlay_corner")}</span>
        <div style={{ minWidth: 150 }}>
          <Dropdown rgOptions={cornerOptions} selectedOption={cornerValue} onChange={(sel: any) => setOpt("debugOverlayCorner", sel.data)} />
        </div>
      </div>
      <ToggleField label={t("dev_overlay_vertical")} checked={o.debugOverlayVertical !== false} onChange={(v: boolean) => setOpt("debugOverlayVertical", v)} />
      <ToggleField label={t("dev_overlay_show_fps")} checked={o.debugOverlayFps !== false} onChange={(v: boolean) => setOpt("debugOverlayFps", v)} />
      <ToggleField label={t("dev_overlay_show_stats")} checked={o.debugOverlayStats !== false} onChange={(v: boolean) => setOpt("debugOverlayStats", v)} />
      <ToggleField label={t("dev_overlay_show_pershelf")} checked={o.debugOverlayPerShelf !== false} onChange={(v: boolean) => setOpt("debugOverlayPerShelf", v)} />
      <ToggleField label={t("dev_overlay_show_focus")} checked={o.debugOverlayFocus === true} onChange={(v: boolean) => setOpt("debugOverlayFocus", v)} />
      <ToggleField label={t("dev_overlay_outlines")} checked={o.debugOverlayOutlines === true} onChange={(v: boolean) => setOpt("debugOverlayOutlines", v)} />
      <ToggleField label={t("dev_overlay_transparent")} checked={o.debugOverlayTransparent === true} onChange={(v: boolean) => setOpt("debugOverlayTransparent", v)} />
    </div>
  );
}

/** Developer tab (only shown when Developer mode is on): the on-home debug
    overlay toggle, source resolver, focus tree, and the diagnostic log. */
export function DeveloperDetail({ controller, t }: DeveloperDetailProps) {
  const [diags, setDiags] = useState<DiagnosticEntry[]>([]);
  useEffect(() => subscribeDiagnostics(setDiags), []);

  const copyLogs = () => {
    if (diags.length === 0) return;
    // Oldest-first so the copied text reads top-to-bottom in chronological order.
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

  const overlayOn = (controller.settings as any)?.debugOverlayEnabled === true;

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 12 }}>
        <ToggleField
          label={t("dev_overlay_title")}
          description={t("dev_overlay_desc")}
          checked={overlayOn}
          onChange={(v: boolean) => (controller.actions as any).setDebugOverlayEnabled?.(v)}
        />
        {overlayOn ? <OverlayConfig controller={controller} t={t} /> : null}
      </div>
      <SourceResolverInspector controller={controller} t={t} />
      <CollapsibleSection
        id="dev-logs"
        title={t("settings_advanced_logs_title")}
        count={diags.length}
        icon={<DocsIcon size={14} />}
        headerExtra={
          <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
            <DialogButton onClick={copyLogs} onOKButton={copyLogs} disabled={diags.length === 0} style={BTN_ICON_STYLE} aria-label={t("settings_advanced_logs_copy")}>
              <CopyIcon size={12} />
            </DialogButton>
            <DialogButton onClick={clearDiagnostics} onOKButton={clearDiagnostics} disabled={diags.length === 0} style={BTN_ICON_STYLE} aria-label={t("settings_advanced_logs_clear")}>
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
          <div style={{ opacity: 0.55, padding: 12, fontStyle: "italic" }}>{t("settings_advanced_logs_empty")}</div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: "auto", background: "var(--ds-surface-row, rgba(0,0,0,0.18))", borderRadius: 6, padding: 8 }}>
            <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {diags.map((entry) => (
                <Focusable
                  key={entry.id}
                  onActivate={() => { /* leaf — focus only */ }}
                  onOKActionDescription={t("settings_advanced_logs_view")}
                  className="ds-log-row"
                  style={{ display: "flex", gap: 10, padding: "6px 8px", borderRadius: 4, background: "var(--ds-surface-row, rgba(255,255,255,0.03))" }}
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
