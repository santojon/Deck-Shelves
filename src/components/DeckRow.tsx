import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { mark, measure } from "../core/perf";
import { computeCenteredScrollLeft } from "../core/scrollUtils";
import { Focusable } from "@decky/ui";
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

// Mention card constants and image sizing for compatibility checks
// CARD_W = CARD_ART_H = object-fit: cover
import { type DeckRowItem, CARD_W, CARD_ART_H, CARD_GAP } from "./shelf/types";
import { GameCard } from "./shelf/GameCard";
import { MoreCard } from "./shelf/MoreCard";
import { RefreshCard } from "./shelf/RefreshCard";
import {
  getCachedNativeDims,
  globalStylesStart,
  globalStylesStop,
  onNativeDimsChange,
} from "./shelf/shelfStyles";

function getHeroUrls(appid: number): string[] {
  return [
    `/customimages/${appid}_hero.png`,
    `/customimages/${appid}_hero.jpg`,
    `/assets/${appid}/library_hero.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`,
    `/assets/${appid}/header.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
  ];
}

/** Lightweight per-shelf hero background. Rendered inside the .ds-shelf div
 *  (z-index:-1) so it appears behind that shelf's cards only. Separate from
 *  the global HeroBackground which handles the recents-slot promoted shelf. */

function PerShelfHero({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const [visible, setVisible] = useState(true);  // true: always render, opacity driven by image loading
  // Smaller bleed above for non-first hero shelves so their art doesn't
  // overlap the shelf above. Determined by DOM order on mount.
  const [topBleed, setTopBleed] = useState(-90);
  const activeSlotRef = useRef<'A' | 'B'>('A');
  const currentAppid = useRef(0);
  const fallbackIdx = useRef(0);
  const allUrls = useRef<string[]>([]);
  useEffect(() => { activeSlotRef.current = activeSlot; }, [activeSlot]);

  // First hero shelf: more bleed above to fill the space before the page
  // content. Non-first: keep bleed short so the eased-in fade stays mostly
  // in the gap between shelves and doesn't visibly overlay the shelf above.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const root = el.closest('.deck-shelves-root');
    if (!root) return;
    setTopBleed(-80);
  }, [containerRef]);

  // Assign decreasing z-index to the shelf divs so each shelf's stacking
  // context sits above the shelf below it. Without this, DOM order (later =
  // on top) makes shelf N's downward hero bleed appear behind shelf N+1 instead
  // of in front of it. Runs after a short delay so all hero shelves have mounted.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const assign = () => {
      const root = el.closest('.deck-shelves-root');
      if (!root) return;
      const all = Array.from(root.querySelectorAll<HTMLElement>('.ds-shelf[data-ds-hero-enabled="true"]'));
      const idx = all.indexOf(el);
      if (idx >= 0) el.style.zIndex = String(all.length - idx);
    };
    const t = setTimeout(assign, 50);
    return () => { clearTimeout(t); el.style.zIndex = ''; };
  }, [containerRef]);

  const onError = useCallback((slot: 'A' | 'B') => () => {
    fallbackIdx.current += 1;
    const next = allUrls.current[fallbackIdx.current];
    if (next) { if (slot === 'A') setSlotA(next); else setSlotB(next); }
    else setVisible(false);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (e?: Event) => {
      let focused: HTMLElement | null = null;
      if (e && e.target instanceof HTMLElement)
        focused = e.target.closest('.ds-card[data-appid]') as HTMLElement | null;
      if (!focused)
        focused = el.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      // Always-visible fallback: if no card is focused yet, show the first
      // VISIBLE card so hidden/filtered cards (owned games on online shelves,
      // cards in collapsed rows, etc.) are skipped.
      if (!focused) {
        const allCards = el.querySelectorAll<HTMLElement>('.ds-card[data-appid]');
        for (const c of allCards) {
          // Check element is visible: has layout height and is in the document flow.
          // Also verify no ancestor has display:none by checking offsetParent.
          if (c.offsetHeight > 0 && c.offsetParent !== null &&
              getComputedStyle(c).visibility !== 'hidden' &&
              getComputedStyle(c).display !== 'none') {
            focused = c; break;
          }
        }
      }
      if (!focused) return;
      const appid = Number(focused.getAttribute('data-appid') ?? 0);
      if (appid <= 0) return;
      if (appid !== currentAppid.current) {
        currentAppid.current = appid;
        const urls = getHeroUrls(appid);
        allUrls.current = urls;
        fallbackIdx.current = 0;
        const next: 'A' | 'B' = activeSlotRef.current === 'A' ? 'B' : 'A';
        const url0 = urls[0] ?? null;
        if (next === 'A') setSlotA(url0); else setSlotB(url0);
        setActiveSlot(next);
        setVisible(true);
        // Extract dominant color for background tinting — mirrors how ArtHero
        // picks up the art color. Works for same-origin steamloopback.host URLs.
      } else {
        setVisible(true);
      }
    };
    el.addEventListener('focusin', update);
    const obs = new MutationObserver(() => update());
    obs.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    update();
    return () => { el.removeEventListener('focusin', update); obs.disconnect(); };
  }, [containerRef]);

  if (!slotA && !slotB) return null;
  const themeBg = 'var(--obsidian-main-color,var(--ds-page-bg,rgb(0,0,0)))';
  // When a dominant color was extracted from the hero image, blend it at low
  // opacity over the theme background — same tinting effect ArtHero applies
  // to the first shelf when active. Falls back to the theme background alone.
  const bPx = Math.abs(topBleed); // 80px

  // Top fade: smooth ease-in curve with 5 stops over the full 80px bleed.
  // Keeps the hero near-invisible while overlapping the shelf above (~0.03 at
  // mid-bleed) and accelerates to opaque only in the final third.  This gives
  // the rounded, gradual transition the user sees between hero arts.
  // Bottom fade: mirrors ArtHero — opaque → 0.67 at -24px → transparent,
  // matching "rgba(0,0,0,0.67) 95%, transparent 100%" from the theme.
  const p = (f: number) => `${(bPx * f).toFixed(0)}px`;
  const maskVal = [
    `linear-gradient(to bottom,`,
    `  transparent 0,`,
    `  rgba(0,0,0,0.02) ${p(0.28)},`,
    `  rgba(0,0,0,0.08) ${p(0.50)},`,
    `  rgba(0,0,0,0.28) ${p(0.70)},`,
    `  rgba(0,0,0,0.65) ${p(0.88)},`,
    `  rgba(0,0,0,0.88) ${bPx}px,`,
    `  black calc(${bPx}px + 40px),`,
    `  black calc(100% - 100px),`,
    `  rgba(0,0,0,0.45) calc(100% - 64px),`,
    `  transparent calc(100% - 16px))`,
  ].join(' ');

  return (
    <div style={{
      position: 'absolute',
      top: topBleed, bottom: -64,
      left: '-2.8vw', right: '-2.8vw',
      zIndex: -1, pointerEvents: 'none', overflow: 'hidden',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
      maskImage: maskVal,
      WebkitMaskImage: maskVal,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: themeBg }} />
      {slotA && (
        <div style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          opacity: activeSlot === 'A' ? 1 : 0,
          transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
        }}>
          <img src={slotA} onError={onError('A')}
            className="ds-per-shelf-hero-img"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 30%', display: 'block' }} />
        </div>
      )}
      {slotB && (
        <div style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          opacity: activeSlot === 'B' ? 1 : 0,
          transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
        }}>
          <img src={slotB} onError={onError('B')}
            className="ds-per-shelf-hero-img"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 30%', display: 'block' }} />
        </div>
      )}
    </div>
  );
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

function DeckRowImpl({ title, items, shelfId, matchNativeSize = false, highlightFirst = false, highlightAll = false, highlightedAppIds, hideStatusLine = false, hideNewBadge = false, hideCompatIcons = false, hideNonSteamBadge = false, hideShelfTitle = false, hideGameNames = false, hideInstallIndicator = false, forceExpanded = false, heroEnabled = false }: { title?: string; items: DeckRowItem[]; shelfId?: string; matchNativeSize?: boolean; highlightFirst?: boolean; highlightAll?: boolean; highlightedAppIds?: number[]; hideStatusLine?: boolean; hideNewBadge?: boolean; hideCompatIcons?: boolean; hideNonSteamBadge?: boolean; hideShelfTitle?: boolean; hideGameNames?: boolean; hideInstallIndicator?: boolean; forceExpanded?: boolean; heroEnabled?: boolean }) {
  const highlightedSet = useMemo(() => {
    if (!highlightedAppIds?.length) return null;
    return new Set(highlightedAppIds);
  }, [highlightedAppIds]);
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
  // render it expanded but preserve the user's original collapsed status
  // untouched — if it later loses the slot (becomes second/third/etc.),
  // it should return to whatever state the user had chosen. We intentionally
  // do NOT overwrite `collapsedState` or the persisted `ds-collapsed-{id}`
  // key while `forceExpanded` is active.
  const collapsed = forceExpanded ? false : collapsedState;
  const [nativeRowClass, setNativeRowClass] = useState('');

  // Memoize effective dimensions — only recompute when the dims version changes,
  // not on every render. This prevents intermediate states from causing layout jumps.
  const [dimsVersion, setDimsVersion] = useState(0);
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
    const featH = matchNativeSize && nd?.featuredHeight ? nd.featuredHeight : h;
    const artH = matchNativeSize && nd?.imgHeight ? nd.imgHeight : h;
    const featArtH = matchNativeSize && nd?.featuredImgHeight ? nd.featuredImgHeight : featH;
    return { w, h, gap, featW, featH, artH, featArtH };
  }, [matchNativeSize, dimsVersion]);
  const { w: effectiveW, h: effectiveH, gap: effectiveGap, featW: effectiveFeaturedW, featH: effectiveFeaturedH, artH: effectiveArtH, featArtH: effectiveFeaturedArtH } = dims;
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
      setDimsVersion(n => n + 1);
      // After dims change the focused card's offsetLeft shifts because
      // preceding cards resized — the row's scrollLeft (set for the old
      // layout) leaves the focused card off-center, making the focus look
      // misplaced. Re-center on the next frame, only if a card in THIS row
      // currently holds the tracker.
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
    // Race-condition guard: dims may have been cached between the render
    // that captured `nd === null` and this effect's listener registration —
    // typical for shelves that mount in a later commit (smart shelves with
    // visibility windows, or any shelf that appears after `globalStylesStart`
    // triggers measurement). Without this, the row stays at the default
    // `CARD_W` even with `matchNativeSize: true` because no listener fires.
    if (matchNativeSize && getCachedNativeDims()) setDimsVersion(n => n + 1);
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
      // Experimental: when `forceCssLoaderThemes` is on, apply the full set
      // of DFL semantic tokens so themes targeting Title/Section/Collection/
      // GameRow/Library variants also reach DS shelves. Focus/hover state
      // classes stay excluded to avoid conflicts with DS focus handling.
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

  // Keep `forceExpanded` readable inside the focus-scroll effect without
  // re-subscribing the listener every time it flips — the effect below
  // captures a ref so it always sees the current value.
  const forceExpandedRef = useRef(forceExpanded);
  useEffect(() => { forceExpandedRef.current = forceExpanded; }, [forceExpanded]);

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
    // Center `el` inside its scrollable ancestor. One smooth scroll per focus
    // event, issued only when needed — if Steam's native scroll already put
    // the shelf near center (within tolerance), skip entirely to avoid
    // competing smooth-scrolls that cause visible stutter.
    //
    // Exception: when this shelf is promoted to the native-recents slot
    // (`forceExpanded=true`), pin the scrollable to the very top — otherwise
    // the shelf's natural position near scroll content top leaves its header
    // clipped by prior content (hero, hidden recents spacer). scrollTop=0
    // is the only position that guarantees the promoted shelf renders in
    // full below whatever sits above it.
    const maybeCenter = () => {
      try {
        const scr = findScrollableAncestor(el);
        if (!scr) { el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
        const elRect = el.getBoundingClientRect();
        const scrRect = scr.getBoundingClientRect();
        if (forceExpandedRef.current) {
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
      // Verification pass after 300ms: covers the recently-expanded-shelf
      // case where the first scroll reads mid-animation layout or Steam's
      // native scroll competes with ours. Self-skips via the tolerance
      // check inside maybeCenter when the shelf is already centered.
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
      try {
        const outer = outerRef.current;
        if (outer) requestAnimationFrame(() => {
          if (forceExpandedRef.current) return;
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
            if (forceExpandedRef.current) {
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
              if (forceExpandedRef.current) {
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
      // DeckRow's MutationObserver only watches its own row, so without this
      // cross-row pass, gpfocus from a card in a previously-visited shelf
      // persists and `findFocusedDsCard` (queries .ds-card.gpfocus across
      // documents) returns the wrong card in DOM order. Synchronous so the
      // OPTIONS-button intercept sees a single focused card immediately.
      try {
        for (const doc of getAllSteamDocuments()) {
          const all = doc.querySelectorAll<HTMLElement>('.ds-card.gpfocus');
          for (const it of all) { if (it !== c) it.classList.remove('gpfocus'); }
        }
      } catch {}
      if (rafPending !== null) return;
      rafPending = requestAnimationFrame(() => { rafPending = null; handleFocusedCard(c); });
    });

    const onCardFocus = (e: FocusEvent) => {
      const card = (e.target as HTMLElement)?.closest?.('.ds-card') as HTMLElement | null;
      if (card) {
        (globalThis as any).__ds_last_focused_card = card;
        if (rafPending !== null) { cancelAnimationFrame(rafPending); rafPending = null; }
        rafPending = requestAnimationFrame(() => { rafPending = null; handleFocusedCard(card); });
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
    if (forceExpanded) return;
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
  return (
    <div
      ref={outerRef}
      className="Panel ds-shelf"
      data-shelfid={shelfId || undefined}
      data-ds-hero-enabled={heroEnabled ? 'true' : undefined}
        style={{ position: 'relative', marginBottom: hideStatusLine ? -6 : 12, scrollMarginTop: 60, scrollMarginBottom: 52, overflow: heroEnabled ? 'visible' : 'hidden', background: heroEnabled ? 'transparent' : 'var(--ds-shell-bg)' }}
    >
      {heroEnabled && <PerShelfHero containerRef={outerRef} />}
      {title && !hideShelfTitle ? (
        collapsed ? (
          <Focusable
            ref={titleRef as any}
            className="ds-shelf-title"
            onClick={toggleCollapse}
            onOKButton={toggleCollapse}
            onActivate={toggleCollapse}
            style={{
              marginBottom: 8,
              paddingLeft: "2.8vw",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <span style={{ flex: 1 }}>{`+ ${title}`}</span>
          </Focusable>
        ) : (
          <div
            ref={titleRef}
            className={`ds-shelf-title${forceExpanded ? ' ds-shelf-title--locked' : ''}`}
            onClick={forceExpanded ? undefined : toggleCollapse}
            style={{
              marginBottom: 8,
              paddingLeft: "2.8vw",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: forceExpanded ? "default" : "pointer",
              userSelect: "none",
              pointerEvents: forceExpanded ? "none" : undefined,
            }}
          >
            <span style={{ flex: 1 }}>{title}</span>
          </div>
        )
      ) : null}
      {(!collapsed || hideShelfTitle) && (
        <Focusable
          ref={rowRef}
          className={`ds-row-scroll${nativeRowClass ? ` ${nativeRowClass}` : ''}`}
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
            gap: effectiveGap,
            overflowX: "auto",
            overflowY: "visible",
            scrollbarWidth: "none",
            scrollBehavior: "smooth",
            padding: "6px 0 46px 2.8vw",
          }}
          {...flowChildrenProps("horizontal")}
        >
          {items.map((item, idx) => {
            if (item.isRefresh) {
              return <RefreshCard key={item.id} item={item} cardW={effectiveW} cardH={effectiveH} />;
            }
            if (item.isMoreLink) {
              return <MoreCard key={item.id} item={item} cardW={effectiveW} cardH={effectiveH} />;
            }
            const isFeatured = highlightAll
              || (highlightFirst && idx === 0)
              || (!!highlightedSet && item.appid !== undefined && highlightedSet.has(item.appid));
            return <GameCard key={item.id} item={item}
              cardW={isFeatured ? finalFeaturedW : effectiveW}
              cardH={isFeatured ? finalFeaturedH : effectiveH}
              artH={isFeatured ? finalFeaturedArtH : effectiveArtH}
              featured={isFeatured}
              cardIndex={idx}
              hideStatusLine={hideStatusLine}
              hideNewBadge={hideNewBadge}
              hideCompatIcons={hideCompatIcons}
              hideNonSteamBadge={hideNonSteamBadge}
              hideGameName={hideGameNames}
              hideInstallIndicator={hideInstallIndicator} />;
          })}
          <div style={{ minWidth: "2.8vw", minHeight: 1, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
        </Focusable>
      )}
    </div>
  );
}

// Shallow-prop memo: `items` is already memoized in ShelfView via useMemo,
// so re-renders triggered by unrelated parent state (e.g. settings panel
// updates) don't force a full shelf re-render when only non-visual props
// have been recomputed identically.
export const DeckRow = memo(DeckRowImpl);
