import i18next from "i18next";
import { getCurrentSettings, subscribeSettings, wasSettingsRecovered } from "../store/settingsStore";
import { installDeviceHistoryTracker } from "./deviceHistoryTracker";
import { installFriendsState } from "./friendsState";
import { installLauncherCachePoll } from "./launcherCache";
import { settingsNeedFriends, settingsNeedLaunchers, settingsNeedShortcutTags } from "./featureDemand";
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

/* The boot phases the plugin entry runs after the Home patches are in: each
   installs one concern and returns its teardown, so the entry only orders them. */

type Uninstall = () => void;
type Patch = { uninstall?: () => void } | null | undefined;

/* Startup watchdog: Home's first mount is expected well under a second; 20 s is
   generous, not tight. If it never lands, tear down both Home patches — leaving
   recentsReplace alone would hide the native recents row with nothing behind it,
   worse than the stuck injection. Both uninstalls are idempotent, so this can
   safely race a normal dispose. */
/* Only a STARTED-but-unfinished mount is a fault. If Home hasn't rendered at all
   yet (Steam restarted onto another view, a game, or a settings panel), re-arm
   instead of disabling — permanently killing the patch there left the plugin
   looking dead through no fault of the injection. Bounded re-arms. */
const WATCHDOG_BUDGET_MS = 20000;
const MAX_REARMS = 9;

// The mount timing is shared with earlier instances of this session; say so when this boot's Home has not mounted.
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
      // Home still unopened — stop watching, keep the patch
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

/* Phase B (lazy bootstrap): trackers/pollers nothing else in boot reads
   synchronously — deferred to idle so they don't compete with the critical path
   (Home injection, routes, state subscriptions). `disposed` + cancel guard the
   case where dismount happens before idle ever fires. */
/* Phase C (feature demand): the friends poller and the launcher-cache poll run
   only while the configuration can actually use their data — started the moment
   a settings change introduces such a use, stopped when the last one goes. The
   settings subscription is the only trigger. */
function followDemand(current: Uninstall | null, needed: boolean, install: () => Uninstall): Uninstall | null {
  if (needed && !current) return install();
  if (!needed && current) { current(); return null; }
  return current;
}

export function startLazyPhases(): Uninstall {
  let uninstallDeviceHistoryTracker: Uninstall | null = null;
  let uninstallFriendsState: Uninstall | null = null;
  let uninstallLauncherCache: Uninstall | null = null;
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
    uninstallLauncherCache = followDemand(uninstallLauncherCache, settingsNeedLaunchers(s), installLauncherCachePoll);
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
    uninstallLauncherCache?.();
    uninstallShortcutTags?.();
    uninstallGameLists?.();
  };
}

/* Dev-only update-probe trace. No-ops in release (`if (!__DEV__) return;` is
   dead-code-eliminated) so `__dsUpdateProbe` never lands on the global in
   distribution builds. */
const probe = (patch: Record<string, unknown>, reset = false): void => {
  if (!__DEV__) return;
  const g = globalThis as any;
  g.__dsUpdateProbe = reset ? { ...patch } : Object.assign(g.__dsUpdateProbe || {}, patch);
};

// Update notifier: the toggle (default ON) gates whether to run at all; cache +
// dismiss gate whether to fire the toast.
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

/* Boot retry: poll for network with backoff until a probe actually runs (online
   + checked) or we hit the 10-min cap. Steam restart and system reboot both land
   here; the loop self-terminates on first successful probe so steady-state work
   is zero. A self-install host already polls this same release feed to update
   itself and the bundle, owns the check and shows its own notice — never duplicated. */
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
  // Re-probe on the upward edge of the notify toggle (OFF → ON).
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

/* Two one-shots. ~18 s after boot (library + stats settled): if the user opted
   into suggestions and there's one they haven't been told about, a single
   branded, clickable toast opens the Suggestions tab (self-gated + deduped in
   `pickNewSuggestions`; no polling). */
/* ~5 s after boot: the backend flags the moment it recovers settings.json from
   a `.bak`/backups snapshot after finding the primary file corrupted (truncated
   write, disk error); reading the flag clears it server-side, so this fires
   once per actual recovery, never on a normal boot. */
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

// Log system environment for easier support debugging.
export function logSystemEnvironment(): void {
  const ua = userAgent();
  try {
    // GetOSType is async in some versions; fire-and-forget with fallback to UA
    Promise.resolve(steamClient()?.System?.GetOSType?.()).then((osType: any) => {
      logDiagnostic("info", "System environment", JSON.stringify({ ua, osType: osType ?? "unavailable" }));
    }).catch(() => {
      logDiagnostic("info", "System environment", ua);
    });
  } catch {
    logDiagnostic("info", "System environment", ua);
  }
}
