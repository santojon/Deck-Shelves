import { definePlugin } from "@decky/api";
import i18next from "i18next";
import { initI18n } from "./i18n";
import { SettingsView } from "./components/Settings";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
import "./core/internalRegistry";
import { logDiagnostic } from "./runtime/diagnostics";
import { prefetchSteamOSVersion } from "./core/steamOSVersion";
import { prewarmUserPaths } from "./core/userPaths";
import { checkForUpdate, __resetUpdateCheckCache } from "./core/updateNotifier";
import { invalidateRandomSortCache } from "./steam";
import { pruneCache as pruneImageCache } from "./core/imageCache";
import { isOnline } from "./core/connectivity";
import { getCurrentSettings, subscribeSettings } from "./store/settingsStore";
import { logError, logInfo } from "./runtime/logger";
import { toaster } from "./shims/decky-api";
import { Navigation, Focusable, DialogButton, quickAccessMenuClasses, createDeckyHostApi } from "./runtime/host/decky";
import { AboutPage } from "./components/AboutPage";
import { ShelfEditRoute, ShelfDeleteRoute } from "./components/ShelfModalRoute";
import { ShelfManageRoute } from "./components/ShelfManageRoute";
import type { HostApi } from "./runtime/host/contract";
initI18n();

// HostApi singleton — instantiated once at boot. Every `@decky/*`
// dependency eventually routes through this contract as the migration
// progresses; today only the pilot surfaces (EditShelfModal etc.) consume
// it directly.
let _hostApi: HostApi | null = null;
export function getHostApi(): HostApi { if (!_hostApi) throw new Error("HostApi not booted"); return _hostApi; }
export function __setHostApiForTest(h: HostApi | null) { _hostApi = h; }

const ABOUT_ROUTE = "/deck-shelves/about";
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
  try { (Navigation as any).CloseSideMenus?.(); } catch (e) { console.info("CloseSideMenus failed", e); }
  Navigation.Navigate(ABOUT_ROUTE);
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
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
        </svg>
      </DialogButton>
    </Focusable>
  );
}

export default definePlugin((serverAPI?: any) => {
  logInfo("RUNTIME", "plugin bootstrap start");
  const platform = createDeckyPlatform();
  setPlatform(platform);
  // Image cache pruning — drop persistent entries older than EVICT_AFTER_MS.
  // Deferred to idle so it doesn't compete with bootstrap work.
  try {
    const schedule = (globalThis as any).requestIdleCallback ?? ((cb: any) => setTimeout(cb, 2000));
    schedule(() => { try { pruneImageCache(); } catch {} });
  } catch {}
  // Resolve `~/Downloads` from the backend so import/export defaults work
  // on systems where the user account isn't `deck` (Bazzite, ChimeraOS, etc.).
  void prewarmUserPaths();
  const enableHomePatch = typeof __DECK_SHELVES_ENABLE_HOME_PATCH__ !== "undefined" ? __DECK_SHELVES_ENABLE_HOME_PATCH__ : true;
  const routerHook = serverAPI?.routerHook
    ?? (globalThis as any).window?.DFL?.routerHook
    ?? (globalThis as any).DFL?.routerHook;
  _hostApi = createDeckyHostApi(routerHook);
  const patch = enableHomePatch ? installHomePatch(routerHook) : null;
  const recentsReplacePatch = installRecentsReplace(routerHook);
  const uninstallRefresh = installShelfRefreshEmitter();
  const uninstallSystemEvents = installSystemEvents();
  const uninstallBatteryState = installBatteryState();
  const uninstallFriendsState = installFriendsState();
  const uninstallPluginApi = installPluginApi();

  try { routerHook?.addRoute?.(ABOUT_ROUTE, () => (
    <AboutPage />
  )); } catch (e) { console.warn("addRoute failed", e); }

  // Edit / Delete routes — opened by the game context menu when the user
  // selects "Edit" or "Delete" on a DS shelf card. The route mounts a
  // SettingsController standalone (no QAM required), shows the modal via
  // DFL.showModal (renders in a portal independent of the route), then
  // navigates back. Path uses :shelfId parameter so the route handler can
  // load the correct shelf from the location pathname.
  try {
    routerHook?.addRoute?.(EDIT_ROUTE, () => (
      <ShelfEditRoute shelfId="" />
    ), { exact: true });
    routerHook?.addRoute?.(DELETE_ROUTE, () => (
      <ShelfDeleteRoute shelfId="" />
    ), { exact: true });
    // Manage page — full-screen UI with all per-shelf actions (Edit /
    // Duplicate / Hide / Move / Delete). The native game context menu
    // shows a single "Deck Shelves" item that navigates here. Using a
    // flat MenuItem + route navigation is the only injection shape that
    // reliably survives React reconciliation across menu opens for every
    // game type; a nested MenuGroup wrapper only commits to the DOM for
    // the very first menu of the session and silently disappears on
    // every subsequent open.
    routerHook?.addRoute?.(MANAGE_ROUTE, () => (
      <ShelfManageRoute shelfId="" />
    ), { exact: true });
  } catch (e) { console.warn("shelf modal route addRoute failed", e); }

  logDiagnostic("info", enableHomePatch ? (patch ? "Home patch installed" : "Home patch unavailable") : "Home patch disabled in this build");

  // Random-sort cache is keyed by shelfId + idHash with a 24h TTL.
  // Wipe all entries at boot so each Steam session gets a fresh shuffle
  // — without this, shelves with `sort: random` stay in the same order
  // across Steam restarts as long as their app set doesn't change.
  try { invalidateRandomSortCache(); } catch {}

  // Prefetch SteamOS version asynchronously so synchronous version-gated
  // paths (e.g. `useLegacyMenuFlow()` in `steamGameMenu.ts`) hit the cache
  // by the time the user interacts. On 3.7.x the only source is the async
  // `SteamClient.System.GetSystemInfo()` — sync sources return null there.
  void prefetchSteamOSVersion().then((v) => {
    logDiagnostic("info", "SteamOS version", v ?? "unknown");
  }).catch(() => {});

  // Update notifier — single demand probe at boot, gated by the persisted
  // toggle (default ON). The 24h cache lives in localStorage so subsequent
  // boots short-circuit; failures are silent. On a positive result, fire a
  // toast so the user sees the notification even without opening QAM.
  //
  // `runUpdateProbe()` is the single entry point used by every trigger
  // (boot, toggle false→true, QAM banner re-mount). It honours the
  // toggle, invalidates the 24h cache when the device is online (so the
  // probe always reflects the latest release rather than yesterday's
  // snapshot — covers the post-self-upgrade case where the cached
  // `latestVersion` is older than the running build), then runs the
  // network probe and toasts on a fresh release the user hasn't already
  // dismissed. Offline → cache reused as-is so the boot path stays
  // silent on flaky links.
  const runUpdateProbe = async (reason: string): Promise<void> => {
    try {
      (globalThis as any).__dsUpdateProbe = { reason, at: Date.now(), step: 'start' };
      const s = getCurrentSettings();
      (globalThis as any).__dsUpdateProbe.step = 'settings';
      (globalThis as any).__dsUpdateProbe.settingsLoaded = !!s;
      (globalThis as any).__dsUpdateProbe.notifyEnabled = s?.updateNotifyEnabled;
      if (s?.updateNotifyEnabled === false) {
        (globalThis as any).__dsUpdateProbe.step = 'skipped-toggle-off';
        return;
      }
      try {
        const online = await isOnline();
        (globalThis as any).__dsUpdateProbe.online = online;
        if (online) __resetUpdateCheckCache();
      } catch (e) { (globalThis as any).__dsUpdateProbe.onlineErr = String(e); }
      (globalThis as any).__dsUpdateProbe.step = 'checking';
      const r = await checkForUpdate();
      (globalThis as any).__dsUpdateProbe.result = { hasUpdate: r.hasUpdate, latest: r.latestVersion, current: r.currentVersion };
      if (
        r.hasUpdate &&
        r.latestVersion &&
        r.latestVersion !== s?.updateNotifyDismissedVersion
      ) {
        (globalThis as any).__dsUpdateProbe.step = 'firing-toast';
        toaster.toast({
          title: i18next.t("pluginName"),
          body: i18next.t("update_available", { version: r.latestVersion }),
        });
        (globalThis as any).__dsUpdateProbe.step = 'toast-fired';
      } else {
        (globalThis as any).__dsUpdateProbe.step = 'no-update-or-dismissed';
        (globalThis as any).__dsUpdateProbe.dismissed = s?.updateNotifyDismissedVersion ?? null;
      }
    } catch (e) {
      (globalThis as any).__dsUpdateProbe = (globalThis as any).__dsUpdateProbe || {};
      (globalThis as any).__dsUpdateProbe.err = String(e);
    }
  };
  // Defer the boot probe so Steam's network stack + `refreshSettings()`
  // have time to come up — without this, `isOnline()` often returns false
  // on a cold boot (DNS not ready yet) and the cache invalidation step is
  // skipped, leaving a stale cached `latestVersion` to suppress the toast
  // for the rest of the 24h cache window.
  (globalThis as any).__dsUpdateProbeScheduled = Date.now();
  setTimeout(() => { void runUpdateProbe('boot'); }, 3000);

  // Re-probe whenever the user flips the notify toggle OFF → ON in the
  // QAM. `subscribeSettings` fires once immediately with the current
  // value (consumed to seed `lastToggle`), then on every settings
  // mutation; we trigger only on the upward edge so flipping OFF doesn't
  // spam toasts, and flipping it ON re-runs the same online-first probe
  // the boot path uses.
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
        unsubUpdateNotify();
      } catch (error) {
        logError("RUNTIME", "failed to remove patch", String(error));
      }
    },
  };
});
