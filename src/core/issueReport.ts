// Opens the bug-report form with diagnostics in the URL; labels stay English so every report reads the same.
import {
  collectRuntimeInfo,
  collectSystemInfo,
  collectHardwareInfo,
  collectBootInfo,
  listCoLoadedPlugins,
  summarizeConfig,
  formatSize,
  hwCpuText,
  hwDiskText,
  hwExternalDiskText,
  type RuntimeInfo,
  type SystemInfo,
  type HardwareInfo,
} from "../runtime/diagnosticsInfo";
import { getDiagnostics } from "../runtime/diagnostics";
import { getDeviceProfile } from "../runtime/deviceState";
import { getPerfSnapshot } from "./perfMetrics";
import { getLearnedTimeoutsSummary } from "./adaptiveTimeout";
import { getSmartShelfCacheStats } from "../steam/smartShelves";
import { countQuarantinedSettings, getCurrentSettings } from "../store/settingsStore";
import { openExternalUrl } from "./updateNotifier";
import { copyToClipboard } from "../components/ui/clipboard";
import { notify } from "../components/notify";
import i18next from "i18next";
import { GITHUB_ISSUES_NEW } from "../constants";

const ISSUE_URL = GITHUB_ISSUES_NEW;
const DASH = "—";
// OpenInSystemBrowser silently does nothing on long URLs, so the full log goes to the clipboard.
const MAX_CONTEXT_URL_CHARS = 1800;
const CLIPBOARD_LOG_BUDGET = 6000;
// A SteamID64 anywhere in what leaves the device (an error text, a log line) is replaced.
const STEAM_ID64 = /7656119\d{10}/g;

export function redactAccountIds(text: string): string {
  return text.replace(STEAM_ID64, "[steamid]");
}

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

function hardwareText(hw: HardwareInfo): string[] {
  const lines = [
    "Hardware:",
    `  Model: ${hw.model ?? DASH}`,
    `  CPU: ${hwCpuText(hw)}`,
    `  RAM: ${formatSize(hw.memTotalBytes)}`,
  ];
  if (hw.gpu) lines.push(`  GPU: ${hw.gpu}`);
  if (hw.diskTotalBytes) lines.push(`  Storage: ${hwDiskText(hw)}`);
  for (const d of hw.externalDisks) lines.push(`  ${hwExternalDiskText(d)}`);
  lines.push(...deviceProfileText());
  return lines;
}

function deviceProfileText(): string[] {
  try {
    const p = getDeviceProfile();
    const cap = (v: boolean | null) => (v === null ? "unknown" : v ? "yes" : "no");
    return [
      `  Device family: ${p.family} (${p.architecture})${p.model ? ` — ${p.model}` : ""}`,
      `  Capabilities: battery ${cap(p.capabilities.battery)}, external display ${cap(p.capabilities.externalDisplay)}, VR ${cap(p.capabilities.vr)}, controller ${cap(p.capabilities.controller)}`,
    ];
  } catch { return []; }
}

// Always included: plugin counters only, nothing personal.
function perfText(): string[] {
  const snap = getPerfSnapshot();
  const cache = getSmartShelfCacheStats();
  const cacheTotal = cache.hits + cache.misses;
  const learned = getLearnedTimeoutsSummary();
  const ms = (v: number | null) => (v !== null ? `${v.toFixed(0)}ms` : DASH);
  const lines = [
    "Performance:",
    `  Boot critical / Home mount: ${ms(snap.bootCriticalMs)} / ${ms(snap.mountMs)}`,
    `  Active timers/observers/subscriptions: ${snap.activeTimers}/${snap.activeObservers}/${snap.activeSubscriptions}`,
    `  Reconciles/DOM-callbacks/renders per min: ${snap.reconcilesPerMin}/${snap.domCallbacksPerMin}/${snap.rendersPerMin}`,
    `  Long tasks: ${snap.longTaskCount} (${snap.longTaskTotalMs.toFixed(0)}ms total)`,
  ];
  if (snap.usedJSHeapMB !== null) lines.push(`  JS heap: ${snap.usedJSHeapMB}MB / ${snap.totalJSHeapMB}MB`);
  if (cacheTotal > 0) lines.push(`  Smart-shelf cache hits: ${cache.hits}/${cacheTotal}`);
  if (learned.length > 0) lines.push(`  Learned timeouts: ${learned.map((l) => `${l.key}=${l.p90Ms}ms`).join(", ")}`);
  return lines;
}

function bootText(): string[] {
  const boot = collectBootInfo();
  return [
    "Boot:",
    `  Origin: ${boot.origin}`,
    `  Phases: ${boot.phases}`,
    `  Watchdog: ${boot.watchdog}`,
    `  Long tasks: ${boot.longTasks}`,
    `  Seeded cache: ${boot.seededCache}`,
  ];
}

function hostLine(hs: RuntimeInfo["hostHandshake"]): string {
  if (!hs) return DASH;
  let s = `${hs.hostKind} ${hs.hostVersion} (contract ${hs.hostApiVersion})`;
  if (hs.device) s += ` on ${hs.device.kind}/${hs.device.arch}${hs.device.model ? ` (${hs.device.model})` : ""}`;
  if (hs.bundleVersion) s += `, bundle ${hs.bundleVersion}`;
  return s;
}

function diagnosticsText(runtime: RuntimeInfo, sys: SystemInfo | null, hw: HardwareInfo | null, quarantined = 0): string {
  const yn = (b: boolean) => (b ? "yes" : "no");
  const plugins = listCoLoadedPlugins();
  return [
    `Version: ${runtime.version}`,
    `OS: ${osLine(sys, runtime.steamOS)}`,
    `Steam: ${sys?.steamVersion ?? DASH}`,
    `Theme: ${runtime.theme ?? DASH}`,
    `Host: ${hostLine(runtime.hostHandshake)}`,
    ...(hw ? hardwareText(hw) : []),
    ...perfText(),
    ...bootText(),
    `Decky: ${yn(runtime.decky)}`,
    `CSS Loader: ${yn(runtime.cssLoader)}`,
    `TabMaster: ${yn(runtime.tabMaster)}`,
    `UnifiDeck: ${yn(runtime.unifiDeck)}`,
    `Non-Steam Badges: ${yn(runtime.nonSteamBadges)}`,
    `Plugins: ${plugins.length ? plugins.join(", ") : DASH}`,
    // A count above 0 means the settings file was unreadable at some point (copies kept aside).
    `Unreadable settings copies kept: ${quarantined}`,
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

const OS_BY_DISTRO: Record<string, string> = {
  bazzite: "Bazzite", holoiso: "HoloISO", chimeraos: "ChimeraOS",
};

function osFromName(name: string, hasDistro: boolean): string | null {
  if (name.includes("windows")) return "Windows";
  if (name.includes("mac")) return "macOS";
  if (name.includes("linux") || hasDistro) return "Other Linux";
  return null;
}

function osDropdown(runtime: RuntimeInfo, sys: SystemInfo | null): string | null {
  if (isSteamOs(runtime, sys)) return "SteamOS (Steam Deck)";
  const distro = (sys?.distroId ?? "").toLowerCase();
  if (OS_BY_DISTRO[distro]) return OS_BY_DISTRO[distro];
  const named = osFromName((sys?.osName ?? "").toLowerCase(), !!distro);
  return named ?? (sys?.osName ? "Other / Unknown" : null);
}

// GitHub silently drops dropdown values that don't match a template option exactly.
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

  const diag = diagnosticsText(runtime, sys, hw, await countQuarantinedSettings());
  const context = redactAccountIds([
    ...(opts.error ? ["### Error", "```", opts.error.slice(0, 400), "```", ""] : []),
    "### Diagnostics",
    "```", diag, "```",
  ].join("\n")).slice(0, MAX_CONTEXT_URL_CHARS);

  const logs = redactAccountIds(logsText(CLIPBOARD_LOG_BUDGET));
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
