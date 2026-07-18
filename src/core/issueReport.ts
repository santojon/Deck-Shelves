/* Pre-filled bug report: gathers the same diagnostics as Settings → Advanced →
   Diagnostics, aggregates the dev log buffer, and opens the repo's bug-report
   Issue Form in the system browser with everything filled in — no server, the
   payload rides in the URL. Labels are fixed English so the maintainer always
   gets a consistent, machine-diffable readout regardless of the user's locale. */
import {
  collectRuntimeInfo,
  collectSystemInfo,
  listCoLoadedPlugins,
  summarizeConfig,
  type RuntimeInfo,
  type SystemInfo,
} from "../runtime/diagnosticsInfo";
import { getDiagnostics } from "../runtime/diagnostics";
import { getCurrentSettings } from "../store/settingsStore";
import { openExternalUrl } from "./updateNotifier";

const ISSUE_URL = "https://github.com/santojon/Deck-Shelves/issues/new";
const DASH = "—";
// Keep the whole pre-filled body well under GitHub's URL length limit (~8 KB
// once percent-encoded); diagnostics are small, so the rest is the log budget.
const CONTEXT_BUDGET = 3000;

function osLine(sys: SystemInfo | null, steamOS: string | null): string {
  if (sys?.osName) return sys.osVersion ? `${sys.osName} ${sys.osVersion}` : sys.osName;
  if (steamOS) return `SteamOS ${steamOS}`;
  return DASH;
}

function diagnosticsText(runtime: RuntimeInfo, sys: SystemInfo | null): string {
  const yn = (b: boolean) => (b ? "yes" : "no");
  const plugins = listCoLoadedPlugins();
  return [
    `Version: ${runtime.version}`,
    `OS: ${osLine(sys, runtime.steamOS)}`,
    `Steam: ${sys?.steamVersion ?? DASH}`,
    `Theme: ${runtime.theme ?? DASH}`,
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
  return !!(runtime.steamOS || /steamos/i.test(sys?.osName ?? ""));
}

/* Best-effort prefill of the bug form's dropdown/input fields. Dropdown values
   MUST match a template option verbatim, else GitHub silently drops them. */
function fillEnvironment(p: URLSearchParams, runtime: RuntimeInfo, sys: SystemInfo | null): void {
  const beta = (getCurrentSettings() as any)?.betaChannelEnabled === true;
  const osv = osLine(sys, runtime.steamOS);
  setIf(p, "os", isSteamOs(runtime, sys) ? "SteamOS (Steam Deck)" : null);
  setIf(p, "os_version", osv !== DASH ? osv : null);
  setIf(p, "steam_client", sys?.steamVersion);
  setIf(p, "version", runtime.version);
  p.set("release_channel", beta ? "Beta / Pre-release" : "Stable");
  p.set("steam_mode", "Game Mode (Steam Deck home / GamepadUI)");
}

export async function openBugReport(): Promise<void> {
  const runtime = collectRuntimeInfo();
  let sys: SystemInfo | null = null;
  try { sys = await collectSystemInfo(); } catch { /* fail-soft — report without OS/Steam */ }

  const diag = diagnosticsText(runtime, sys);
  const logs = logsText(Math.max(500, CONTEXT_BUDGET - diag.length));
  const context = [
    "### Diagnostics",
    "```", diag, "```",
    "",
    "### Logs (most recent first)",
    "```", logs, "```",
  ].join("\n");

  const p = new URLSearchParams();
  p.set("template", "bug_report.yml");
  p.set("title", "[BUG] ");
  p.set("context", context);
  fillEnvironment(p, runtime, sys);
  openExternalUrl(`${ISSUE_URL}?${p.toString()}`);
}
