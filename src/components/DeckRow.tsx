import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { mark, measure } from "../core/perf";
import { computeCenteredScrollLeft } from "../core/scrollUtils";
import { Focusable } from "../runtime/host/decky";
import { getPreferredSteamDocument, getAllSteamDocuments } from "../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap } from "../core/webpackCompat";
import { logInfo } from "../runtime/logger";
import { focusElement } from "../core/focusRestore";
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
  const visuallyForced = forceExpanded || forceLayoutAsRecents;
  /* 100vh layout fires for BOTH real recents-replacement (`forceExpanded`)
     and per-shelf full-page intent (`fullPageLayoutOnly`). Only the real
     one drives `isFirstShelf` for the hero — full-page with native
     recents above must still keep its subtle fade-in. */
  const fullPageLayoutActive = (forceExpanded || fullPageLayoutOnly) && !pinScrollTop;
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
  const autoCollapsed = forceCollapsed || (autoCollapseWhenEmpty && items.length === 0);
  const collapsed = visuallyForced ? false : (collapsedState || autoCollapsed);
  const [nativeRowClass, setNativeRowClass] = useState('');

  // Effective dimensions, computed once at mount from whatever native dims are
  /* already cached. These feed the cards only as the *fallback* of their
     --ds-eff-* CSS variables — the live value comes from those vars (set on
     the shelf div, resolved from the root --ds-native-* vars that ensureStyles
     keeps current). So a dims discovery after mount reflows the cards through
     CSS alone, with no React re-render of the 800+ GameCards on the home. */
  const dims = useMemo(() => {
    const nd = getCachedNativeDims();
    const w = matchNativeSize && nd ? nd.width : CARD_W;
    const h = matchNativeSize && nd ? nd.height : CARD_ART_H;
    // TiltedHome skews cards into each other: a measured native gap of 0 (or
    // near-0) becomes fully invisible after the skew transform. Clamp to 8px
    // minimum so parallelograms never fully merge regardless of theme state.
    const rawGap = matchNativeSize && nd ? nd.gap : CARD_GAP;
    const gap = Math.max(rawGap, 8);
    // Default featured: ~3.21× portrait width (matches base native 430px featured
    // card at 134px portrait width, measured via CDP on the Steam Deck home screen).
    const featW = matchNativeSize && nd?.featuredWidth ? nd.featuredWidth : Math.round(w * 3.21);
    // A featured card differs from its row-mates only in WIDTH — its height
    // (and art height) always match the regular cards, never Steam's
    // separately measured landscape-card height.
    const artH = matchNativeSize && nd?.imgHeight ? nd.imgHeight : h;
    const featH = h;
    const featArtH = artH;
    return { w, h, gap, featW, featH, artH, featArtH };
  }, [matchNativeSize]);
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
      // The cards resize through CSS (--ds-eff-* vars) with no re-render.
      /* After that reflow the focused card's offsetLeft shifts because
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
    // cached still sizes correctly once they arrive — the cards follow the
    // root --ds-native-* vars through CSS, no listener or re-render required.
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
        try {
          const cs = getComputedStyle(cur);
          const oy = (cs.overflowY || "").toLowerCase();
          if ((oy === "auto" || oy === "scroll" || oy === "overlay") && cur.scrollHeight > cur.clientHeight) return cur;
        } catch { /* skip */ }
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
        const scr = findScrollableAncestor(el);
        if (!scr) { el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
        const elRect = el.getBoundingClientRect();
        const scrRect = scr.getBoundingClientRect();
        if (pinScrollTopRef.current) {
          if (scr === lastScrollable && lastTarget === 0) return;
          lastScrollable = scr;
          lastTarget = 0;
          try { scr.scrollTo({ top: 0, behavior: "smooth" }); } catch { scr.scrollTop = 0; }
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
        try { scr.scrollTo({ top: clamped, behavior: "smooth" }); } catch { scr.scrollTop = clamped; }
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
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      if (scheduled !== null) cancelAnimationFrame(scheduled);
      if (verifyTimer) clearTimeout(verifyTimer);
    };
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
      throttleRows.add(rowEl);
      if (throttleTimer) clearTimeout(throttleTimer);
      throttleTimer = setTimeout(() => {
        throttleRows.delete(rowEl);
        throttleTimer = null;
        if (lastFocusedCard && lastFocusedCard !== card) {
          doHorizontalScroll(lastFocusedCard);
        }
      }, 150);
    };

    let lastFocusedCard: HTMLElement | null = null;
    const handleFocusedCard = (card: HTMLElement | null) => {
      if (!card) return;
      lastFocusedCard = card;
      if (throttleRows.has(rowEl)) return;
      try {
        const allCards = Array.from(rowEl.querySelectorAll<HTMLElement>('.ds-card'));
        for (const it of allCards) {
          it.classList.toggle('is-selected', it === card);
        }
      } catch (e) {
        logInfo("HOME", "is-selected toggle failed", String(e));
      }
      try {
        const nested = Array.from(rowEl.querySelectorAll<HTMLElement>('.gpfocus'));
        for (const n of nested) {
          if (n !== card && n.classList) n.classList.remove('gpfocus');
        }
      } catch (e) {
        logInfo("HOME", "gpfocus cleanup failed", String(e));
      }
      /* Lateral card-to-card move within the same shelf → skip the vertical
         re-centering below (the shelf is already positioned). Only re-center
         when focus ENTERS this shelf from another row. Re-centering on every
         lateral focus (this block has no tolerance, unlike maybeCenter) made
         the whole shelf — hero art included — bob ~6px per card. */
      const prevCard: HTMLElement | null = (globalThis as any).__ds_prev_centered_card ?? null;
      (globalThis as any).__ds_prev_centered_card = card;
      if (prevCard && prevCard !== card && rowEl.contains(prevCard)) {
        doHorizontalScroll(card);
        return;
      }
      try {
        const outer = outerRef.current;
        if (outer) requestAnimationFrame(() => {
          if (pinScrollTopRef.current) return;
          outer.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      } catch (e) {
        logInfo("HOME", "scrollIntoView failed", String(e));
      }
      // Vertical fallback A: walk DOM for scrollable ancestor and scroll manually.
      try {
        function getScrollableAncestor(node: HTMLElement | null): HTMLElement | null {
          let cur = node?.parentElement ?? null;
          while (cur && cur !== document.body) {
            try {
              const cs = getComputedStyle(cur);
              const oy = (cs.overflowY || '').toLowerCase();
              if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cur.scrollHeight > cur.clientHeight) return cur;
            } catch (e) {
              logInfo("HOME", "getScrollableAncestor: getComputedStyle failed", String(e));
            }
            cur = cur.parentElement;
          }
          return null;
        }
        const anc = getScrollableAncestor(rowEl);
        if (anc) {
          const outerEl = outerRef.current;
          if (outerEl) {
            if (pinScrollTopRef.current) {
              try { anc.scrollTo({ top: 0, behavior: 'smooth' }); } catch { anc.scrollTop = 0; }
            } else {
              const outerRect = outerEl.getBoundingClientRect();
              const ancRect = anc.getBoundingClientRect();
              const delta = outerRect.top - ancRect.top;
              const target = anc.scrollTop + delta - (anc.clientHeight / 2) + (outerRect.height / 2);
              const maxScroll = Math.max(0, anc.scrollHeight - anc.clientHeight);
              const finalTop = Math.max(0, Math.min(target, maxScroll));
              try { anc.scrollTo({ top: finalTop, behavior: 'smooth' }); } catch { anc.scrollTop = finalTop; }
            }
          }
        }
      } catch (e) {
        logInfo("HOME", "vertical scroll fallback A failed", String(e));
      }
      // Vertical fallback B: Steam's home uses a separate BrowserWindow document.
      try {
        const spDoc = getPreferredSteamDocument();
        if (spDoc && spDoc !== document) {
          const candidates = Array.from(spDoc.querySelectorAll<HTMLElement>('[class]'));
          let viewport: HTMLElement | null = null;
          const map = (() => { try { return getRuntimeClassMap(spDoc); } catch { return null; } })();
          if (map?.viewport) {
            const sel = buildSelectorFromToken(map.viewport);
            if (sel) try { viewport = spDoc.querySelector(sel); } catch (e) { logInfo("HOME", "viewport selector failed", String(e)); }
          }
          if (!viewport) {
            for (const el of candidates) {
              try {
                const cs = getComputedStyle(el);
                const oy = (cs.overflowY || '').toLowerCase();
                if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight && el.clientHeight > 80) { viewport = el; break; }
              } catch (e) {
                logInfo("HOME", "viewport scan: getComputedStyle failed", String(e));
              }
            }
          }
          if (viewport) {
            const outerEl = outerRef.current;
            if (outerEl) {
              if (pinScrollTopRef.current) {
                try { viewport.scrollTo({ top: 0, behavior: 'smooth' }); } catch { viewport.scrollTop = 0; }
              } else {
                const outerRect = outerEl.getBoundingClientRect();
                const vpRect = viewport.getBoundingClientRect();
                const delta = outerRect.top - vpRect.top;
                const target = viewport.scrollTop + delta - (viewport.clientHeight / 2) + (outerRect.height / 2);
                const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
                const finalTop = Math.max(0, Math.min(target, max));
                try { viewport.scrollTo({ top: finalTop, behavior: 'smooth' }); } catch { viewport.scrollTop = finalTop; }
              }
            }
          }
        }
      } catch (e) {
        logInfo("HOME", "vertical scroll fallback B failed", String(e));
      }
      doHorizontalScroll(card);
    };

    const observer = new MutationObserver((mutations) => {
      let detected: HTMLElement | null = null;
      for (const m of mutations) {
        const el = m.target as HTMLElement;
        if (el.classList?.contains('gpfocus') && el.classList?.contains('ds-card')) {
          detected = el;
          break;
        }
      }
      if (!detected) return;
      const c = detected;
      // GLOBAL sync cleanup — remove gpfocus from all DS cards in all known
      // Steam documents EXCEPT the one we just observed gaining it. Each
      /* DeckRow's MutationObserver only watches its own row, so without this
         cross-row pass, gpfocus from a card in a previously-visited shelf
         persists and `findFocusedDsCard` (queries .ds-card.gpfocus across
         documents) returns the wrong card in DOM order. Synchronous so the
         OPTIONS-button intercept sees a single focused card immediately. */
      try {
        for (const doc of getAllSteamDocuments()) {
          const all = doc.querySelectorAll<HTMLElement>('.ds-card.gpfocus');
          for (const it of all) { if (it !== c) it.classList.remove('gpfocus'); }
        }
      } catch {}
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
      if (throttleTimer !== null) { clearTimeout(throttleTimer); throttleTimer = null; }
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
    const tryFocus = (attempt: number) => {
      let target: HTMLElement | null = null;
      if (!next) {
        target = rowRef.current?.querySelector<HTMLElement>('.ds-card') ?? null;
      } else {
        const all = Array.from(shelf?.ownerDocument?.querySelectorAll<HTMLElement>('.ds-shelf .ds-card') ?? []);
        target = all.find((el) => !shelf?.contains(el)) ?? null;
      }
      if (target && focusElement(target)) return;
      if (attempt < 20) setTimeout(() => tryFocus(attempt + 1), 50);
    };
    requestAnimationFrame(() => tryFocus(0));
  };

  if (!items.length) return null;
  // Space the logo + (below-logo) description banner needs — reserved either
  // above (default) or below (logoBelowShelf) the cards.
  const logoBandPx = enableLogo
    ? Math.round(130 * logoSize / 100) + Math.max(0, Math.round(logoTopOffset * 0.32)) + ((enableDescription && descriptionBelowLogo) ? 26 : 0)
    : 0;
  return (
    <div
      ref={outerRef}
      className="Panel ds-shelf"
      data-shelfid={shelfId || undefined}
      data-ds-hero-enabled={heroEnabled ? 'true' : undefined}
      data-ds-info-above={infoAbove ? 'true' : undefined}
        style={{ position: 'relative', ...effShelfVars, ["--ds-eff-desc-scale" as string]: descriptionScale, marginBottom: hideStatusLine ? -6 : 12, scrollMarginTop: 60, scrollMarginBottom: 52, overflow: (heroEnabled || enableLogo || enableDescription) ? 'visible' : 'hidden', background: (heroEnabled || enableLogo) ? 'transparent' : 'var(--ds-shell-bg)',
        /* Per-shelf fullPageShelf: shelf takes a full viewport-worth of
           space so it looks identical to the first shelf when
           hideRecents is on. Cards anchor at the bottom; the hero
           composes inside the shelf's own bounds (absolute, height 100%). */
        minHeight: fullPageLayoutActive ? '100vh' : undefined,
        display: fullPageLayoutActive ? 'flex' : undefined,
        flexDirection: fullPageLayoutActive ? 'column' : undefined,
        justifyContent: fullPageLayoutActive ? 'flex-end' : undefined,
        /* Reserve top space for the logo + description banner.
           Skipped only when the hero is rendered as a true full-page box
           (`forceExpanded && !pinScrollTop`) — there the cards sit at the
           bottom (justify-content: flex-end) and the absolute logo lives
           in the empty top half, so no extra padding is needed. */
        /* When `pinScrollTop` is on (user disabled full-page shelves) the
           hero shrinks back to a normal row, so the absolute logo would
           overlap the card row unless we still reserve space here.
           `forceLayoutAsRecents` (themed shelves without hero art) also
           needs the reservation for the same reason. */
        /* gameInfoAbove reserves a fixed-px band for the focused game's info
           clone (NOT viewport-relative: in SharedJSContext window.innerHeight
           is 1, so vh maths collapses to 0). logoBelowShelf moves the logo
           reservation to paddingBottom (banner under the cards); else it's on
           top. Skipped on full-page shelves (flex-end already leaves room). */
        paddingTop: (!fullPageLayoutActive && (infoAbove || (enableLogo && !logoBelowShelf))) ? (() => {
          const logoBand = (enableLogo && !logoBelowShelf) ? logoBandPx : 0;
          const labelBand = infoAbove ? 50 : 0;
          return logoBand + labelBand + 2;
        })() : undefined,
        paddingBottom: (!fullPageLayoutActive && enableLogo && logoBelowShelf) ? logoBandPx + 2 : undefined }}
    >
      {(heroEnabled || heroLabelMount || enableLogo || enableDescription || infoAbove) && <PerShelfHero containerRef={outerRef} showArt={heroEnabled} isFirstShelf={visuallyForced} forceLayoutAsRecents={forceLayoutAsRecents} isFullPage={fullPageLayoutActive} enableLogo={enableLogo} enableDescription={enableDescription} descriptionBelowLogo={descriptionBelowLogo} logoBelowShelf={logoBelowShelf} logoPosition={logoPosition} descriptionPosition={descriptionPosition} logoSize={logoSize} logoTopOffset={logoTopOffset} descriptionHeight={descriptionHeight} descriptionLogoGap={descriptionLogoGap} infoAbove={infoAbove} />}
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
              justifyContent: shelfTitlePosition === 'center' ? 'center' : shelfTitlePosition === 'right' ? 'flex-end' : 'flex-start',
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
            className={`ds-shelf-title${visuallyForced ? ' ds-shelf-title--locked' : ''}`}
            data-ds-title-position={shelfTitlePosition}
            onClick={visuallyForced ? undefined : toggleCollapse}
            style={{
              marginBottom: 8,
              paddingLeft: "2.8vw",
              paddingRight: "2.8vw",
              display: "flex",
              alignItems: "center",
              justifyContent: shelfTitlePosition === 'center' ? 'center' : shelfTitlePosition === 'right' ? 'flex-end' : 'flex-start',
              gap: 8,
              cursor: visuallyForced ? "default" : "pointer",
              userSelect: "none",
              pointerEvents: visuallyForced ? "none" : undefined,
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
