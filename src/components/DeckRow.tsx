import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { computeCenteredScrollLeft } from "../core/scrollUtils";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument } from "../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap } from "../core/webpackCompat";
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
    const docs = [document, getPreferredSteamDocument()];
    for (const doc of docs) {
      if (!doc) continue;
      if (radiusChanged) {
        const existing = doc.getElementById(STYLE_ID);
        if (existing) existing.remove();
      }
      if (!doc.getElementById(STYLE_ID)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
          :root {
            --ds-card-radius: ${cachedCardRadius};
            --ds-card-dim: 0.9;
            --ds-card-bg: rgba(3, 10, 30, 0.92);
            /* Fallback focus-ring color when no theme is active.
               Themes set --custom-sp-color-border on body/.BasicUI, which cascades
               to all descendants and takes precedence over these :root fallbacks. */
            --custom-sp-color-border: rgba(255, 255, 255, 0.72);
            --custom-sp-color-border-grow-0: rgba(255, 255, 255, 0);
            --custom-sp-color-border-grow-01: rgba(255, 255, 255, 0.36);
            --custom-sp-color-border-grow-100: rgba(255, 255, 255, 0.72);
            --custom-sp-color-border-fade-0: rgba(255, 255, 255, 0);
            --custom-sp-color-border-fade-100: rgba(255, 255, 255, 0.72);
          }
          .ds-row-scroll { scrollbar-width: none; -ms-overflow-style: none; }
          .ds-row-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }
          .ds-card {
            border-radius: var(--ds-card-radius, ${cachedCardRadius}) !important;
            filter: brightness(var(--ds-card-dim, 0.9));
            transition: filter 0.4s cubic-bezier(0, 0.73, 0.48, 1);
            scroll-margin-top: 90px;
            scroll-margin-bottom: 52px;
            scroll-margin-inline-end: 2.8vw;
          }
          /* Let the native card class draw the actual focus ring so the shelves match Steam.
             Suppress ancestor focus visuals, enforce a single themed outline on the card root,
             and retint the native shimmer (::after) to the theme color to avoid gray banding. */
          #deck-shelves-home-root .deck-shelves-root:focus,
          #deck-shelves-home-root .deck-shelves-root.gpfocus,
          #deck-shelves-home-root .deck-shelves-root.gpfocuswithin,
          #deck-shelves-home-root .ds-row-scroll:focus,
          #deck-shelves-home-root .ds-row-scroll.gpfocus,
          #deck-shelves-home-root .ds-row-scroll.gpfocuswithin,
          #deck-shelves-home-root .Panel.gpfocus,
          #deck-shelves-home-root .Focusable.gpfocus,
          #deck-shelves-home-root [class*="row"].gpfocus {
            outline: none !important;
            border: none !important;
            box-shadow: none !important;
            animation: none !important;
          }

          /* Match native visuals: no outline, no offset, no pseudo shimmer
             applied directly to the card. This makes the shelf card behave
             like the native Recent card so we can compare their behavior. */
          #deck-shelves-home-root .ds-card:focus,
          #deck-shelves-home-root .ds-card.gpfocus {
            outline: none !important;
            outline-offset: 0px !important;
            border: none !important;
            box-shadow: none !important;
            z-index: 5;
          }

           /* Retint native ::after shimmer to theme color and avoid a visible gray band.
             Use overlay blending and cap opacity so shimmer doesn't produce a thick double-ring.
             Provide a fallback shimmer animation so the focus pulses even if Steam's native
             animation does not apply to our injected element. */
          /* The pseudo-element draws a thin themed ring (via box-shadow) when
             the card is focused. This avoids painting over the artwork and
             allows us to animate opacity for the pulsing effect. */
          /* Ensure the ::after pseudo does not paint a gradient or shimmer
             on the shelf card — match native which has no ::after background. */
          #deck-shelves-home-root .ds-card::after {
            content: '' !important;
            position: absolute !important;
            inset: 0 !important;
            border-radius: var(--ds-card-radius, ${cachedCardRadius}) !important;
            pointer-events: none !important;
            z-index: 4 !important;
            opacity: 1 !important;
            transition: none !important;
            background: none !important;
            background-image: none !important;
            animation: none !important;
            display: inline !important;
          }

          /* Show a 2px themed ring using box-shadow on focus, and pulse opacity. */
          #deck-shelves-home-root .ds-card:focus::after,
          #deck-shelves-home-root .ds-card.gpfocus::after {
            /* keep empty: prefer ::before overlay for consistent stacking */
            opacity: 0 !important;
            animation: none !important;
          }

          /* Create a stacked overlay via ::before to ensure the ring sits above
             any native ::after visuals and never tints the artwork. */
          #deck-shelves-home-root .ds-card::before {
            content: '' !important;
            position: absolute !important;
            inset: 0 !important;
            border-radius: var(--ds-card-radius, ${cachedCardRadius}) !important;
            pointer-events: none !important;
            z-index: 10 !important;
            opacity: 0 !important;
            transition: opacity 120ms linear !important;
          }

          /* Also ensure the ::before overlay is inert for parity with native: */
          #deck-shelves-home-root .ds-card:focus::before,
          #deck-shelves-home-root .ds-card.gpfocus::before {
            box-shadow: none !important;
            opacity: 1 !important;
            animation: none !important;
          }

          /* Disable the DOM overlay; it caused unwanted tinting over covers.
             We rely on the ::after pseudo-element ring instead. */
          #deck-shelves-home-root .ds-card .ds-card-shimmer { display: none !important; }
          #deck-shelves-home-root .ds-card:focus::before,
          #deck-shelves-home-root .ds-card.gpfocus::before {
            display: none !important;
            content: none !important;
            animation: none !important;
            box-shadow: none !important;
          }

          @keyframes ds-shelf-shimmer {
            0% { background-position: 0% 0%; opacity: 0; }
            40% { opacity: 1; }
            100% { background-position: -200% 0%; opacity: 0; }
          }
          @keyframes ds-focus-pulse {
            0% { opacity: 0; }
            40% { opacity: 1; }
            100% { opacity: 0; }
          }
          #deck-shelves-home-root .ds-card *:focus { outline: none !important; box-shadow: none !important; }
          .ds-card-art {
            position: absolute !important;
            inset: 0 !important;
            padding-top: 0 !important;
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
          .ds-shelf-title {
            color: var(--ds-native-heading-color, inherit);
            font-size: 22px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }
          .ds-shelf-collapse-icon {
            font-size: 14px;
            opacity: 0.5;
            transition: transform 0.2s;
            display: inline-block;
          }
          .ds-card-label-name {
            color: var(--ds-native-heading-color, inherit);
            font-size: 18px;
            line-height: 18px;
            font-weight: 800;
            white-space: nowrap;
            overflow: visible;
            display: flex;
            align-items: center;
          }
          .ds-card-status {
            display: flex;
            align-items: center;
            gap: 6px;
            opacity: 0.7;
            font-size: 12px;
            line-height: 16px;
            font-weight: 700;
            text-transform: uppercase;
            margin-top: 4px;
            white-space: nowrap;
            overflow: visible;
          }
          .ds-card-status-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 14px;
            height: 14px;
            flex-shrink: 0;
            line-height: 0;
          }
          /* Play icon: theme color when available, green as fallback */
          .ds-card-status-play { color: var(--ds-native-heading-color, rgb(89, 191, 64)); }
          .ds-more-card-text {
            font-size: 16px;
            font-weight: 400;
            line-height: 1.35;
            text-align: center;
          }
          .ds-card-art-placeholder {
            font-size: 11px;
            opacity: 0.5;
            text-align: center;
            word-break: break-word;
          }
        `;
        doc.head.appendChild(style);
      }
      // Always clear then re-detect native heading color so theme changes take effect live.
      // Only set the variable when color is a saturated accent (theme-provided).
      // Vanilla Steam headings are white/near-gray — skip those so the CSS fallback
      // (green play icon, inherit for text) applies when no theme is active.
      try {
        doc.documentElement.style.removeProperty('--ds-native-heading-color');
        const headings = doc.querySelectorAll('h2[class], h3[class]');
        for (const h of Array.from(headings)) {
          const cls = (h as HTMLElement).className || '';
          if (/_[A-Za-z0-9_-]{5,}/.test(cls)) {
            const c = getComputedStyle(h as HTMLElement).color;
            if (!c || c === 'rgb(0, 0, 0)' || c === 'rgba(0, 0, 0, 0)') continue;
            // Check saturation: skip gray/white (all channels similar and bright)
            const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (m) {
              const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
              const max = Math.max(r, g, b);
              const sat = max > 0 ? (max - Math.min(r, g, b)) / max : 0;
              if (sat < 0.25) continue; // near-gray or white — skip
            }
            doc.documentElement.style.setProperty('--ds-native-heading-color', c);
            break;
          }
        }
      } catch {}
    }
  } catch {}
}



function GameCard({ item }: { item: DeckRowItem }) {
  const t = i18n.t.bind(i18n);
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fallbackIdx = useRef(0);
  const appid = typeof item.id === "number" ? item.id : Number(item.appid ?? 0);

  // Use React state for Focusable root className (classList.add is wiped on re-render)
  const [nativeCardClass, setNativeCardClass] = useState('');

  useEffect(() => {
    function injectNativeClasses(): boolean {
      const doc = getPreferredSteamDocument();
      const map = doc ? getRuntimeClassMap(doc) : null;
      if (!map?.nativeCard) return false;
      // Card root via React state (survives re-renders). Prefer the full class list from
      // a live native card so focus/glow modifiers match Steam's Recent Games cards.
      const sampleSelector = buildSelectorFromToken(map.nativeCard);
      const nativeSample = sampleSelector ? doc?.querySelector(`${sampleSelector}:not(.ds-card)`) as HTMLElement | null : null;
      if (nativeSample) {
        try {
          const rootClasses = Array.from(nativeSample.classList).filter((cls) => (
            cls !== 'Panel'
            && cls !== 'Focusable'
            && cls !== 'gpfocus'
            && !cls.startsWith('ds-')
          ));
          if (!rootClasses.includes('gpfocuswithin')) rootClasses.push('gpfocuswithin');
          setNativeCardClass(rootClasses.join(' '));
        } catch (e) {
          setNativeCardClass('');
        }
        
        try {
          const pa = getComputedStyle(nativeSample, '::after');
          const animName = (pa.animationName || '').split(',')[0] || '';
          const animDur = pa.animationDuration || '';
          const animTiming = pa.animationTimingFunction || '';
          const animIter = pa.animationIterationCount || '';
          if (cardRef.current) {
            if (animName && animName !== 'none') cardRef.current.style.setProperty('--ds-native-after-animation', animName);
            if (animDur) cardRef.current.style.setProperty('--ds-native-after-duration', animDur);
            if (animTiming) cardRef.current.style.setProperty('--ds-native-after-timing', animTiming);
            if (animIter) cardRef.current.style.setProperty('--ds-native-after-iteration', animIter);
            // Also set inline styles on the shimmer overlay element so it's applied
            // even if CSS rules are overridden by Steam's stylesheet ordering.
            try {
              const shimmer = cardRef.current.querySelector('.ds-card-shimmer') as HTMLElement | null;
              if (shimmer) {
                // Ensure the overlay is not used — hide it explicitly so it cannot
                // tint artwork even if other styles are present or CSS ordering
                // prevents our stylesheet from taking precedence.
                shimmer.style.display = 'none';
                shimmer.style.animation = 'none';
              }
            } catch (e) {}
          }
        } catch (e) {}
      } else {
        setNativeCardClass('');
      }
      // Art/img via classList.add (plain DOM elements, stable across re-renders)
      const artEl = cardRef.current?.querySelector('.ds-card-art');
      if (artEl) {
        if (map.nativeCardArt && !artEl.classList.contains(map.nativeCardArt)) artEl.classList.add(map.nativeCardArt);
        if (map.nativeCardArtOuter && !artEl.classList.contains(map.nativeCardArtOuter)) artEl.classList.add(map.nativeCardArtOuter);
        if (map.nativeCardArtPortrait && !artEl.classList.contains(map.nativeCardArtPortrait)) artEl.classList.add(map.nativeCardArtPortrait);
      }
      if (imgRef.current) {
        if (map.nativeCardImg && !imgRef.current.classList.contains(map.nativeCardImg)) imgRef.current.classList.add(map.nativeCardImg);
        if (map.nativeCardImgFade && !imgRef.current.classList.contains(map.nativeCardImgFade)) imgRef.current.classList.add(map.nativeCardImgFade);
      }
      // If we didn't find a nativeSample earlier, try to read runtime map animation tokens
      try {
        if (!nativeSample && map.nativeCard) {
          const maybe = doc.querySelector(buildSelectorFromToken(map.nativeCard) ?? '');
          if (maybe) {
            const pa = getComputedStyle(maybe, '::after');
            const animName = (pa.animationName || '').split(',')[0] || '';
            if (animName && animName !== 'none' && cardRef.current) cardRef.current.style.setProperty('--ds-native-after-animation', animName);
          }
        }
      } catch (e) {}
      return true;
    }

    let attempts = 0;
    const intervals = [250, 500, 800, 1200, 2000];
    let timer: number | null = null;
    const tryInject = () => {
      attempts += 1;
      const ok = injectNativeClasses();
      if (!ok && attempts < intervals.length) {
        timer = window.setTimeout(tryInject, intervals[attempts - 1]);
      }
    };
    tryInject();
    return () => { if (timer) clearTimeout(timer); };
  }, []);

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

  const downloadIcon = (
    <span className="ds-card-status-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" style={{ width: 14, height: 14, display: "block" }}>
        <path fillRule="evenodd" clipRule="evenodd" d="M29 23V27H7V23H2V32H34V23H29Z" fill="currentColor" />
        <path d="M20 14.1716L24.5858 9.58578L27.4142 12.4142L18 21.8284L8.58582 12.4142L11.4142 9.58578L16 14.1715V2H20V14.1716Z" fill="currentColor" />
      </svg>
    </span>
  );
  const playIcon = (
    <span className="ds-card-status-icon ds-card-status-play">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" style={{ width: 14, height: 14, display: "block" }}>
        <path d="M7.5 32.135a1 1 0 0 1-1.5-.866V4.73a1 1 0 0 1 1.5-.866l22.999 13.269a1 1 0 0 1 0 1.732l-23 13.269Z" fill="currentColor" />
      </svg>
    </span>
  );
  const updateIcon = (
    <span className="ds-card-status-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14, display: "block" }}>
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
      className={`ds-card${nativeCardClass ? ` ${nativeCardClass}` : ''}`}
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
          background: "var(--ds-card-bg, rgba(3, 10, 30, 0.92))",
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
          <div
            className="ds-card-art-placeholder"
            style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 6 }}
          >
            {item.name}
          </div>
        )}
        <div className="ds-card-shimmer" aria-hidden="true" />
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
        <div className="ds-card-label-name">
          {item.name}
        </div>
        {item.isSteam !== false && (() => {
          const hasUpdate = item.updatePending === true;
          const isInstalled = item.isInstalled === true;
          const hasPlaytime = !!playtime && item.playtimeMinutes && item.playtimeMinutes > 0;

          if (!isInstalled && !hasPlaytime) {
            return (
              <div className="ds-card-status">
                {downloadIcon}
                <span>{t('status_not_installed')}</span>
              </div>
            );
          }
          if (!isInstalled && hasPlaytime) {
            return (
              <div className="ds-card-status">
                {downloadIcon}
                <span>{t('playtime_label', { time: playtime })}</span>
              </div>
            );
          }
          if (isInstalled && hasUpdate) {
            return (
              <div className="ds-card-status">
                {updateIcon}
                <span>{hasPlaytime ? t('playtime_label', { time: playtime }) : t('status_no_playtime')}</span>
              </div>
            );
          }
          if (isInstalled && !hasPlaytime) {
            return (
              <div className="ds-card-status">
                {playIcon}
                <span>{t('status_no_playtime')}</span>
              </div>
            );
          }
          if (isInstalled && hasPlaytime) {
            return (
              <div className="ds-card-status">
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [nativeCardClass, setNativeCardClass] = useState('');

  useEffect(() => {
    function injectNativeClasses(): boolean {
      const doc = getPreferredSteamDocument();
      const map = doc ? getRuntimeClassMap(doc) : null;
      if (!map?.nativeCard) return false;
      const sampleSelector = buildSelectorFromToken(map.nativeCard);
      const nativeSample = sampleSelector ? doc?.querySelector(`${sampleSelector}:not(.ds-card)`) as HTMLElement | null : null;
      if (nativeSample) {
        const rootClasses = Array.from(nativeSample.classList).filter((cls) => (
          cls !== 'Panel'
          && cls !== 'Focusable'
          && cls !== 'gpfocus'
          && cls !== 'gpfocuswithin'
          && !cls.startsWith('ds-')
        ));
        if (!rootClasses.includes('gpfocuswithin')) rootClasses.push('gpfocuswithin');
        setNativeCardClass(rootClasses.join(' '));
        // Also copy animation props from native ::after to the MoreCard root so
        // the fallback inherits native timing when possible.
        try {
          const pa = getComputedStyle(nativeSample, '::after');
          const animName = (pa.animationName || '').split(',')[0] || '';
          if (animName && animName !== 'none' && cardRef.current) cardRef.current.style.setProperty('--ds-native-after-animation', animName);
        } catch (e) {}
      } else {
        setNativeCardClass([map.nativeCard, map.nativeCardMods].filter(Boolean).join(' '));
      }
      return true;
    }

    let attempts = 0;
    const intervals = [250, 500, 800, 1200];
    let timer: number | null = null;
    const tryInject = () => {
      attempts += 1;
      const ok = injectNativeClasses();
      if (!ok && attempts < intervals.length) {
        timer = window.setTimeout(tryInject, intervals[attempts - 1]);
      }
    };
    tryInject();
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  return (
    <Focusable
      ref={cardRef}
      className={`ds-card${nativeCardClass ? ` ${nativeCardClass}` : ''}`}
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
        <span className="ds-more-card-text">{item.name}</span>
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
  const titleRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(() => shelfId ? readCollapsed(shelfId) : false);
  const [nativeRowClass, setNativeRowClass] = useState('');

  useEffect(() => {
    ensureStyles();
    const interval = setInterval(ensureStyles, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function injectShelfNativeClasses() {
      const doc = getPreferredSteamDocument();
      const map = doc ? getRuntimeClassMap(doc) : null;
      if (!map) return;
      // Plain div elements — classList.add is safe (React doesn't manage their className)
      if (map.nativeShelf && outerRef.current && !outerRef.current.classList.contains(map.nativeShelf)) {
        outerRef.current.classList.add(map.nativeShelf);
      }
      if (map.nativeShelfTitle && titleRef.current && !titleRef.current.classList.contains(map.nativeShelfTitle)) {
        titleRef.current.classList.add(map.nativeShelfTitle);
      }
      // Focusable row — use React state (classList.add is wiped on re-render)
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
    // rAF debounce coalesces the focusin + MutationObserver gpfocus double-trigger
    // that fires for the same D-pad event.
    // throttleTimer creates the per-card micro-pause when holding D-pad:
    // while the throttle is active, the latest focused card is captured in
    // lastFocusedCard and scroll catches up when the timer expires.
    // __ds_scroll_throttle_rows: Set shared with BTryInternalNavigation in HomeInject.
    // While a row is in this Set, Gate 1 blocks D-pad so focus cannot move until
    // the throttle expires — creating the per-card micro-pause when holding D-pad.
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
        throttleTimer = null;
        throttleRows.delete(rowEl);
      }, 200);
    };

    const handleFocusedCard = (card: HTMLElement | null) => {
      if (!card || !rowEl.contains(card)) return;
      if (rafPending !== null) return;
      rafPending = requestAnimationFrame(() => {
        rafPending = null;
        const c = card;
        if (!c || !rowEl.contains(c)) return;
        try {
          for (const it of Array.from(rowEl.querySelectorAll<HTMLElement>('.ds-card'))) {
            it.classList.toggle('is-selected', it === c);
          }
        } catch {}
        try {
          const nested = Array.from(rowEl.querySelectorAll<HTMLElement>('.gpfocus'));
          for (const n of nested) {
            if (n !== c && n.classList) n.classList.remove('gpfocus');
          }
        } catch {}
        // Vertical: scrollIntoView on the shelf element (works when Steam uses the default viewport)
        try {
          const outer = outerRef.current;
          if (outer) requestAnimationFrame(() => outer.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        } catch {}
        // Vertical fallback A: walk DOM for scrollable ancestor and scroll manually.
        // Catches cases where the shelf is inside a non-standard scroll container.
        try {
          function getScrollableAncestor(node: HTMLElement | null): HTMLElement | null {
            let cur = node?.parentElement ?? null;
            while (cur && cur !== document.body) {
              try {
                const cs = getComputedStyle(cur);
                const oy = (cs.overflowY || '').toLowerCase();
                if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cur.scrollHeight > cur.clientHeight) return cur;
              } catch {}
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
        } catch {}
        // Vertical fallback B: Steam's home uses a separate BrowserWindow document.
        // getPreferredSteamDocument() reaches that document; scan for its scrollable viewport.
        try {
          const spDoc = getPreferredSteamDocument();
          if (spDoc && spDoc !== document) {
            const candidates = Array.from(spDoc.querySelectorAll<HTMLElement>('[class]'));
            let viewport: HTMLElement | null = null;
            const map = (() => { try { return getRuntimeClassMap(spDoc); } catch { return null; } })();
            if (map?.viewport) {
              const sel = buildSelectorFromToken(map.viewport);
              if (sel) try { viewport = spDoc.querySelector(sel); } catch {}
            }
            if (!viewport) {
              for (const el of candidates) {
                try {
                  const cs = getComputedStyle(el);
                  const oy = (cs.overflowY || '').toLowerCase();
                  if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight && el.clientHeight > 80) { viewport = el; break; }
                } catch {}
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
        } catch {}
        doHorizontalScroll(c);
      });
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
      style={{ marginBottom: 12, scrollMarginTop: 60, scrollMarginBottom: 52 }}
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
            gap: CARD_GAP,
            overflowX: "auto",
            overflowY: "visible",
            scrollbarWidth: "none",
            scrollBehavior: "smooth",
            padding: "6px 0 46px 2.8vw",
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
