/* Pre-filled bug report: gathers the same diagnostics as Settings → Advanced →
   Diagnostics, aggregates the dev log buffer, and opens the repo's bug-report
   Issue Form in the system browser with everything filled in — no server, the
   payload rides in the URL. Labels are fixed English so the maintainer always
   gets a consistent, machine-diffable readout regardless of the user's locale. */
import {
  collectRuntimeInfo,
  collectSystemInfo,
  collectHardwareInfo,
  listCoLoadedPlugins,
  summarizeConfig,
  formatSize,
  hwCpuText,
  hwDiskText,
  type RuntimeInfo,
  type SystemInfo,
  type HardwareInfo,
} from "../runtime/diagnosticsInfo";
import { getDiagnostics } from "../runtime/diagnostics";
import { getCurrentSettings } from "../store/settingsStore";
import { openExternalUrl } from "./updateNotifier";
import { copyToClipboard } from "../components/ui/clipboard";
import { notify } from "../components/notify";
import i18next from "i18next";

const ISSUE_URL = "https://github.com/santojon/Deck-Shelves/issues/new";
const DASH = "—";
// Steam's embedded overlay browser (OpenInSystemBrowser) silently no-ops on
// long URLs instead of erroring. Only the short diagnostics summary rides
// in the URL; the full log buffer goes to the clipboard instead.
const MAX_CONTEXT_URL_CHARS = 1800;
const CLIPBOARD_LOG_BUDGET = 6000;

export type IssueType = "bug" | "enhancement" | "feature";

const TEMPLATE_BY_TYPE: Record<IssueType, string> = {
  bug: "bug_report.yml",
  enhancement: "enhancement.yml",
  feature: "feature_request.yml",
};

const TITLE_PREFIX_BY_TYPE: Record<IssueType, string> = {
  bug: "[BUG] ",
  enhancement: "[ENHANCEMENT] ",
  feature: "[FEATURE] ",
};

function osLine(sys: SystemInfo | null, steamOS: string | null): string {
  const base = sys?.osName
    ? (sys.osVersion ? `${sys.osName} ${sys.osVersion}` : sys.osName)
    : (steamOS ? `SteamOS ${steamOS}` : null);
  if (!base) return DASH;
  return sys?.machine ? `${base} (${sys.machine})` : base;
}

// Hardware block — English labels, only when the user opted in. Text-only.
function hardwareText(hw: HardwareInfo): string[] {
  const lines = [
    "Hardware:",
    `  Model: ${hw.model ?? DASH}`,
    `  CPU: ${hwCpuText(hw)}`,
    `  RAM: ${formatSize(hw.memTotalBytes)}`,
  ];
  if (hw.gpu) lines.push(`  GPU: ${hw.gpu}`);
  if (hw.diskTotalBytes) lines.push(`  Storage: ${hwDiskText(hw)}`);
  return lines;
}

function diagnosticsText(runtime: RuntimeInfo, sys: SystemInfo | null, hw: HardwareInfo | null): string {
  const yn = (b: boolean) => (b ? "yes" : "no");
  const plugins = listCoLoadedPlugins();
  return [
    `Version: ${runtime.version}`,
    `OS: ${osLine(sys, runtime.steamOS)}`,
    `Steam: ${sys?.steamVersion ?? DASH}`,
    `Theme: ${runtime.theme ?? DASH}`,
    ...(hw ? hardwareText(hw) : []),
    `Decky: ${yn(runtime.decky)}`,
    `CSS Loader: ${yn(runtime.cssLoader)}`,
    `TabMaster: ${yn(runtime.tabMaster)}`,
    `UnifiDeck: ${yn(runtime.unifiDeck)}`,
    `Non-Steam Badges: ${yn(runtime.nonSteamBadges)}`,
    `Plugins: ${plugins.length ? plugins.join(", ") : DASH}`,
    "Config:",
    ...summarizeConfig(getCurrentSettings()).map((l) => `  ${l}`),
  ].join("\n");
}

function logsText(budget: number): string {
  const entries = getDiagnostics();
  if (!entries.length) return "(no log entries)";
  const lines: string[] = [];
  let used = 0;
  for (const e of entries) {
    const line = `[${e.time}] ${e.level.toUpperCase()}${e.scope ? ` ${e.scope}` : ""}: ${e.message}${e.context ? ` — ${e.context}` : ""}`;
    if (used + line.length > budget) { lines.push("… (older entries trimmed)"); break; }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

function setIf(p: URLSearchParams, key: string, val: string | null | undefined): void {
  if (val) p.set(key, val);
}

function isSteamOs(runtime: RuntimeInfo, sys: SystemInfo | null): boolean {
  if (typeof sys?.isSteamOS === "boolean") return sys.isSteamOS;
  return !!(runtime.steamOS || /steamos/i.test(sys?.osName ?? ""));
}

// Distro id (os-release ID) -> bug-report OS dropdown option, for the
// SteamOS-like Linuxes that have their own option.
const OS_BY_DISTRO: Record<string, string> = {
  bazzite: "Bazzite", holoiso: "HoloISO", chimeraos: "ChimeraOS",
};

function osFromName(name: string, hasDistro: boolean): string | null {
  if (name.includes("windows")) return "Windows";
  if (name.includes("mac")) return "macOS";
  if (name.includes("linux") || hasDistro) return "Other Linux";
  return null;
}

/* Map the detected host to a bug-report OS dropdown option (must match the
   template verbatim). Distro id distinguishes the SteamOS-like Linuxes. */
function osDropdown(runtime: RuntimeInfo, sys: SystemInfo | null): string | null {
  if (isSteamOs(runtime, sys)) return "SteamOS (Steam Deck)";
  const distro = (sys?.distroId ?? "").toLowerCase();
  if (OS_BY_DISTRO[distro]) return OS_BY_DISTRO[distro];
  const named = osFromName((sys?.osName ?? "").toLowerCase(), !!distro);
  return named ?? (sys?.osName ? "Other / Unknown" : null);
}

/* Best-effort prefill of the bug form's dropdown/input fields. Dropdown values
   MUST match a template option verbatim, else GitHub silently drops them. */
function fillEnvironment(p: URLSearchParams, runtime: RuntimeInfo, sys: SystemInfo | null): void {
  const beta = (getCurrentSettings() as any)?.betaChannelEnabled === true;
  const osv = osLine(sys, runtime.steamOS);
  setIf(p, "os", osDropdown(runtime, sys));
  setIf(p, "os_version", osv !== DASH ? osv : null);
  setIf(p, "steam_client", sys?.steamVersion);
  setIf(p, "version", runtime.version);
  p.set("release_channel", beta ? "Beta / Pre-release" : "Stable");
  p.set("steam_mode", isSteamOs(runtime, sys) ? "Game Mode (Steam Deck home / GamepadUI)" : "Big Picture Mode");
}

export async function openIssueReport(
  type: IssueType,
  opts: { includeHardware?: boolean; error?: string | null } = {},
): Promise<void> {
  const runtime = collectRuntimeInfo();
  let sys: SystemInfo | null = null;
  try { sys = await collectSystemInfo(); } catch { /* fail-soft — report without OS/Steam */ }
  let hw: HardwareInfo | null = null;
  if (opts.includeHardware) { try { hw = await collectHardwareInfo(); } catch { /* fail-soft — report without hardware */ } }

  const diag = diagnosticsText(runtime, sys, hw);
  const context = [
    ...(opts.error ? ["### Error", "```", opts.error.slice(0, 400), "```", ""] : []),
    "### Diagnostics",
    "```", diag, "```",
  ].join("\n").slice(0, MAX_CONTEXT_URL_CHARS);

  const logs = logsText(CLIPBOARD_LOG_BUDGET);
  void copyToClipboard([context, "", "### Logs (most recent first)", "```", logs, "```"].join("\n"))
    .then((ok) => { if (ok) notify("copy", { body: i18next.t("about_report_copied") }); });

  const p = new URLSearchParams();
  p.set("template", TEMPLATE_BY_TYPE[type]);
  p.set("title", TITLE_PREFIX_BY_TYPE[type]);
  p.set("context", context);
  if (type === "bug") fillEnvironment(p, runtime, sys);
  openExternalUrl(`${ISSUE_URL}?${p.toString()}`);
}

export async function openBugReport(opts: { includeHardware?: boolean; error?: string | null } = {}): Promise<void> {
  return openIssueReport("bug", opts);
}
