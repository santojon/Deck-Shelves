import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { mark, measure } from "../core/perf";
import { computeCenteredScrollLeft } from "../core/scrollUtils";
import { Focusable } from "../runtime/host/decky";
import { getPreferredSteamDocument } from "../runtime/steamHost";
import { getRuntimeClassMap } from "../core/webpackCompat";
import { logInfo } from "../runtime/logger";
import { focusElement } from "../core/focusRestore";
import { subscribeFocusedCard, getFocusedCard } from "../runtime/focusedCardTracker";
import { flowChildrenProps } from "../core/steamOSVersion";

// Re-export types and components from shelf/ for backwards compatibility
export { type DeckRowItem } from "./shelf/types";
export { GameCard } from "./shelf/GameCard";
export { MoreCard } from "./shelf/MoreCard";
export { PlaceholderCard } from "./shelf/PlaceholderCard";

import { type DeckRowItem, CARD_W, CARD_ART_H, CARD_GAP } from "./shelf/types";
import { ShelfRow } from "./shelf/ShelfRow";
import {
  getCachedNativeDims,
  globalStylesStart,
  globalStylesStop,
  onNativeDimsChange,
} from "./shelf/shelfStyles";
import { getCurrentSettings, saveSettings } from "../store/settingsStore";
import { trackFeature } from "../steam/usageTracking";
import { patchShelfInSettings } from "../domain/settings";
import { PerShelfHero } from "./shelf/PerShelfHero";
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

// Row paddingBottom budget: scales with what renders below the card art
// so the label / status row / per-card description never get clipped.
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

function DeckRowImpl({ title, items, shelfId, removableSet, matchNativeSize = false, highlightFirst = false, highlightAll = false, highlightedAppIds, hideStatusLine = false, hideNewBadge = false, hideDiscountBadge = false, hideCompatIcons = false, hideNonSteamBadge = false, hideShelfTitle = false, hideGameNames = false, hideInstallIndicator = false, enableLogo = false, enableIcon = false, enableDescription = false, descriptionBelowLogo = false, logoBelowShelf = false, logoPosition = 'left', descriptionPosition = 'left', logoSize = 100, logoTopOffset = 20, iconVerticalAlign = 'top', shelfTitlePosition = 'left', gameNamePosition = 'left', playtimePosition = 'left', descriptionHeight = 2, descriptionLogoGap = 10, descriptionScale = 1, forceExpanded = false, fullPageLayoutOnly = false, pinScrollTop = false, forceLayoutAsRecents = false, heroEnabled = false, heroLabelMount = false, infoAbove = false, friendsOverlay = false, friendsOverlayRecent = false, forceCollapsed = false, autoCollapseWhenEmpty = false }: { title?: string; items: DeckRowItem[]; shelfId?: string; removableSet?: Set<number>; matchNativeSize?: boolean; highlightFirst?: boolean; highlightAll?: boolean; highlightedAppIds?: number[]; hideStatusLine?: boolean; hideNewBadge?: boolean; hideDiscountBadge?: boolean; hideCompatIcons?: boolean; hideNonSteamBadge?: boolean; hideShelfTitle?: boolean; hideGameNames?: boolean; hideInstallIndicator?: boolean; enableLogo?: boolean; enableIcon?: boolean; enableDescription?: boolean; descriptionBelowLogo?: boolean; logoBelowShelf?: boolean; logoPosition?: 'left' | 'center' | 'right'; descriptionPosition?: 'left' | 'center' | 'right'; logoSize?: number; logoTopOffset?: number; iconVerticalAlign?: 'top' | 'center' | 'bottom'; shelfTitlePosition?: 'left' | 'center' | 'right'; gameNamePosition?: 'left' | 'center' | 'right'; playtimePosition?: 'left' | 'center' | 'right'; descriptionHeight?: number; descriptionLogoGap?: number; descriptionScale?: number; forceExpanded?: boolean; fullPageLayoutOnly?: boolean; pinScrollTop?: boolean; forceLayoutAsRecents?: boolean; heroEnabled?: boolean; heroLabelMount?: boolean; infoAbove?: boolean; friendsOverlay?: boolean; friendsOverlayRecent?: boolean; forceCollapsed?: boolean; autoCollapseWhenEmpty?: boolean }) {
  const visuallyForced = computeVisuallyForced(forceExpanded, forceLayoutAsRecents);
  /* 100vh layout fires for BOTH real recents-replacement (`forceExpanded`)
     and per-shelf full-page intent (`fullPageLayoutOnly`). Only the real
     one drives `isFirstShelf` for the hero — full-page with native
     recents above must still keep its subtle fade-in. */
  const fullPageLayoutActive = computeFullPageLayoutActive(forceExpanded, fullPageLayoutOnly, pinScrollTop);
  const highlightedSet = useMemo(() => {
    if (!highlightedAppIds?.length) return null;
    return new Set(highlightedAppIds);
  }, [highlightedAppIds]);
  /* X-button binding. `removableSet` is fed in by Shelf.tsx (which has
     access to the pre-applyManualOrder resolved source ids — DeckRow
     only sees the post-merge `items`, so it can't compute the set
     itself). `hiddenSet` is read from settings each render for the
     Hide/Show label toggle; both callbacks below persist directly. */
  const hiddenSet = useMemo(() => {
    if (!shelfId) return undefined;
    const s = getCurrentSettings();
    const sh: any = s?.shelves?.find((row: any) => row.id === shelfId);
    const h: number[] | undefined = sh?.hiddenAppIds;
    return h?.length ? new Set(h) : undefined;
  }, [shelfId, items]);
  const onRemoveCard = useCallback((appid: number) => {
    if (!shelfId || !appid) return;
    const s = getCurrentSettings();
    if (!s) return;
    const sh: any = (s.shelves ?? []).find((row: any) => row.id === shelfId);
    if (!sh) return;
    const m: number[] = sh.manualOrder ?? [];
    if (!m.includes(appid)) return;
    void saveSettings(patchShelfInSettings(s, shelfId, {
      manualOrder: m.filter((id) => id !== appid),
    }));
  }, [shelfId]);
  const onHideCard = useCallback((appid: number) => {
    if (!shelfId || !appid) return;
    const s = getCurrentSettings();
    if (!s) return;
    const sh: any = (s.shelves ?? []).find((row: any) => row.id === shelfId);
    if (!sh) return;
    const h: number[] = sh.hiddenAppIds ?? [];
    const next = h.includes(appid) ? h.filter((id) => id !== appid) : [...h, appid];
    try { trackFeature("hide"); } catch {}
    void saveSettings(patchShelfInSettings(s, shelfId, { hiddenAppIds: next }));
  }, [shelfId]);
  try { mark?.(`deckRow.render:${shelfId ?? 'unknown'}:start`); } catch (e) { logInfo("HOME", "mark failed", String(e)); }
  const rowRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [collapsedState, setCollapsed] = useState(() => shelfId ? readCollapsed(shelfId) : false);
  // Sync local collapse state when the game-capsule menu (Collapse action)
  // mutates ds-collapsed-{shelfId} from outside the React tree. Cleanup is
  // mandatory — DeckRow remounts per shelf.
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
  // When our shelf takes the native-recents slot (`forceExpanded=true`),
  /* render it expanded but preserve the user's original collapsed status
     untouched — if it later loses the slot (becomes second/third/etc.),
     it should return to whatever state the user had chosen. We intentionally
     do NOT overwrite `collapsedState` or the persisted `ds-collapsed-{id}`
     key while `forceExpanded` is active. */
  // Auto-collapse forces the collapsed render (off-context predicate matched, or
  // the shelf is empty) on top of the manual `collapsedState`; a promoted/recents
  // shelf (visuallyForced) is never auto-collapsed.
  const autoCollapsed = computeAutoCollapsed(forceCollapsed, autoCollapseWhenEmpty, items.length);
  const collapsed = computeCollapsed(visuallyForced, collapsedState, autoCollapsed);
  const [nativeRowClass, setNativeRowClass] = useState('');
  /* Bumped by the onNativeDimsChange subscription below so `dims` recomputes
     with a fresh getCachedNativeDims() read once a measurement lands after
     this row's own mount — GameCard reads these JS values directly (e.g. its
     artFillsCard check), so a stale post-mount snapshot left them out of
     sync with the real dims even though the CSS vars stayed live. */
  const [dimsVersion, setDimsVersion] = useState(0);

  // Effective dimensions, recomputed from the freshest cached native dims
  /* whenever a new measurement lands (dimsVersion). These also feed the
     cards as the *fallback* of their --ds-eff-* CSS variables — the live
     value normally comes from those vars (set on the shelf div, resolved
     from the root --ds-native-* vars that ensureStyles keeps current). */
  const dims = useMemo(
    () => computeEffectiveDims(matchNativeSize, getCachedNativeDims()),
    [matchNativeSize, dimsVersion],
  );
  const { w: effectiveW, h: effectiveH, gap: effectiveGap, featW: effectiveFeaturedW, featH: effectiveFeaturedH, artH: effectiveArtH, featArtH: effectiveFeaturedArtH } = dims;

  /* Per-shelf effective-dimension vars. When matchNativeSize is on, the cards
     size off the live native dims (root --ds-native-* vars); when off, the
     vars are absent and cards fall back to their CARD_W/CARD_ART_H props —
     exactly the prior behaviour. Memoized on matchNativeSize alone so a dims
     change never recomputes (and thus never re-renders) this object. */
  const effShelfVars = useMemo<React.CSSProperties>(() => {
    if (!matchNativeSize) return {};
    return {
      ["--ds-eff-card-w" as string]: `var(--ds-native-card-w, ${CARD_W}px)`,
      ["--ds-eff-card-h" as string]: `var(--ds-native-card-h, ${CARD_ART_H}px)`,
      ["--ds-eff-card-art-h" as string]: `var(--ds-native-card-art-h, ${CARD_ART_H}px)`,
      ["--ds-eff-feat-w" as string]: `var(--ds-native-feat-w, ${Math.round(CARD_W * 3.21)}px)`,
      /* A featured card must be the SAME height as the regular cards in its
         row — only its WIDTH differs. So feat height/art-height intentionally
         reuse the regular card's native vars (not the separately-measured
         --ds-native-feat-* ones, which track Steam's landscape native card
         and would make the featured card taller/shorter than its neighbours). */
      ["--ds-eff-feat-h" as string]: `var(--ds-native-card-h, ${CARD_ART_H}px)`,
      ["--ds-eff-feat-art-h" as string]: `var(--ds-native-card-art-h, ${CARD_ART_H}px)`,
      ["--ds-eff-card-gap" as string]: `max(var(--ds-native-card-gap, ${CARD_GAP}px), 8px)`,
    };
  }, [matchNativeSize]);
  // When native dims are unavailable but highlightFirst is on, the featured
  // card must stay the same HEIGHT as neighboring portrait cards — only width
  // differs (landscape hero shape). Scaling height broke row alignment.
  const finalFeaturedW = effectiveFeaturedW;
  const finalFeaturedH = effectiveFeaturedH;
  const finalFeaturedArtH = effectiveFeaturedArtH;

  useEffect(() => {
    globalStylesStart();
    try { requestAnimationFrame(() => { try { measure?.(`deckRow.render:${shelfId ?? 'unknown'}`, `deckRow.render:${shelfId ?? 'unknown'}:start`); } catch (e) { logInfo("HOME", "measure failed", String(e)); } }); } catch (e) { logInfo("HOME", "rAF measure failed", String(e)); }
    const unsub = onNativeDimsChange(() => {
      setDimsVersion((v) => v + 1);
      // The cards resize through CSS (--ds-eff-* vars) too, ahead of this
      /* row's own re-render. After that reflow the focused card's offsetLeft shifts because
         preceding cards resized — the row's scrollLeft (set for the old
         layout) leaves the focused card off-center, making the focus look
         misplaced. Re-center on the next frame, only if a card in THIS row
         currently holds the tracker. */
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
    // No race-condition guard needed: a shelf that mounts before dims are
    // cached still sizes correctly once they arrive, via the dimsVersion bump.
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
      // Curated safe set (always applied): recents container / header tokens.
      addMapClasses(outerRef.current, 'nativeRecentsContainer', map);
      addMapClasses(outerRef.current, 'nativeRecentsInner', map);
      addMapClasses(outerRef.current, 'nativeRecentsSection', map);
      addMapClasses(titleRef.current, 'nativeRecentsHeader', map);
      addMapClasses(titleRef.current, 'nativeRecentsHeaderLabel', map);
      /* Native shelf-container ancestor — required for descendant-selector
         theme rules (TiltedHome targets
         `_39tNvaLedsTrVh0fFsP4Jm ... _1HIFNGSxh4-jOhPiDynR4C > div:first-child`
         and would otherwise never reach DS cards because our shelf root
         lacks that ancestor class). */
      addMapClasses(outerRef.current, 'nativeShelfContainer', map);
      /* Experimental: when `forceCssLoaderThemes` is on, apply the full set
         of DFL semantic tokens so themes targeting Title/Section/Collection/
         GameRow/Library variants also reach DS shelves. Focus/hover state
         classes stay excluded to avoid conflicts with DS focus handling. */
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
    // Multiple retry points: classmap discovery (homePatch) and settings load
    // from backend both happen async after mount. On cold boot the 500ms slot
    // misses both — 1 s, 2 s, and 5 s cover the tail without staying active.
    const timers = [500, 1000, 2000, 5000].map(d => setTimeout(injectShelfNativeClasses, d));
    const onSettings = () => injectShelfNativeClasses();
    globalThis.addEventListener('deck-shelves-settings-changed', onSettings);
    return () => {
      for (const t of timers) clearTimeout(t);
      globalThis.removeEventListener('deck-shelves-settings-changed', onSettings);
    };
  }, []);

  

  /* Scroll-pin-to-top only fires when this shelf is genuinely replacing
     the native recents slot (`pinScrollTop`) — NOT when the user opts
     into `fullPageShelf` for visual reasons. Otherwise the shelf traps
     the viewport at top 0 and the user can't scroll to siblings. */
  const pinScrollTopRef = useRef(pinScrollTop);
  useEffect(() => { pinScrollTopRef.current = pinScrollTop; }, [pinScrollTop]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const CENTER_TOLERANCE_PX = 32; // don't fight Steam when it's already close
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
    /* Center `el` in its scrollable ancestor — one smooth scroll per focus, only
       when needed (skip if Steam's native scroll already centered it, to avoid
       competing scrolls that stutter). Exception: when promoted to the recents
       slot (`forceExpanded`), pin scrollTop=0 so the header isn't clipped by
       prior content (hero / hidden-recents spacer). */
    const maybeCenter = () => {
      try {
        // The 300ms verify pass below can outlive the focus that scheduled it
        // (issue #118) — `onCardFocus` further down already guards the same
        // way; this handler was missing it. See isFocusStillWithin.
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
        // Coalesce: ignore redundant scroll commands to the same target on the
        // same scrollable — Steam may re-fire focusin during smooth scroll.
        if (scr === lastScrollable && Math.abs(clamped - lastTarget) < 2) return;
        lastScrollable = scr;
        lastTarget = clamped;
        smoothScrollTo(scr, clamped);
      } catch { /* ignore */ }
    };
    let verifyTimer: number | null = null;
    const onFocusIn = () => {
      if (scheduled === null) {
        scheduled = requestAnimationFrame(() => {
          scheduled = null;
          maybeCenter();
        });
      }
      /* Verification pass after 300ms: covers the recently-expanded-shelf
         case where the first scroll reads mid-animation layout or Steam's
         native scroll competes with ours. Self-skips via the tolerance
         check inside maybeCenter when the shelf is already centered. */
      if (verifyTimer) clearTimeout(verifyTimer);
      verifyTimer = window.setTimeout(() => {
        verifyTimer = null;
        // Reset the dedup target so the verification pass can re-issue the
        // same scroll if it's genuinely needed again.
        lastTarget = -1;
        maybeCenter();
      }, 300);
    };
    el.addEventListener("focusin", onFocusIn);
    /* `focusin` alone misses Steam's native BTakeFocus-driven navigation,
       which moves GamepadUI's own tracked focus (and the `gpfocus` class)
       without ever touching document.activeElement — confirmed live on the
       2026-09-09 beta once shelves became real nav-tree members. Mirror the
       gpfocus-class watch the row-level effect below already uses. */
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

  /* Confirmed live (2026-09-12): BTakeFocus nav on this beta never fires
     focusin/gpfocus; activeElement and m_FocusWithin subscriptions both
     proved unreliable. `focusedCardTracker` polls the reliable signal ONCE
     for every mounted row (was: one independent 150ms poll per row). */
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

    /* Coalesce to one scrollTo per rendered FRAME, not a fixed 150ms window
       — the old value predates real dpad-driven nav reaching shelves at
       all and suppressed every intermediate card under genuine hardware
       repeat, landing only once on release. A frame still coalesces
       same-paint mutations without dropping in-between positions. */
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
      /* Lateral card-to-card move within the same shelf → skip the vertical
         re-centering below (the shelf is already positioned). Only re-center
         when focus ENTERS this shelf from another row. Re-centering on every
         lateral focus (this block has no tolerance, unlike maybeCenter) made
         the whole shelf — hero art included — bob ~6px per card. */
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
      // Vertical fallback A: walk DOM for scrollable ancestor and scroll manually.
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
      // Vertical fallback B: Steam's home uses a separate BrowserWindow document.
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
        /* Skip the scroll-to-center when the gpfocus was transient. On a Steam
           restart the nav tree is rebuilt and gpfocus flickers across cards
           (including late-resolving online shelves) before settling — without
           this guard a brief gpfocus on an online card scrolls the viewport to
           center that shelf even though real focus ends up elsewhere. */
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
  // Space the logo + (below-logo) description banner needs — reserved either
  // above (default) or below (logoBelowShelf) the cards.
  const logoBandPx = computeLogoBandPx({ enableLogo, logoSize, logoTopOffset, enableDescription, descriptionBelowLogo });
  /* Per-shelf fullPageShelf anchors cards at the bottom of a full-viewport
     box so it looks like the first shelf when hideRecents is on; top/bottom
     padding reserve room for the logo/description banner or gameInfoAbove
     clone. See computeShelfRootStyle. */
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
      {title && !hideShelfTitle ? (
        collapsed ? (
          <Focusable
            ref={titleRef as any}
            className="ds-shelf-title"
            data-ds-title-position={shelfTitlePosition}
            onClick={toggleCollapse}
            onOKButton={toggleCollapse}
            onActivate={toggleCollapse}
            style={{
              marginBottom: 8,
              paddingLeft: "2.8vw",
              paddingRight: "2.8vw",
              display: "flex",
              alignItems: "center",
              justifyContent: resolveTitleJustifyContent(shelfTitlePosition),
              gap: 8,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <span>{`+ ${title}`}</span>
          </Focusable>
        ) : (
          <div
            ref={titleRef}
            className={`ds-shelf-title${lockedTitleProps.extraClass}`}
            data-ds-title-position={shelfTitlePosition}
            onClick={lockedTitleProps.onClick}
            style={{
              marginBottom: 8,
              paddingLeft: "2.8vw",
              paddingRight: "2.8vw",
              display: "flex",
              alignItems: "center",
              justifyContent: resolveTitleJustifyContent(shelfTitlePosition),
              gap: 8,
              cursor: lockedTitleProps.cursor,
              userSelect: "none",
              pointerEvents: lockedTitleProps.pointerEvents,
            }}
          >
            <span>{title}</span>
          </div>
        )
      ) : null}
      {(!collapsed || hideShelfTitle) && (
        <Focusable
          ref={rowRef}
          // Carry ReactVirtualized class so CSS Loader theme rules
          // (TiltedHome/ArtHero) sibling-target DS cards.
          className={`ds-row-scroll ReactVirtualized__Grid__innerScrollContainer${nativeRowClass ? ` ${nativeRowClass}` : ''}`}
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
            // Smooth scroll: instant (auto) tested at 74ms avg latency but
            /* half the presses got swallowed — Steam's nav controller
               seems to need the brief scroll animation window to register
               subsequent presses. Smooth keeps the press throughput while
               still feeling snappy enough with the matched 0.4s card
               transition. */
            scrollBehavior: "smooth",
            padding: `16px 0 ${_labelOverhangPx({ hideStatusLine, hideGameNames, enableIcon, enableDescription, descriptionBelowLogo })}px 2.8vw`,
            /* Full-page shelves anchor this row to the shelf bottom (flex-end),
               which put the card's below-art label under Steam's ~40px bottom
               hint bar. Lift the row clear of it; margin (not padding) keeps the
               hero full-height, and the row still drops back as the label band
               (padding-bottom above) shrinks when those items are hidden. */
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
            highlightedSet={highlightedSet ?? undefined}
            hideStatusLine={hideStatusLine}
            hideNewBadge={hideNewBadge}
            hideDiscountBadge={hideDiscountBadge}
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
          />
          <div style={{ minWidth: "2.8vw", minHeight: 1, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
        </Focusable>
      )}
    </div>
  );
}

/* Shallow-prop memo: `items` is already memoized in ShelfView via useMemo,
   so re-renders triggered by unrelated parent state (e.g. settings panel
   updates) don't force a full shelf re-render when only non-visual props
   have been recomputed identically. */
export const DeckRow = memo(DeckRowImpl);
