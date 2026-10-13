import { type SteamHostWindow, type SteamUIWindowLike, steamUIStore } from "./internals";
import { getPreferredSteamWindow } from "../runtime/steamHost";

/* Where the Steam windows and clients live, and generic readers for Steam objects. */

export function getSteamClient(): any {
  const hostWindow = getPreferredSteamWindow() as any;
  return hostWindow?.SteamClient ?? (window as any).SteamClient;
}

export function getSteamWindows(): any[] {
  const candidates = [
    getPreferredSteamWindow(),
    window,
    (window as any).opener,
    steamUIStore()?.GetFocusedWindowInstance?.()?.BrowserWindow,
    steamUIStore()?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow,
    ...((steamUIStore()?.WindowStore?.SteamUIWindows ?? []).map((entry: SteamUIWindowLike) => entry?.BrowserWindow)),
  ].filter(Boolean);

  return Array.from(new Set(candidates));
}

export function getSteamClients(): any[] {
  return Array.from(new Set(getSteamWindows().map((win: SteamHostWindow) => win?.SteamClient).filter(Boolean)));
}

export function uniqNumbers(list: number[]): number[] {
  return Array.from(new Set(list.filter((value) => Number.isFinite(value))));
}

export function hasAnyMethod(target: any, methodNames: string[]): boolean {
  if (!target || typeof target !== "object") return false;
  return methodNames.some((name) => typeof target?.[name] === "function");
}

export function firstStringFromKeys(node: Record<string, any> | null | undefined, keys: string[], fallback = ""): string {
  if (!node) return fallback;
  for (const k of keys) {
    const v = node[k];
    if (v !== undefined && v !== null) return String(v);
  }
  return fallback;
}
