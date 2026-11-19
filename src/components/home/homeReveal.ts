import type { Settings } from "../../types";
import { logWarn } from "../../runtime/logger";
import { applyHideRecents } from "../../runtime/homePatch";
import { getShelfWarmEntry, isShelfResolved } from "../shelf/shelfWarmState";
import { revealableInOrder } from "../../domain/shelfOrder";
import { evalVisibility } from "../../steam/smartShelves";
import { applyRecentsFocusTrap, dispatchHideRecentsDisabled } from "./homeInjectHelpers";

export function applyHideRecentsGated(hide: boolean, revealed: boolean): void {
  if (hide && !revealed) return;
  applyHideRecents(hide && revealed);
}
export function applyRecentsFocusTrapGated(recentsEl: HTMLElement | null, hide: boolean, revealed: boolean): void {
  if (!recentsEl || (hide && !revealed)) return;
  applyRecentsFocusTrap(recentsEl, hide && revealed);
}
export function settleHideCheck(alive: boolean, anyHas: boolean, revealed: boolean): void {
  if (!alive) return;
  applyHideRecentsGated(anyHas, revealed);
  dispatchHideRecentsDisabled(!anyHas);
}
export function shelfIdsOf(shelves: any[] | null | undefined): string[] {
  return (shelves ?? []).map((s: any) => s.id);
}
export function applyProgressiveReveal(renderedEls: HTMLElement[], orderedIds: string[], complete: boolean): number {
  const rendered = new Set(renderedEls.map((el) => el.getAttribute('data-shelfid') ?? ''));
  const resolved = new Set(orderedIds.filter((id) => isShelfResolved(id)));
  const showing = complete ? rendered : new Set(revealableInOrder(orderedIds, rendered, resolved));
  for (const el of renderedEls) {
    const pending = !showing.has(el.getAttribute('data-shelfid') ?? '');
    if (pending) el.setAttribute('data-ds-pending', 'true');
    else if (el.hasAttribute('data-ds-pending')) el.removeAttribute('data-ds-pending');
  }
  return showing.size;
}
export function anyShelfWarmWithItems(shelves: readonly { id: string }[]): boolean {
  return shelves.some((s) => (getShelfWarmEntry(s.id)?.appIds.length ?? 0) > 0);
}

export function skipHomeRender(settings: Settings, visibleCount: number, isLatestInstance: boolean): boolean {
  if (!settings.enabled || !visibleCount) {
    applyHideRecents(false);
    if (!settings.enabled) logWarn("HOME", "plugin disabled — recents forced visible");
    return true;
  }
  return !isLatestInstance;
}

export function scanHomeChildren(parent: HTMLElement, mount: HTMLElement): { recentsVisible: boolean; tabsVisible: boolean } {
  let recentsVisible = false;
  let tabsVisible = false;
  for (const child of Array.from(parent.children) as HTMLElement[]) {
    if (child === mount) continue;
    const tablist = child.querySelector<HTMLElement>('[role="tablist"]');
    if (tablist) { if (child.offsetHeight > 8 || tablist.offsetHeight > 8) tabsVisible = true; continue; }
    if (child.offsetHeight <= 8) continue;
    recentsVisible = true;
  }
  return { recentsVisible, tabsVisible };
}

export function computeAutoCollapse(shelf: any, enabled: boolean): { forceCollapsed: boolean; autoCollapseWhenEmpty: boolean } {
  if (!enabled) return { forceCollapsed: false, autoCollapseWhenEmpty: false };
  const ac = shelf.autoCollapse;
  const forceCollapsed = !!ac && Array.isArray(ac.rules) && ac.rules.length > 0 && evalVisibility({ visibility: ac } as any);
  return { forceCollapsed, autoCollapseWhenEmpty: shelf.autoCollapseWhenEmpty === true };
}
