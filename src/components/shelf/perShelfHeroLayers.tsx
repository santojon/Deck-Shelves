import { type ReactNode } from "react";
import { getHotCachedImageSrc } from "../../core/imageCache";
import { resolveOverlayPositionStyle, resolveOverlayOffset, type HorizontalPosition } from "./perShelfHeroHelpers";

export const slotLoaded = (src: string | null, loadedSrc: string | null): boolean => !!src && loadedSrc === src;

export function resolveLogoSrc(logoUrls: string[], idx: number): string | null {
  const u = logoUrls[idx];
  return u ? (getHotCachedImageSrc(u) || u) : null;
}

type OverlayFlags = { hasFocusedApp: boolean; wantsLogo: boolean; hasRealLogo: boolean; wantsDescriptionBelowLogo: boolean; showOverlayContainer: boolean };

export function overlayFlags(a: { enableLogo: boolean; enableDescription: boolean; descriptionBelowLogo: boolean; focusedAppid: number; logoSrc: string | null; overlayDescription: string | null }): OverlayFlags {
  const hasFocusedApp = a.focusedAppid > 0;
  const wantsLogo = a.enableLogo && hasFocusedApp;
  const hasRealLogo = wantsLogo && !!a.logoSrc;
  const wantsDescriptionBelowLogo = a.enableDescription && !!a.overlayDescription && a.descriptionBelowLogo && hasFocusedApp;
  return { hasFocusedApp, wantsLogo, hasRealLogo, wantsDescriptionBelowLogo, showOverlayContainer: wantsLogo || wantsDescriptionBelowLogo };
}

export function visibleLayers(a: { showArt: boolean; slotA: string | null; slotB: string | null; needsLabel: boolean; labelNode: HTMLElement | null; showOverlayContainer: boolean }) {
  const hasArt = a.showArt && !!(a.slotA || a.slotB);
  const showLabel = a.needsLabel && !!a.labelNode;
  return { hasArt, showLabel, nothing: !hasArt && !showLabel && !a.showOverlayContainer };
}

type HeroSlotProps = {
  src: string | null;
  active: boolean;
  loaded: boolean;
  innerClass: string | null;
  zoomClass: string | null;
  imgClass: string | null;
  onLoaded: (src: string) => void;
  onError: () => void;
};

export function HeroSlot({ src, active, loaded, innerClass, zoomClass, imgClass, onLoaded, onError }: HeroSlotProps) {
  if (!src) return null;
  const eagerLoaded = (el: HTMLImageElement | null) => {
    if (el && el.complete && (el.naturalWidth || 0) > 0 && !loaded) onLoaded(src);
  };
  // Steam's CDN sometimes answers 200 with a placeholder body that still fires onLoad.
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if ((img.naturalWidth || 0) > 0 && (img.naturalHeight || 0) > 0) onLoaded(src);
    else onError();
  };
  return (
    <div className={innerClass ?? undefined} style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      opacity: active ? 1 : 0,
      transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83), transform 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
      transform: active ? 'scale(1)' : 'scale(1.03)',
    }}>
      <div className={zoomClass ?? undefined} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {/* Large hero images would otherwise decode on the main thread. */}
        <img src={src} onError={onError} decoding="async" ref={eagerLoaded} onLoad={onLoad}
          className={`ds-per-shelf-hero-img${loaded ? ' is-loaded' : ''}${imgClass ? ' ' + imgClass : ''}`}
          style={{
            width: '100%', height: '100%', display: 'block',
            objectPosition: '50% 18%',
            animation: zoomClass ? 'none' : undefined,
          }} />
      </div>
    </div>
  );
}

type HeroArtProps = {
  rootClass: string | null;
  isFullPage: boolean;
  isFirstShelf: boolean;
  topBleed: number;
  heroHeight: string;
  maskVal: string;
  shown: boolean;
  children: ReactNode;
};

export function HeroArt({ rootClass, isFullPage, isFirstShelf, topBleed, heroHeight, maskVal, shown, children }: HeroArtProps) {
  return (
    <div className={rootClass ?? undefined} data-ds-per-shelf-hero="true" data-ds-hero-full-page={isFullPage ? 'true' : undefined} style={{
      position: 'absolute',
      top: `var(--ds-hero-top, ${isFirstShelf ? '0px' : `${topBleed}px`})`,
      height: `var(--ds-hero-h, ${isFirstShelf ? '100%' : heroHeight})`,
      left: 0, right: 0,
      zIndex: -1,
      pointerEvents: 'none',
      overflow: 'hidden',
      opacity: shown ? 1 : 0,
      transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
      maskImage: `var(--ds-hero-mask, ${maskVal})`,
      WebkitMaskImage: `var(--ds-hero-mask, ${maskVal})`,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--obsidian-main-color,var(--ds-page-bg,rgb(0,0,0)))' }} />
      {children}
    </div>
  );
}

// A sibling, not a child: the art's z-index:-1 stacking context would trap the label behind the cards.
export function PromotedLabel({ mountRef, left, bottom, visible }: { mountRef: React.RefObject<HTMLDivElement | null>; left: number; bottom: number; visible: boolean }) {
  return (
    <div
      ref={mountRef}
      className="ds-promoted-hero-label"
      style={{
        position: 'absolute',
        left,
        bottom,
        width: 'max-content',
        maxWidth: '100%',
        zIndex: 20,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s cubic-bezier(0.17,0.45,0.14,0.83), left 0.2s ease',
      }}
    />
  );
}

const descriptionAlign = (pos: HorizontalPosition) => pos === 'left' ? 'flex-start' : pos === 'right' ? 'flex-end' : 'center';

const overlayAnchor = (logoBelowShelf: boolean, offset: string | number) =>
  logoBelowShelf ? { top: 'auto' as const, bottom: offset } : { top: offset, bottom: undefined };

type HeroOverlayProps = {
  logoPosition: HorizontalPosition;
  descriptionPosition: HorizontalPosition;
  logoBelowShelf: boolean;
  isFullPage: boolean;
  logoTopOffset: number;
  logoSize: number;
  descriptionHeight: number;
  descriptionLogoGap: number;
  visible: boolean;
  flags: OverlayFlags;
  logoSrc: string | null;
  onLogoError: () => void;
  description: string | null;
};

export function HeroOverlay(p: HeroOverlayProps) {
  const pos = resolveOverlayPositionStyle(p.logoPosition);
  const anchor = overlayAnchor(p.logoBelowShelf, resolveOverlayOffset(p.logoTopOffset, p.isFullPage));
  const logoMax = p.isFullPage ? `${(28 * p.logoSize / 100).toFixed(2)}vh` : `${Math.round(130 * p.logoSize / 100)}px`;
  const lines = Math.max(1, Math.min(3, p.descriptionHeight));
  return (
    <div
      className="ds-shelf-logo-overlay"
      data-ds-position={p.logoPosition}
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: pos.left,
        right: pos.right,
        transform: pos.transform,
        top: anchor.top,
        bottom: anchor.bottom,
        zIndex: 21,
        pointerEvents: 'none',
        opacity: p.visible ? 1 : 0,
        transition: 'opacity 0.4s cubic-bezier(0.17,0.45,0.14,0.83)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: pos.alignItems,
        textAlign: p.logoPosition,
      }}
    >
      {p.flags.wantsLogo && (p.flags.hasRealLogo ? (
        <img
          src={p.logoSrc!}
          alt=""
          onError={p.onLogoError}
          style={{ maxWidth: '100%', maxHeight: logoMax, objectFit: 'contain', filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.75))' }}
        />
      ) : (
        <div aria-hidden="true" style={{ width: 1, height: logoMax }} />
      ))}
      {p.flags.wantsDescriptionBelowLogo && (
        <div
          className="ds-shelf-logo-description"
          style={{
            marginTop: p.flags.wantsLogo ? p.descriptionLogoGap : 0,
            maxWidth: 'min(calc(var(--ds-eff-card-w, 188px) * 4 + var(--ds-eff-card-gap, 16px) * 3), 72vw)',
            fontSize: 'calc(0.74em * var(--ds-eff-desc-scale, 1))',
            lineHeight: 1.2,
            color: 'rgba(255,255,255,0.85)',
            textShadow: '0 2px 8px rgba(0,0,0,0.7)',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical' as any,
            WebkitLineClamp: lines,
            lineClamp: lines,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textAlign: p.descriptionPosition,
            alignSelf: descriptionAlign(p.descriptionPosition),
          }}
        >
          {p.description}
        </div>
      )}
    </div>
  );
}
