import { definePlugin } from "@decky/api";
import React from "react";
import { initI18n } from "./i18n";
import { SettingsView } from "./components/Settings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { createDeckyPlatform } from "./runtime/deckyPlatform";
import { PlatformProvider, setPlatform } from "./runtime/platformContext";
import './runtime/embeddedClassMap';
import { installHomePatch } from "./runtime/homePatch";
import { installShelfRefreshEmitter } from "./core/shelfRefresh";
import { installSystemEvents } from "./runtime/systemEvents";
import { installPluginApi } from "./core/pluginApi";
import { logDiagnostic } from "./runtime/diagnostics";
import { logError, logInfo } from "./runtime/logger";
import { Navigation, Focusable, DialogButton, quickAccessMenuClasses } from "@decky/ui";
import { AboutPage } from "./components/AboutPage";
initI18n();

const ABOUT_ROUTE = "/deck-shelves/about";

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
  const enableHomePatch = typeof __DECK_SHELVES_ENABLE_HOME_PATCH__ !== "undefined" ? __DECK_SHELVES_ENABLE_HOME_PATCH__ : true;
  const routerHook = serverAPI?.routerHook
    ?? (globalThis as any).window?.DFL?.routerHook
    ?? (globalThis as any).DFL?.routerHook;
  const patch = enableHomePatch ? installHomePatch(routerHook) : null;
  const uninstallRefresh = installShelfRefreshEmitter();
  const uninstallSystemEvents = installSystemEvents();
  const uninstallPluginApi = installPluginApi();

  try { routerHook?.addRoute?.(ABOUT_ROUTE, () => (
    <AboutPage />
  )); } catch (e) { console.warn("addRoute failed", e); }

  logDiagnostic("info", enableHomePatch ? (patch ? "Home patch installed" : "Home patch unavailable") : "Home patch disabled in this build");

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
        routerHook?.removeRoute?.(ABOUT_ROUTE);
        uninstallRefresh();
        uninstallSystemEvents();
        uninstallPluginApi();
      } catch (error) {
        logError("RUNTIME", "failed to remove patch", String(error));
      }
    },
  };
});
