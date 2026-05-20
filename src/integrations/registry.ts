/**
 * Plugin registry — detection utilities for optional integrations.
 * Uses DeckyPluginLoader.plugins as the authoritative source.
 */
export function isPluginInstalled(name: string): boolean {
  // SteamOS 3.9: DeckyPluginLoader moved away from window — try multiple paths.
  // plugins may be an array or Map depending on the Decky version.
  try {
    const loaders = [
      (window as any).DeckyPluginLoader,
      (globalThis as any).DeckyPluginLoader,
      (globalThis as any).deckyPluginLoader,
      (window as any).deckyPluginLoader,
    ].filter(Boolean);
    for (const loader of loaders) {
      const raw = loader?.plugins ?? loader?.pluginList;
      const arr: any[] = raw instanceof Map
        ? Array.from(raw.values())
        : (Array.isArray(raw) ? raw : []);
      if (arr.some((p: any) => typeof p?.name === 'string' && p.name.toLowerCase() === name.toLowerCase())) {
        return true;
      }
    }
  } catch {}
  return false;
}

function qaForce(flag: string): "present" | "absent" | "" {
  if (flag === "present" || flag === "absent") return flag;
  return "";
}
const qaTabMaster = __DEV__ && typeof __QA_FORCE_TABMASTER__ !== "undefined" ? qaForce(__QA_FORCE_TABMASTER__) : "";
const qaUnifiDeck = __DEV__ && typeof __QA_FORCE_UNIFIDECK__ !== "undefined" ? qaForce(__QA_FORCE_UNIFIDECK__) : "";
const qaNonSteamBadges = __DEV__ && typeof __QA_FORCE_NONSTEAMBADGES__ !== "undefined" ? qaForce(__QA_FORCE_NONSTEAMBADGES__) : "";

export const isTabMasterInstalled = (): boolean => {
  if (qaTabMaster) return qaTabMaster === "present";
  return isPluginInstalled('TabMaster');
};

export const isNonSteamBadgesInstalled = (): boolean => {
  if (qaNonSteamBadges) return qaNonSteamBadges === "present";
  return isPluginInstalled('NonSteamLaunchersBadges') || isPluginInstalled('NonSteamBadges') || isPluginInstalled('Non-Steam Badges');
};

export const isUnifiDeckInstalled = (): boolean => {
  if (qaUnifiDeck) return qaUnifiDeck === "present";
  try {
    if (isPluginInstalled('Unifideck') || isPluginInstalled('UnifiDeck') || isPluginInstalled('UnifyDeck')) return true;

    if (typeof document !== 'undefined') {
      if (document.getElementById?.('unifideck-tab-hider')) return true;
      if (document.querySelector?.('#unifideck-tab-hider')) return true;
      if (document.querySelector?.('[data-tab-id^="unifideck-"]')) return true;
    }

    const g: any = globalThis as any;
    if (g?.UnifiDeck || g?.UnifyDeck || g?.Unifideck) return true;
    if ((window as any)?.UnifiDeck || (window as any)?.UnifyDeck || (window as any)?.Unifideck) return true;

    return false;
  } catch {
    return false;
  }
};
export const isExternalTabsProviderInstalled = isUnifiDeckInstalled;
