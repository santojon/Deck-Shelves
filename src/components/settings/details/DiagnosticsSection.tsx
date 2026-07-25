import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DialogButton, Focusable } from "../../../runtime/host/decky";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import {
  collectRuntimeInfo, collectSystemInfo, collectHardwareInfo, listCoLoadedPlugins,
  summarizeConfig, formatSize, hwCpuText, hwDiskText,
  type SystemInfo, type HardwareInfo,
} from "../../../runtime/diagnosticsInfo";
import { refreshCssLoaderThemes } from "../../../core/cssLoaderDetect";
import { getCurrentSettings } from "../../../settingsStore";
import {
  CheckIcon, CopyIcon, RefreshIcon, ToolsIcon, MonitorIcon, GearIcon, SlidersIcon,
  PuzzleIcon, WandIcon, SideNavIcon, StackIcon, BookmarkIcon, SparkleIcon, PersonIcon, FunnelIcon,
} from "../../icons";
import { BTN_ICON_STYLE } from "../../ui/buttonStyles";
import { copyToClipboard } from "../../ui/clipboard";
import { notify } from "../../notify";

const DASH = "—";
const NOOP = () => { /* leaf — focus only */ };
type Tr = (key: string) => string;
interface Integration { key: string; icon: ReactNode; active: boolean }

function osLine(sys: SystemInfo | null, steamOS: string | null): string {
  const base = sys?.osName
    ? (sys.osVersion ? `${sys.osName} ${sys.osVersion}` : sys.osName)
    : (steamOS ? `SteamOS ${steamOS}` : null);
  if (!base) return DASH;
  return sys?.machine ? `${base} (${sys.machine})` : base;
}

/** A titled, tinted block — one per System-information section, for a uniform
    card look across Hardware / Software / Integrations / Configuration. */
function SectionCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 8px 10px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>{icon}{title}</div>
      {children}
    </div>
  );
}

/** Spec tile — uppercase caption over a bold value (device-spec look). */
function SpecTile({ label, value }: { label: string; value: string }) {
  return (
    <Focusable onActivate={NOOP} focusWithinClassName="gpfocuswithin"
      style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", minWidth: 0 }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.55 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>{value}</span>
    </Focusable>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <Focusable onActivate={NOOP} focusWithinClassName="gpfocuswithin"
      style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 4, padding: "3px 6px" }}>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 12, opacity: 0.85, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </Focusable>
  );
}

/** Accent chip: an icon + a count, for the configuration summary. */
function IconStat({ icon, value }: { icon: ReactNode; value: number }) {
  return (
    <Focusable onActivate={NOOP} focusWithinClassName="gpfocuswithin"
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, background: "rgba(99,192,136,0.10)", border: "1px solid rgba(99,192,136,0.25)" }}>
      <span style={{ color: "var(--ds-accent, #63c088)", display: "flex" }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>{value}</span>
    </Focusable>
  );
}

function IntegrationCard({ name, icon, active }: { name: string; icon: ReactNode; active: boolean }) {
  const accent = active ? "var(--ds-accent, #63c088)" : "rgba(255,255,255,0.55)";
  return (
    <Focusable onActivate={NOOP} focusWithinClassName="gpfocuswithin"
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
        gap: 3, padding: "8px 2px", borderRadius: 7, minWidth: 0, position: "relative",
        background: active ? "rgba(99,192,136,0.12)" : "rgba(255,255,255,0.035)",
        border: `1px solid ${active ? "rgba(99,192,136,0.4)" : "rgba(255,255,255,0.08)"}`,
        opacity: active ? 1 : 0.6,
      }}>
      <div style={{ color: accent, display: "flex" }}>{icon}</div>
      <span style={{ fontSize: 9, textAlign: "center", lineHeight: 1.1, wordBreak: "break-word", maxWidth: "100%" }}>{name}</span>
      {active ? <span style={{ position: "absolute", top: 3, right: 3, color: accent, display: "flex" }}><CheckIcon size={9} /></span> : null}
    </Focusable>
  );
}

function HardwareBlock({ hw, t }: { hw: HardwareInfo | null; t: Tr }) {
  if (!hw) return null;
  return (
    <SectionCard title={t("hw_title")} icon={<MonitorIcon size={13} />}>
      <SpecTile label={t("hw_model")} value={hw.model ?? DASH} />
      <Focusable flow-children="horizontal" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 6 }}>
        <SpecTile label={t("hw_cpu")} value={hwCpuText(hw)} />
        <SpecTile label={t("hw_ram")} value={formatSize(hw.memTotalBytes)} />
        {hw.gpu ? <SpecTile label={t("hw_gpu")} value={hw.gpu} /> : null}
        {hw.diskTotalBytes ? <SpecTile label={t("hw_storage")} value={hwDiskText(hw)} /> : null}
      </Focusable>
    </SectionCard>
  );
}

function SoftwareBlock({ rows, plugins, t }: { rows: Array<[string, string]>; plugins: string[]; t: Tr }) {
  return (
    <SectionCard title={t("diag_software")} icon={<GearIcon size={13} />}>
      <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map(([k, v]) => <KVRow key={k} label={t(k)} value={v} />)}
      </Focusable>
      <Focusable onActivate={NOOP} focusWithinClassName="gpfocuswithin" style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4, borderRadius: 4, padding: "4px 6px" }}>
        <span style={{ fontSize: 13 }}>{t("diag_plugins")}</span>
        <span style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5, wordBreak: "break-word" }}>{plugins.length ? plugins.join(", ") : DASH}</span>
      </Focusable>
    </SectionCard>
  );
}

function IntegrationsBlock({ items, t }: { items: Integration[]; t: Tr }) {
  return (
    <SectionCard title={t("diag_integrations")} icon={<PuzzleIcon size={13} />}>
      <Focusable flow-children="horizontal" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4 }}>
        {items.map((it) => <IntegrationCard key={it.key} name={t(it.key)} icon={it.icon} active={it.active} />)}
      </Focusable>
    </SectionCard>
  );
}

function ConfigBlock({ stats, version, config, t }: { stats: Array<{ icon: ReactNode; value: number }>; version: string; config: string[]; t: Tr }) {
  return (
    <SectionCard title={t("diag_config")} icon={<SlidersIcon size={13} />}>
      <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {stats.map((s, i) => <IconStat key={i} icon={s.icon} value={s.value} />)}
      </Focusable>
      <KVRow label={t("diag_version")} value={version} />
      <Focusable onActivate={NOOP} focusWithinClassName="gpfocuswithin" style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4, borderRadius: 4, padding: "4px 6px", background: "rgba(255,255,255,0.02)" }}>
        {config.map((line, i) => <span key={i} style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5, wordBreak: "break-word" }}>{line}</span>)}
      </Focusable>
    </SectionCard>
  );
}

/** Advanced → System information: read-only runtime + hardware detection in four
    blocks (Hardware, Software, Integrations, Deck Shelves configuration).
    Refresh re-reads the live probes; Copy dumps the whole readout as text. */
export function DiagnosticsSection({ t }: { t: Tr }) {
  const [tick, setTick] = useState(0);
  const [themesTick, setThemesTick] = useState(0);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const info = useMemo(() => collectRuntimeInfo(), [tick, themesTick]);
  const plugins = useMemo(() => listCoLoadedPlugins(), [tick]);
  const settings = useMemo(() => getCurrentSettings() as any, [tick]);
  const config = useMemo(() => summarizeConfig(settings), [settings]);
  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let alive = true;
    void collectSystemInfo().then((s) => { if (alive) setSys(s); });
    void collectHardwareInfo().then((h) => { if (alive) setHw(h); });
    void refreshCssLoaderThemes().then(() => { if (alive) setThemesTick((n) => n + 1); });
    return () => { alive = false; };
  }, [tick]);

  const softwareRows: Array<[string, string]> = [
    ["diag_os", osLine(sys, info.steamOS)],
    ["diag_steam", sys?.steamVersion ?? DASH],
    ["diag_theme", info.theme ?? DASH],
  ];
  const integrations: Integration[] = [
    { key: "diag_decky", icon: <PuzzleIcon size={16} />, active: info.decky },
    { key: "diag_css_loader", icon: <WandIcon size={16} />, active: info.cssLoader },
    { key: "diag_tabmaster", icon: <SideNavIcon size={16} />, active: info.tabMaster },
    { key: "diag_unifideck", icon: <StackIcon size={16} />, active: info.unifiDeck },
    { key: "diag_nonsteambadges", icon: <BookmarkIcon size={16} />, active: info.nonSteamBadges },
  ];
  const cnt = (v: any) => (Array.isArray(v) ? v.length : 0);
  const stats = [
    { icon: <StackIcon size={14} />, value: cnt(settings?.shelves) },
    { icon: <SparkleIcon size={14} />, value: cnt(settings?.smartShelves) },
    { icon: <PersonIcon size={14} />, value: cnt(settings?.profiles) },
    { icon: <FunnelIcon size={14} />, value: cnt(settings?.savedFilters) + cnt(settings?.savedSmartFilters) },
  ];

  const hwCopyLines = (): string[] => {
    if (!hw) return [];
    return [
      `${t("hw_title")}:`,
      `  ${t("hw_model")}: ${hw.model ?? DASH}`,
      `  ${t("hw_cpu")}: ${hwCpuText(hw)}`,
      `  ${t("hw_ram")}: ${formatSize(hw.memTotalBytes)}`,
      ...(hw.gpu ? [`  ${t("hw_gpu")}: ${hw.gpu}`] : []),
      ...(hw.diskTotalBytes ? [`  ${t("hw_storage")}: ${hwDiskText(hw)}`] : []),
    ];
  };

  const copyAll = () => {
    const lines = [
      ...hwCopyLines(),
      `${t("diag_version")}: ${info.version}`,
      ...softwareRows.map(([k, v]) => `${t(k)}: ${v}`),
      `${t("diag_plugins")}: ${plugins.length ? plugins.join(", ") : DASH}`,
      ...integrations.map((it) => `${t(it.key)}: ${it.active ? "yes" : "no"}`),
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
      <HardwareBlock hw={hw} t={t} />
      <SoftwareBlock rows={softwareRows} plugins={plugins} t={t} />
      <IntegrationsBlock items={integrations} t={t} />
      <ConfigBlock stats={stats} version={info.version} config={config} t={t} />
    </CollapsibleSection>
  );
}
