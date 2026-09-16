export function isPluginInstalled(name: string): boolean {
  // SteamOS 3.9 moved the loader off window — try multiple paths.
  // plugins may be array or Map depending on version.
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

const UNIFIDECK_PLUGIN_NAMES = ['Unifideck', 'UnifiDeck', 'UnifyDeck'];

function isUnifiDeckPluginPresent(): boolean {
  return UNIFIDECK_PLUGIN_NAMES.some((n) => isPluginInstalled(n));
}

function isUnifiDeckDomPresent(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(document.getElementById?.('unifideck-tab-hider')
    || document.querySelector?.('#unifideck-tab-hider')
    || document.querySelector?.('[data-tab-id^="unifideck-"]'));
}

const UNIFIDECK_GLOBAL_NAMES = ['UnifiDeck', 'UnifyDeck', 'Unifideck'];

function isUnifiDeckGlobalPresent(): boolean {
  const hosts: any[] = [globalThis as any, window as any];
  return hosts.some((h) => UNIFIDECK_GLOBAL_NAMES.some((n) => !!h?.[n]));
}

export const isUnifiDeckInstalled = (): boolean => {
  if (qaUnifiDeck) return qaUnifiDeck === "present";
  try {
    return isUnifiDeckPluginPresent() || isUnifiDeckDomPresent() || isUnifiDeckGlobalPresent();
  } catch {
    return false;
  }
};
export const isExternalTabsProviderInstalled = isUnifiDeckInstalled;
