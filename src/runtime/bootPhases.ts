import i18next from "i18next";
import { getCurrentSettings, subscribeSettings, wasSettingsRecovered } from "../store/settingsStore";
import { installDeviceHistoryTracker } from "./deviceHistoryTracker";
import { installFriendsState } from "./friendsState";
import { settingsNeedFriends, settingsNeedShortcutTags } from "./featureDemand";
import { installShortcutTagsPoll } from "./shortcutTags";
import { installGameLists } from "./gameLists";
import { checkForUpdate, __resetUpdateCheckCache } from "../core/updateNotifier";
import { installOrDownloadUpdate, canSelfInstallUpdate } from "./updateDownload";
import { isOnline } from "../core/connectivity";
import { notify } from "../components/notify";
import { pickNewSuggestions } from "./suggestionNotifier";
import { logDiagnostic } from "./diagnostics";
import { getPerfSnapshot, hasMountStarted, recordBootWatchdog, beginBootPhase, endBootPhase } from "../core/perfMetrics";
import type { Settings } from "../types";

type Uninstall = () => void;
type Patch = { uninstall?: () => void } | null | undefined;

// Remove both patches: a hidden native recents row with nothing behind it is worse than a stuck mount.
// Only a started-but-unfinished mount is a fault; if Home never rendered, re-arm instead.
const WATCHDOG_BUDGET_MS = 20000;
const MAX_REARMS = 9;

// The mount timing can come from an earlier instance in this Steam session.
function mountVerdict(rearms: number): string {
  const thisBoot = getPerfSnapshot().bootPhases.some((p) => p.name === "mount" && p.durationMs !== null);
  if (!thisBoot) return "ok (mount from an earlier instance)";
  return rearms ? `ok after ${rearms} re-arms` : "ok";
}

export function installStartupWatchdog(patch: Patch, recentsReplacePatch: Patch): Uninstall {
  if (!patch) { recordBootWatchdog("off: no Home patch"); return () => {}; }
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rearms = 0;
  const checkMount = () => {
    timer = null;
    if (getPerfSnapshot().mountMs !== null) { recordBootWatchdog(mountVerdict(rearms)); return; }
    if (!hasMountStarted()) {
      if (rearms++ >= MAX_REARMS) { recordBootWatchdog("gave up: Home never opened"); return; }
      timer = setTimeout(checkMount, WATCHDOG_BUDGET_MS);
      return;
    }
    logDiagnostic("warn", "Startup watchdog: Home didn't complete its first mount within budget — disabling Home patch for this session");
    recordBootWatchdog("tripped: Home patch disabled");
    try { patch.uninstall?.(); } catch {}
    try { recentsReplacePatch?.uninstall?.(); } catch {}
  };
  timer = setTimeout(checkMount, WATCHDOG_BUDGET_MS);
  return () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
}

function followDemand(current: Uninstall | null, needed: boolean, install: () => Uninstall): Uninstall | null {
  if (needed && !current) return install();
  if (!needed && current) { current(); return null; }
  return current;
}

export function startLazyPhases(): Uninstall {
  let uninstallDeviceHistoryTracker: Uninstall | null = null;
  let uninstallFriendsState: Uninstall | null = null;
  let uninstallShortcutTags: Uninstall | null = null;
  let uninstallGameLists: Uninstall | null = null;
  let unsubFeatureDemand: Uninstall | null = null;
  let disposed = false;
  const g = globalThis as any;
  // A timeout is required: Steam's UI can starve an idle callback for a minute.
  const schedule = g.requestIdleCallback ? (cb: () => void) => g.requestIdleCallback(cb, { timeout: 5000 }) : (cb: () => void) => setTimeout(cb, 2000);
  const cancel = g.cancelIdleCallback ?? ((id: any) => clearTimeout(id));
  const startOnDemand = (s: Settings | null) => {
    if (disposed) return;
    if (!s) return;
    uninstallFriendsState = followDemand(uninstallFriendsState, settingsNeedFriends(s), installFriendsState);
    uninstallShortcutTags = followDemand(uninstallShortcutTags, settingsNeedShortcutTags(s), installShortcutTagsPoll);
  };
  const handle = schedule(() => {
    if (disposed) return;
    beginBootPhase("lazy");
    uninstallDeviceHistoryTracker = installDeviceHistoryTracker();
    uninstallGameLists = installGameLists();
    startOnDemand(getCurrentSettings());
    unsubFeatureDemand = subscribeSettings(startOnDemand);
    endBootPhase("lazy");
  });
  return () => {
    disposed = true;
    try { cancel(handle); } catch {}
    unsubFeatureDemand?.();
    uninstallDeviceHistoryTracker?.();
    uninstallFriendsState?.();
    uninstallShortcutTags?.();
    uninstallGameLists?.();
  };
}

const probe = (patch: Record<string, unknown>, reset = false): void => {
  if (!__DEV__) return;
  const g = globalThis as any;
  g.__dsUpdateProbe = reset ? { ...patch } : Object.assign(g.__dsUpdateProbe || {}, patch);
};

async function runUpdateProbe(reason: string): Promise<boolean> {
  try {
    probe({ reason, at: Date.now(), step: 'start' }, true);
    const s = getCurrentSettings();
    probe({ notifyEnabled: s?.updateNotifyEnabled });
    if (s?.updateNotifyEnabled === false) {
      probe({ step: 'skipped-toggle-off' });
      return false;
    }
    const online = await isOnline().catch(() => false);
    probe({ online });
    if (!online) {
      probe({ step: 'skipped-offline' });
      return false;
    }
    __resetUpdateCheckCache();
    probe({ step: 'checking' });
    const r = await checkForUpdate();
    probe({ result: { hasUpdate: r.hasUpdate, latest: r.latestVersion, current: r.currentVersion } });
    const fresh = r.hasUpdate && r.latestVersion && r.latestVersion !== s?.updateNotifyDismissedVersion;
    if (fresh) {
      probe({ step: 'firing-toast' });
      notify("update", {
        body: i18next.t("update_available", { version: r.latestVersion }),
        onClick: () => { void installOrDownloadUpdate(r); },
      });
      probe({ step: 'toast-fired' });
    } else {
      probe({ step: 'no-update-or-dismissed' });
    }
    return true;
  } catch (e) {
    probe({ err: String(e) });
    return false;
  }
}

// Backs off until the first probe runs, then stops; a self-install host runs its own check instead.
const UPDATE_BACKOFFS_MS = [3000, 10000, 20000, 40000, 60000, 60000, 60000, 60000, 60000, 60000, 60000, 60000];

export function installUpdateProbes(): Uninstall {
  let bootTimer: ReturnType<typeof setTimeout> | null = null;
  let bootStep = 0;
  const scheduleBootProbe = () => {
    if (bootStep >= UPDATE_BACKOFFS_MS.length) return;
    const delay = UPDATE_BACKOFFS_MS[bootStep++];
    bootTimer = setTimeout(async () => {
      bootTimer = null;
      const probed = await runUpdateProbe('boot');
      if (!probed) scheduleBootProbe();
    }, delay);
  };
  if (!canSelfInstallUpdate()) scheduleBootProbe();
  let lastToggle = getCurrentSettings()?.updateNotifyEnabled !== false;
  const unsubscribe = subscribeSettings((s) => {
    const now = s?.updateNotifyEnabled !== false;
    if (!lastToggle && now && !canSelfInstallUpdate()) void runUpdateProbe('toggle-on');
    lastToggle = now;
  });
  return () => {
    unsubscribe();
    if (bootTimer !== null) { clearTimeout(bootTimer); bootTimer = null; }
  };
}

// Reading the recovery flag clears it on the backend, so this fires once per recovery.
export function scheduleBootToasts(openSettings: (tab?: string) => void): Uninstall {
  const suggestTimer = setTimeout(() => {
    void pickNewSuggestions().then((fresh) => {
      if (!fresh.length) return;
      notify("suggestion", {
        body: i18next.t("suggestion_toast_body"),
        onClick: () => openSettings("suggestions"),
      });
    }).catch(() => {});
  }, 18000);
  const corruptionCheckTimer = setTimeout(() => {
    void wasSettingsRecovered().then((recovered) => {
      if (!recovered) return;
      notify("warning", {
        body: i18next.t("settings_recovered_toast_body" as any),
        onClick: () => openSettings("backup"),
      });
    }).catch(() => {});
  }, 5000);
  return () => { clearTimeout(suggestTimer); clearTimeout(corruptionCheckTimer); };
}

function userAgent(): string {
  try { return typeof navigator !== "undefined" ? navigator.userAgent : "unavailable"; } catch { return "unavailable"; }
}

function steamClient(): any {
  const g = globalThis as any;
  return g.SteamClient ?? g.window?.SteamClient;
}

export function logSystemEnvironment(): void {
  const ua = userAgent();
  try {
    // GetOSType is async on some clients.
    Promise.resolve(steamClient()?.System?.GetOSType?.()).then((osType: any) => {
      logDiagnostic("info", "System environment", JSON.stringify({ ua, osType: osType ?? "unavailable" }));
    }).catch(() => {
      logDiagnostic("info", "System environment", ua);
    });
  } catch {
    logDiagnostic("info", "System environment", ua);
  }
}
