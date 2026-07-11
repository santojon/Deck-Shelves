import { useEffect, useMemo, useState } from "react";
import { DialogButton, Focusable } from "../../../runtime/host/decky";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { collectRuntimeInfo, collectSystemInfo, listCoLoadedPlugins, summarizeConfig, type SystemInfo } from "../../../runtime/diagnosticsInfo";
import { refreshCssLoaderThemes } from "../../../core/cssLoaderDetect";
import { getCurrentSettings } from "../../../settingsStore";
import { CheckIcon, CopyIcon, RefreshIcon, ToolsIcon } from "../../icons";
import { BTN_ICON_STYLE } from "../../ui/buttonStyles";
import { copyToClipboard } from "../../ui/clipboard";
import { notify } from "../../notify";

const DASH = "—";

function BoolCell({ on }: { on: boolean }) {
  return on ? <CheckIcon size={14} /> : <span style={{ opacity: 0.5 }}>{DASH}</span>;
}

function osLine(sys: SystemInfo | null, steamOS: string | null): string {
  if (sys?.osName) return sys.osVersion ? `${sys.osName} ${sys.osVersion}` : sys.osName;
  if (steamOS) return `SteamOS ${steamOS}`;
  return DASH;
}

/** Advanced → Diagnostics: read-only runtime detection. Refresh re-reads the
    live probes; Copy dumps the whole readout as text. Nothing here mutates
    Steam or plugin state. */
export function DiagnosticsSection({ t }: { t: (key: string) => string }) {
  const [tick, setTick] = useState(0);
  const [themesTick, setThemesTick] = useState(0);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const info = useMemo(() => collectRuntimeInfo(), [tick, themesTick]);
  const plugins = useMemo(() => listCoLoadedPlugins(), [tick]);
  const config = useMemo(() => summarizeConfig(getCurrentSettings()), [tick]);
  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let alive = true;
    void collectSystemInfo().then((s) => { if (alive) setSys(s); });
    // Fetch the actual CSS Loader theme names off disk (gated + fail-soft), then
    // nudge the runtime-info memo so the theme line shows the real names.
    void refreshCssLoaderThemes().then(() => { if (alive) setThemesTick((n) => n + 1); });
    return () => { alive = false; };
  }, [tick]);

  const strRows: Array<[string, string]> = [
    ["diag_version", info.version],
    ["diag_os", osLine(sys, info.steamOS)],
    ["diag_steam", sys?.steamVersion ?? DASH],
    ["diag_theme", info.theme ?? DASH],
  ];
  const boolRows: Array<[string, boolean]> = [
    ["diag_decky", info.decky],
    ["diag_css_loader", info.cssLoader],
    ["diag_tabmaster", info.tabMaster],
    ["diag_unifideck", info.unifiDeck],
    ["diag_nonsteambadges", info.nonSteamBadges],
  ];

  const copyAll = () => {
    const lines = [
      ...strRows.map(([k, v]) => `${t(k)}: ${v}`),
      ...boolRows.map(([k, v]) => `${t(k)}: ${v ? "yes" : "no"}`),
      `${t("diag_plugins")}: ${plugins.length ? plugins.join(", ") : DASH}`,
      `${t("diag_config")}:`,
      ...config.map((line) => `  ${line}`),
    ];
    void copyToClipboard(lines.join("\n")).then((ok) => {
      if (ok) notify("copy", { body: t("diag_copied") });
    });
  };

  return (
    <CollapsibleSection
      id="adv-diagnostics"
      title={t("diagnostics_title")}
      count={0}
      icon={<ToolsIcon size={14} />}
      headerExtra={
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
          <DialogButton onClick={copyAll} onOKButton={copyAll} style={BTN_ICON_STYLE} aria-label={t("diag_copy")}>
            <CopyIcon size={12} />
          </DialogButton>
          <DialogButton onClick={refresh} onOKButton={refresh} style={BTN_ICON_STYLE} aria-label={t("diag_refresh")}>
            <RefreshIcon size={12} />
          </DialogButton>
        </Focusable>
      }
    >
      <div style={{ fontSize: 12, opacity: 0.6, margin: "2px 0 8px" }}>{t("diagnostics_desc")}</div>
      <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {strRows.map(([k, v]) => (
          <Focusable key={k} onActivate={() => { /* leaf — focus only */ }} focusWithinClassName="gpfocuswithin" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 4, padding: "4px 6px" }}>
            <span style={{ flex: 1, fontSize: 13 }}>{t(k)}</span>
            <span style={{ fontSize: 12, opacity: 0.85, textAlign: "right" }}>{v}</span>
          </Focusable>
        ))}
        {boolRows.map(([k, v]) => (
          <Focusable key={k} onActivate={() => { /* leaf — focus only */ }} focusWithinClassName="gpfocuswithin" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 4, padding: "4px 6px" }}>
            <span style={{ flex: 1, fontSize: 13 }}>{t(k)}</span>
            <span style={{ display: "flex", justifyContent: "flex-end", minWidth: 24 }}><BoolCell on={v} /></span>
          </Focusable>
        ))}
        <Focusable onActivate={() => { /* leaf — focus only */ }} focusWithinClassName="gpfocuswithin" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, borderRadius: 4, padding: "4px 6px" }}>
          <span style={{ fontSize: 13 }}>{t("diag_plugins")}</span>
          <span style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5, wordBreak: "break-word" }}>{plugins.length ? plugins.join(", ") : DASH}</span>
        </Focusable>
        <Focusable onActivate={() => { /* leaf — focus only */ }} focusWithinClassName="gpfocuswithin" style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4, borderRadius: 4, padding: "4px 6px" }}>
          <span style={{ fontSize: 13 }}>{t("diag_config")}</span>
          {config.map((line, i) => (
            <span key={i} style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5, wordBreak: "break-word" }}>{line}</span>
          ))}
        </Focusable>
      </Focusable>
    </CollapsibleSection>
  );
}
