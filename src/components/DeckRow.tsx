import { memo, useEffect, useRef, useState, useMemo } from "react";
import { mark, measure } from "../core/perf";
import { computeCenteredScrollLeft } from "../core/scrollUtils";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument } from "../runtime/steamHost";
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

function DeckRowImpl({ title, items, shelfId, matchNativeSize = false, highlightFirst = false, highlightAll = false, highlightedAppIds, hideStatusLine = false, hideNewBadge = false, hideCompatIcons = false, hideNonSteamBadge = false, hideShelfTitle = false, hideGameNames = false, hideInstallIndicator = false, forceExpanded = false }: { title?: string; items: DeckRowItem[]; shelfId?: string; matchNativeSize?: boolean; highlightFirst?: boolean; highlightAll?: boolean; highlightedAppIds?: number[]; hideStatusLine?: boolean; hideNewBadge?: boolean; hideCompatIcons?: boolean; hideNonSteamBadge?: boolean; hideShelfTitle?: boolean; hideGameNames?: boolean; hideInstallIndicator?: boolean; forceExpanded?: boolean }) {
  const highlightedSet = useMemo(() => {
    if (!highlightedAppIds?.length) return null;
    return new Set(highlightedAppIds);
  }, [highlightedAppIds]);
  try { mark?.(`deckRow.render:${shelfId ?? 'unknown'}:start`); } catch (e) { logInfo("HOME", "mark failed", String(e)); }
  const rowRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [collapsedState, setCollapsed] = useState(() => shelfId ? readCollapsed(shelfId) : false);
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
    const gap = matchNativeSize && nd ? nd.gap : CARD_GAP;
    // Default featured: ~2× portrait width, same height — proportionally close
    // to native "highlight" card layout. Avoids the 2.14 landscape aspect that
    // makes the card look too wide against the portrait row.
    const featW = matchNativeSize && nd?.featuredWidth ? nd.featuredWidth : Math.round(w * 3);
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
    const unsub = onNativeDimsChange(() => setDimsVersion(n => n + 1));
    return () => {
      globalStylesStop();
      unsub();
    };
  }, []);

  useEffect(() => {
    function injectShelfNativeClasses() {
      const doc = getPreferredSteamDocument();
      const map = doc ? getRuntimeClassMap(doc) : null;
      if (!map) return;
      if (map.nativeShelf && outerRef.current && !outerRef.current.classList.contains(map.nativeShelf)) {
        outerRef.current.classList.add(map.nativeShelf);
      }
      if (map.nativeShelfTitle && titleRef.current && !titleRef.current.classList.contains(map.nativeShelfTitle)) {
        titleRef.current.classList.add(map.nativeShelfTitle);
      }
      if (map.nativeShelfRow) setNativeRowClass(map.nativeShelfRow);
    }
    injectShelfNativeClasses();
    const t = setTimeout(injectShelfNativeClasses, 500);
    return () => clearTimeout(t);
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
      if (rafPending !== null) return;
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
      rafPending = requestAnimationFrame(() => { rafPending = null; handleFocusedCard(c); });
    });

    const onCardFocus = (e: FocusEvent) => {
      const card = (e.target as HTMLElement)?.closest?.('.ds-card') as HTMLElement | null;
      if (card) {
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
        style={{ marginBottom: hideStatusLine ? -6 : 12, scrollMarginTop: 60, scrollMarginBottom: 52, overflow: 'hidden', background: 'var(--ds-shell-bg)' }}
    >
      {title && !hideShelfTitle ? (
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
          <span style={{ flex: 1 }}>{collapsed ? `+ ${title}` : title}</span>
        </div>
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
