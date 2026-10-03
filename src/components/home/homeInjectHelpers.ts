import type { Settings, Shelf, SmartShelf } from "../../types";
import { getModeVisibilityWindows, evalVisibility } from "../../steam/smartShelves";
import { getRecentsReplaceActiveShelfId } from "../../runtime/recentsReplace";

/* When replace-source is actively injecting (toggle on + app ids resolved +
   not killed), the injected shelf already renders inside the native recents
   slot — skip it here to avoid a visual duplicate. If injection isn't
   happening (failed, not resolved yet), keep every shelf. */
export function computeNormalShelves(visibleShelves: Shelf[], replaceInjecting: boolean, replaceKillSwitch: boolean): Shelf[] {
  if (!replaceInjecting || replaceKillSwitch) return visibleShelves;
  const activeId = getRecentsReplaceActiveShelfId();
  return activeId ? visibleShelves.filter((s) => s.id !== activeId) : visibleShelves.slice(1);
}

/* Placement: unifiedListEnabled emits shelves in the user's explicit
   `allShelvesOrder` (unlisted fall to the end), skipping the interleave/
   order-css path entirely. Otherwise: normalFirst picks normal-then-smart
   vs smart-then-normal (DOM order; CSS `order` restores the visual
   interleave separately when hideRecents + !atBottom). */
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
  // Append anything the user has but hasn't placed yet (new shelves).
  for (const remaining of byId.values()) ordered.push(remaining);
  return ordered;
}

// Visual interleave: hiding recents without smartShelvesAtBottom (and not
// replace-injecting) renders [normal, smart] in the DOM but presents
// [promoted normal, smart, rest] via flex `order`. Off in unified mode.
export function computeInterleaveSmart(params: { unifiedOn: boolean; settings: Settings; replaceInjecting: boolean; replaceKillSwitch: boolean }): boolean {
  const { unifiedOn, settings, replaceInjecting, replaceKillSwitch } = params;
  if (unifiedOn) return false;
  if (settings.hideRecents !== true || settings.smartShelvesAtBottom) return false;
  return !(replaceInjecting && !replaceKillSwitch);
}

function resolvePositionSetting(value: unknown): 'left' | 'center' | 'right' {
  return value === 'center' || value === 'right' ? value : 'left';
}

function resolveClampedSize(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' ? Math.max(min, Math.min(max, value)) : fallback;
}

/* The handful of ShelvesContainer props that are actually DERIVED (ternary/
   &&/|| logic), as opposed to the many plain `settings.x === true`
   passthroughs left inline at the call site. */
export function computeDerivedGlobalFlags(params: { settings: Settings; replaceInjecting: boolean; replaceKillSwitch: boolean }) {
  const { settings, replaceInjecting, replaceKillSwitch } = params;
  const s = settings as any;
  const replaceInactive = !(replaceInjecting && !replaceKillSwitch);
  return {
    globalLogoPosition: resolvePositionSetting(s.globalLogoPosition),
    globalDescriptionPosition: resolvePositionSetting(s.globalDescriptionPosition),
    globalLogoSize: resolveClampedSize(s.globalLogoSize, 50, 200, 100),
    globalLogoTopOffset: resolveClampedSize(s.globalLogoTopOffset, 0, 100, 20),
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
    // Composite source mixing — forwarded so the resolver can union /
    // intersect multiple smart-mode candidate sets for a composite shelf.
    compositeModes: raw.compositeModes,
    compositeCombine: raw.compositeCombine,
    /* friends_playing may surface games the user doesn't own (friends
       currently playing OR seen playing in the last 14 days) — this flag
       tells Shelf.tsx to fall back to the Store API for names/covers on
       non-owned appids, the same path wishlist/store shelves use. */
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

// Convert one enabled smart shelf into a Shelf-compatible object for
// ShelfView. `sortReverse`/`manualBaseSortReverse` forward alongside
// `sort`/`manualBaseSort` so a descending order reaches Home, not just preview.
function smartShelfToShelf(s: SmartShelf): Shelf {
  const raw = s as any;
  return {
    id: s.id,
    title: s.title,
    enabled: true,
    hidden: false,
    limit: s.limit ?? 20,
    ...smartShelfDisplayFlags(raw),
    ...(raw.heroEnabled ? { heroEnabled: true } : {}),
    source: buildSmartShelfSource(s),
    sort: raw.sort,
    sortReverse: raw.sortReverse,
    manualOrder: raw.manualOrder,
    manualBaseSort: raw.manualBaseSort,
    manualBaseSortReverse: raw.manualBaseSortReverse,
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

// Resolves every visible shelf's app ids in parallel (best-effort — a
// failing resolver counts as empty) and reports whether ANY has items, to
// decide whether hiding recents would leave the user with nothing to see.
export async function anyShelfHasItems(visible: Shelf[], resolveShelfAppIds: (source: unknown, limit: number) => Promise<number[]>): Promise<boolean> {
  const resolved = await Promise.all(visible.map((sh) => resolveShelfAppIds(sh.source, sh.limit).catch(() => [])));
  return resolved.some((r) => Array.isArray(r) && r.length > 0);
}

export function teardownObservers(observers: MutationObserver[]): void {
  for (const o of observers) { try { o.disconnect(); } catch {} }
}

// Only restore history.pushState/replaceState if nothing else re-patched
// them after us (a later effect's own patch should win, not get clobbered).
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

// Whether native recents can actually be hidden right now (enabled, toggle
// on, something to show in its place), and whether recents-replace is the
// thing keeping the row visible (canHide false, but still needs the margin).
export function computeCanHideRecents(params: { settings: Settings | null | undefined; replaceKillSwitch: boolean }): { canHide: boolean; replaceActive: boolean } {
  const { settings, replaceKillSwitch } = params;
  if (!settings) return { canHide: false, replaceActive: false };
  const hasAnyVisible = hasAnyVisibleShelves(settings);
  const toggleOn = settings.enabled === true && settings.hideRecents === true;
  const replaceActive = toggleOn && settings.recentsReplaceSource === true && hasAnyVisible && !replaceKillSwitch;
  const canHide = toggleOn && hasAnyVisible && !replaceActive;
  return { canHide, replaceActive };
}

// When recents are hidden, pull its focusables out of the gamepad nav tree
// (tabindex -1) so the D-pad skips straight to our shelves — DOM stays
// intact so native classes/hero images stay readable; restores on un-hide.
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
