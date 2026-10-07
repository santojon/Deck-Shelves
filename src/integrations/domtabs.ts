import { getPreferredSteamDocument } from '../runtime/steamHost';

export type PlatformTab = { id: string; name: string };

function tabLabel(el: Element): string {
  return (el as HTMLElement).innerText?.trim()
    || el.getAttribute('aria-label')
    || el.getAttribute('title')
    || '';
}

export function getTabsFromDOM(): PlatformTab[] {
  try {
    const doc = getPreferredSteamDocument();
    // Steam renders library tabs with data-tab-id attribute — this generic
    // selector already covers UnifiDeck's own "unifideck-*" tab ids, so a
    // UnifiDeck-specific variant isn't needed (one existed, was unused, removed).
    const tabEls = doc.querySelectorAll('[data-tab-id]');
    const tabs: PlatformTab[] = [];
    const seen = new Set<string>();
    for (const el of Array.from(tabEls)) {
      const id = el.getAttribute('data-tab-id') ?? '';
      if (!id) continue;
      const name = tabLabel(el);
      if (name && !seen.has(id)) { seen.add(id); tabs.push({ id, name }); }
    }
    return tabs;
  } catch {
    return [];
  }
}
