/* eslint-disable complexity */
/**
 * UnifiDeck integration.
 *
 * UnifiDeck (github.com/mubaraknumann/unifideck) registers third-party store
 * games as Steam shortcuts (shortcuts.vdf). It injects a CSS stylesheet with
 * id="unifideck-tab-hider" and dispatches VIEW_MODE_CHANGE_EVENT events.
 *
 * UnifiDeck shortcuts have app_type = EAppType_GameShortcut (0x40000000).
 * They are detectable as non-steam apps through normal Steam app overview flags.
 */
import { isExternalTabsProviderInstalled } from './registry';
import { getPreferredSteamDocument } from '../runtime/steamHost';
import { getTabAppIdsFromStore, resolveAppInstalledState } from '../steam';

export type PlatformTab = { id: string; name: string };

/** UnifiDeck's built-in tab IDs */
export const UNIFIDECK_TAB_IDS = [
  'unifideck-deck',
  'unifideck-all',
  'unifideck-installed',
  'unifideck-steam',
  'unifideck-epic',
  'unifideck-gog',
  'unifideck-amazon',
  'unifideck-ubisoft',
  'unifideck-microsoft',
  'unifideck-nonsteam',
] as const;

/**
 * Returns UnifiDeck tabs if the plugin is installed.
 * UnifiDeck doesn't expose a React context; its tabs are rendered via DOM.
 * We read them from the DOM's [data-tab-id] attributes if available.
 */
export function getUnifiDeckTabs(): PlatformTab[] {
  if (!isExternalTabsProviderInstalled()) return [];
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

/**
 * Resolve installed app ids for a UnifiDeck tab.
 * Uses Steam store APIs when available and falls back to DOM scanning.
 */
export async function getUnifiDeckInstalledAppIds(tabId: string): Promise<number[]> {
  if (!isExternalTabsProviderInstalled()) return [];
  try {
    // 1) Try Steam store APIs (more reliable)
    try {
      const ids = await getTabAppIdsFromStore(tabId);
      if (ids && ids.length) {
        const out: number[] = [];
        for (const id of ids) {
          try {
            const state = await resolveAppInstalledState(Number(id));
            if (state === true) out.push(Number(id));
          } catch {}
        }
        if (out.length) return out;
      }
    } catch {}

    // 2) Fallback: DOM scan for data-appid attributes within the tab panel
    const doc = getPreferredSteamDocument();
    if (!doc) return [];
    const sel = `[data-tab-id="${tabId}"], [data-tab-id^="${tabId}"]`;
    const tabEl = doc.querySelector(sel) as HTMLElement | null;
    const ids: number[] = [];
    if (tabEl) {
      const panel = tabEl.closest('.Panel') || tabEl;
      const candidates = panel ? panel.querySelectorAll('[data-appid], [data-app-id]') : doc.querySelectorAll('[data-appid], [data-app-id]');
      for (const c of Array.from(candidates)) {
        const aid = c.getAttribute('data-appid') || c.getAttribute('data-app-id') || (c as any).dataset?.appid || (c as any).dataset?.appId;
        const n = Number(aid);
        if (Number.isFinite(n) && n > 0) ids.push(n);
      }
    }
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

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
