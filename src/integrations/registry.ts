/**
 * Plugin registry — detection utilities for optional integrations.
 * Uses DeckyPluginLoader.plugins as the authoritative source.
 */
export function isPluginInstalled(name: string): boolean {
  try {
    const plugins: any[] = (window as any).DeckyPluginLoader?.plugins ?? [];
    return plugins.some(
      (p: any) => typeof p.name === 'string' && p.name.toLowerCase() === name.toLowerCase(),
    );
  } catch {
    return false;
  }
}

export const isTabMasterInstalled = (): boolean => isPluginInstalled('TabMaster');

export const isUnifiDeckInstalled = (): boolean => {
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
