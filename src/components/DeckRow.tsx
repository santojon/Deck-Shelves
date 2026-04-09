import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { computeCenteredScrollLeft } from "../core/scrollUtils";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument } from "../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap, discoverNativeCardDimensions, type NativeCardDims } from "../core/webpackCompat";
import { getPortraitFallbacks, getLandscapeUrls } from "../core/steamAssets";
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

const CARD_W      = 133;       // Focusable width
const CARD_ART_H  = 200;       // ~199.5, rounded to clean integer
const CARD_GAP    = 12;        // gap between portrait cards
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
let cachedNativeDims: NativeCardDims | null = null;
const nativeDimsListeners = new Set<() => void>();

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
    const steamDoc = getPreferredSteamDocument();
    const newDims = discoverNativeCardDimensions(steamDoc) ?? discoverNativeCardDimensions(document);
    const dimsChanged = newDims !== null && (
      !cachedNativeDims ||
      newDims.width !== cachedNativeDims.width ||
      newDims.height !== cachedNativeDims.height ||
      newDims.gap !== cachedNativeDims.gap ||
      newDims.featuredWidth !== cachedNativeDims.featuredWidth ||
      newDims.featuredHeight !== cachedNativeDims.featuredHeight
    );
    if (newDims) cachedNativeDims = newDims;
    if (dimsChanged) nativeDimsListeners.forEach(cb => cb());
    const docs = [document, steamDoc];
    for (const doc of docs) {
      if (!doc) continue;
      if (radiusChanged || dimsChanged) {
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
            --ds-native-card-w: ${cachedNativeDims?.width ?? CARD_W}px;
            --ds-native-card-h: ${cachedNativeDims?.height ?? CARD_ART_H}px;
            --ds-native-card-gap: ${cachedNativeDims?.gap ?? CARD_GAP}px;
          }
          #deck-shelves-home-root { margin-top: -24px !important; }
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

          #deck-shelves-home-root .ds-card::after {
            content: '' !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: auto !important;
            height: var(--ds-card-art-h, 100%) !important;
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
          
          #deck-shelves-home-root .ds-card.gpfocus::after,
          #deck-shelves-home-root .ds-card:focus::after {
            height: var(--ds-card-art-h, 100%) !important;
            bottom: auto !important;
            border-radius: var(--ds-card-radius, ${cachedCardRadius}) !important;
          }

          #deck-shelves-home-root .ds-card .ds-card-shimmer { display: none !important; }

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
            inset: 1px !important;
            height: var(--ds-card-art-h, 100%) !important;
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
            display: var(--ds-compat-display, flex); align-items: center;
            background: rgba(0,0,0,0.7);
            border-radius: 20px;
            padding: 2px;
            z-index: 3; pointer-events: none;
            width: 40px; height: 20px;
            opacity: 0;
            transition: opacity .15s ease;
          }
          .ds-card.gpfocus .ds-compat,
          .ds-card:focus .ds-compat { opacity: var(--ds-compat-opacity, 1); }
          .ds-compat svg { flex-shrink: 0; width: 20px; height: 20px; }
          /* Deck logo icon: picks up --custom-compat-icons-deck from themed CSS Loader themes */
          .ds-compat-deck-icon { color: var(--custom-compat-icons-deck, rgba(255,255,255,0.84)); }
          /* Verdict icons: picks up CSS Loader "Colored Compatibility Icons" theme vars from :root */
          .ds-compat-verified .ds-compat-verdict-icon { color: var(--custom-compat-icons-verified, rgb(89, 191, 64)); }
          .ds-compat-playable .ds-compat-verdict-icon { color: var(--custom-compat-icons-playable, rgb(255, 200, 44)); }
          .ds-compat-unsupported .ds-compat-verdict-icon { color: var(--custom-compat-icons-unsupported, rgb(220, 222, 223)); }
          .ds-compat-unknown .ds-compat-verdict-icon { color: var(--custom-compat-icons-unknown, rgba(255,255,255,0.4)); }
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
            font-size: inherit;
            line-height: 1.2;
            font-weight: bold;
            white-space: nowrap;
            overflow: visible;
          }
          .ds-card-status {
            display: flex;
            align-items: center;
            gap: 6px;
            opacity: 0.7;
            font-size: 0.75em;
            line-height: 1.3;
            font-weight: bold;
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
          /* Featured (highlight-first) card: label always visible */
          .ds-card.ds-card--featured .ds-card-label { opacity: 1 !important; }
          .ds-card.ds-card--featured .ds-card-art img { object-position: center top; }
        `;
        doc.head.appendChild(style);
      }

      try {
        doc.documentElement.style.removeProperty('--ds-native-heading-color');
        const headings = doc.querySelectorAll('h2[class], h3[class]');
        for (const h of Array.from(headings)) {
          const cls = (h as HTMLElement).className || '';
          if (/_[A-Za-z0-9_-]{5,}/.test(cls)) {
            const c = getComputedStyle(h as HTMLElement).color;
            if (!c || c === 'rgb(0, 0, 0)' || c === 'rgba(0, 0, 0, 0)') continue;
            const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (m) {
              const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
              const max = Math.max(r, g, b);
              const sat = max > 0 ? (max - Math.min(r, g, b)) / max : 0;
              if (sat < 0.25) continue;
            }
            doc.documentElement.style.setProperty('--ds-native-heading-color', c);
            break;
          }
        }
      } catch {}

    }
  } catch {}
}



function GameCard({ item, cardW = CARD_W, cardH = CARD_ART_H, artH: artHProp, featured = false }: { item: DeckRowItem; cardW?: number; cardH?: number; artH?: number; featured?: boolean }) {
  const t = i18n.t.bind(i18n);
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fallbackIdx = useRef(0);
  const appid = typeof item.id === "number" ? item.id : Number(item.appid ?? 0);
  // DeckRow passes the correct width for featured cards (native or ratio-derived); just use cardW.
  const featuredW = cardW;
  const artH = artHProp ?? cardH;

  const [nativeCardClass, setNativeCardClass] = useState('');

  useEffect(() => {
    function injectNativeClasses(): boolean {
      const doc = getPreferredSteamDocument();
      const map = doc ? getRuntimeClassMap(doc) : null;
      if (!map?.nativeCard) return false;
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
            try {
              const shimmer = cardRef.current.querySelector('.ds-card-shimmer') as HTMLElement | null;
              if (shimmer) {
                shimmer.style.display = 'none';
                shimmer.style.animation = 'none';
              }
            } catch (e) {}
          }
        } catch (e) {}
      } else {
        setNativeCardClass('');
      }
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
      // NOTE: do NOT apply nativeCardLabel / nativeCardLabelText classes to our
      // label elements — those native info bar classes carry Steam CSS side-effects
      // (display, height, position) that break card layout and context menus.
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
    if (featured && appid > 0) {
      // "Faixa" = landscape capsule 616×353. heroUrl (library_hero) as fallback.
      for (const u of getLandscapeUrls(appid)) urls.push(u);
      if (item.heroUrl && !urls.includes(item.heroUrl)) urls.push(item.heroUrl);
    } else {
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
    }
    return urls;
  }, [item.portraitUrl, item.heroUrl, appid, featured]);

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

  // Deck logo: uses --custom-compat-icons-deck CSS var if set by a theme (e.g. Colored Compatibility Icons)
  const deckLogoSvg = (
    <svg className="ds-compat-deck-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path opacity="0.84" fillRule="evenodd" clipRule="evenodd" d="M7.77715 4.30197C10.9241 4.30197 13.4752 6.85305 13.4752 9.99997C13.4752 13.1469 10.9241 15.698 7.77715 15.698V18.8889C12.6864 18.8889 16.666 14.9092 16.666 9.99997C16.666 5.09078 12.6864 1.11108 7.77715 1.11108V4.30197ZM7.77756 13.8889C9.92533 13.8889 11.6664 12.1477 11.6664 9.99997C11.6664 7.8522 9.92533 6.11108 7.77756 6.11108C5.62979 6.11108 3.88867 7.8522 3.88867 9.99997C3.88867 12.1477 5.62979 13.8889 7.77756 13.8889Z" fill="currentColor" />
    </svg>
  );
  // Verdict icons: color driven by our CSS rules (.ds-compat-verified/playable/unsupported .ds-compat-verdict-icon).
  // CSS Loader "Colored Compatibility Icons" theme overrides via --custom-compat-icons-* vars on :root.
  const checkmarkSvg = (
    <svg className="ds-compat-verdict-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M10 19C14.9706 19 19 14.9706 19 10C19 5.02944 14.9706 1 10 1C5.02944 1 1 5.02944 1 10C1 14.9706 5.02944 19 10 19ZM8.33342 11.9222L14.4945 5.76667L16.4556 7.72779L8.33342 15.8556L3.26675 10.7833L5.22786 8.82223L8.33342 11.9222Z" fill="currentColor" />
    </svg>
  );
  const infoCircleSvg = (
    <svg className="ds-compat-verdict-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M10 19C14.9706 19 19 14.9706 19 10C19 5.02944 14.9706 1 10 1C5.02944 1 1 5.02944 1 10C1 14.9706 5.02944 19 10 19ZM8.61079 9.44444V15H11.3886V9.44444H8.61079ZM9.07372 8.05245C9.34781 8.23558 9.67004 8.33333 9.99967 8.33333C10.4417 8.33333 10.8656 8.15774 11.1782 7.84518C11.4907 7.53262 11.6663 7.10869 11.6663 6.66667C11.6663 6.33703 11.5686 6.0148 11.3855 5.74072C11.2023 5.46663 10.942 5.25301 10.6375 5.12687C10.3329 5.00072 9.99783 4.96771 9.67452 5.03202C9.35122 5.09633 9.05425 5.25507 8.82116 5.48815C8.58808 5.72124 8.42934 6.01821 8.36503 6.34152C8.30072 6.66482 8.33373 6.99993 8.45988 7.30447C8.58602 7.60902 8.79964 7.86931 9.07372 8.05245Z" fill="currentColor" />
    </svg>
  );
  const xCircleSvg = (
    <svg className="ds-compat-verdict-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M14.1931 15.6064C13.0246 16.4816 11.5733 17 10.001 17C6.13498 17 3.00098 13.866 3.00098 10C3.00098 8.42766 3.51938 6.97641 4.39459 5.80783L14.1931 15.6064ZM15.6074 14.1922C16.4826 13.0236 17.001 11.5723 17.001 10C17.001 6.13401 13.867 3 10.001 3C8.42864 3 6.97739 3.5184 5.80881 4.39362L15.6074 14.1922ZM19.001 10C19.001 14.9706 14.9715 19 10.001 19C5.03041 19 1.00098 14.9706 1.00098 10C1.00098 5.02944 5.03041 1 10.001 1C14.9715 1 19.001 5.02944 19.001 10Z" fill="currentColor" />
    </svg>
  );


  // Only show badge for explicit Steam compat ratings (1-3).
  // Level 0 means "Unknown/Unrated" — includes non-Steam games and games with no data; don't show badge.
  const compatClass = compat === 3 ? "ds-compat ds-compat-verified"
    : compat === 2 ? "ds-compat ds-compat-playable"
    : compat === 1 ? "ds-compat ds-compat-unsupported"
    : "";

  return (
    <Focusable
      ref={cardRef}
      className={`ds-card${featured ? ' ds-card--featured' : ''}${nativeCardClass ? ` ${nativeCardClass}` : ''}`}
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
        width: featuredW,
        minWidth: featuredW,
        height: cardH,
        flexShrink: 0,
        padding: 0,
        margin: 0,
        background: "transparent",
        cursor: "pointer",
        overflow: "visible",
        ["--ds-card-art-h" as string]: artH < cardH ? `${artH}px` : "100%",
      }}
    >
      <div
        className="ds-card-art"
        style={{
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
            {compat === 3 ? checkmarkSvg : compat === 2 ? infoCircleSvg : xCircleSvg}
          </div>
        )}
      </div>
      <div
        className="ds-card-label"
        style={{
          position: "absolute",
          // When artH < cardH the label sits inside the card (native theme label area); otherwise below
          top: artH < cardH ? artH : "100%",
          left: 0,
          width: featuredW + 20,
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

function MoreCard({ item, cardW = CARD_W, cardH = CARD_ART_H }: { item: DeckRowItem; cardW?: number; cardH?: number }) {
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
        width: cardW,
        minWidth: cardW,
        height: cardH,
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
          width: cardW,
          height: cardH,
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

export function DeckRow({ title, items, shelfId, matchNativeSize = false, highlightFirst = false }: { title?: string; items: DeckRowItem[]; shelfId?: string; matchNativeSize?: boolean; highlightFirst?: boolean }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(() => shelfId ? readCollapsed(shelfId) : false);
  const [nativeRowClass, setNativeRowClass] = useState('');
  const [, forceUpdate] = useState(0);

  const effectiveW = matchNativeSize && cachedNativeDims ? cachedNativeDims.width : CARD_W;
  const effectiveH = matchNativeSize && cachedNativeDims ? cachedNativeDims.height : CARD_ART_H;
  const effectiveGap = matchNativeSize && cachedNativeDims ? cachedNativeDims.gap : CARD_GAP;
  // Featured card: use native featured dims when matchNativeSize; otherwise derive width from portrait height ratio
  const effectiveFeaturedW = matchNativeSize && cachedNativeDims?.featuredWidth
    ? cachedNativeDims.featuredWidth
    : Math.round(effectiveH * (460 / 215));
  // Featured card height: same as regular cards (landscape card is wider, not taller)
  const effectiveFeaturedH = matchNativeSize && cachedNativeDims?.featuredHeight
    ? cachedNativeDims.featuredHeight
    : effectiveH;
  // Art area height: native imgHeight if available (may be < cardH when theme reserves label space inside card)
  const effectiveArtH = matchNativeSize && cachedNativeDims?.imgHeight
    ? cachedNativeDims.imgHeight
    : effectiveH;
  const effectiveFeaturedArtH = matchNativeSize && cachedNativeDims?.featuredImgHeight
    ? cachedNativeDims.featuredImgHeight
    : effectiveFeaturedH;

  useEffect(() => {
    ensureStyles();
    const interval = setInterval(ensureStyles, 3000);
    const onResize = () => ensureStyles();
    window.addEventListener('resize', onResize);
    // Re-render when native dims change (e.g. theme applied/removed)
    const onDimsChange = () => forceUpdate(n => n + 1);
    nativeDimsListeners.add(onDimsChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
      nativeDimsListeners.delete(onDimsChange);
    };
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
