import { definePlugin } from "@host/api";
import i18next from "i18next";
import { useEffect, useReducer, type ReactNode } from "react";
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
import { installPowerGate } from "./runtime/powerGate";
import { installSystemEvents } from "./runtime/systemEvents";
import { installBatteryState } from "./runtime/batteryState";
import { installDeviceState } from "./runtime/deviceState";
import { installSessionState } from "./runtime/sessionState";
import { installProfileTriggers } from "./runtime/profileTriggers";
import { installOwnQamTab } from "./runtime/ownQamTab";
import { installShowcaseMode } from "./runtime/showcaseMode";
import { installSteamAccountWatch } from "./runtime/steamAccount";
import { notifyAccountSwitch } from "./features/account/accountSwitchNotice";
import { createAccountSettingsHandler } from "./runtime/accountSettings";
import { notifyAccountRestored, openAccountChoice } from "./features/account/AccountChoiceModal";
import { isPerAccount } from "./domain/accountBuckets";
import { installScreensaverInject } from "./runtime/screensaverInject";
import { installCloudSync } from "./runtime/cloudSync";
import { installPluginApi } from "./core/pluginApi";
import "./core/internalRegistry";
import { logDiagnostic } from "./runtime/diagnostics";
import { prefetchSteamOSVersion } from "./core/steamOSVersion";
import { prewarmUserPaths } from "./core/userPaths";
import { invalidateRandomSortCache } from "./steam";
import { pruneCache as pruneImageCache, hydrateHotCacheFromStorage } from "./core/imageCache";
import { pruneShelfCaches } from "./components/shelf/shelfViewHelpers";
import { getCurrentSettings, isSettingsFileRead, onSettingsFileRead, requestSettingsFileRead, subscribeSettings } from "./store/settingsStore";
import type { Settings } from "./types";
import { setPendingSettingsTab } from "./runtime/settingsNav";
import { logError, logInfo } from "./runtime/logger";
import { disposeAll } from "./runtime/runtimeDisposer";
import { evaluateBootOutcome } from "./runtime/safeMode";
import { markBootStart, recordBootCritical } from "./core/perfMetrics";
import { installStartupWatchdog, startLazyPhases, installUpdateProbes, scheduleBootToasts, logSystemEnvironment } from "./runtime/bootPhases";
import { Navigation, Focusable, DialogButton, quickAccessMenuClasses } from "./runtime/host/decky";
import { resolveHost, hostProvidesNativeTab, shouldUseForcedHost, awaitInjectedHost } from "./runtime/host/resolve";
import { claimHomeOwnership, getOwnerKind, type HostKind } from "./runtime/host/ownerGuard";
import { setHostHandshake, getHostHandshake } from "./runtime/hostHandshake";
import { tryDeferToHost, readDeferSignal, hostBundleBooted } from "./runtime/host/coopDefer";
import { SetupWizardEntry } from "./features/setup/SetupWizardEntry";
import pkg from "../package.json";
import { AboutPage } from "./components/AboutPage";
import { SettingsPage } from "./components/SettingsPage";
import { ShelfEditRoute, ShelfDeleteRoute, ShelfComposeRoute, GameTagsRoute } from "./components/ShelfModalRoute";
import { isForcedOwner, getInjectedHost, type HostApi, type QamPanel } from "./runtime/host/contract";
initI18n();

let _hostApi: HostApi | null = null;
export function getHostApi(): HostApi { if (!_hostApi) throw new Error("HostApi not booted"); return _hostApi; }

const ABOUT_ROUTE = "/deck-shelves/about";
const SETTINGS_ROUTE = "/deck-shelves/settings";
const EDIT_ROUTE = "/deck-shelves/edit/:shelfId";
const DELETE_ROUTE = "/deck-shelves/delete/:shelfId";
const COMPOSE_ROUTE = "/deck-shelves/compose/:sourceId/:targetId";
const TAGS_ROUTE = "/deck-shelves/tags/:appid";

// Same mark as assets/tab-icon.svg; keep the two in sync.
function DeckShelvesIcon({ fixedSize = true }: { fixedSize?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={fixedSize ? { width: 18, height: 18 } : undefined}>
      <rect x="3.8" y="7.5" width="3.9" height="11.5" rx="0.8" />
      <rect x="8.7" y="5" width="3.9" height="14" rx="0.8" />
      <rect x="14" y="8" width="3.9" height="11" rx="0.8" transform="rotate(-13 15.95 19)" />
      <rect x="2.4" y="19" width="19.2" height="2.5" rx="0.9" />
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

type StandInEntry = { content?: ReactNode; onDismount?: () => void } | null;
let standInEntry: StandInEntry = null;
const standInWatchers = new Set<() => void>();
function StandInContent() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { standInWatchers.add(rerender); return () => { standInWatchers.delete(rerender); }; }, []);
  if (standInEntry?.content) return <>{standInEntry.content}</>;
  return <div style={{ padding: "8px 16px", opacity: 0.8 }}>{i18next.t("coop_stand_in")}</div>;
}

// Sized like the host's own tab so the title stays on one line.
const titleIconButton = { height: 28, width: 28, minWidth: 0, padding: 0, borderRadius: 4, flex: "0 0 auto", display: "flex", justifyContent: "center", alignItems: "center" } as const;

function TitleView() {
  return (
    <Focusable
      style={{ display: "flex", alignItems: "center", gap: 8, padding: 0, flex: "auto", boxShadow: "none" }}
      className={quickAccessMenuClasses.Title}
    >
      <div style={{ marginRight: "auto", minWidth: 0, fontSize: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Deck Shelves</div>
      <SetupWizardEntry />
      <DialogButton style={titleIconButton} onClick={openAboutPage} onOKButton={openAboutPage}>
        <DocsIcon size={16} />
      </DialogButton>
      <DialogButton style={titleIconButton} onClick={() => openSettingsPage()} onOKButton={() => openSettingsPage()}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </DialogButton>
    </Focusable>
  );
}

const ENABLE_HOME_PATCH = typeof __DECK_SHELVES_ENABLE_HOME_PATCH__ !== "undefined" ? __DECK_SHELVES_ENABLE_HOME_PATCH__ : true;

// Keyed on the loader only; the injected host's router hook must not make resolveHost pick the loader.
function loaderRouterHookOf(serverAPI: any): any {
  const g = globalThis as any;
  return serverAPI?.routerHook ?? g.window?.DFL?.routerHook ?? g.DFL?.routerHook;
}

function pluginRouterHookOf(loaderRouterHook: any): any {
  const g = globalThis as any;
  return loaderRouterHook ?? g.window?.__SHELVES_HOST__?.routerHook ?? g.__SHELVES_HOST__?.routerHook;
}

function cacheHostHandshake(host: HostApi): void {
  try { setHostHandshake(host.handshake?.() ?? null); } catch { setHostHandshake(null); }
}

// A hot-swap skips the old instance's onDismount, so the next instance of the same kind disposes it.
function disposePreviousInstance(kind: HostKind): void {
  try {
    (globalThis as any).__DECK_SHELVES_INSTANCES__?.[kind]?.dispose?.();
  } catch (error) {
    logError("RUNTIME", "failed to dispose previous instance before hot-swap boot", String(error));
  }
}

function stashInstance(kind: HostKind, dispose: () => void): void {
  try {
    const w = globalThis as any;
    const entry = { dispose, kind };
    w.__DECK_SHELVES_INSTANCE__ = entry;
    (w.__DECK_SHELVES_INSTANCES__ ??= {})[kind] = entry;
  } catch {}
}

function claimRenderer(coopForce: boolean, loaderLaunched: boolean): boolean {
  const isOwner = claimHomeOwnership((coopForce || !loaderLaunched) ? "shelveshub" : "decky");
  if (!isOwner) logInfo("RUNTIME", "another Deck Shelves instance owns the renderer — standing down (no home patch / no settings writes)");
  return isOwner;
}

// Safe Mode: skip the Home patches after repeated boots that never finished mounting.
function installHomePatches(routerHook: any, isOwner: boolean) {
  const safeMode = evaluateBootOutcome();
  if (safeMode) logDiagnostic("warn", "Safe Mode: Home patches skipped after repeated incomplete boots");
  const active = isOwner && !safeMode;
  const patch = (ENABLE_HOME_PATCH && active) ? installHomePatch(routerHook) : null;
  const recentsReplacePatch = active ? installRecentsReplace(routerHook) : null;
  logDiagnostic("info", ENABLE_HOME_PATCH ? (patch ? "Home patch installed" : "Home patch unavailable") : "Home patch disabled in this build");
  return { patch, recentsReplacePatch };
}

type RouteSpec = { path: string; label: string; exact?: boolean; render: () => ReactNode };
// Manage is a flat MenuItem plus navigation because nested groups disappear after the first open.
const PLUGIN_ROUTES: RouteSpec[] = [
  { path: ABOUT_ROUTE, label: "about", render: () => <AboutPage /> },
  { path: SETTINGS_ROUTE, label: "settings", render: () => <SettingsPage /> },
  { path: EDIT_ROUTE, label: "shelf modal", exact: true, render: () => <ShelfEditRoute shelfId="" /> },
  { path: DELETE_ROUTE, label: "shelf modal", exact: true, render: () => <ShelfDeleteRoute shelfId="" /> },
  { path: COMPOSE_ROUTE, label: "shelf modal", exact: true, render: () => <ShelfComposeRoute sourceId="" targetId="" /> },
  { path: TAGS_ROUTE, label: "tags modal", exact: true, render: () => <GameTagsRoute appid={0} /> },
];

function registerPluginRoutes(routerHook: any): void {
  for (const r of PLUGIN_ROUTES) {
    try {
      if (r.exact) routerHook?.addRoute?.(r.path, r.render, { exact: true });
      else routerHook?.addRoute?.(r.path, r.render);
    } catch (e) { logInfo("RUNTIME", `${r.label} route addRoute failed`, String(e)); }
  }
}

function unregisterPluginRoutes(routerHook: any): void {
  for (const r of PLUGIN_ROUTES) routerHook?.removeRoute?.(r.path);
}

// The host tab may inject after this runs, so retry and enqueue.
function registerHostQamPanel(renderPanel: QamPanel["content"]): () => void {
  try {
    const qamPanel: QamPanel = { id: "deck-shelves", title: i18next.t("menu_deck_shelves"), content: renderPanel };
    const registerNativeTab = (): boolean => {
      const q = window.__SHELVES_QAM__;
      if (q?.registerPanel) { try { q.registerPanel(qamPanel); } catch {} return true; }
      return false;
    };
    if (!registerNativeTab()) {
      // The host drains the pending list when it installs; poll briefly in case it is mid-injection.
      const pending = (window.__SHELVES_QAM_PENDING__ ??= []);
      pending.push(qamPanel);
      let attempts = 0;
      const timer = setInterval(() => { if (registerNativeTab() || ++attempts > 100) clearInterval(timer); }, 100);
      return () => { clearInterval(timer); const i = pending.indexOf(qamPanel); if (i >= 0) pending.splice(i, 1); };
    }
  } catch {}
  return () => {};
}

function installOwnTabIfWanted(isOwner: boolean, loaderLaunched: boolean, renderPanel: () => ReactNode): (() => void) | null {
  if (!isOwner || !loaderLaunched || hostProvidesNativeTab()) return null;
  return installOwnQamTab({
    title: i18next.t("menu_deck_shelves"),
    icon: <DeckShelvesIcon fixedSize={false} />, // Steam's strip sizes its tab icons itself
    renderPanel,
    isEnabled: () => getCurrentSettings()?.ownQamTabEnabled === true,
    subscribe: subscribeLoadedSettings,
  });
}

const OWN_TAB_FILE_WAIT_MS = 10_000;

// The tab decides once per start, so it waits for the settings file rather than defaults or a stale cache.
function subscribeLoadedSettings(listener: () => void): () => void {
  let loaded = false;
  let waitedOut = false;
  let wait: ReturnType<typeof setTimeout> | null = null;
  const report = (s: Settings | null) => {
    if (!loaded && (s?.schemaVersion == null || !(waitedOut || isSettingsFileRead()))) return;
    loaded = true;
    if (wait) { clearTimeout(wait); wait = null; }
    listener();
  };
  const offRead = onSettingsFileRead(() => report(getCurrentSettings()));
  const offChange = subscribeSettings((s) => report(s));
  if (!loaded && !isSettingsFileRead()) {
    wait = setTimeout(() => { wait = null; waitedOut = true; report(getCurrentSettings()); }, OWN_TAB_FILE_WAIT_MS);
    requestSettingsFileRead();
  }
  return () => { if (wait) clearTimeout(wait); offRead(); offChange(); };
}

// Patches a Steam internal of unguaranteed shape; never let it take boot down.
function tryInstall(install: () => () => void): (() => void) | null {
  try { return install(); } catch { return null; }
}

const __ds_entry = definePlugin((serverAPI?: any) => {
  markBootStart();
  logInfo("RUNTIME", "plugin bootstrap start");
  try { disposeAll(); } catch {}
  const platform = createDeckyPlatform();
  setPlatform(platform);
  // Deferred to idle so it doesn't compete with boot.
  try {
    // A timeout is required: Steam's UI can starve an idle callback for a minute.
    const ric = (globalThis as any).requestIdleCallback;
    const schedule = ric ? (cb: () => void) => ric(cb, { timeout: 5000 }) : (cb: () => void) => setTimeout(cb, 2000);
    schedule(() => {
      try { void hydrateHotCacheFromStorage(); } catch {}
      try { void pruneImageCache(); } catch {}
      // Expired per-shelf id caches are never read again, so nothing else drops them.
      try { pruneShelfCaches(); } catch {}
    });
  } catch {}
  // The user account isn't always `deck`.
  void prewarmUserPaths();
  // The forced neutral host may not have injected yet, so defer the host-dependent boot until it does.
  const boot = (): unknown => {
  const loaderRouterHook = loaderRouterHookOf(serverAPI);
  const loaderLaunched = !!(serverAPI || loaderRouterHook);
  _hostApi = resolveHost(serverAPI, loaderRouterHook);
  cacheHostHandshake(_hostApi);
  const deferToHost = tryDeferToHost({
    loaderLaunched: !__ds_selfInvoked, forced: shouldUseForcedHost(),
    handshake: getHostHandshake(), ownVersion: pkg.version, log: (m) => logInfo("RUNTIME", m),
    onFallback: () => bootStandIn("boot after host defer failed"),
  });
  if (deferToHost) return standIn();
  const routerHook = pluginRouterHookOf(loaderRouterHook);
  const isOwner = claimRenderer(shouldUseForcedHost(), loaderLaunched);
  disposePreviousInstance(getOwnerKind());
  // Before anything periodic registers with it.
  const uninstallPowerGate = installPowerGate();
  const { patch, recentsReplacePatch } = installHomePatches(routerHook, isOwner);
  const uninstallWatchdog = installStartupWatchdog(patch, recentsReplacePatch);
  const uninstallRefresh = installShelfRefreshEmitter();
  const uninstallSystemEvents = installSystemEvents();
  const uninstallBatteryState = installBatteryState();
  const uninstallDeviceState = installDeviceState();
  const uninstallSessionState = installSessionState();
  const uninstallProfileTriggers = installProfileTriggers();
  const uninstallPluginApi = installPluginApi();
  const uninstallLazyPhases = startLazyPhases();
  registerPluginRoutes(routerHook);

  // Fresh shuffle every Steam session.
  try { invalidateRandomSortCache(); } catch {}

  // Prefetched so synchronous version checks hit the cache; some clients only expose it asynchronously.
  void prefetchSteamOSVersion().then((v) => {
    logDiagnostic("info", "SteamOS version", v ?? "unknown");
  }).catch(() => {});

  const uninstallUpdateProbes = installUpdateProbes();
  const uninstallBootToasts = scheduleBootToasts(openSettingsPage);
  logSystemEnvironment();

  const renderSettingsContent = () => (
    <PlatformProvider platform={platform}>
      <ErrorBoundary title="Deck Shelves">
        <SettingsView />
      </ErrorBoundary>
    </PlatformProvider>
  );

  const renderNativeTabPanel = () => (
    <>
      {/* A native tab has no title bar inset, so the header pads itself. */}
      <div style={{ padding: "8px 15px 10px" }}>
        <TitleView />
      </div>
      {renderSettingsContent()}
    </>
  );

  const uninstallHostQamPanel = registerHostQamPanel(renderNativeTabPanel);
  const uninstallOwnQamTab = installOwnTabIfWanted(isOwner, loaderLaunched, renderNativeTabPanel);
  const uninstallShowcaseMode = isOwner ? installShowcaseMode() : null;
  const uninstallScreensaverInject = tryInstall(installScreensaverInject);
  const uninstallAccountWatch = isOwner ? tryInstall(() => installSteamAccountWatch({
    onSwitch: () => { if (!isPerAccount(getCurrentSettings())) notifyAccountSwitch(); },
    onKnown: createAccountSettingsHandler({ ask: openAccountChoice, restored: notifyAccountRestored }),
  })) : null;
  const uninstallCloudSync = tryInstall(installCloudSync);

  // Named so it can also be stashed on `window` for the next hot-swap to call.
  const teardown: Array<() => void> = [
    () => patch?.uninstall?.(),
    () => recentsReplacePatch?.uninstall?.(),
    () => unregisterPluginRoutes(routerHook),
    uninstallRefresh, uninstallSystemEvents, uninstallBatteryState, uninstallDeviceState,
    uninstallSessionState, uninstallProfileTriggers, uninstallPluginApi, uninstallLazyPhases,
    () => uninstallShowcaseMode?.(),
    () => uninstallScreensaverInject?.(),
    () => uninstallCloudSync?.(),
    () => uninstallAccountWatch?.(),
    uninstallUpdateProbes, uninstallWatchdog, uninstallBootToasts, uninstallHostQamPanel,
    () => uninstallOwnQamTab?.(),
    disposeAll,
    // Last: its owners have unregistered their tasks by now.
    uninstallPowerGate,
  ];
  // Runs once: the host's teardown, a loader's onDismount and the next instance may each call it.
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    logInfo("RUNTIME", "plugin dismount");
    // One failing step must not leave the later ones installed before a reboot.
    for (const step of teardown) {
      try { step(); } catch (error) { logError("RUNTIME", "failed to remove patch", String(error)); }
    }
    // A loader reloading the same build calls the export again in this evaluation: let it boot.
    __ds_ran = false;
  };
  stashInstance(getOwnerKind(), dispose);
  // A neutral host runs its unmount handlers before hot-swapping the bundle.
  try { _hostApi.lifecycle.onUnmount(dispose); } catch {}
  recordBootCritical();

  return {
    name: "Deck Shelves",
    title: <></>,
    titleView: <TitleView />,
    content: renderSettingsContent(),
    icon: <DeckShelvesIcon />,
    onDismount: dispose,
  };
  };
  const standIn = () => ({
    name: "Deck Shelves", title: <></>, content: <StandInContent />, icon: <DeckShelvesIcon />,
    onDismount: () => { try { standInEntry?.onDismount?.(); } catch {} },
  });
  const bootStandIn = (failure: string) => {
    try {
      standInEntry = boot() as StandInEntry;
      standInWatchers.forEach((w) => w());
    } catch (e) { logError("RUNTIME", failure, String(e)); }
  };
  if (isForcedOwner() && !getInjectedHost()) {
    logInfo("RUNTIME", "cooperative force — awaiting injected host before boot");
    void awaitInjectedHost(8000).then(() => bootStandIn("deferred cooperative boot failed"));
    return standIn() as unknown as ReturnType<typeof boot>;
  }
  return boot();
});

// A neutral host never calls the export, so the bundle boots itself; `__ds_ran` keeps the body from running twice.
let __ds_ran = false;
let __ds_selfInvoked = false;
function __ds_entry_guarded(serverAPI?: any) {
  if (__ds_ran) return undefined;
  __ds_ran = true;
  // The real loader passes a serverAPI despite the zero-arg type.
  return (__ds_entry as (serverAPI?: any) => unknown)(serverAPI);
}
export default __ds_entry_guarded;

// A loader always wins on a dual install, except during the cooperative bundle hand-over.
try {
  const g = globalThis as any;
  const hasInjectedHost = !!(g.window?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__);
  const hasLoaderGlobal = !!(g.window?.DFL ?? g.DFL ?? g.window?.deckyFrontendLib ?? g.deckyFrontendLib);
  const coopHandOver = readDeferSignal() !== null && !hostBundleBooted();
  if (hasInjectedHost && (!hasLoaderGlobal || coopHandOver)) { __ds_selfInvoked = true; __ds_entry_guarded(); }
} catch {}
