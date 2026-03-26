import { Navigation } from "@decky/ui";
import { getAppMeta, getAppName, listCollections, listLibraryTabs, resolveShelfAppIds } from "../steam";
import type { ShelfSource } from "../types";
import type { PlatformApi } from "./platform";
import { logError } from "./logger";

function navigate(appid: number) {
  try {
    Navigation.Navigate(`/library/app/${appid}`);
  } catch (error) {
    logError("RUNTIME", "navigateToApp failed", String(error));
  }
}

function navigateToShelfSource(source: ShelfSource, _title?: string) {
  const steamClient = (globalThis as any).SteamClient ?? (globalThis as any).window?.SteamClient;
  const nav = steamClient?.Navigation ?? Navigation;
  const safeNavigate = (path: string) => {
    try { nav?.Navigate?.(path); return true; } catch {}
    return false;
  };
  if (source.type === 'tab') {
    if (safeNavigate('/library')) return;
    safeNavigate('/library/home');
    return;
  }
  if (source.type === 'collection') {
    if (safeNavigate(`/library/collection/${source.collectionId}`)) return;
    if (safeNavigate('/library/collections')) return;
    safeNavigate('/library/home');
    return;
  }
  if (source.type === 'filter') {
    if (safeNavigate('/library')) return;
    safeNavigate('/library/home');
    return;
  }
  safeNavigate('/library');
}

export function createDeckyPlatform(): PlatformApi {
  return {
    listCollections,
    listLibraryTabs,
    resolveShelfAppIds,
    getAppName,
    getAppMeta,
    navigateToApp: navigate,
    navigateToShelfSource,
  };
}
