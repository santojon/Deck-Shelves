import React, { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { computeCenteredScrollLeft } from "../core/scrollUtils";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument } from "../runtime/steamHost";
import { getPortraitFallbacks } from "../core/steamAssets";
import i18n from "../i18n";

export type DeckRowItem = {
  id: string | number;
  name: string;
  portraitUrl?: string;
  heroUrl?: string;
  isMoreLink?: boolean;
  onActivate?: () => void;
  onMenuButton?: (evt: any) => void;
  appid?: number;
  deckCompatCategory?: number;
  playtimeMinutes?: number;
  isInstalled?: boolean;
  statusText?: string;
  shelfId?: string;
  updatePending?: boolean;
  isSteam?: boolean;
};

const CARD_W      = 133;       // native Focusable width
const CARD_ART_H  = 200;       // native ~199.5, rounded to clean integer
const CARD_GAP    = 12;        // native gap between portrait cards
const STYLE_ID      = "deck-shelves-row-style";

function detectNativeCardRadius(): string {
  try {
    const doc = getPreferredSteamDocument();
    if (!doc) return "0px";
    const selectors = [
      '[class*="appportrait"] img',
      '[class*="GameCard"] img',
      '[class*="libraryhome"] img',
      '[class*="appportraitlaunchable"] img',
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel) as HTMLElement | null;
      if (el) {
        const r = getComputedStyle(el).borderRadius;
        if (r && r !== "0px") return r;
      }
    }
    const grid = doc.querySelector('[class*="ReactVirtualized__Grid"]');
    if (grid) {
      const imgs = grid.querySelectorAll('img');
      for (let i = 0; i < Math.min(imgs.length, 10); i++) {
        const r = getComputedStyle(imgs[i]).borderRadius;
        if (r && r !== "0px") return r;
      }
    }
  } catch {}
  return "0px";
}

let cachedCardRadius = "0px";

function formatPlaytime(minutes: number | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1).replace(".", ",")} h`;
}

function ensureStyles() {
  try {
    const newRadius = detectNativeCardRadius();
    const radiusChanged = newRadius !== cachedCardRadius;
    cachedCardRadius = newRadius;
    // compute a sensible outline offset for rounded cards (helps avoid clipping/duplicate visuals)
    const parsedRadius = parseInt((cachedCardRadius || "0px").toString(), 10) || 0;
    // For Round theme we want a single visible focus visual with 2px offset
    const outlineOffset = 2;
    const docs = [document, getPreferredSteamDocument()];
    for (const doc of docs) {
      if (!doc) continue;
      if (radiusChanged) {
        const existing = doc.getElementById(STYLE_ID);
        if (existing) existing.remove();
      }
      if (doc.getElementById(STYLE_ID)) continue;
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .ds-row-scroll { scrollbar-width: none; -ms-overflow-style: none; scroll-behavior: smooth; }
        .ds-row-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .ds-card {
          border-radius: var(--ds-card-radius, ${cachedCardRadius}) !important;
          outline: 2px solid transparent !important;
          outline-offset: ${outlineOffset}px !important;
          box-shadow: none !important;
          border: none !important;
          filter: brightness(0.9);
          transition: outline-color 0.4s cubic-bezier(0, 0.73, 0.48, 1),
                      filter 0.4s cubic-bezier(0, 0.73, 0.48, 1),
                      box-shadow 0.4s cubic-bezier(0, 0.73, 0.48, 1);
          scroll-margin-top: 90px;
          scroll-margin-bottom: 52px;
          scroll-margin-inline-end: 2.8vw;
        }
        /* Remove any inner/native focus visuals so only the card root shows the outline */
        .ds-card *:focus { outline: none !important; box-shadow: none !important; }
        /* Suppress any descendant elements that gain gpfocus to avoid duplicate outlines; keep it only on the card root */
        .ds-card .gpfocus:not(.ds-card) { outline: none !important; box-shadow: none !important; }
        .ds-card.gpfocus, .ds-card:focus {
          outline: 2px solid rgba(255,255,255,0.6) !important;
          outline-offset: ${outlineOffset}px !important;
          box-shadow: 0 16px 24px rgba(0,0,0,0.5) !important;
          border: none !important;
          filter: brightness(1);
          z-index: 12;
        }
        .ds-card-art {
          border-radius: var(--ds-card-radius, ${cachedCardRadius});
        }
        .ds-card-art img {
          border-radius: var(--ds-card-radius, ${cachedCardRadius});
        }
        .ds-card.gpfocus .ds-card-art,
        .ds-card:focus .ds-card-art {
          z-index: 2;
        }
        .ds-card .ds-card-label {
          opacity: 0;
          transition: opacity .15s ease;
          font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
        }
        .ds-card.gpfocus .ds-card-label,
        .ds-card:focus .ds-card-label {
          opacity: 1;
        }
        .ds-card img { transition: opacity .15s ease; }
        .ds-compat {
          position: absolute; bottom: 4px; right: 4px;
          display: flex; align-items: center;
          background: rgba(0,0,0,0.7);
          border-radius: 20px;
          padding: 2px;
          z-index: 3; pointer-events: none;
          width: 40px; height: 20px;
          opacity: 0;
          transition: opacity .15s ease;
        }
        .ds-card.gpfocus .ds-compat,
        .ds-card:focus .ds-compat { opacity: 1; }
        .ds-compat svg { flex-shrink: 0; width: 20px; height: 20px; }
        .ds-compat-verified { color: rgb(89, 191, 64); }
        .ds-compat-playable { color: rgb(255, 200, 44); }
      `;
      doc.head.appendChild(style);
    }
  } catch {}
}


const statusStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "rgba(255, 255, 255, 0.5)",
  fontSize: 12,
  lineHeight: "16px",
  fontWeight: 700,
  fontFamily: '"Motiva Sans", Helvetica, sans-serif',
  textTransform: "uppercase",
  marginTop: 4,
  whiteSpace: "nowrap",
  overflow: "visible",
};

const statusIconWrap: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 14,
  height: 14,
  flexShrink: 0,
  lineHeight: 0,
};

function GameCard({ item }: { item: DeckRowItem }) {
  const t = i18n.t.bind(i18n);
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fallbackIdx = useRef(0);
  const appid = typeof item.id === "number" ? item.id : Number(item.appid ?? 0);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const menuHandler = (evt: Event) => {
      if (!item.onMenuButton) return;
      evt.stopPropagation();
      evt.preventDefault();
      item.onMenuButton(evt);
    };
    const activateHandler = (evt: Event) => {
      if (!item.onActivate) return;
      evt.stopPropagation();
      evt.preventDefault();
      item.onActivate();
    };
    el.addEventListener("vgp_onmenubutton", menuHandler);
    el.addEventListener("contextmenu", menuHandler);
    el.addEventListener("vgp_onok", activateHandler);
    return () => {
      el.removeEventListener("vgp_onmenubutton", menuHandler);
      el.removeEventListener("contextmenu", menuHandler);
      el.removeEventListener("vgp_onok", activateHandler);
    };
  }, [item.onMenuButton, item.onActivate]);

  const allUrls = useMemo(() => {
    const urls: string[] = [];
    if (appid > 0) {
      urls.push(`/customimages/${appid}p.png`);
      urls.push(`/customimages/${appid}p.jpg`);
    }
    if (item.portraitUrl && !urls.includes(item.portraitUrl)) urls.push(item.portraitUrl);
    if (item.heroUrl && !urls.includes(item.heroUrl)) urls.push(item.heroUrl);
    if (appid > 0) {
      for (const u of getPortraitFallbacks(appid)) {
        if (!urls.includes(u)) urls.push(u);
      }
    }
    return urls;
  }, [item.portraitUrl, item.heroUrl, appid]);

  useEffect(() => {
    fallbackIdx.current = 0;
    if (imgRef.current && allUrls[0]) {
      imgRef.current.src = allUrls[0];
    }
  }, [allUrls]);

  const onImgError = useCallback(() => {
    fallbackIdx.current += 1;
    if (imgRef.current && fallbackIdx.current < allUrls.length) {
      imgRef.current.src = allUrls[fallbackIdx.current];
    }
  }, [allUrls]);

  const firstUrl = allUrls[0] ?? "";
  const compat = item.deckCompatCategory ?? 0;
  const playtime = formatPlaytime(item.playtimeMinutes);

  const iconSvgStyle: React.CSSProperties = { width: 14, height: 14, display: "block" };
  const downloadIcon = (
    <span style={statusIconWrap}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" style={iconSvgStyle}>
        <path fillRule="evenodd" clipRule="evenodd" d="M29 23V27H7V23H2V32H34V23H29Z" fill="currentColor" />
        <path d="M20 14.1716L24.5858 9.58578L27.4142 12.4142L18 21.8284L8.58582 12.4142L11.4142 9.58578L16 14.1715V2H20V14.1716Z" fill="currentColor" />
      </svg>
    </span>
  );
  const playIcon = (
    <span style={{ ...statusIconWrap, color: '#59bf40' }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" style={iconSvgStyle}>
        <path d="M7.5 32.135a1 1 0 0 1-1.5-.866V4.73a1 1 0 0 1 1.5-.866l22.999 13.269a1 1 0 0 1 0 1.732l-23 13.269Z" fill="currentColor" />
      </svg>
    </span>
  );
  const updateIcon = (
    <span style={statusIconWrap}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={iconSvgStyle}>
        <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
      </svg>
    </span>
  );

  const deckLogoSvg = (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path opacity="0.84" fillRule="evenodd" clipRule="evenodd" d="M7.77715 4.30197C10.9241 4.30197 13.4752 6.85305 13.4752 9.99997C13.4752 13.1469 10.9241 15.698 7.77715 15.698V18.8889C12.6864 18.8889 16.666 14.9092 16.666 9.99997C16.666 5.09078 12.6864 1.11108 7.77715 1.11108V4.30197ZM7.77756 13.8889C9.92533 13.8889 11.6664 12.1477 11.6664 9.99997C11.6664 7.8522 9.92533 6.11108 7.77756 6.11108C5.62979 6.11108 3.88867 7.8522 3.88867 9.99997C3.88867 12.1477 5.62979 13.8889 7.77756 13.8889Z" fill="white" />
    </svg>
  );
  const checkmarkSvg = (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M10 19C14.9706 19 19 14.9706 19 10C19 5.02944 14.9706 1 10 1C5.02944 1 1 5.02944 1 10C1 14.9706 5.02944 19 10 19ZM8.33342 11.9222L14.4945 5.76667L16.4556 7.72779L8.33342 15.8556L3.26675 10.7833L5.22786 8.82223L8.33342 11.9222Z" fill="currentColor" />
    </svg>
  );
  const infoCircleSvg = (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M10 19C14.9706 19 19 14.9706 19 10C19 5.02944 14.9706 1 10 1C5.02944 1 1 5.02944 1 10C1 14.9706 5.02944 19 10 19ZM9 6H11V8H9V6ZM9 9H11V14H9V9Z" fill="currentColor" />
    </svg>
  );

  const compatClass = compat === 3 ? "ds-compat ds-compat-verified"
    : compat === 2 ? "ds-compat ds-compat-playable"
    : "";

  return (
    <Focusable
      ref={cardRef}
      className="ds-card"
      focusClassName="gpfocus"
      role="listitem"
      onActivate={item.onActivate}
      onOKButton={item.onActivate}
      onMenuButton={item.onMenuButton}
      onContextMenu={item.onMenuButton}
      data-appid={appid || undefined}
      data-shelfid={item.shelfId || undefined}
      style={{
        position: "relative",
        width: CARD_W,
        minWidth: CARD_W,
        height: CARD_ART_H,
        flexShrink: 0,
        padding: 0,
        margin: 0,
        background: "transparent",
        cursor: "pointer",
        overflow: "visible",
      }}
    >
      <div
        className="ds-card-art"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(3, 10, 30, 0.92)",
          overflow: "hidden",
        }}
      >
        {firstUrl ? (
          <img
            ref={imgRef}
            src={firstUrl}
            alt={item.name}
            onError={onImgError}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, color: "#667", padding: 6, textAlign: "center",
            wordBreak: "break-word",
          }}>
            {item.name}
          </div>
        )}
        {compatClass && (
          <div className={compatClass}>
            {deckLogoSvg}
            {compat === 3 ? checkmarkSvg : infoCircleSvg}
          </div>
        )}
      </div>
      <div
        className="ds-card-label"
        style={{
          position: "absolute",
          top: "100%",
          left: 0,
          width: CARD_W + 20,
          paddingTop: 10,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{
          color: "#fff",
          fontSize: 18,
          lineHeight: "18px",
          fontWeight: 800,
          fontFamily: '"Motiva Sans", Helvetica, sans-serif',
          whiteSpace: "nowrap",
          overflow: "visible",
          display: "flex",
          alignItems: "center",
        }}>
          {item.name}
        </div>
        {item.isSteam !== false && (() => {
          const hasUpdate = item.updatePending === true;
          const isInstalled = item.isInstalled === true;
          const hasPlaytime = !!playtime && item.playtimeMinutes && item.playtimeMinutes > 0;

          if (!isInstalled && !hasPlaytime) {
            return (
              <div style={statusStyle}>
                {downloadIcon}
                <span>{t('status_not_installed')}</span>
              </div>
            );
          }
          if (!isInstalled && hasPlaytime) {
            return (
              <div style={statusStyle}>
                {downloadIcon}
                <span>{t('playtime_label', { time: playtime })}</span>
              </div>
            );
          }
          if (isInstalled && hasUpdate) {
            return (
              <div style={statusStyle}>
                {updateIcon}
                <span>{hasPlaytime ? t('playtime_label', { time: playtime }) : t('status_no_playtime')}</span>
              </div>
            );
          }
          if (isInstalled && !hasPlaytime) {
            return (
              <div style={statusStyle}>
                {playIcon}
                <span>{t('status_no_playtime')}</span>
              </div>
            );
          }
          if (isInstalled && hasPlaytime) {
            return (
              <div style={statusStyle}>
                {playIcon}
                <span>{t('playtime_label', { time: playtime })}</span>
              </div>
            );
          }
          return null;
        })()}
      </div>
    </Focusable>
  );
}

function MoreCard({ item }: { item: DeckRowItem }) {
  return (
    <Focusable
      className="ds-card"
      focusClassName="gpfocus"
      onActivate={item.onActivate}
      onOKButton={item.onActivate}
      style={{
        position: "relative",
        width: CARD_W,
        minWidth: CARD_W,
        height: CARD_ART_H,
        flexShrink: 0,
        padding: 0,
        margin: 0,
        background: "transparent",
        cursor: "pointer",
        overflow: "visible",
      }}
    >
      <div
        className="ds-card-art"
        style={{
          position: "absolute",
          inset: 0,
          width: CARD_W,
          height: CARD_ART_H,
          overflow: "hidden",
          background: "linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))",
          borderRadius: cachedCardRadius,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <span style={{
          fontSize: 16,
          color: "rgb(220, 222, 223)",
          fontWeight: 400,
          lineHeight: 1.35,
          textAlign: "center",
          fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
        }}>{item.name}</span>
      </div>
    </Focusable>
  );
}

function readCollapsed(shelfId: string): boolean {
  try { return localStorage.getItem(`ds-collapsed-${shelfId}`) === '1'; } catch { return false; }
}

function writeCollapsed(shelfId: string, collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(`ds-collapsed-${shelfId}`, '1');
    else localStorage.removeItem(`ds-collapsed-${shelfId}`);
  } catch {}
}

export function DeckRow({ title, items, shelfId }: { title?: string; items: DeckRowItem[]; shelfId?: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(() => shelfId ? readCollapsed(shelfId) : false);
  useEffect(() => {
    ensureStyles();
    const interval = setInterval(ensureStyles, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    let retryTimer: number | null = null;
    const doScroll = () => el.scrollIntoView({ block: "center", behavior: "smooth" });
    const onFocusIn = (e: FocusEvent) => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      requestAnimationFrame(doScroll);
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
    let clearTimer: any = null;

    const handleFocusedCard = (card: HTMLElement | null) => {
      if (!card || !rowEl.contains(card)) return;
      (globalThis as any).__ds_centering = true;
      if (clearTimer) clearTimeout(clearTimer);
      try {
        for (const it of Array.from(rowEl.querySelectorAll<HTMLElement>('.ds-card'))) {
          it.classList.toggle('is-selected', it === card);
        }
      } catch {}
      // Normalize any 'gpfocus' that may be applied to nested elements by the runtime so
      // only the card root retains the class — this avoids duplicate visual outlines.
      try {
        const nested = Array.from(rowEl.querySelectorAll<HTMLElement>('.gpfocus'));
        for (const n of nested) {
          if (n !== card && n.classList) n.classList.remove('gpfocus');
        }
      } catch {}
      // Ensure the whole shelf panel is vertically centered in the viewport
      try {
        const outer = outerRef.current;
        if (outer) requestAnimationFrame(() => outer.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      } catch {}
      // Fallback: ensure an enclosing scrollable ancestor is scrolled so the row is centered
      try {
        function getScrollableAncestor(node: HTMLElement | null) {
          let cur: HTMLElement | null = node;
          while (cur && cur !== document.body) {
            try {
              const cs = getComputedStyle(cur);
              const oy = (cs.overflowY || '').toLowerCase();
              if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cur.scrollHeight > cur.clientHeight) return cur;
            } catch {}
            cur = cur.parentElement;
          }
          return (document.scrollingElement as HTMLElement) || document.documentElement as HTMLElement;
        }

        const anc = getScrollableAncestor(rowEl);
        if (anc) {
          const cardRect = card.getBoundingClientRect();
          const ancRect = anc.getBoundingClientRect();
          const delta = cardRect.top - ancRect.top;
          const target = anc.scrollTop + delta - (anc.clientHeight / 2) + (cardRect.height / 2);
          const maxScroll = Math.max(0, anc.scrollHeight - anc.clientHeight);
          const finalTop = Math.max(0, Math.min(target, maxScroll));
          try { anc.scrollTo({ top: finalTop, behavior: 'smooth' }); } catch { anc.scrollTop = finalTop; }
        }
      } catch {}
      // Additional Steam viewport fallback: resilient viewport discovery + instrumentation
      try {
        const spDoc = getPreferredSteamDocument();
        if (spDoc) {
          function findSteamViewport(doc: Document): HTMLElement | null {
            try {
              // Known selector (from probes)
              const known = doc.querySelector('._3PhGYbMWIcIaZCfllWN19N') as HTMLElement | null;
              if (known) return known;
            } catch {}
            try {
              // Prefer any element with overflowY auto/scroll/overlay and content taller than viewport
              const candidates = Array.from(doc.querySelectorAll<HTMLElement>('[class]'));
              for (const c of candidates) {
                try {
                  const cs = getComputedStyle(c);
                  const oy = (cs.overflowY || '').toLowerCase();
                  if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && c.scrollHeight > c.clientHeight && c.clientHeight > 80) return c;
                } catch {}
              }
            } catch {}
            try {
              // Last-resort: doc scrolling element
              return (doc.scrollingElement as HTMLElement) || (doc.documentElement as HTMLElement) || null;
            } catch {}
            return null;
          }

          function remoteLog(msg: string, obj?: any) {
            try {
              console.log('[ds]', msg, obj);
            } catch {}
            try {
              const w = (spDoc as any).defaultView as Window | undefined;
              if (w && w.console && w.console.log) w.console.log('[ds]', msg, obj);
            } catch {}
          }

          const viewport = findSteamViewport(spDoc);
          if (viewport) {
            const vRect = viewport.getBoundingClientRect();
            const rowRect = rowEl.getBoundingClientRect();
            const delta = rowRect.top - vRect.top;
            const target = viewport.scrollTop + delta - (viewport.clientHeight / 2) + (rowRect.height / 2);
            const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
            const final = Math.max(0, Math.min(target, max));
            remoteLog('viewport-scroll-attempt-smooth', { target: final, before: viewport.scrollTop });
            try { viewport.scrollTo({ top: final, behavior: 'smooth' }); } catch { try { viewport.scrollTop = final; } catch {} }
            // After a short delay, check if smooth scroll reached near target; if not, fall back to instant correction
            setTimeout(() => {
              try {
                const delta = Math.abs((viewport.scrollTop || 0) - final);
                remoteLog('viewport-scroll-check', { after: viewport.scrollTop, delta });
                if (delta > 8) {
                  remoteLog('viewport-scroll-fallback-auto', { target: final });
                  try { viewport.scrollTo({ top: final, behavior: 'auto' }); } catch { viewport.scrollTop = final; }
                }
              } catch (e) { remoteLog('viewport-scroll-check-error', { err: String(e) }); }
            }, 220);
          } else {
            try { console.log('[ds] viewport not found'); } catch {}
          }
        }
      } catch {}
      const final = computeCenteredScrollLeft({ width: rowEl.clientWidth, scrollWidth: rowEl.scrollWidth }, { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight });
      rowEl.scrollTo({ left: final, behavior: 'smooth' });
      clearTimer = setTimeout(() => {
        try { (globalThis as any).__ds_centering = false; } catch {}
      }, 80);
    };

    const onCardFocus = (e: FocusEvent) => {
      const card = (e.target as HTMLElement)?.closest?.('.ds-card') as HTMLElement | null;
      handleFocusedCard(card);
    };

    // MutationObserver to detect class-based focus changes (e.g., 'gpfocus')
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const target = m.target as HTMLElement | null;
        if (!target) continue;
        if (target.classList && target.classList.contains('gpfocus')) {
          const card = target.closest('.ds-card') as HTMLElement | null;
          handleFocusedCard(card);
          break;
        }
      }
    });

    // Observe children for class attribute changes
    observer.observe(rowEl, { subtree: true, attributes: true, attributeFilter: ['class'] });

    rowEl.addEventListener("focusin", onCardFocus);
    return () => {
      rowEl.removeEventListener("focusin", onCardFocus);
      observer.disconnect();
      if (clearTimer) clearTimeout(clearTimer);
      try { (globalThis as any).__ds_centering = false; } catch {}
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
      className="Panel"
      style={{ marginBottom: 12, scrollMarginTop: 60, scrollMarginBottom: 52 }}
    >
      {title ? (
        <div
          onClick={toggleCollapse}
          style={{
            color: "#dcdedf",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 0.5,
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
          <span style={{ fontSize: 14, opacity: 0.5, paddingRight: "2.8vw", transition: "transform 0.2s", display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
        </div>
      ) : null}
      {!collapsed && (
        <Focusable
          ref={rowRef}
          className="ds-row-scroll"
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
            gap: CARD_GAP,
            overflowX: "auto",
            overflowY: "visible",
            scrollbarWidth: "none",
            scrollBehavior: "smooth",
            padding: "6px 0 46px 2.8vw",  /* bottom: label/scale room; left: aligns first card with shelf title */
          }}
          flow-children="horizontal"
        >
          {items.map((item) =>
            item.isMoreLink
              ? <MoreCard key={item.id} item={item} />
              : <GameCard key={item.id} item={item} />
          )}
          <div style={{ minWidth: "2.8vw", minHeight: 1, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
        </Focusable>
      )}
    </div>
  );
}
