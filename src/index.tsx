import { definePlugin } from "@host/api";
// Build sentinel — bumped each iteration so CDP probes can confirm the
// running JS matches the latest source. Read via `window.__ds_build`.
// Dev-only; stripped from release via `if (__DEV__)`.
if (__DEV__) { try { (globalThis as any).__ds_build = __BUILD_ID__; } catch {} }
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
import { installSystemEvents } from "./runtime/systemEvents";
import { installBatteryState } from "./runtime/batteryState";
import { installDeviceState, getDeviceState } from "./runtime/deviceState";
import { installSessionState } from "./runtime/sessionState";
import { installProfileTriggers } from "./runtime/profileTriggers";
import { installOwnQamTab } from "./runtime/ownQamTab";
import { installShowcaseMode } from "./runtime/showcaseMode";
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
import { getCurrentSettings } from "./store/settingsStore";
import { setPendingSettingsTab } from "./runtime/settingsNav";
import { logError, logInfo } from "./runtime/logger";
import { disposeAll, registerDisposer } from "./runtime/runtimeDisposer";
import { installDevNavHooks } from "./runtime/devNavHooks";
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
import { ShelfManageRoute } from "./components/ShelfManageRoute";
import { isForcedOwner, getInjectedHost, type HostApi, type QamPanel } from "./runtime/host/contract";
initI18n();

/* HostApi singleton — instantiated once at boot. Today only the handshake
   and the self-install update path (runtime/updateDownload.ts) read it; RPC,
   toasts and UI primitives go through the host shims. */
let _hostApi: HostApi | null = null;
export function getHostApi(): HostApi { if (!_hostApi) throw new Error("HostApi not booted"); return _hostApi; }

const ABOUT_ROUTE = "/deck-shelves/about";
const SETTINGS_ROUTE = "/deck-shelves/settings";
const EDIT_ROUTE = "/deck-shelves/edit/:shelfId";
const DELETE_ROUTE = "/deck-shelves/delete/:shelfId";
const MANAGE_ROUTE = "/deck-shelves/manage/:shelfId";
const COMPOSE_ROUTE = "/deck-shelves/compose/:sourceId/:targetId";
const TAGS_ROUTE = "/deck-shelves/tags/:appid";

// Decky plugin-tab / QAM icon. Simplified single-colour (tintable) glyph — the
// same mark shipped as assets/tab-icon.svg (the designated plugin icon); keep
// the two in sync. Filled books read far better than thin outlines at ~18px.
function DeckShelvesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }}>
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

/* What the loader renders for a copy that stood down: a note pointing at the
   host's tab, or the real editor once `bootStandIn` ran this copy after all. */
type StandInEntry = { content?: ReactNode; onDismount?: () => void } | null;
let standInEntry: StandInEntry = null;
const standInWatchers = new Set<() => void>();
function StandInContent() {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { standInWatchers.add(rerender); return () => { standInWatchers.delete(rerender); }; }, []);
  if (standInEntry?.content) return <>{standInEntry.content}</>;
  return <div style={{ padding: "8px 16px", opacity: 0.8 }}>{i18next.t("coop_stand_in")}</div>;
}

/* Title row sized like the host's own tab (18 px title, 28 px square icon
   buttons): Decky adds a back arrow on the left, and the previous 40 px buttons
   wrapped "Deck Shelves" onto two lines. */
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

/* A LOADER router hook (used to detect that a loader launched us). Keyed on the
   loader only — the injected host also exposes a router hook, but that must NOT
   make resolveHost pick the loader path. */
function loaderRouterHookOf(serverAPI: any): any {
  const g = globalThis as any;
  return serverAPI?.routerHook ?? g.window?.DFL?.routerHook ?? g.DFL?.routerHook;
}

/* The router hook used for our screens + home patch: the loader's when a loader
   launched us, or — as sole host — the injected host's own hook. */
function pluginRouterHookOf(loaderRouterHook: any): any {
  const g = globalThis as any;
  return loaderRouterHook ?? g.window?.__SHELVES_HOST__?.routerHook ?? g.__SHELVES_HOST__?.routerHook;
}

// Optional on the contract (absent hosts, e.g. Decky, are read via direct feature
// detection elsewhere) — cached once so diagnostics/bug-report can read it without
// a direct HostApi import (see hostHandshake.ts).
function cacheHostHandshake(host: HostApi): void {
  try { setHostHandshake(host.handshake?.() ?? null); } catch { setHostHandshake(null); }
}

/* Single-owner guard: in a dual-host install the first instance claims the
   renderer; the other stands down — no home patch and no settings writes — so
   there's one injector and one writer. Under cooperative force this single
   instance runs on the neutral host and claims under that host's own kind even
   though a loader launched it (resolveHost already bound it to the injected host). */
/* A hot-swap (the same host re-evaluating this bundle) skips the OLD instance's
   onDismount, leaving its patches, listeners and timers live. `window` survives
   the swap where module state doesn't, so boot() stashes each instance there by
   host kind and the next instance of the SAME kind disposes it first; the other
   copy of a dual install is another host's instance and keeps running. */
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

/* Safe Mode: after repeated boots where Home started mounting but never
   finished, skip both Home patches this session so Steam's own Home stays
   usable; the QAM banner offers the way out (`runtime/safeMode.ts`). */
function installHomePatches(routerHook: any, isOwner: boolean) {
  const safeMode = evaluateBootOutcome();
  if (safeMode) logDiagnostic("warn", "Safe Mode: Home patches skipped after repeated incomplete boots");
  const active = isOwner && !safeMode;
  const patch = (ENABLE_HOME_PATCH && active) ? installHomePatch(routerHook) : null;
  const recentsReplacePatch = active ? installRecentsReplace(routerHook) : null;
  logDiagnostic("info", ENABLE_HOME_PATCH ? (patch ? "Home patch installed" : "Home patch unavailable") : "Home patch disabled in this build");
  return { patch, recentsReplacePatch };
}

function installDevHooks(): void {
  if (!__DEV__) return;
  // Expose the live device snapshot for on-device CDP inspection.
  try { (globalThis as any).__ds_device = getDeviceState; } catch {}
  // Navigation/nav-tree hooks for on-device drivers, via the host abstraction.
  try { registerDisposer(installDevNavHooks()); } catch {}
}

type RouteSpec = { path: string; label: string; exact?: boolean; render: () => ReactNode };
/* The full-page Settings route is registered eagerly so navigation works; the
   title bar's gear button opens it. Edit /
   Delete / Manage / Compose open from the card context menu — a standalone
   controller shows the modal via showModal in a portal; Manage is a flat
   MenuItem + navigation because nested groups disappear after the first open. */
const PLUGIN_ROUTES: RouteSpec[] = [
  { path: ABOUT_ROUTE, label: "about", render: () => <AboutPage /> },
  { path: SETTINGS_ROUTE, label: "settings", render: () => <SettingsPage /> },
  { path: EDIT_ROUTE, label: "shelf modal", exact: true, render: () => <ShelfEditRoute shelfId="" /> },
  { path: DELETE_ROUTE, label: "shelf modal", exact: true, render: () => <ShelfDeleteRoute shelfId="" /> },
  { path: MANAGE_ROUTE, label: "shelf modal", exact: true, render: () => <ShelfManageRoute shelfId="" /> },
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

/* If a neutral host injected its own native QAM tab, populate it so opening it
   shows Deck Shelves directly (`__SHELVES_QAM__` takes no part in host
   selection). The tab may inject after this body runs — retry + enqueue. */
function registerHostQamPanel(renderPanel: QamPanel["content"]): () => void {
  try {
    // `QamPanel` / `window.__SHELVES_QAM__` / `__SHELVES_QAM_PENDING__` are all
    // declared by the @deck-shelves/host contract's `Window` augmentation.
    const qamPanel: QamPanel = { id: "deck-shelves", title: i18next.t("menu_deck_shelves"), content: renderPanel };
    const registerNativeTab = (): boolean => {
      const q = window.__SHELVES_QAM__;
      if (q?.registerPanel) { try { q.registerPanel(qamPanel); } catch {} return true; }
      return false;
    };
    if (!registerNativeTab()) {
      // Bridge not injected yet — leave the panel for the host runtime to drain
      // when it installs (order-independent), and also poll briefly in case it is
      // mid-injection right now.
      const pending = (window.__SHELVES_QAM_PENDING__ ??= []);
      pending.push(qamPanel);
      let attempts = 0;
      const timer = setInterval(() => { if (registerNativeTab() || ++attempts > 100) clearInterval(timer); }, 100);
      // Teardown: stop polling and withdraw the panel if the host never drained it.
      return () => { clearInterval(timer); const i = pending.indexOf(qamPanel); if (i >= 0) pending.splice(i, 1); };
    }
  } catch {}
  return () => {};
}

/* Own native QAM tab under Decky alone (opt-in, default OFF). Owner-only,
   Decky-loader-only, and never when a neutral host already provides its own
   native tab — the option itself is hidden in that case (settings UI). */
function installOwnTabIfWanted(isOwner: boolean, loaderLaunched: boolean, renderPanel: Parameters<typeof installOwnQamTab>[0]["renderPanel"]): (() => void) | null {
  if (!isOwner || !loaderLaunched || hostProvidesNativeTab()) return null;
  return installOwnQamTab({
    title: i18next.t("menu_deck_shelves"),
    icon: <DeckShelvesIcon />,
    renderPanel,
    isEnabled: () => getCurrentSettings()?.ownQamTabEnabled === true,
  });
}

// Patches a live Steam internal of unguaranteed shape at plugin init — never let it take boot down.
function tryInstall(install: () => () => void): (() => void) | null {
  try { return install(); } catch { return null; }
}

const __ds_entry = definePlugin((serverAPI?: any) => {
  markBootStart();
  logInfo("RUNTIME", "plugin bootstrap start");
  // Safety net: catches anything the old instance's manual dispose() list
  // forgot to wire up by hand (see runtimeDisposer.ts); today only the dev
  // navigation hooks register here.
  try { disposeAll(); } catch {}
  const platform = createDeckyPlatform();
  setPlatform(platform);
  // Image cache pre-hydration + pruning, both deferred to idle so they
  /* don't compete with bootstrap. Hydration moves persistent blob URLs
     back into the in-memory hot map so the FIRST focus of every card
     is a hot hit instead of walking the local 404 chain — without this,
     every Steam restart felt like a full re-download to the user even
     though the persistent cache already had every blob. */
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
  // Resolve `~/Downloads` from the backend so import/export defaults work
  // on systems where the user account isn't `deck` (Bazzite, ChimeraOS, etc.).
  void prewarmUserPaths();
  /* Cooperative force: a loader launched us, but the user forced the neutral host
     and it hasn't injected `__SHELVES_HOST__` yet (the loader booted us first).
     Defer the host-dependent boot until the host appears, then run on it — no
     race, no takeover. Meanwhile hand the loader a minimal placeholder. Everything
     host-dependent lives in boot() so it can run now or once the host is ready. */
  const boot = (): unknown => {
  const loaderRouterHook = loaderRouterHookOf(serverAPI);
  const loaderLaunched = !!(serverAPI || loaderRouterHook);
  // Host selection lives entirely in resolveHost() — loader vs injected host,
  // by launch signal, producing the same HostApi contract either way.
  _hostApi = resolveHost(serverAPI, loaderRouterHook);
  cacheHostHandshake(_hostApi);
  /* Cooperative auto-update (host capability `coopBundle`): when the forced host
     carries a bundle at least as new as this loader copy, stand down and let it
     inject its own; a normal boot follows only if that bundle never shows up. */
  const deferToHost = tryDeferToHost({
    loaderLaunched: !__ds_selfInvoked, forced: shouldUseForcedHost(),
    handshake: getHostHandshake(), ownVersion: pkg.version, log: (m) => logInfo("RUNTIME", m),
    onFallback: () => bootStandIn("boot after host defer failed"),
  });
  if (deferToHost) return standIn();
  const routerHook = pluginRouterHookOf(loaderRouterHook);
  const isOwner = claimRenderer(shouldUseForcedHost(), loaderLaunched);
  disposePreviousInstance(getOwnerKind());
  const { patch, recentsReplacePatch } = installHomePatches(routerHook, isOwner);
  const uninstallWatchdog = installStartupWatchdog(patch, recentsReplacePatch);
  const uninstallRefresh = installShelfRefreshEmitter();
  const uninstallSystemEvents = installSystemEvents();
  const uninstallBatteryState = installBatteryState();
  const uninstallDeviceState = installDeviceState();
  const uninstallSessionState = installSessionState();
  const uninstallProfileTriggers = installProfileTriggers();
  installDevHooks();
  const uninstallPluginApi = installPluginApi();
  const uninstallLazyPhases = startLazyPhases();
  registerPluginRoutes(routerHook);

  /* Random-sort cache is keyed by shelfId + idHash with a 24h TTL.
     Wipe all entries at boot so each Steam session gets a fresh shuffle
     — without this, shelves with `sort: random` stay in the same order
     across Steam restarts as long as their app set doesn't change. */
  try { invalidateRandomSortCache(); } catch {}

  /* Prefetch SteamOS version asynchronously so synchronous version-gated
     paths (e.g. `isLegacyMenuFlow()` in `steamGameMenu.ts`) hit the cache
     by the time the user interacts. On 3.7.x the only source is the async
     `SteamClient.System.GetSystemInfo()` — sync sources return null there. */
  void prefetchSteamOSVersion().then((v) => {
    logDiagnostic("info", "SteamOS version", v ?? "unknown");
  }).catch(() => {});

  const uninstallUpdateProbes = installUpdateProbes();
  const uninstallBootToasts = scheduleBootToasts(openSettingsPage);
  logSystemEnvironment();

  // The QAM settings editor as a factory, so it can render independently in the
  // loader's own panel and in a neutral host's native tab — a fresh element tree
  // for each, both reading the one shared settings store.
  const renderSettingsContent = () => (
    <PlatformProvider platform={platform}>
      <ErrorBoundary title="Deck Shelves">
        <SettingsView />
      </ErrorBoundary>
    </PlatformProvider>
  );

  // For a neutral host's native tab we render the WHOLE panel ourselves — the
  // loader draws the title bar via `titleView`, but a native tab has no such
  // chrome, so compose the same header above the editor (no back button needed).
  const renderNativeTabPanel = () => (
    <>
      {/* The loader draws the title bar with its own inset; a native Steam tab
          has none, so pad the header to sit off the panel edges (incl. a gap
          below it, before the first setting). */}
      <div style={{ padding: "8px 15px 10px" }}>
        <TitleView />
      </div>
      {renderSettingsContent()}
    </>
  );

  const uninstallHostQamPanel = registerHostQamPanel(renderNativeTabPanel);
  const uninstallOwnQamTab = installOwnTabIfWanted(isOwner, loaderLaunched, renderNativeTabPanel);
  // Showcase / Dynamic Idle Mode (opt-in, default OFF). Only the renderer's
  // owner drives Home focus.
  const uninstallShowcaseMode = isOwner ? installShowcaseMode() : null;
  // Screensaver shelf injection (experimental, default OFF). Not gated on isOwner.
  const uninstallScreensaverInject = tryInstall(installScreensaverInject);
  // Cross-device settings sync via SteamClient.RoamingStorage (experimental, default OFF).
  const uninstallCloudSync = tryInstall(installCloudSync);

  /* Teardown steps, in order — run by `dispose`, which is named (not inline in
     onDismount) so it can ALSO be stashed on `window` for the next hot-swap's
     own instance to call first — see the dispose-previous-instance check at
     the top of this function. */
  const teardown: Array<() => void> = [
    () => patch?.uninstall?.(),
    () => recentsReplacePatch?.uninstall?.(),
    () => unregisterPluginRoutes(routerHook),
    uninstallRefresh, uninstallSystemEvents, uninstallBatteryState, uninstallDeviceState,
    uninstallSessionState, uninstallProfileTriggers, uninstallPluginApi, uninstallLazyPhases,
    () => uninstallOwnQamTab?.(),
    () => uninstallShowcaseMode?.(),
    () => uninstallScreensaverInject?.(),
    () => uninstallCloudSync?.(),
    uninstallUpdateProbes, uninstallWatchdog, uninstallBootToasts, uninstallHostQamPanel,
    disposeAll,
  ];
  // Runs once: the host's teardown, a loader's onDismount and the next instance may each call it.
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      logInfo("RUNTIME", "plugin dismount");
      for (const step of teardown) step();
    } catch (error) {
      logError("RUNTIME", "failed to remove patch", String(error));
    }
  };
  stashInstance(getOwnerKind(), dispose);
  // A neutral host runs its unmount handlers before hot-swapping the bundle (host contract).
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
  /* Cooperative force with the host not yet injected: wait for it, then boot on
     the neutral host. The loader gets a minimal placeholder now; the real UI is
     driven by boot() once `__SHELVES_HOST__` appears (bounded — falls back to a
     normal boot if it never does). */
  /* The loader's entry while this copy stands down (for the host's own copy, or
     until the host appears): the stand-in note, replaced by the real editor the
     moment this copy boots after all. */
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

/* Self-invoke bootstrap: a loader imports this module and calls the default
   export itself with a serverAPI/routerHook. A neutral host has no loader —
   it injects `window.__SHELVES_HOST__` first and never calls the export, so
   nothing would boot. `__ds_ran` guards both directions so a self-invoke plus
   an unexpected loader call can never run the plugin body twice. */
let __ds_ran = false;
// True when this copy booted itself (injected by a neutral host), false when a loader called the export.
let __ds_selfInvoked = false;
function __ds_entry_guarded(serverAPI?: any) {
  if (__ds_ran) return undefined;
  __ds_ran = true;
  /* @host/api's own DefinePluginFn type is a zero-arg () => Plugin, but the
     real loader calls this with a serverAPI (see definePlugin() above) — cast
     past that known mismatch, same as the shim's own `serverAPI?: any`. */
  return (__ds_entry as (serverAPI?: any) => unknown)(serverAPI);
}
export default __ds_entry_guarded;

/* A loader always wins on a dual-install (see resolveHost()) — only self-invoke
   when the injected-host signal is present with no loader global. Exception:
   the cooperative-bundle hand-over — the loader's copy published the defer
   signal and no host copy has booted yet, so this copy IS the host's bundle. */
try {
  const g = globalThis as any;
  const hasInjectedHost = !!(g.window?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__);
  const hasLoaderGlobal = !!(g.window?.DFL ?? g.DFL ?? g.window?.deckyFrontendLib ?? g.deckyFrontendLib);
  const coopHandOver = readDeferSignal() !== null && !hostBundleBooted();
  if (hasInjectedHost && (!hasLoaderGlobal || coopHandOver)) { __ds_selfInvoked = true; __ds_entry_guarded(); }
} catch {}
