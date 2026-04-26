import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";
import { getPortraitFallbacks, getLandscapeUrls } from "../../core/steamAssets";
import { logInfo } from "../../runtime/logger";
import i18n from "../../i18n";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { formatPlaytime } from "./shelfStyles";
import { PlaceholderCard } from "./PlaceholderCard";
import { resolveNativeCardClass } from "./cardUtils";

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
  <svg className="ds-compat-deck-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path opacity="0.84" fillRule="evenodd" clipRule="evenodd" d="M7.77715 4.30197C10.9241 4.30197 13.4752 6.85305 13.4752 9.99997C13.4752 13.1469 10.9241 15.698 7.77715 15.698V18.8889C12.6864 18.8889 16.666 14.9092 16.666 9.99997C16.666 5.09078 12.6864 1.11108 7.77715 1.11108V4.30197ZM7.77756 13.8889C9.92533 13.8889 11.6664 12.1477 11.6664 9.99997C11.6664 7.8522 9.92533 6.11108 7.77756 6.11108C5.62979 6.11108 3.88867 7.8522 3.88867 9.99997C3.88867 12.1477 5.62979 13.8889 7.77756 13.8889Z" fill="currentColor" />
  </svg>
);
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

export function GameCard({ item, cardW = CARD_W, cardH = CARD_ART_H, artH: artHProp, featured = false, hideStatusLine = false, hideNewBadge = false, hideCompatIcons = false, hideNonSteamBadge = false }: { item: DeckRowItem; cardW?: number; cardH?: number; artH?: number; featured?: boolean; hideStatusLine?: boolean; hideNewBadge?: boolean; hideCompatIcons?: boolean; hideNonSteamBadge?: boolean }) {
  const t = i18n.t.bind(i18n);
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fallbackIdx = useRef(0);
  const appid = typeof item.id === "number" ? item.id : Number(item.appid ?? 0);
  const featuredW = cardW;
  const artH = artHProp ?? cardH;

  const [nativeCardClass, setNativeCardClass] = useState('');
  const [imgFailed, setImgFailed] = useState(false);

  // Dedupe activation: Focusable fires onActivate + onOKButton + dispatches
  // vgp_onok (listened below), so a single A-press can invoke item.onActivate
  // up to 3× — pushing multiple history entries and requiring 2× B to exit.
  const lastActivateRef = useRef(0);
  const onActivateRef = useRef(item.onActivate);
  onActivateRef.current = item.onActivate;
  const activate = useCallback(() => {
    const now = Date.now();
    if (now - lastActivateRef.current < 400) return;
    lastActivateRef.current = now;
    onActivateRef.current?.();
  }, []);

  useEffect(() => {
    function injectNativeClasses(): boolean {
      const doc = getPreferredSteamDocument();
      const cls = resolveNativeCardClass(doc);
      if (cls === null) return false;
      setNativeCardClass(cls);
      const map = doc ? getRuntimeClassMap(doc) : null;
      const sampleSelector = map?.nativeCard ? buildSelectorFromToken(map.nativeCard) : null;
      const nativeSample = sampleSelector ? doc?.querySelector(`${sampleSelector}:not(.ds-card)`) as HTMLElement | null : null;
      if (nativeSample) {

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
            } catch (e) {
              logInfo("HOME", "injectNativeClasses: shimmer cleanup failed", String(e));
            }
          }
        } catch (e) {
          logInfo("HOME", "injectNativeClasses: animation read failed", String(e));
        }
      }
      if (!map) return true;
      const artEl = cardRef.current?.querySelector('.ds-card-art');
      if (artEl) {
        if (map.nativeCardArt && !artEl.classList.contains(map.nativeCardArt)) artEl.classList.add(map.nativeCardArt);
        if (map.nativeCardArtOuter && !artEl.classList.contains(map.nativeCardArtOuter)) artEl.classList.add(map.nativeCardArtOuter);
        if (map.nativeCardArtPortrait && !featured && !artEl.classList.contains(map.nativeCardArtPortrait)) artEl.classList.add(map.nativeCardArtPortrait);
      }
      if (imgRef.current) {
        if (map.nativeCardImg && !imgRef.current.classList.contains(map.nativeCardImg)) imgRef.current.classList.add(map.nativeCardImg);
        if (map.nativeCardImgFade && !imgRef.current.classList.contains(map.nativeCardImgFade)) imgRef.current.classList.add(map.nativeCardImgFade);
      }
      try {
        if (!nativeSample && map.nativeCard) {
          const maybe = doc.querySelector(buildSelectorFromToken(map.nativeCard) ?? '');
          if (maybe) {
            const pa = getComputedStyle(maybe, '::after');
            const animName = (pa.animationName || '').split(',')[0] || '';
            if (animName && animName !== 'none' && cardRef.current) cardRef.current.style.setProperty('--ds-native-after-animation', animName);
          }
        }
      } catch (e) {
        logInfo("HOME", "injectNativeClasses: fallback animation read failed", String(e));
      }
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
      activate();
    };
    el.addEventListener("vgp_onmenubutton", menuHandler);
    el.addEventListener("contextmenu", menuHandler);
    el.addEventListener("vgp_onok", activateHandler);
    return () => {
      el.removeEventListener("vgp_onmenubutton", menuHandler);
      el.removeEventListener("contextmenu", menuHandler);
      el.removeEventListener("vgp_onok", activateHandler);
    };
  }, [item.onMenuButton, activate]);

  const allUrls = useMemo(() => {
    const urls: string[] = [];
    if (featured && appid > 0) {
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
    setImgFailed(false);
    if (imgRef.current && allUrls[0]) {
      imgRef.current.src = allUrls[0];
    }
  }, [allUrls]);

  const onImgError = useCallback(() => {
    fallbackIdx.current += 1;
    if (imgRef.current && fallbackIdx.current < allUrls.length) {
      imgRef.current.src = allUrls[fallbackIdx.current];
    } else {
      setImgFailed(true);
    }
  }, [allUrls]);

  const firstUrl = allUrls[0] ?? "";

  // If all image URLs failed, render PlaceholderCard instead
  if (imgFailed || !firstUrl) {
    return <PlaceholderCard item={item} cardW={cardW} cardH={cardH} featured={featured} />;
  }

  const compat = item.deckCompatCategory ?? 0;
  const playtime = formatPlaytime(item.playtimeMinutes);

  const isNonSteam = item.isSteam === false;
  const suppressCompat = hideCompatIcons || (hideNonSteamBadge && isNonSteam);
  const compatClass = suppressCompat ? "" :
    compat === 3 ? "ds-compat ds-compat-verified"
    : compat === 2 ? "ds-compat ds-compat-playable"
    : compat === 1 ? "ds-compat ds-compat-unsupported"
    : "";
  const showNewBadge = !hideNewBadge && item.isNew === true;

  return (
    <Focusable
      ref={cardRef}
      className={`ds-card${featured ? ' ds-card--featured' : ''}${nativeCardClass ? ` ${nativeCardClass}` : ''}${hideCompatIcons ? ' ds-card--hide-compat' : ''}${hideNonSteamBadge ? ' ds-card--hide-non-steam-badge' : ''}`}
      focusClassName="gpfocus"
      role="listitem"
      onActivate={activate}
      onOKButton={activate}
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
        // Per-card height/width ratio used by the TiltedHome compat CSS to
        // compute the exact zoom scale that covers the skewed parallelogram
        // — featured (landscape) and portrait cards need different scale
        // factors. Reflects the live rendered dimensions, so any screen-size
        // or theme-driven dim change automatically reaches the calc().
        ["--ds-card-h-w-ratio" as string]: featuredW > 0 ? (cardH / featuredW).toFixed(4) : "1.5",
      }}
    >
      <div
        className="ds-card-art"
        style={{
          background: "var(--ds-card-bg, rgba(3, 10, 30, 0.92))",
          overflow: "hidden",
        }}
      >
        <img
          ref={imgRef}
          src={firstUrl}
          alt={item.name}
          onError={onImgError}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          loading="lazy"
        />
        <div className="ds-card-shimmer" aria-hidden="true" />
        {compatClass && (
          <div className={compatClass}>
            {deckLogoSvg}
            {compat === 3 ? checkmarkSvg : compat === 2 ? infoCircleSvg : xCircleSvg}
          </div>
        )}
        {showNewBadge && (
          <div className="ds-new-badge-band">
            <div className="ds-new-badge">{t('badge_new')}</div>
          </div>
        )}
      </div>
      <div
        className={`ds-card-label${hideStatusLine ? ' ds-card-label--compact' : ''}`}
        style={{
          position: "absolute",
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
        {!hideStatusLine && (() => {
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
