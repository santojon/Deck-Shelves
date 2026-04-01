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

export const isUnifiDeckInstalled = (): boolean =>
  isPluginInstalled('Unifideck') ||
  isPluginInstalled('UnifiDeck') ||
  !!(document.getElementById?.('unifideck-tab-hider'));
