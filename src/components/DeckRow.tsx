import { useEffect, useRef, useState, useMemo } from "react";
import { mark, measure } from "../core/perf";
import { computeCenteredScrollLeft } from "../core/scrollUtils";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument } from "../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap } from "../core/webpackCompat";
import { logInfo } from "../runtime/logger";

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

export function DeckRow({ title, items, shelfId, matchNativeSize = false, highlightFirst = false }: { title?: string; items: DeckRowItem[]; shelfId?: string; matchNativeSize?: boolean; highlightFirst?: boolean }) {
  try { mark?.(`deckRow.render:${shelfId ?? 'unknown'}:start`); } catch (e) { logInfo("HOME", "mark failed", String(e)); }
  const rowRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(() => shelfId ? readCollapsed(shelfId) : false);
  const [nativeRowClass, setNativeRowClass] = useState('');

  // Memoize effective dimensions — only recompute when the dims version changes,
  // not on every render. This prevents intermediate states from causing layout jumps.
  const [dimsVersion, setDimsVersion] = useState(0);
  const dims = useMemo(() => {
    const nd = getCachedNativeDims();
    const w = matchNativeSize && nd ? nd.width : CARD_W;
    const h = matchNativeSize && nd ? nd.height : CARD_ART_H;
    const gap = matchNativeSize && nd ? nd.gap : CARD_GAP;
    const featW = matchNativeSize && nd?.featuredWidth ? nd.featuredWidth : Math.round(h * (460 / 215));
    const featH = matchNativeSize && nd?.featuredHeight ? nd.featuredHeight : h;
    const artH = matchNativeSize && nd?.imgHeight ? nd.imgHeight : h;
    const featArtH = matchNativeSize && nd?.featuredImgHeight ? nd.featuredImgHeight : featH;
    return { w, h, gap, featW, featH, artH, featArtH };
  }, [matchNativeSize, dimsVersion]);
  const { w: effectiveW, h: effectiveH, gap: effectiveGap, featW: effectiveFeaturedW, featH: effectiveFeaturedH, artH: effectiveArtH, featArtH: effectiveFeaturedArtH } = dims;

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

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    let retryTimer: number | null = null;
    const onFocusIn = () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      requestAnimationFrame(() => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    };
    el.addEventListener("focusin", onFocusIn);
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      if (retryTimer) clearTimeout(retryTimer as number);
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
        if (outer) requestAnimationFrame(() => outer.scrollIntoView({ block: 'center', behavior: 'smooth' }));
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
            const outerRect = outerEl.getBoundingClientRect();
            const ancRect = anc.getBoundingClientRect();
            const delta = outerRect.top - ancRect.top;
            const target = anc.scrollTop + delta - (anc.clientHeight / 2) + (outerRect.height / 2);
            const maxScroll = Math.max(0, anc.scrollHeight - anc.clientHeight);
            const finalTop = Math.max(0, Math.min(target, maxScroll));
            try { anc.scrollTo({ top: finalTop, behavior: 'smooth' }); } catch { anc.scrollTop = finalTop; }
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
    const next = !collapsed;
    setCollapsed(next);
    if (shelfId) writeCollapsed(shelfId, next);
  };

  if (!items.length) return null;
  return (
    <div
      ref={outerRef}
      className="Panel ds-shelf"
        style={{ marginBottom: 12, scrollMarginTop: 60, scrollMarginBottom: 52, overflow: 'hidden', background: 'var(--ds-shell-bg)' }}
    >
      {title ? (
        <div
          ref={titleRef}
          className="ds-shelf-title"
          onClick={toggleCollapse}
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
          <span style={{ flex: 1 }}>{title}</span>
        </div>
      ) : null}
      {!collapsed && (
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
          flow-children="horizontal"
        >
          {items.map((item, idx) =>
            item.isMoreLink
              ? <MoreCard key={item.id} item={item} cardW={effectiveW} cardH={effectiveH} />
              : <GameCard key={item.id} item={item}
                  cardW={highlightFirst && idx === 0 ? effectiveFeaturedW : effectiveW}
                  cardH={highlightFirst && idx === 0 ? effectiveFeaturedH : effectiveH}
                  artH={highlightFirst && idx === 0 ? effectiveFeaturedArtH : effectiveArtH}
                  featured={highlightFirst && idx === 0} />
          )}
          <div style={{ minWidth: "2.8vw", minHeight: 1, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
        </Focusable>
      )}
    </div>
  );
}
