import { definePlugin } from "@decky/api";
// Build sentinel — bumped each iteration so CDP probes can confirm the
// running JS matches the latest source. Read via `window.__ds_build`.
// Dev-only; stripped from release via `if (__DEV__)`.
if (__DEV__) { try { (globalThis as any).__ds_build = "2026-06-27-friends"; } catch {} }
import i18next from "i18next";
import { initI18n } from "./i18n";
import { SettingsView } from "./components/Settings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DocsIcon } from "./components/icons";
import { createDeckyPlatform } from "./runtime/deckyPlatform";
import { PlatformProvider, setPlatform } from "./runtime/platformContext";
import './runtime/embeddedClassMap';
import { installHomePatch } from "./runtime/homePatch";
import { installRecentsReplace } from "./runtime/recentsReplace";
import { installShelfRefreshEmitter } from "./core/shelfRefresh";
import { installSystemEvents } from "./runtime/systemEvents";
import { installBatteryState } from "./runtime/batteryState";
import { installFriendsState } from "./runtime/friendsState";
import { installPluginApi } from "./core/pluginApi";
import { installLauncherCachePoll } from "./runtime/launcherCache";
import "./core/internalRegistry";
import { logDiagnostic } from "./runtime/diagnostics";
import { prefetchSteamOSVersion } from "./core/steamOSVersion";
import { prewarmUserPaths } from "./core/userPaths";
import { checkForUpdate, __resetUpdateCheckCache, openReleaseUrl } from "./core/updateNotifier";
import { invalidateRandomSortCache } from "./steam";
import { pruneCache as pruneImageCache, hydrateHotCacheFromStorage } from "./core/imageCache";
import { isOnline } from "./core/connectivity";
import { getCurrentSettings, subscribeSettings } from "./store/settingsStore";
import { setPendingSettingsTab } from "./runtime/settingsNav";
import { pickNewSuggestions } from "./runtime/suggestionNotifier";
import { notify } from "./components/notify";
import { logError, logInfo } from "./runtime/logger";
import { Navigation, Focusable, DialogButton, quickAccessMenuClasses, createDeckyHostApi } from "./runtime/host/decky";
import { createStandaloneHostApi, isStandaloneHost } from "./runtime/host/standalone";
import { AboutPage } from "./components/AboutPage";
import { SettingsPage } from "./components/SettingsPage";
import { ShelfEditRoute, ShelfDeleteRoute } from "./components/ShelfModalRoute";
import { ShelfManageRoute } from "./components/ShelfManageRoute";
import type { HostApi } from "./runtime/host/contract";
initI18n();

/* HostApi singleton — instantiated once at boot. Every `@decky/*`
   dependency eventually routes through this contract as the migration
   progresses; today only the pilot surfaces (EditShelfModal etc.) consume
   it directly. */
let _hostApi: HostApi | null = null;
export function getHostApi(): HostApi { if (!_hostApi) throw new Error("HostApi not booted"); return _hostApi; }
export function __setHostApiForTest(h: HostApi | null) { _hostApi = h; }

const ABOUT_ROUTE = "/deck-shelves/about";
const SETTINGS_ROUTE = "/deck-shelves/settings";
const EDIT_ROUTE = "/deck-shelves/edit/:shelfId";
const DELETE_ROUTE = "/deck-shelves/delete/:shelfId";
const MANAGE_ROUTE = "/deck-shelves/manage/:shelfId";

function DeckShelvesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <line x1="0.75" y1="20.75" x2="23.25" y2="20.75" strokeWidth="1.6" />
      <rect x="1" y="6.5" width="4.5" height="14.25" rx="0.5" strokeWidth="1.5" />
      <line x1="1" y1="9.5" x2="5.5" y2="9.5" strokeWidth="1.1" />
      <rect x="6.5" y="3.5" width="4" height="17.25" rx="0.5" strokeWidth="1.5" />
      <line x1="6.5" y1="6.75" x2="10.5" y2="6.75" strokeWidth="1.1" />
      <rect x="11.5" y="8.5" width="3.5" height="12.25" rx="0.5" strokeWidth="1.5" />
      <line x1="11.5" y1="11.25" x2="15" y2="11.25" strokeWidth="1.1" />
      <rect x="16" y="5" width="6.5" height="15.75" rx="0.5" strokeWidth="1.5" />
      <line x1="16" y1="8.5" x2="22.5" y2="8.5" strokeWidth="1.1" />
    </svg>
  );
}

function openAboutPage() {
  try { (Navigation as any).CloseSideMenus?.(); } catch (e) { logInfo("RUNTIME", "CloseSideMenus failed", String(e)); }
  Navigation.Navigate(ABOUT_ROUTE);
}

export function openSettingsPage(tab?: string) {
  if (tab) setPendingSettingsTab(tab);
  try { (Navigation as any).CloseSideMenus?.(); } catch (e) { logInfo("RUNTIME", "CloseSideMenus failed", String(e)); }
  Navigation.Navigate(SETTINGS_ROUTE);
}

function TitleView() {
  return (
    <Focusable
      style={{ display: "flex", padding: 0, flex: "auto", boxShadow: "none" }}
      className={quickAccessMenuClasses.Title}
    >
      <div style={{ marginRight: "auto", display: "flex", alignItems: "center" }}>Deck Shelves</div>
      <DialogButton
        style={{ height: 28, width: 40, minWidth: 0, padding: 0, display: "flex", justifyContent: "center", alignItems: "center" }}
        onClick={openAboutPage}
        onOKButton={openAboutPage}
      >
        <DocsIcon size={14} />
      </DialogButton>
      <DialogButton
        style={{ height: 28, width: 40, minWidth: 0, padding: 0, marginLeft: 4, display: "flex", justifyContent: "center", alignItems: "center" }}
        onClick={() => openSettingsPage()}
        onOKButton={() => openSettingsPage()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </DialogButton>
    </Focusable>
  );
}

export default definePlugin((serverAPI?: any) => {
  logInfo("RUNTIME", "plugin bootstrap start");
  const platform = createDeckyPlatform();
  setPlatform(platform);
  // Image cache pre-hydration + pruning, both deferred to idle so they
  /* don't compete with bootstrap. Hydration moves persistent blob URLs
     back into the in-memory hot map so the FIRST focus of every card
     is a hot hit instead of walking the local 404 chain — without this,
     every Steam restart felt like a full re-download to the user even
     though the persistent cache already had every blob. */
  try {
    const schedule = (globalThis as any).requestIdleCallback ?? ((cb: any) => setTimeout(cb, 2000));
    schedule(() => {
      try { void hydrateHotCacheFromStorage(); } catch {}
      try { void pruneImageCache(); } catch {}
    });
  } catch {}
  // Resolve `~/Downloads` from the backend so import/export defaults work
  // on systems where the user account isn't `deck` (Bazzite, ChimeraOS, etc.).
  void prewarmUserPaths();
  const enableHomePatch = typeof __DECK_SHELVES_ENABLE_HOME_PATCH__ !== "undefined" ? __DECK_SHELVES_ENABLE_HOME_PATCH__ : true;
  const routerHook = serverAPI?.routerHook
    ?? (globalThis as any).window?.DFL?.routerHook
    ?? (globalThis as any).DFL?.routerHook;
  // Host selection: use the standalone runtime (Shelves Loader) when its global
  // is present, otherwise the Decky adapter. Same HostApi contract either way.
  _hostApi = isStandaloneHost() ? createStandaloneHostApi() : createDeckyHostApi(routerHook);
  const patch = enableHomePatch ? installHomePatch(routerHook) : null;
  const recentsReplacePatch = installRecentsReplace(routerHook);
  const uninstallRefresh = installShelfRefreshEmitter();
  const uninstallSystemEvents = installSystemEvents();
  const uninstallBatteryState = installBatteryState();
  const uninstallFriendsState = installFriendsState();
  const uninstallPluginApi = installPluginApi();
  const uninstallLauncherCache = installLauncherCachePoll();

  try { routerHook?.addRoute?.(ABOUT_ROUTE, () => (
    <AboutPage />
  )); } catch (e) { logInfo("RUNTIME", "addRoute failed", String(e)); }

  /* Full-page Settings route — registered eagerly so navigation works.
     The QAM gear-icon button that triggers it stays gated behind the
     `settingsPageEnabled` flag (off by default) until the page itself
     is built out beyond its current placeholder. */
  try { routerHook?.addRoute?.(SETTINGS_ROUTE, () => (
    <SettingsPage />
  )); } catch (e) { logInfo("RUNTIME", "settings route addRoute failed", String(e)); }

  // Edit / Delete routes — opened from the card context menu; mount a
  // standalone controller and show the modal via showModal in a portal.
  try {
    routerHook?.addRoute?.(EDIT_ROUTE, () => (
      <ShelfEditRoute shelfId="" />
    ), { exact: true });
    routerHook?.addRoute?.(DELETE_ROUTE, () => (
      <ShelfDeleteRoute shelfId="" />
    ), { exact: true });
    // Manage page route — flat MenuItem + navigation; nested groups
    // disappear after the first menu open.
    routerHook?.addRoute?.(MANAGE_ROUTE, () => (
      <ShelfManageRoute shelfId="" />
    ), { exact: true });
  } catch (e) { logInfo("RUNTIME", "shelf modal route addRoute failed", String(e)); }

  logDiagnostic("info", enableHomePatch ? (patch ? "Home patch installed" : "Home patch unavailable") : "Home patch disabled in this build");

  /* Random-sort cache is keyed by shelfId + idHash with a 24h TTL.
     Wipe all entries at boot so each Steam session gets a fresh shuffle
     — without this, shelves with `sort: random` stay in the same order
     across Steam restarts as long as their app set doesn't change. */
  try { invalidateRandomSortCache(); } catch {}

  /* Prefetch SteamOS version asynchronously so synchronous version-gated
     paths (e.g. `useLegacyMenuFlow()` in `steamGameMenu.ts`) hit the cache
     by the time the user interacts. On 3.7.x the only source is the async
     `SteamClient.System.GetSystemInfo()` — sync sources return null there. */
  void prefetchSteamOSVersion().then((v) => {
    logDiagnostic("info", "SteamOS version", v ?? "unknown");
  }).catch(() => {});

  // Update notifier: probe always runs once the network is reachable.
  // Toggle (default ON) gates whether to run at all; cache + dismiss
  // gate whether to fire the toast.
  /* Dev-only update-probe trace. The `probe` helper no-ops in release
     (`if (!__DEV__) return;` is dead-code-eliminated) so `__dsUpdateProbe`
     never lands on the global in distribution builds. */
  const probe = (patch: Record<string, unknown>, reset = false): void => {
    if (!__DEV__) return;
    const g = globalThis as any;
    g.__dsUpdateProbe = reset ? { ...patch } : Object.assign(g.__dsUpdateProbe || {}, patch);
  };
  const runUpdateProbe = async (reason: string): Promise<boolean> => {
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
          onClick: () => openReleaseUrl(r.releaseUrl),
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
  };

  /* Boot retry: poll for network with backoff until a probe actually
     runs (online + checked) or we hit the 10-min cap. Steam restart and
     system reboot both land here; the loop self-terminates on first
     successful probe so steady-state work is zero. */
  const UPDATE_BACKOFFS_MS = [3000, 10000, 20000, 40000, 60000, 60000, 60000, 60000, 60000, 60000, 60000, 60000];
  let updateBootTimer: ReturnType<typeof setTimeout> | null = null;
  let updateBootStep = 0;
  const scheduleBootProbe = () => {
    if (updateBootStep >= UPDATE_BACKOFFS_MS.length) return;
    const delay = UPDATE_BACKOFFS_MS[updateBootStep++];
    updateBootTimer = setTimeout(async () => {
      updateBootTimer = null;
      const probed = await runUpdateProbe('boot');
      if (!probed) scheduleBootProbe();
    }, delay);
  };
  scheduleBootProbe();

  /* One-shot, ~18 s after boot (library + stats settled): if the user opted
     into suggestions and there's a suggestion they haven't been told about,
     fire a single branded, clickable toast that opens the Suggestions tab.
     Self-gated + deduped in `pickNewSuggestions`; no polling. */
  const suggestTimer = setTimeout(() => {
    void pickNewSuggestions().then((fresh) => {
      if (!fresh.length) return;
      notify("suggestion", {
        body: i18next.t("suggestion_toast_body"),
        onClick: () => openSettingsPage("suggestions"),
      });
    }).catch(() => {});
  }, 18000);

  // Re-probe on the upward edge of the notify toggle (OFF → ON).
  let lastToggle = getCurrentSettings()?.updateNotifyEnabled !== false;
  const unsubUpdateNotify = subscribeSettings((s) => {
    const now = s?.updateNotifyEnabled !== false;
    if (!lastToggle && now) void runUpdateProbe('toggle-on');
    lastToggle = now;
  });

  // Log system environment for easier support debugging
  try {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unavailable";
    const client = (globalThis as any).SteamClient ?? (window as any)?.SteamClient;
    // GetOSType is async in some versions; fire-and-forget with fallback to UA
    Promise.resolve(client?.System?.GetOSType?.()).then((osType: any) => {
      logDiagnostic("info", "System environment", JSON.stringify({ ua, osType: osType ?? "unavailable" }));
    }).catch(() => {
      logDiagnostic("info", "System environment", ua);
    });
  } catch {
    try { logDiagnostic("info", "System environment", navigator?.userAgent ?? "unavailable"); } catch {}
  }

  return {
    name: "Deck Shelves",
    title: <></>,
    titleView: <TitleView />,
    content: (
      <PlatformProvider platform={platform}>
        <ErrorBoundary title="Deck Shelves">
          <SettingsView />
        </ErrorBoundary>
      </PlatformProvider>
    ),
    icon: <DeckShelvesIcon />,
    onDismount() {
      try {
        logInfo("RUNTIME", "plugin dismount");
        patch?.uninstall?.();
        recentsReplacePatch?.uninstall?.();
        routerHook?.removeRoute?.(ABOUT_ROUTE);
        routerHook?.removeRoute?.(EDIT_ROUTE);
        routerHook?.removeRoute?.(DELETE_ROUTE);
        routerHook?.removeRoute?.(MANAGE_ROUTE);
        uninstallRefresh();
        uninstallSystemEvents();
        uninstallBatteryState();
        uninstallFriendsState();
        uninstallPluginApi();
        uninstallLauncherCache();
        unsubUpdateNotify();
        if (updateBootTimer !== null) { clearTimeout(updateBootTimer); updateBootTimer = null; }
        clearTimeout(suggestTimer);
      } catch (error) {
        logError("RUNTIME", "failed to remove patch", String(error));
      }
    },
  };
});
