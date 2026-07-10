/* Read-only runtime detection for the Advanced → Diagnostics panel. Every probe
   observes (version strings, active theme, co-loaded plugins) and never mutates
   Steam or plugin state. Advanced-mode only. */

import pkg from "../../package.json";
import { getSteamOSVersion } from "../core/steamOSVersion";
import {
  isCssLoaderActive,
  isArtHeroActive,
  isTiltedHomeActive,
  isHeroFullscreenActive,
  isNoHomeTextActive,
  cssLoaderStyleCount,
} from "../core/cssLoaderDetect";
import * as pluginRegistry from "../integrations/registry";

export interface RuntimeInfo {
  version: string;
  steamOS: string | null;
  decky: boolean;
  cssLoader: boolean;
  theme: string | null;
  tabMaster: boolean;
  unifiDeck: boolean;
  nonSteamBadges: boolean;
}

function deckyLoader(): unknown {
  try {
    const w = window as any;
    const g = globalThis as any;
    return w.DeckyPluginLoader ?? g.DeckyPluginLoader ?? g.deckyPluginLoader ?? w.deckyPluginLoader ?? null;
  } catch { return null; }
}

/** Names of every plugin the Decky loader currently has loaded (deduped, sorted). */
export function listCoLoadedPlugins(): string[] {
  try {
    const raw = (deckyLoader() as any)?.plugins ?? (deckyLoader() as any)?.pluginList;
    const arr: any[] = raw instanceof Map ? Array.from(raw.values()) : (Array.isArray(raw) ? raw : []);
    const names = arr.map((p) => (typeof p?.name === "string" ? p.name : "")).filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  } catch { return []; }
}

function activeTheme(): string | null {
  if (!isCssLoaderActive()) return null;
  // Human-readable: the DS-relevant home themes we structurally detect. Reading
  // CSS Loader's raw style-node ids proved unreadable, so we don't.
  const parts: string[] = [];
  if (isTiltedHomeActive()) parts.push("TiltedHome");
  if (isArtHeroActive()) parts.push("ArtHero");
  if (isHeroFullscreenActive()) parts.push("Hero Fullscreen");
  if (isNoHomeTextActive()) parts.push("No Home Text");
  // No DS-known theme matched but CSS Loader is injecting styles — surface the
  // block count as a signal (theme names aren't reliably tagged to read).
  return parts.length ? parts.join(", ") : `CSS Loader (${cssLoaderStyleCount()})`;
}

export interface SystemInfo {
  steamVersion: string | null;
  osName: string | null;
  osVersion: string | null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.length) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function uaOsName(ua: string): string | null {
  if (/SteamOS/i.test(ua)) return "SteamOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}

function fromSystemInfo(info: any, out: SystemInfo): void {
  if (!info) return;
  out.osName = strOrNull(info.sOSName) ?? strOrNull(info.sOSType);
  out.osVersion = strOrNull(info.sOSVersionId) ?? strOrNull(info.sKernelVersion);
  out.steamVersion = strOrNull(info.sSteamUIVersion) ?? strOrNull(info.nSteamVersion) ?? strOrNull(info.sClientVersion);
}

/** Steam client + OS detection (async, platform-agnostic — not SteamOS-only).
    Reads SteamClient.System.GetSystemInfo when present, then the user agent. */
export async function collectSystemInfo(): Promise<SystemInfo> {
  const out: SystemInfo = { steamVersion: null, osName: null, osVersion: null };
  try {
    const sc: any = (globalThis as any).SteamClient;
    fromSystemInfo(await sc?.System?.GetSystemInfo?.(), out);
  } catch { /* not available */ }
  try {
    const ua = (globalThis as any).navigator?.userAgent as string | undefined;
    if (ua && !out.osName) out.osName = uaOsName(ua);
  } catch { /* no navigator */ }
  return out;
}

export function collectRuntimeInfo(): RuntimeInfo {
  return {
    version: (pkg as any).version ?? "0.0.0",
    steamOS: getSteamOSVersion(),
    decky: deckyLoader() != null,
    cssLoader: isCssLoaderActive(),
    theme: activeTheme(),
    tabMaster: pluginRegistry.isTabMasterInstalled(),
    unifiDeck: pluginRegistry.isUnifiDeckInstalled(),
    nonSteamBadges: pluginRegistry.isNonSteamBadgesInstalled(),
  };
}

const onOff = (v: any) => (v ? "on" : "off");

// Global-visual on/off toggles surfaced in the config summary: [settings key, label].
const VISUAL_ENABLED_FLAGS: Array<[string, string]> = [
  ["globalMatchNativeSize", "match-native"],
  ["globalHighlightFirst", "highlight-first"],
  ["globalHighlightAll", "highlight-all"],
  ["globalHighlightRandom", "highlight-random"],
  ["globalEnableLogo", "logo"],
  ["globalEnableIcon", "icon"],
  ["globalEnableDescription", "description"],
  ["globalHeroEnabled", "hero"],
  ["globalGameInfoAbove", "info-above"],
  ["globalFriendsPlayingOverlay", "friends"],
  ["globalFriendsPlayingOverlayRecent", "friends-recent"],
  ["globalFullPageShelf", "full-page"],
  ["globalDescriptionBelowLogo", "desc-below-logo"],
  ["globalLogoBelowShelf", "logo-below-shelf"],
  ["globalDedupeByName", "dedupe-by-name"],
];

// Global-visual "hide element" toggles.
const VISUAL_HIDE_FLAGS: Array<[string, string]> = [
  ["globalHideStatusLine", "status-line"],
  ["globalHideNewBadge", "new-badge"],
  ["globalHideDiscountBadge", "discount-badge"],
  ["globalHideCompatIcons", "compat-icons"],
  ["globalHideNonSteamBadge", "nonsteam-badge"],
  ["globalHideShelfTitle", "shelf-title"],
  ["globalHideGameNames", "game-names"],
  ["globalHideInstallIndicator", "install-indicator"],
  ["globalHideSeeMore", "see-more"],
  ["globalHideRefreshCard", "refresh-card"],
];

// The QAM "Additional features" section (matches the `additional` section's toggles).
function featureLine(s: any): string {
  return `Features: Update notify ${onOff(s.updateNotifyEnabled !== false)} (beta ${onOff(s.betaChannelEnabled)}) · Quick Search ${onOff(s.contextSearchEnabled)} · Side Nav ${onOff(s.sideNavEnabled)} · Online ${onOff(s.onlineFeaturesEnabled)} · Force CSS themes ${onOff(s.forceCssLoaderThemes)}`;
}

// Global visual: the enabled toggles, the hidden elements, and the numeric /
// position values (— when unset, so it falls back to the built-in default).
function visualLines(s: any): string[] {
  const on = VISUAL_ENABLED_FLAGS.filter(([k]) => s[k]).map(([, l]) => l);
  const hidden = VISUAL_HIDE_FLAGS.filter(([k]) => s[k]).map(([, l]) => l);
  const val = (v: any, unit = "") => (v == null ? "—" : `${v}${unit}`);
  return [
    `Global visual on: ${on.length ? on.join(", ") : "none"}`,
    `Global visual hidden: ${hidden.length ? hidden.join(", ") : "none"}`,
    `Global visual values: desc-scale ${val(s.globalDescriptionScale, "%")} · logo ${val(s.globalLogoPosition)}/${val(s.globalLogoSize, "%")}/${val(s.globalLogoTopOffset, "%")} · desc ${val(s.globalDescriptionPosition)}/h${val(s.globalDescriptionHeight)}/gap ${val(s.globalDescriptionLogoGap, "px")} · icon ${val(s.globalIconVerticalAlign)} · title ${val(s.globalShelfTitlePosition)} · name ${val(s.globalGameNamePosition)} · playtime ${val(s.globalPlaytimePosition)}`,
  ];
}

/* Compact human-readable summary of the user's currently-active Deck Shelves
   configuration — counts, core toggles, the Additional-features section and the
   Global-visual toggles + values — for the System information panel (and its
   copyable dump). Read-only; tolerant of missing fields. Labels stay in English
   so a copied dump reads the same regardless of UI language. */
export function summarizeConfig(settings: any): string[] {
  const s = settings ?? {};
  const count = (v: any) => (Array.isArray(v) ? v.length : 0);
  const recents = s.recentsReplaceSource ? "replaced" : s.hideRecents ? "hidden" : "default";
  const active = s.activeProfileName ? ` · active "${s.activeProfileName}"` : "";
  return [
    `Master: ${onOff(s.enabled !== false)}`,
    `Shelves: ${count(s.shelves)} · smart ${count(s.smartShelves)} (${onOff(s.smartShelvesEnabled)})`,
    `Profiles: ${count(s.profiles)}${active}`,
    `Saved filters: ${count(s.savedFilters)} · smart ${count(s.savedSmartFilters)}`,
    `Modes: Light ${onOff(s.lightModeEnabled)} · Advanced ${onOff(s.advancedModeEnabled)} · Developer ${onOff(s.devModeEnabled)}`,
    `Recents: ${recents} · Home tabs: ${s.hideHomeTabs ? "hidden" : "shown"} · Debug overlay: ${onOff(s.debugOverlayEnabled)}`,
    featureLine(s),
    ...visualLines(s),
  ];
}
