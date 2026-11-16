import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { DiscountBadgeMode } from './shelf/discountBadge';
import { withDefaults } from "./withDefaults";
import { mark, measure } from "../core/perf";
import { computeCenteredScrollLeft } from "../core/scrollUtils";
import { Focusable } from "../runtime/host/decky";
import { getPreferredSteamDocument } from "../runtime/steamHost";
import { getRuntimeClassMap } from "../core/webpackCompat";
import { logInfo } from "../runtime/logger";
import { focusElement, getPendingFocusTarget } from "../core/focusRestore";
import { subscribeFocusedCard, getFocusedCard } from "../runtime/focusedCardTracker";
import { flowChildrenProps } from "../core/steamOSVersion";

export { type DeckRowItem } from "./shelf/types";
export { GameCard } from "./shelf/GameCard";

import { type DeckRowItem, CARD_W, CARD_ART_H, CARD_GAP } from "./shelf/types";
import { ShelfRow, isWideItem } from "./shelf/ShelfRow";
import {
  getCachedNativeDims,
  globalStylesStart,
  globalStylesStop,
  onNativeDimsChange,
} from "./shelf/shelfStyles";
import { getCurrentSettings, saveSettings } from "../store/settingsStore";
import { trackFeature } from "../steam/usageTracking";
import { patchShelfInSettings } from "../domain/settings";
import type { Settings } from "../types";
import { PerShelfHero } from "./shelf/PerShelfHero";
import { computeCardWindow, sameWindow, type CardWindow } from "../domain/cardWindow";
import { rememberShelfHeight } from "./shelf/shelfViewportGate";
import {
  computeEffectiveDims, computeVisuallyForced, computeFullPageLayoutActive,
  computeAutoCollapsed, computeCollapsed, computeLogoBandPx, computeShelfRootStyle,
  shouldRenderHero, resolveTitleJustifyContent, boolAttr, computeLockedTitleProps,
  isFocusStillWithin, isLateralMoveWithinShelf,
  syncCardSelectionClasses, scrollShelfIntoView, applyVerticalFallback,
  findScrollViewport, findGpfocusDsCardMutation, clearGpfocusOnOtherDocs,
} from "./shelf/deckRowHelpers";

function isScrollableEl(el: HTMLElement): boolean {
  try {
    const oy = (getComputedStyle(el).overflowY || '').toLowerCase();
    return (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight;
  } catch (e) {
    logInfo("HOME", "isScrollableEl: getComputedStyle failed", String(e));
    return false;
  }
}

function smoothScrollTo(el: HTMLElement, top: number): void {
  try { el.scrollTo({ top, behavior: "smooth" }); } catch { el.scrollTop = top; }
}

function readCollapsed(shelfId: string): boolean {
  try { return localStorage.getItem(`ds-collapsed-${shelfId}`) === '1'; } catch (e) { logInfo("HOME", "readCollapsed failed", String(e)); return false; }
}

function writeCollapsed(shelfId: string, collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(`ds-collapsed-${shelfId}`, '1');
    else localStorage.removeItem(`ds-collapsed-${shelfId}`);
  } catch (e) {
    logInfo("HOME", "writeCollapsed failed", String(e));
  }
}

function findShelfRow(s: Settings | null, shelfId: string): { shelf: any; isSmart: boolean } | null {
  const regular = s?.shelves?.find((row) => row.id === shelfId);
  if (regular) return { shelf: regular, isSmart: false };
  const smart = s?.smartShelves?.find((row) => row.id === shelfId);
  return smart ? { shelf: smart, isSmart: true } : null;
}

function patchShelfRow(s: Settings, shelfId: string, isSmart: boolean, patch: Record<string, any>): Settings {
  if (!isSmart) return patchShelfInSettings(s, shelfId, patch);
  return { ...s, smartShelves: (s.smartShelves ?? []).map((sh) => sh.id === shelfId ? { ...sh, ...patch } : sh) };
}

export function _labelOverhangPx(args: {
  hideStatusLine?: boolean;
  hideGameNames?: boolean;
  enableIcon?: boolean;
  enableDescription?: boolean;
  descriptionBelowLogo?: boolean;
}): number {
  let total = 16;
  if (!args.hideGameNames) total += 22;
  if (!args.hideStatusLine) total += 18;
  if (args.enableDescription && !args.descriptionBelowLogo) total += 38;
  total += 8;
  return Math.max(total, 60);
}

type HPos = 'left' | 'center' | 'right';

type DeckRowProps = {
  title?: string; items: DeckRowItem[]; shelfId?: string; removableSet?: Set<number>; matchNativeSize?: boolean;
  highlightFirst?: boolean; highlightAll?: boolean; highlightedAppIds?: number[];
  hideStatusLine?: boolean; hideNewBadge?: boolean; hideDiscountBadge?: boolean; hideCompatIcons?: boolean; hideNonSteamBadge?: boolean;
  discountBadgeMode?: DiscountBadgeMode;
  hideShelfTitle?: boolean; hideGameNames?: boolean; hideInstallIndicator?: boolean;
  enableLogo?: boolean; enableIcon?: boolean; enableDescription?: boolean; descriptionBelowLogo?: boolean; logoBelowShelf?: boolean;
  logoPosition?: HPos; descriptionPosition?: HPos; logoSize?: number; logoTopOffset?: number;
  iconVerticalAlign?: 'top' | 'center' | 'bottom'; shelfTitlePosition?: HPos; gameNamePosition?: HPos; playtimePosition?: HPos;
  descriptionHeight?: number; descriptionLogoGap?: number; descriptionScale?: number;
  forceExpanded?: boolean; fullPageLayoutOnly?: boolean; pinScrollTop?: boolean; forceLayoutAsRecents?: boolean;
  heroEnabled?: boolean; heroLabelMount?: boolean; infoAbove?: boolean; friendsOverlay?: boolean; friendsOverlayRecent?: boolean;
  forceCollapsed?: boolean; autoCollapseWhenEmpty?: boolean;
};

const ROW_DEFAULTS = {
  matchNativeSize: false, highlightFirst: false, highlightAll: false,
  hideStatusLine: false, hideNewBadge: false, hideDiscountBadge: false, hideCompatIcons: false, hideNonSteamBadge: false,
  discountBadgeMode: 'percent' as DiscountBadgeMode,
  hideShelfTitle: false, hideGameNames: false, hideInstallIndicator: false,
  enableLogo: false, enableIcon: false, enableDescription: false, descriptionBelowLogo: false, logoBelowShelf: false,
  logoPosition: 'left', descriptionPosition: 'left', logoSize: 100, logoTopOffset: 20,
  iconVerticalAlign: 'top', shelfTitlePosition: 'left', gameNamePosition: 'left', playtimePosition: 'left',
  descriptionHeight: 2, descriptionLogoGap: 10, descriptionScale: 1,
  forceExpanded: false, fullPageLayoutOnly: false, pinScrollTop: false, forceLayoutAsRecents: false,
  heroEnabled: false, heroLabelMount: false, infoAbove: false, friendsOverlay: false, friendsOverlayRecent: false,
  forceCollapsed: false, autoCollapseWhenEmpty: false,
} as const satisfies Partial<DeckRowProps>;

function markRenderStart(shelfId: string | undefined): void {
  try { mark?.(`deckRow.render:${shelfId ?? 'unknown'}:start`); } catch (e) { logInfo("HOME", "mark failed", String(e)); }
}

function rowHasWideCards(highlightAll: boolean, highlightFirst: boolean, highlightedSet: Set<number> | undefined): boolean {
  return highlightAll || highlightFirst || !!highlightedSet?.size;
}

// The ReactVirtualized class lets theme rules that target native rows reach these cards.
function rowClassName(nativeRowClass: string): string {
  return `ds-row-scroll ReactVirtualized__Grid__innerScrollContainer${nativeRowClass ? ` ${nativeRowClass}` : ''}`;
}

const TITLE_STYLE = { marginBottom: 8, paddingLeft: "2.8vw", paddingRight: "2.8vw", display: "flex", alignItems: "center", gap: 8, userSelect: "none" } as const;

type ShelfTitleProps = {
  title: string; collapsed: boolean; position: HPos; titleRef: React.RefObject<HTMLDivElement | null>;
  locked: ReturnType<typeof computeLockedTitleProps>; onToggle: () => void;
};

function ShelfTitle({ title, collapsed, position, titleRef, locked, onToggle }: ShelfTitleProps) {
  if (collapsed) {
    return (
      <Focusable
        ref={titleRef as any}
        className="ds-shelf-title"
        data-ds-title-position={position}
        onClick={onToggle}
        onOKButton={onToggle}
        onActivate={onToggle}
        style={{ ...TITLE_STYLE, justifyContent: resolveTitleJustifyContent(position), cursor: "pointer" }}
      >
        <span>{`+ ${title}`}</span>
      </Focusable>
    );
  }
  return (
    <div
      ref={titleRef}
      className={`ds-shelf-title${locked.extraClass}`}
      data-ds-title-position={position}
      onClick={locked.onClick}
      style={{ ...TITLE_STYLE, justifyContent: resolveTitleJustifyContent(position), cursor: locked.cursor, pointerEvents: locked.pointerEvents }}
    >
      <span>{title}</span>
    </div>
  );
}

function DeckRowImpl(props: DeckRowProps) {
  const {
    title, items, shelfId, removableSet, matchNativeSize, highlightFirst, highlightAll, highlightedAppIds,
    hideStatusLine, hideNewBadge, hideDiscountBadge, discountBadgeMode, hideCompatIcons, hideNonSteamBadge, hideShelfTitle, hideGameNames, hideInstallIndicator,
    enableLogo, enableIcon, enableDescription, descriptionBelowLogo, logoBelowShelf, logoPosition, descriptionPosition, logoSize, logoTopOffset,
    iconVerticalAlign, shelfTitlePosition, gameNamePosition, playtimePosition, descriptionHeight, descriptionLogoGap, descriptionScale,
    forceExpanded, fullPageLayoutOnly, pinScrollTop, forceLayoutAsRecents, heroEnabled, heroLabelMount, infoAbove,
    friendsOverlay, friendsOverlayRecent, forceCollapsed, autoCollapseWhenEmpty,
  } = withDefaults(props, ROW_DEFAULTS);
  const visuallyForced = computeVisuallyForced(forceExpanded, forceLayoutAsRecents);
  const fullPageLayoutActive = computeFullPageLayoutActive(forceExpanded, fullPageLayoutOnly, pinScrollTop);
  const highlightedSet = useMemo(() => {
    if (!highlightedAppIds?.length) return undefined;
    return new Set(highlightedAppIds);
  }, [highlightedAppIds]);
  const hiddenSet = useMemo(() => {
    if (!shelfId) return undefined;
    const h: number[] | undefined = findShelfRow(getCurrentSettings(), shelfId)?.shelf.hiddenAppIds;
    return h?.length ? new Set(h) : undefined;
  }, [shelfId, items]);
  const onRemoveCard = useCallback((appid: number) => {
    if (!shelfId || !appid) return;
    const s = getCurrentSettings();
    const found = s ? findShelfRow(s, shelfId) : null;
    if (!s || !found) return;
    const m: number[] = found.shelf.manualOrder ?? [];
    if (!m.includes(appid)) return;
    void saveSettings(patchShelfRow(s, shelfId, found.isSmart, { manualOrder: m.filter((id) => id !== appid) }));
  }, [shelfId]);
  const onHideCard = useCallback((appid: number) => {
    if (!shelfId || !appid) return;
    const s = getCurrentSettings();
    const found = s ? findShelfRow(s, shelfId) : null;
    if (!s || !found) return;
    const h: number[] = found.shelf.hiddenAppIds ?? [];
    const next = h.includes(appid) ? h.filter((id) => id !== appid) : [...h, appid];
    try { trackFeature("hide"); } catch {}
    void saveSettings(patchShelfRow(s, shelfId, found.isSmart, { hiddenAppIds: next }));
  }, [shelfId]);
  markRenderStart(shelfId);
  const rowRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [collapsedState, setCollapsed] = useState(() => shelfId ? readCollapsed(shelfId) : false);
  useEffect(() => {
    if (!shelfId) return;
    const onCollapsed = (e: Event) => {
      const ev = e as CustomEvent<{ shelfId: string; collapsed: boolean }>;
      if (ev.detail?.shelfId !== shelfId) return;
      setCollapsed(!!ev.detail.collapsed);
    };
    window.addEventListener('ds-shelf-collapsed', onCollapsed as EventListener);
    return () => window.removeEventListener('ds-shelf-collapsed', onCollapsed as EventListener);
  }, [shelfId]);
  const autoCollapsed = computeAutoCollapsed(forceCollapsed, autoCollapseWhenEmpty, items.length);
  const collapsed = computeCollapsed(visuallyForced, collapsedState, autoCollapsed);
  const [nativeRowClass, setNativeRowClass] = useState('');
  const [dimsVersion, setDimsVersion] = useState(0);

  const dims = useMemo(
    () => computeEffectiveDims(matchNativeSize, getCachedNativeDims()),
    [matchNativeSize, dimsVersion],
  );
  const { w: effectiveW, h: effectiveH, gap: effectiveGap, featW: effectiveFeaturedW, featH: effectiveFeaturedH, artH: effectiveArtH, featArtH: effectiveFeaturedArtH } = dims;

  const effShelfVars = useMemo<React.CSSProperties>(() => {
    if (!matchNativeSize) return {};
    return {
      ["--ds-eff-card-w" as string]: `var(--ds-native-card-w, ${CARD_W}px)`,
      ["--ds-eff-card-h" as string]: `var(--ds-native-card-h, ${CARD_ART_H}px)`,
      ["--ds-eff-card-art-h" as string]: `var(--ds-native-card-art-h, ${CARD_ART_H}px)`,
      ["--ds-eff-feat-w" as string]: `var(--ds-native-feat-w, ${Math.round(CARD_W * 3.21)}px)`,
      // A featured card only differs in width; its height matches the rest of the row.
      ["--ds-eff-feat-h" as string]: `var(--ds-native-card-h, ${CARD_ART_H}px)`,
      ["--ds-eff-feat-art-h" as string]: `var(--ds-native-card-art-h, ${CARD_ART_H}px)`,
      ["--ds-eff-card-gap" as string]: `max(var(--ds-native-card-gap, ${CARD_GAP}px), 8px)`,
    };
  }, [matchNativeSize]);
  const finalFeaturedW = effectiveFeaturedW;
  const finalFeaturedH = effectiveFeaturedH;
  const finalFeaturedArtH = effectiveFeaturedArtH;

  const hasWideCards = rowHasWideCards(highlightAll, highlightFirst, highlightedSet);
  const windowFor = useCallback((scrollLeft: number, viewportW: number): CardWindow => {
    const target = getPendingFocusTarget();
    const anchor = target && (!target.shelfId || target.shelfId === shelfId) ? items.findIndex((i) => i.appid === target.appid) : -1;
    const wide = hasWideCards ? { wideSlotW: finalFeaturedW + effectiveGap, isWide: (i: number) => isWideItem(items[i], i, { highlightAll, highlightFirst, highlightedSet }) } : {};
    return computeCardWindow({ scrollLeft, viewportW: viewportW || 1280, slotW: effectiveW + effectiveGap, count: items.length, overscan: hasWideCards ? 9 : 6, anchor, ...wide });
  }, [items, shelfId, effectiveW, effectiveGap, hasWideCards, finalFeaturedW, highlightAll, highlightFirst, highlightedSet]);
  const [cardWindow, setCardWindow] = useState<CardWindow>(() => windowFor(0, 0));
  const windowRef = useRef<CardWindow>(cardWindow);
  useEffect(() => {
    const rowEl = rowRef.current;
    const apply = () => {
      const next = windowFor(rowEl?.scrollLeft ?? 0, rowEl?.clientWidth ?? 0);
      if (!sameWindow(windowRef.current, next)) { windowRef.current = next; setCardWindow(next); }
    };
    apply();
    if (!rowEl) return;
    let raf: number | null = null;
    const onScroll = () => { if (raf !== null) return; raf = requestAnimationFrame(() => { raf = null; apply(); }); };
    rowEl.addEventListener("scroll", onScroll, { passive: true });
    return () => { rowEl.removeEventListener("scroll", onScroll); if (raf !== null) cancelAnimationFrame(raf); };
  }, [windowFor]);
  useEffect(() => { rememberShelfHeight(shelfId, outerRef.current?.offsetHeight ?? 0); });

  useEffect(() => {
    globalStylesStart();
    try { requestAnimationFrame(() => { try { measure?.(`deckRow.render:${shelfId ?? 'unknown'}`, `deckRow.render:${shelfId ?? 'unknown'}:start`); } catch (e) { logInfo("HOME", "measure failed", String(e)); } }); } catch (e) { logInfo("HOME", "rAF measure failed", String(e)); }
    const unsub = onNativeDimsChange(() => {
      setDimsVersion((v) => v + 1);
      // Resized cards shift the focused card's offsetLeft, so re-center it on the next frame.
      try {
        const focused = (globalThis as any).__ds_last_focused_card as HTMLElement | null;
        const row = rowRef.current;
        if (focused && row?.contains(focused)) {
          requestAnimationFrame(() => {
            try {
              const final = computeCenteredScrollLeft(
                { width: row.clientWidth, scrollWidth: row.scrollWidth },
                { left: focused.offsetLeft, top: focused.offsetTop, width: focused.offsetWidth, height: focused.offsetHeight }
              );
              row.scrollTo({ left: final, behavior: 'instant' as ScrollBehavior });
            } catch {}
          });
        }
      } catch {}
    });
    return () => {
      globalStylesStop();
      unsub();
    };
  }, []);

  useEffect(() => {
    function addMapClasses(el: HTMLElement | null, key: string, map: Record<string, string> | null) {
      if (!el || !map?.[key]) return;
      for (const c of map[key].split(/\s+/)) {
        if (c && !el.classList.contains(c)) el.classList.add(c);
      }
    }
    function readForceThemes(): boolean {
      try {
        const w = globalThis as any;
        const raw = w.localStorage?.getItem?.('deck-shelves-settings-cache-v3');
        if (!raw) return false;
        const s = JSON.parse(raw);
        return s?.forceCssLoaderThemes === true;
      } catch { return false; }
    }
    function injectShelfNativeClasses() {
      const doc = getPreferredSteamDocument();
      const map = doc ? getRuntimeClassMap(doc) : null;
      if (!map) return;
      addMapClasses(outerRef.current, 'nativeShelf', map);
      addMapClasses(titleRef.current, 'nativeShelfTitle', map);
      if (map.nativeShelfRow) setNativeRowClass(map.nativeShelfRow);
      addMapClasses(outerRef.current, 'nativeRecentsContainer', map);
      addMapClasses(outerRef.current, 'nativeRecentsInner', map);
      addMapClasses(outerRef.current, 'nativeRecentsSection', map);
      addMapClasses(titleRef.current, 'nativeRecentsHeader', map);
      addMapClasses(titleRef.current, 'nativeRecentsHeaderLabel', map);
      addMapClasses(outerRef.current, 'nativeShelfContainer', map);
      if (readForceThemes()) {
        const outerExtras = [
          'nativeSemanticGameRow', 'nativeSection', 'nativeSectionContainer',
          'nativeLibraryHomeSection', 'nativeCollection', 'nativeCollectionContents',
          'nativeCardsSection',
        ];
        for (const k of outerExtras) addMapClasses(outerRef.current, k, map);
        const titleExtras = [
          'nativeTitle', 'nativeTitleText', 'nativeTitleLabel', 'nativeTitleContainer',
          'nativeSectionTitle', 'nativeSectionHeader', 'nativeSectionHeaderContent',
          'nativeSectionName', 'nativeCollectionHeader', 'nativeCollectionName',
          'nativeCollectionLabel',
        ];
        for (const k of titleExtras) addMapClasses(titleRef.current, k, map);
      }
    }
    injectShelfNativeClasses();
    // The class map and settings both load async after mount; these retries cover a cold boot.
    const timers = [500, 1000, 2000, 5000].map(d => setTimeout(injectShelfNativeClasses, d));
    const onSettings = () => injectShelfNativeClasses();
    globalThis.addEventListener('deck-shelves-settings-changed', onSettings);
    return () => {
      for (const t of timers) clearTimeout(t);
      globalThis.removeEventListener('deck-shelves-settings-changed', onSettings);
    };
  }, []);

  

  const pinScrollTopRef = useRef(pinScrollTop);
  useEffect(() => { pinScrollTopRef.current = pinScrollTop; }, [pinScrollTop]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const CENTER_TOLERANCE_PX = 32;
    let scheduled: number | null = null;
    let lastScrollable: HTMLElement | null = null;
    let lastTarget = -1;
    const findScrollableAncestor = (node: HTMLElement | null): HTMLElement | null => {
      let cur = node?.parentElement ?? null;
      while (cur && cur !== cur.ownerDocument?.body) {
        if (isScrollableEl(cur)) return cur;
        cur = cur.parentElement;
      }
      return null;
    };
    const maybeCenter = () => {
      try {
        if (!isFocusStillWithin(el)) return;
        const scr = findScrollableAncestor(el);
        if (!scr) { el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
        const elRect = el.getBoundingClientRect();
        const scrRect = scr.getBoundingClientRect();
        if (pinScrollTopRef.current) {
          if (scr === lastScrollable && lastTarget === 0) return;
          lastScrollable = scr;
          lastTarget = 0;
          smoothScrollTo(scr, 0);
          return;
        }
        const currentCenterOffset = (elRect.top + elRect.height / 2) - (scrRect.top + scrRect.height / 2);
        if (Math.abs(currentCenterOffset) <= CENTER_TOLERANCE_PX) return;
        const delta = elRect.top - scrRect.top;
        const target = Math.round(scr.scrollTop + delta - (scr.clientHeight - elRect.height) / 2);
        const clamped = Math.max(0, Math.min(scr.scrollHeight - scr.clientHeight, target));
        // Steam can re-fire focusin during a smooth scroll.
        if (scr === lastScrollable && Math.abs(clamped - lastTarget) < 2) return;
        lastScrollable = scr;
        lastTarget = clamped;
        smoothScrollTo(scr, clamped);
      } catch {}
    };
    let verifyTimer: number | null = null;
    const onFocusIn = () => {
      if (scheduled === null) {
        scheduled = requestAnimationFrame(() => {
          scheduled = null;
          maybeCenter();
        });
      }
      if (verifyTimer) clearTimeout(verifyTimer);
      verifyTimer = window.setTimeout(() => {
        verifyTimer = null;
        lastTarget = -1;
        maybeCenter();
      }, 300);
    };
    el.addEventListener("focusin", onFocusIn);
    // BTakeFocus navigation moves Steam's focus without firing focusin or touching activeElement.
    const gpfocusObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const t = m.target as HTMLElement;
        if (t.classList?.contains("gpfocus") && t.classList?.contains("ds-card")) { onFocusIn(); return; }
      }
    });
    gpfocusObserver.observe(el, { subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      gpfocusObserver.disconnect();
      if (scheduled !== null) cancelAnimationFrame(scheduled);
      if (verifyTimer) clearTimeout(verifyTimer);
    };
  }, []);

  useEffect(() => {
    const rowEl = rowRef.current;
    if (!rowEl) return;
    const sync = (focusedCard: HTMLElement | null) => {
      try {
        const card = focusedCard && rowEl.contains(focusedCard) ? focusedCard : null;
        if (!card) {
          for (const el of Array.from(rowEl.querySelectorAll<HTMLElement>(".ds-card.gpfocus"))) el.classList.remove("gpfocus");
          return;
        }
        if (card.classList.contains("gpfocus")) return;
        for (const el of Array.from(rowEl.querySelectorAll<HTMLElement>(".ds-card.gpfocus"))) {
          if (el !== card) el.classList.remove("gpfocus");
        }
        card.classList.add("gpfocus");
      } catch (e) { logInfo("HOME", "row gpfocus sync failed", String(e)); }
    };
    sync(getFocusedCard());
    return subscribeFocusedCard(sync);
  }, []);

  useEffect(() => {
    const rowEl = rowRef.current;
    if (!rowEl) return;
    const throttleRows: Set<HTMLElement> = ((globalThis as any).__ds_scroll_throttle_rows ??= new Set());

    let rafPending: number | null = null;
    let throttleTimer: any = null;

    const doHorizontalScroll = (card: HTMLElement) => {
      const final = computeCenteredScrollLeft(
        { width: rowEl.clientWidth, scrollWidth: rowEl.scrollWidth },
        { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight }
      );
      rowEl.scrollTo({ left: final, behavior: 'instant' });
      if (throttleTimer !== null) return;
      throttleRows.add(rowEl);
      throttleTimer = requestAnimationFrame(() => {
        throttleRows.delete(rowEl);
        throttleTimer = null;
        if (lastFocusedCard && lastFocusedCard !== card) {
          doHorizontalScroll(lastFocusedCard);
        }
      });
    };

    let lastFocusedCard: HTMLElement | null = null;
    const handleFocusedCard = (card: HTMLElement | null) => {
      if (!card) return;
      lastFocusedCard = card;
      if (throttleRows.has(rowEl)) return;
      syncCardSelectionClasses(rowEl, card);
      const prevCard: HTMLElement | null = (globalThis as any).__ds_prev_centered_card ?? null;
      (globalThis as any).__ds_prev_centered_card = card;
      if (isLateralMoveWithinShelf(prevCard, card, rowEl)) {
        doHorizontalScroll(card);
        return;
      }
      try {
        scrollShelfIntoView(outerRef.current, pinScrollTopRef.current);
      } catch (e) {
        logInfo("HOME", "scrollIntoView failed", String(e));
      }
      try {
        function getScrollableAncestor(node: HTMLElement | null): HTMLElement | null {
          let cur = node?.parentElement ?? null;
          while (cur && cur !== document.body) {
            if (isScrollableEl(cur)) return cur;
            cur = cur.parentElement;
          }
          return null;
        }
        applyVerticalFallback(getScrollableAncestor(rowEl), outerRef.current, pinScrollTopRef.current);
      } catch (e) {
        logInfo("HOME", "vertical scroll fallback A failed", String(e));
      }
      try {
        const spDoc = getPreferredSteamDocument();
        if (spDoc && spDoc !== document) {
          applyVerticalFallback(findScrollViewport(spDoc), outerRef.current, pinScrollTopRef.current);
        }
      } catch (e) {
        logInfo("HOME", "vertical scroll fallback B failed", String(e));
      }
      doHorizontalScroll(card);
    };

    const observer = new MutationObserver((mutations) => {
      const detected = findGpfocusDsCardMutation(mutations);
      if (!detected) return;
      const c = detected;
      clearGpfocusOnOtherDocs(c);
      if (rafPending !== null) return;
      rafPending = requestAnimationFrame(() => {
        rafPending = null;
        // gpfocus flickers across cards while Steam rebuilds the nav tree after a restart.
        if (!c.classList.contains('gpfocus') && c !== c.ownerDocument?.activeElement) return;
        handleFocusedCard(c);
      });
    });

    const onCardFocus = (e: FocusEvent) => {
      const card = (e.target as HTMLElement)?.closest?.('.ds-card') as HTMLElement | null;
      if (card) {
        (globalThis as any).__ds_last_focused_card = card;
        if (rafPending !== null) { cancelAnimationFrame(rafPending); rafPending = null; }
        rafPending = requestAnimationFrame(() => {
          rafPending = null;
          if (!card.classList.contains('gpfocus') && card !== card.ownerDocument?.activeElement) return;
          handleFocusedCard(card);
        });
      }
    };

    observer.observe(rowEl, { subtree: true, attributes: true, attributeFilter: ['class'] });

    rowEl.addEventListener("focusin", onCardFocus);
    return () => {
      rowEl.removeEventListener("focusin", onCardFocus);
      observer.disconnect();
      if (rafPending !== null) { cancelAnimationFrame(rafPending); rafPending = null; }
      if (throttleTimer !== null) { cancelAnimationFrame(throttleTimer); throttleTimer = null; }
      throttleRows.delete(rowEl);
    };
  }, []);

  const toggleCollapse = () => {
    if (visuallyForced) return;
    const next = !collapsed;
    const shelf = outerRef.current;
    const focusedInside = !!shelf?.querySelector('.gpfocus, :focus');
    setCollapsed(next);
    if (shelfId) writeCollapsed(shelfId, next);
    if (!focusedInside) return;
    const findCollapseTarget = (): HTMLElement | null => {
      if (!next) return rowRef.current?.querySelector<HTMLElement>('.ds-card') ?? null;
      const all = Array.from(shelf?.ownerDocument?.querySelectorAll<HTMLElement>('.ds-shelf .ds-card') ?? []);
      return all.find((el) => !shelf?.contains(el)) ?? null;
    };
    const tryFocus = (attempt: number) => {
      const target = findCollapseTarget();
      if (target && focusElement(target)) return;
      if (attempt < 20) setTimeout(() => tryFocus(attempt + 1), 50);
    };
    requestAnimationFrame(() => tryFocus(0));
  };

  if (!items.length) return null;
  const logoBandPx = computeLogoBandPx({ enableLogo, logoSize, logoTopOffset, enableDescription, descriptionBelowLogo });
  const shelfRootStyle = computeShelfRootStyle({ heroEnabled, enableLogo, enableDescription, hideStatusLine, fullPageLayoutActive, infoAbove, logoBelowShelf, logoBandPx });
  const lockedTitleProps = computeLockedTitleProps(visuallyForced, toggleCollapse);
  return (
    <div
      ref={outerRef}
      className="Panel ds-shelf"
      data-shelfid={shelfId || undefined}
      data-ds-hero-enabled={boolAttr(heroEnabled)}
      data-ds-info-above={boolAttr(infoAbove)}
        style={{ position: 'relative', ...effShelfVars, ["--ds-eff-desc-scale" as string]: descriptionScale, scrollMarginTop: 60, scrollMarginBottom: 52, ...shelfRootStyle }}
    >
      {shouldRenderHero({ heroEnabled, heroLabelMount, enableLogo, enableDescription, infoAbove }) && <PerShelfHero containerRef={outerRef} showArt={heroEnabled} isFirstShelf={visuallyForced} forceLayoutAsRecents={forceLayoutAsRecents} isFullPage={fullPageLayoutActive} enableLogo={enableLogo} enableDescription={enableDescription} descriptionBelowLogo={descriptionBelowLogo} logoBelowShelf={logoBelowShelf} logoPosition={logoPosition} descriptionPosition={descriptionPosition} logoSize={logoSize} logoTopOffset={logoTopOffset} descriptionHeight={descriptionHeight} descriptionLogoGap={descriptionLogoGap} infoAbove={infoAbove} />}
      {title && !hideShelfTitle ? <ShelfTitle title={title} collapsed={collapsed} position={shelfTitlePosition} titleRef={titleRef} locked={lockedTitleProps} onToggle={toggleCollapse} /> : null}
      {(!collapsed || hideShelfTitle) && (
        <Focusable
          ref={rowRef}
          className={rowClassName(nativeRowClass)}
          noFocusRing
          role="list"
          aria-label={title}
          onFocus={(e: any) => {
            if (e.target === e.currentTarget) {
              requestAnimationFrame(() => {
                const first = rowRef.current?.querySelector('.ds-card') as HTMLElement;
                if (first) first.focus();
              });
            }
          }}
          style={{
            display: "flex",
            flexWrap: "nowrap",
            gap: `var(--ds-eff-card-gap, ${effectiveGap}px)`,
            overflowX: "auto",
            overflowY: "visible",
            scrollbarWidth: "none",
            // Steam's nav drops presses with instant scrolling, so keep it smooth.
            scrollBehavior: "smooth",
            padding: `16px 0 ${_labelOverhangPx({ hideStatusLine, hideGameNames, enableIcon, enableDescription, descriptionBelowLogo })}px 2.8vw`,
            // Lift the row clear of Steam's bottom hint bar; margin keeps the hero full height.
            marginBottom: fullPageLayoutActive ? 48 : undefined,
          }}
          {...flowChildrenProps("horizontal")}
        >
          <ShelfRow
            items={items}
            cardW={effectiveW}
            cardH={effectiveH}
            artH={effectiveArtH}
            featuredW={finalFeaturedW}
            featuredH={finalFeaturedH}
            featuredArtH={finalFeaturedArtH}
            highlightFirst={highlightFirst}
            highlightAll={highlightAll}
            highlightedSet={highlightedSet}
            hideStatusLine={hideStatusLine}
            hideNewBadge={hideNewBadge}
            hideDiscountBadge={hideDiscountBadge}
            discountBadgeMode={discountBadgeMode}
            hideCompatIcons={hideCompatIcons}
            hideNonSteamBadge={hideNonSteamBadge}
            hideGameName={hideGameNames}
            hideInstallIndicator={hideInstallIndicator}
            friendsOverlay={friendsOverlay}
            friendsOverlayRecent={friendsOverlayRecent}
            enableLogo={enableLogo}
            enableIcon={enableIcon}
            enableDescription={enableDescription}
            descriptionBelowLogo={descriptionBelowLogo}
            logoPosition={logoPosition}
            descriptionPosition={descriptionPosition}
            iconVerticalAlign={iconVerticalAlign}
            gameNamePosition={gameNamePosition}
            playtimePosition={playtimePosition}
            removableSet={removableSet}
            onRemoveCard={onRemoveCard}
            hiddenSet={hiddenSet}
            onHideCard={onHideCard}
            window={cardWindow}
          />
          <div style={{ minWidth: "2.8vw", minHeight: 1, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
        </Focusable>
      )}
    </div>
  );
}

export const DeckRow = memo(DeckRowImpl);
