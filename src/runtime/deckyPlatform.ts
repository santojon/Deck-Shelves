import { Navigation } from "./host/decky";
import { getAppMeta, getAppMetaBatch, getAppName, listCollections, listLibraryTabs, resolveShelfAppIds } from "../steam";
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

function resolveNav(): any {
  const steamClient = (globalThis as any).SteamClient ?? (globalThis as any).window?.SteamClient;
  return steamClient?.Navigation ?? Navigation;
}

function getDeckySettings(): any {
  const g = globalThis as any;
  return g.SteamUIStore?.DeckySettings ?? g.window?.SteamUIStore?.DeckySettings;
}

function getOSVersion(): string | undefined {
  try {
    const ds = getDeckySettings();
    const v = ds?.steamos_version ?? ds?.osVersion;
    return typeof v === "string" && v.length ? v : undefined;
  } catch {
    return undefined;
  }
}

function navigateToShelfSource(source: ShelfSource, _title?: string) {
  // Bare /library opens whichever library view the user was last on.
  const nav = resolveNav();
  const safeNavigate = (path: string) => {
    try { nav?.Navigate?.(path); return true; } catch {}
    try { nav?.NavigateTo?.(path); return true; } catch {}
    return false;
  };
  const tryClickCollectionLink = (id: string) => {
    try {
      const doc = (globalThis as any).document ?? (globalThis as any).window?.document;
      if (!doc) return false;
      const selectors = [
        `[data-collection-id="${id}"]`,
        `[data-collection-id*="${id}"]`,
        `a[href*="${encodeURIComponent(id)}"]`,
        `a[href*="${id}"]`,
      ];
      for (const s of selectors) {
        const el = doc.querySelector(s) as HTMLElement | null;
        if (el) { el.click(); return true; }
      }
    } catch {}
    return false;
  };
  const navCollection = () => {
    const id = String((source as any).collectionId ?? "");
    if (id) {
      const candidates = [
        `/library/collection/${id}`,
        `/library/collections/${id}`,
        `/library/collections#${id}`,
        `/library/collections/${encodeURIComponent(id)}`,
      ];
      for (const p of candidates) if (safeNavigate(p)) return;
      if (tryClickCollectionLink(id)) return;
    }
    if (safeNavigate('/library/collections')) return;
    safeNavigate('/library/home');
  };
  if (source.type === 'tab') {
    if (safeNavigate('/library')) return;
    safeNavigate('/library/home');
    return;
  }
  if (source.type === 'collection') {
    navCollection();
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
    getAppMetaBatch,
    navigateToApp: navigate,
    navigateToShelfSource,
    // Optional at runtime even though the contract types it as non-nullable.
    getOSVersion: getOSVersion as PlatformApi["getOSVersion"],
  };
}
