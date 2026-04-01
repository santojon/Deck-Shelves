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
    try { nav?.NavigateTo?.(path); return true; } catch {}
    return false;
  };
  const tryClickCollectionLink = (id: string) => {
    try {
      const doc = (globalThis as any).document ?? (globalThis as any).window?.document;
      if (!doc) return false;
      // Try matching data attributes or anchors that include the collection id
      const selectors = [
        `[data-collection-id="${id}"]`,
        `[data-collection-id*="${id}"]`,
        `a[href*="${encodeURIComponent(id)}"]`,
        `a[href*="${id}"]`,
      ];
      for (const s of selectors) {
        const el = doc.querySelector(s) as HTMLElement | null;
        if (el) {
          el.click();
          return true;
        }
      }
    } catch {}
    return false;
  };
  if (source.type === 'tab') {
    if (safeNavigate('/library')) return;
    safeNavigate('/library/home');
    return;
  }
  if (source.type === 'collection') {
    // Try common navigation paths first
    const id = String(source.collectionId ?? "");
    if (id) {
      const candidates = [
        `/library/collection/${id}`,
        `/library/collections/${id}`,
        `/library/collections#${id}`,
        `/library/collections/${encodeURIComponent(id)}`,
      ];
      for (const p of candidates) if (safeNavigate(p)) return;
      // Try clicking a link in the DOM that references the collection id
      if (tryClickCollectionLink(id)) return;
    }
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
