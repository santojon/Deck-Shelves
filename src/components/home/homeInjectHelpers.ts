import type { Settings, Shelf, SmartShelf } from "../../types";
import { getModeVisibilityWindows, evalVisibility } from "../../steam/smartShelves";
import { getRecentsReplaceActiveShelfId } from "../../runtime/recentsReplace";

export function computeNormalShelves(visibleShelves: Shelf[], replaceInjecting: boolean, replaceKillSwitch: boolean): Shelf[] {
  if (!replaceInjecting || replaceKillSwitch) return visibleShelves;
  const activeId = getRecentsReplaceActiveShelfId();
  return activeId ? visibleShelves.filter((s) => s.id !== activeId) : visibleShelves.slice(1);
}

export function computeShelvesOrder(params: { unifiedOn: boolean; allShelvesOrder: string[]; normalShelves: Shelf[]; smartShelves: Shelf[]; normalFirst: boolean }): Shelf[] {
  const { unifiedOn, allShelvesOrder, normalShelves, smartShelves, normalFirst } = params;
  if (!unifiedOn) {
    return normalFirst ? [...normalShelves, ...smartShelves] : [...smartShelves, ...normalShelves];
  }
  const combined = [...normalShelves, ...smartShelves];
  const byId = new Map(combined.map((s) => [s.id, s] as const));
  const ordered: Shelf[] = [];
  for (const id of allShelvesOrder) {
    const found = byId.get(id);
    if (found) { ordered.push(found); byId.delete(id); }
  }
  for (const remaining of byId.values()) ordered.push(remaining);
  return ordered;
}

export function computeInterleaveSmart(params: { unifiedOn: boolean; settings: Settings; replaceInjecting: boolean; replaceKillSwitch: boolean }): boolean {
  const { unifiedOn, settings, replaceInjecting, replaceKillSwitch } = params;
  if (unifiedOn) return false;
  if (settings.hideRecents !== true || settings.smartShelvesAtBottom) return false;
  return !(replaceInjecting && !replaceKillSwitch);
}

function resolvePositionSetting(value: unknown): 'left' | 'center' | 'right' | undefined {
  return value === 'left' || value === 'center' || value === 'right' ? value : undefined;
}

function resolveClampedSize(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' ? Math.max(min, Math.min(max, value)) : undefined;
}

export function computeDerivedGlobalFlags(params: { settings: Settings; replaceInjecting: boolean; replaceKillSwitch: boolean }) {
  const { settings, replaceInjecting, replaceKillSwitch } = params;
  const s = settings as any;
  const replaceInactive = !(replaceInjecting && !replaceKillSwitch);
  return {
    globalLogoPosition: resolvePositionSetting(s.globalLogoPosition),
    globalDescriptionPosition: resolvePositionSetting(s.globalDescriptionPosition),
    globalLogoSize: resolveClampedSize(s.globalLogoSize, 50, 200),
    globalLogoTopOffset: resolveClampedSize(s.globalLogoTopOffset, -50, 100),
    shelfHeroBackground: settings.hideRecents === true && settings.shelfHeroBackground === true && replaceInactive,
    perShelfHeroAllowed: replaceInactive,
    hideRecentsSetting: settings.hideRecents === true && (settings.recentsReplaceSource !== true || replaceKillSwitch),
  };
}

function buildSmartShelfSource(s: SmartShelf): Shelf['source'] {
  const raw = s as any;
  return {
    type: "smart",
    mode: s.mode,
    filterGroup: raw.filterGroup,
    smartParams: raw.smartParams,
    refreshIntervalMinutes: raw.refreshIntervalMinutes,
    compositeModes: raw.compositeModes,
    compositeCombine: raw.compositeCombine,
    includesNonOwned: s.mode === 'friends_playing' || (Array.isArray(raw.compositeModes) && raw.compositeModes.includes('friends_playing')),
  } as any;
}

function smartShelfHideFlags(raw: any) {
  return {
    hideStatusLine: raw.hideStatusLine ?? false,
    hideNewBadge: raw.hideNewBadge ?? false,
    hideDiscountBadge: raw.hideDiscountBadge ?? false,
    hideCompatIcons: raw.hideCompatIcons ?? false,
    hideNonSteamBadge: raw.hideNonSteamBadge ?? false,
    hideShelfTitle: raw.hideShelfTitle ?? false,
    ...smartShelfCardHideFlags(raw),
  };
}

function smartShelfCardHideFlags(raw: any) {
  return {
    hideGameNames: raw.hideGameNames ?? false,
    hideInstallIndicator: raw.hideInstallIndicator ?? false,
    hideSeeMore: raw.hideSeeMore ?? false,
    hideRefreshCard: raw.hideRefreshCard ?? false,
  };
}

function smartShelfOverlayFields(raw: any) {
  return {
    highlightRandom: raw.highlightRandom,
    enableLogo: raw.enableLogo,
    enableIcon: raw.enableIcon,
    enableDescription: raw.enableDescription,
    descriptionScale: raw.descriptionScale,
    descriptionBelowLogo: raw.descriptionBelowLogo,
    logoBelowShelf: raw.logoBelowShelf,
    logoPosition: raw.logoPosition,
    descriptionPosition: raw.descriptionPosition,
    logoSize: raw.logoSize,
    logoTopOffset: raw.logoTopOffset,
    fullPageShelf: raw.fullPageShelf,
    iconVerticalAlign: raw.iconVerticalAlign,
    shelfTitlePosition: raw.shelfTitlePosition,
    gameNamePosition: raw.gameNamePosition,
    playtimePosition: raw.playtimePosition,
    descriptionHeight: raw.descriptionHeight,
    descriptionLogoGap: raw.descriptionLogoGap,
  };
}

function smartShelfDisplayFlags(raw: any) {
  return {
    matchNativeSize: raw.matchNativeSize ?? false,
    highlightFirst: raw.highlightFirst ?? false,
    highlightAll: raw.highlightAll ?? false,
    highlightedAppIds: raw.highlightedAppIds,
    ...smartShelfHideFlags(raw),
    friendsPlayingOverlay: raw.friendsPlayingOverlay ?? false,
    friendsPlayingOverlayRecent: raw.friendsPlayingOverlayRecent ?? false,
  };
}

function smartShelfToShelf(s: SmartShelf): Shelf {
  const raw = s as any;
  return {
    id: s.id,
    title: s.title,
    enabled: true,
    hidden: false,
    limit: s.limit ?? 20,
    ...smartShelfDisplayFlags(raw),
    ...smartShelfOverlayFields(raw),
    ...(raw.heroEnabled ? { heroEnabled: true } : {}),
    gameInfoAbove: raw.gameInfoAbove,
    dedupeByExactName: raw.dedupeByExactName,
    autoPin: raw.autoPin,
    autoCollapse: raw.autoCollapse,
    autoCollapseWhenEmpty: raw.autoCollapseWhenEmpty,
    source: buildSmartShelfSource(s),
    sort: raw.sort,
    sortReverse: raw.sortReverse,
    manualOrder: raw.manualOrder,
    manualBaseSort: raw.manualBaseSort,
    manualBaseSortReverse: raw.manualBaseSortReverse,
    hiddenAppIds: raw.hiddenAppIds,
  } as any;
}

function smartShelfVisible(s: SmartShelf): boolean {
  const raw = s as any;
  return evalVisibility({
    visibility: raw.visibility,
    visibleHours: raw.visibleHours ?? getModeVisibilityWindows(raw.mode),
    visibleDaysOfWeek: raw.visibleDaysOfWeek,
  } as any);
}

export function computeEnabledSmartShelves(smartShelves: SmartShelf[] | undefined): Shelf[] {
  return (smartShelves ?? [])
    .filter((s) => s.enabled && !s.hidden)
    .filter(smartShelfVisible)
    .map(smartShelfToShelf);
}

export function dispatchHideRecentsDisabled(disabled: boolean): void {
  globalThis.dispatchEvent(new CustomEvent('deck-shelves-hideRecents-disabled', { detail: { disabled } }));
}

export async function anyShelfHasItems(visible: Shelf[], resolveShelfAppIds: (source: unknown, limit: number) => Promise<number[]>): Promise<boolean> {
  const resolved = await Promise.all(visible.map((sh) => resolveShelfAppIds(sh.source, sh.limit).catch(() => [])));
  return resolved.some((r) => Array.isArray(r) && r.length > 0);
}

export function teardownObservers(observers: MutationObserver[]): void {
  for (const o of observers) { try { o.disconnect(); } catch {} }
}

// Restore only if nothing re-patched history after us.
export function teardownHistoryPatches(hist: any, origPush: unknown, origReplace: unknown): void {
  try { if (origPush && hist.pushState !== origPush) hist.pushState = origPush; } catch {}
  try { if (origReplace && hist.replaceState !== origReplace) hist.replaceState = origReplace; } catch {}
}

function countVisibleSmartShelves(settings: Settings): number {
  if (!settings.smartShelvesEnabled) return 0;
  return (settings.smartShelves ?? []).filter((s: any) => s.enabled !== false && !s.hidden && evalVisibility(s)).length;
}

function hasAnyVisibleShelves(settings: Settings): boolean {
  const visibleShelves = (settings.shelves ?? []).filter((s: any) => s.enabled && !s.hidden);
  return visibleShelves.length > 0 || countVisibleSmartShelves(settings) > 0;
}

export function computeCanHideRecents(params: { settings: Settings | null | undefined; replaceKillSwitch: boolean }): { canHide: boolean; replaceActive: boolean } {
  const { settings, replaceKillSwitch } = params;
  if (!settings) return { canHide: false, replaceActive: false };
  const hasAnyVisible = hasAnyVisibleShelves(settings);
  const toggleOn = settings.enabled === true && settings.hideRecents === true;
  const replaceActive = toggleOn && settings.recentsReplaceSource === true && hasAnyVisible && !replaceKillSwitch;
  const canHide = toggleOn && hasAnyVisible && !replaceActive;
  return { canHide, replaceActive };
}

// The hidden row stays in the DOM so its native classes and hero images stay readable.
export function applyRecentsFocusTrap(recentsEl: HTMLElement, canHide: boolean): void {
  const focusables = recentsEl.querySelectorAll<HTMLElement>('[tabindex], button, a, input, [role="button"]');
  for (const el of Array.from(focusables)) {
    if (canHide) {
      if (!el.dataset.dsPrevTabindex) el.dataset.dsPrevTabindex = el.getAttribute('tabindex') ?? '0';
      el.setAttribute('tabindex', '-1');
    } else if (el.dataset.dsPrevTabindex !== undefined) {
      el.setAttribute('tabindex', el.dataset.dsPrevTabindex);
      delete el.dataset.dsPrevTabindex;
    }
  }
  if (canHide) recentsEl.setAttribute('aria-hidden', 'true');
  else recentsEl.removeAttribute('aria-hidden');
}
