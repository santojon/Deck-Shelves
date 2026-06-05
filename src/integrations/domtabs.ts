/* eslint-disable complexity */
/**
 * DOM-based tab utilities.
 *
 * These read library tabs rendered into the Steam DOM and provide helpers
 * for plugins that don't expose a React context (e.g., third-party tab plugins).
 */
import { getPreferredSteamDocument } from '../runtime/steamHost';

export type PlatformTab = { id: string; name: string };

/**
 * Reads currently visible library tabs from the Steam DOM.
 * Works regardless of which plugin is managing tabs.
 * Tabs are rendered with [data-tab-id] attributes in Steam's library UI.
 */
export function getTabsFromDOM(): PlatformTab[] {
  try {
    const doc = getPreferredSteamDocument();
    // Steam renders library tabs with data-tab-id attribute
    const tabEls = doc.querySelectorAll('[data-tab-id]');
    const tabs: PlatformTab[] = [];
    const seen = new Set<string>();
    for (const el of Array.from(tabEls)) {
      const id = el.getAttribute('data-tab-id') ?? '';
      if (!id) continue;
      const name = (el as HTMLElement).innerText?.trim()
        || el.getAttribute('aria-label')
        || el.getAttribute('title')
        || '';
      if (name && !seen.has(id)) { seen.add(id); tabs.push({ id, name }); }
    }
    return tabs;
  } catch {
    return [];
  }
}

/**
 * Convenience function: read UnifiDeck-specific tabs (those with data-tab-id starting with 'unifideck-').
 */
export function getUnifiDeckTabs(): PlatformTab[] {
  try {
    const doc = getPreferredSteamDocument();
    const tabEls = doc.querySelectorAll('[data-tab-id^="unifideck-"]');
    const tabs: PlatformTab[] = [];
    const seen = new Set<string>();
    for (const el of Array.from(tabEls)) {
      const id = el.getAttribute('data-tab-id') ?? '';
      const name = (el as HTMLElement).innerText?.trim() || el.getAttribute('aria-label') || id;
      if (id && !seen.has(id)) { seen.add(id); tabs.push({ id, name }); }
    }
    return tabs;
  } catch {
    return [];
  }
}
