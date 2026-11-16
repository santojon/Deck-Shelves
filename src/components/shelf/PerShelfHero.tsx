import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import { getPreferredSteamDocument, getAllSteamDocuments } from "../../runtime/steamHost";
import { isArtHeroActive, isBigArtModeActive } from "../../core/cssLoaderDetect";
import { getRuntimeClassMap } from "../../core/webpackCompat";
import { getLandscapeUrls, getPortraitUrls, getHeroUrls as getCentralHeroUrls, getLogoUrls, getAppAssetCacheKey } from "../../core/steamAssets";
import { getHotCachedImageSrc, warmCacheBackground, firstCacheableUrl } from "../../core/imageCache";
import { getAppDescriptions, preloadAppDescriptions } from "../../steam/appDescriptionsCache";
import { computeHeroVisualGeometry, resolveOverlayPositionStyle, resolveOverlayOffset, findFirstVisibleCard, type HorizontalPosition } from "./perShelfHeroHelpers";
import { withDefaults } from "../withDefaults";
import { subscribeSessionState, getSessionState } from "../../runtime/sessionState";
import { reuseHeroLabel, isHeroLabelOutputMutation, heroLabelAlign, heroLabelLeft } from "./perShelfHeroLabel";

let _nativeAssetProto: any = null;

function findAssetProtoInFiber(fiber: any): any {
  let f = fiber;
  let depth = 0;
  while (f && depth < 8) {
    const p = f.memoizedProps;
    if (p && "eAssetType" in p && f.stateNode) {
      const proto = Object.getPrototypeOf(f.stateNode);
      if (typeof proto?.GetSourcesForAsset === "function") return proto;
    }
    f = f.return;
    depth++;
  }
  return null;
}

function fiberOf(img: HTMLImageElement): any {
  const fiberKey = Object.keys(img).find(k => k.startsWith("__reactFiber$"));
  return fiberKey ? (img as any)[fiberKey] : null;
}

function findAssetProtoInDoc(doc: Document): any {
  const imgs = doc.querySelectorAll("img");
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i] as HTMLImageElement;
    if (img.closest(".ds-card, .ds-per-shelf-hero-img")) continue;
    const fiber = fiberOf(img);
    if (!fiber) continue;
    const proto = findAssetProtoInFiber(fiber);
    if (proto) return proto;
  }
  return null;
}

function findNativeAssetProto(): any {
  if (_nativeAssetProto && typeof _nativeAssetProto.GetSourcesForAsset === "function") {
    return _nativeAssetProto;
  }
  _nativeAssetProto = null;
  try {
    for (const doc of getAllSteamDocuments()) {
      const proto = findAssetProtoInDoc(doc);
      if (proto) { _nativeAssetProto = proto; return proto; }
    }
  } catch {}
  return null;
}

// Only schemes safe for <img src>; anything else returns null.
const SAFE_HERO_SCHEMES = new Set(["http:", "https:", "blob:", "file:"]);
function sanitizeHeroUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Rebuilt through URL so HTML meta-characters come out escaped.
  const base = (typeof location !== "undefined" && location.origin) ? location.origin : "https://steamloopback.host";
  let u: URL;
  try { u = new URL(s, base); } catch { return null; }
  const proto = u.protocol.toLowerCase();
  if (SAFE_HERO_SCHEMES.has(proto)) return u.href;
  // `data:` restricted to image MIME types so a `data:text/html,...` payload can't sneak in.
  if (proto === "data:" && u.href.toLowerCase().startsWith("data:image/")) return u.href;
  return null;
}

function hashStringFastForHero(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  // Keeps the negated value clear of the Steam appid range.
  return ((h % 1_000_000) + 1);
}

function getNativeHeroUrls(appid: number): string[] | null {
  try {
    const app: any = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid);
    if (!app) return null;
    const proto = findNativeAssetProto();
    if (!proto) return null;
    const fake = Object.create(proto);
    fake.props = { app, eAssetType: 1 };
    const sources = fake.GetSourcesForAsset();
    if (!Array.isArray(sources) || !sources.length) return null;
    return sources.filter(
      (s: any) => typeof s === "string" && s && !s.startsWith("/images/default")
    );
  } catch { return null; }
}

function prefetchNativeAppData(appid: number): void {
  try {
    const app: any = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid);
    if (!app) return;
    const proto = findNativeAssetProto();
    if (!proto || typeof proto.RegisterForAppDetails !== "function") return;
    const fake = Object.create(proto);
    fake.props = { app, eAssetType: 1 };
    // The handle is left dangling on purpose: the registration only subscribes.
    fake.RegisterForAppDetails();
  } catch {}
}

function getHeroUrls(appid: number): string[] {
  const base = getCentralHeroUrls(appid);
  const native = getNativeHeroUrls(appid);
  if (!native || !native.length) return base;
  const merged = base.slice();
  for (const u of native) if (!merged.includes(u)) merged.push(u);
  return merged;
}

function tryHotCache(url: string | null): string | null {
  if (!url) return null;
  try { return getHotCachedImageSrc(url); } catch { return null; }
}

function resolveHeroSrcFromCache(url0: string | null, urls: ReadonlyArray<string>): string | null {
  const hotUrl0 = tryHotCache(url0);
  if (hotUrl0) return hotUrl0;
  const warmTarget = firstCacheableUrl(urls);
  if (warmTarget) { try { warmCacheBackground(warmTarget); } catch {} }
  return url0;
}


type NativeHeroClasses = {
  imgClass: string | null;
  zoomClass: string | null;
  innerClass: string | null;
  rootClass: string | null;
};
const EMPTY_HERO_CLASSES: NativeHeroClasses = { imgClass: null, zoomClass: null, innerClass: null, rootClass: null };
let nativeHeroClasses: NativeHeroClasses = EMPTY_HERO_CLASSES;
const nativeHeroSubscribers = new Set<(c: NativeHeroClasses) => void>();
let nativeHeroDiscoveryStarted = false;
let nativeHeroLastDiscoverAt = 0;
let nativeHeroDiscoverPending: any = null;

function nativeHeroClassesEqual(a: NativeHeroClasses, b: NativeHeroClasses): boolean {
  return a.imgClass === b.imgClass && a.zoomClass === b.zoomClass && a.innerClass === b.innerClass && a.rootClass === b.rootClass;
}

function publishNativeHeroClasses(next: NativeHeroClasses): void {
  if (nativeHeroClassesEqual(nativeHeroClasses, next)) return;
  nativeHeroClasses = next;
  for (const cb of nativeHeroSubscribers) {
    try { cb(next); } catch {}
  }
}

function isCandidateHeroImg(img: HTMLImageElement): boolean {
  if (img.closest('.ds-card, .ds-per-shelf-hero-img')) return false;
  const r = img.getBoundingClientRect();
  return r.width >= 400 && r.height >= 120;
}

function classOf(node: Element): string {
  return ((node.className as any) || '').toString().trim();
}

function ancestorHasMask(cs: CSSStyleDeclaration): boolean {
  const wm = (cs as any).webkitMaskImage;
  return !!((cs.maskImage && cs.maskImage !== 'none') || (wm && wm !== 'none'));
}

function ancestorHasAnimation(cs: CSSStyleDeclaration): boolean {
  return !!(cs.animationName && cs.animationName !== 'none');
}

type HeroClassAccumulator = { zoomClass: string | null; innerClass: string | null; rootClass: string | null };

function canBeZoomClass(acc: HeroClassAccumulator, cs: CSSStyleDeclaration, cls: string): boolean {
  return !acc.zoomClass && !acc.innerClass && !!cls && ancestorHasAnimation(cs);
}

function classifyAncestor(acc: HeroClassAccumulator, cs: CSSStyleDeclaration, cls: string): void {
  if (canBeZoomClass(acc, cs, cls)) { acc.zoomClass = cls; return; }
  if (!acc.innerClass && ancestorHasMask(cs)) { acc.innerClass = cls || null; return; }
  if (acc.innerClass && !acc.rootClass && cls) acc.rootClass = cls;
}

function walkAncestorHeroClasses(win: Window, img: HTMLImageElement): HeroClassAccumulator {
  let node: HTMLElement | null = img.parentElement;
  const acc: HeroClassAccumulator = { zoomClass: null, innerClass: null, rootClass: null };
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    classifyAncestor(acc, win.getComputedStyle(node), classOf(node));
  }
  return acc;
}

function findNativeHeroClassesInDoc(doc: Document): NativeHeroClasses | null {
  const win = doc.defaultView ?? window;
  const imgs = doc.querySelectorAll<HTMLImageElement>('img');
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i];
    if (!isCandidateHeroImg(img)) continue;
    const { zoomClass, innerClass, rootClass } = walkAncestorHeroClasses(win, img);
    if (innerClass || zoomClass) {
      return { imgClass: classOf(img) || null, zoomClass, innerClass, rootClass };
    }
  }
  return null;
}

function discoverNativeHeroClasses(): NativeHeroClasses {
  if (!isArtHeroActive() && !isBigArtModeActive()) return EMPTY_HERO_CLASSES;
  try {
    for (const doc of getAllSteamDocuments()) {
      const found = findNativeHeroClassesInDoc(doc);
      if (found) return found;
    }
  } catch {}
  return embeddedHeroClassesFallback();
}

function embeddedHeroClassesFallback(): NativeHeroClasses {
  try {
    const map = getRuntimeClassMap(getPreferredSteamDocument());
    if (map?.heroRoot || map?.heroInner) {
      return { imgClass: null, zoomClass: null, innerClass: map.heroInner ?? null, rootClass: map.heroRoot ?? null };
    }
  } catch {}
  return EMPTY_HERO_CLASSES;
}

function scheduleNativeHeroDiscovery(): void {
  if (nativeHeroDiscoverPending != null) return;
  nativeHeroDiscoverPending = requestAnimationFrame(() => {
    nativeHeroDiscoverPending = null;
    nativeHeroLastDiscoverAt = Date.now();
    publishNativeHeroClasses(discoverNativeHeroClasses());
  });
}

function startNativeHeroDiscovery(): void {
  if (nativeHeroDiscoveryStarted) return;
  nativeHeroDiscoveryStarted = true;
  scheduleNativeHeroDiscovery();
  setTimeout(scheduleNativeHeroDiscovery, 1200);
  setTimeout(scheduleNativeHeroDiscovery, 3000);
  const doc = getPreferredSteamDocument();
  const head = doc?.head ?? doc?.documentElement;
  if (head) {
    const mo = new MutationObserver(scheduleNativeHeroDiscovery);
    mo.observe(head, { childList: true });
    // Never disconnected: discovery is a singleton bound to the BigPicture head.
  }
}

function useNativeHeroClasses(applyGate: boolean): NativeHeroClasses {
  const [state, setState] = useState<NativeHeroClasses>(applyGate ? nativeHeroClasses : EMPTY_HERO_CLASSES);
  useEffect(() => {
    if (!applyGate) {
      setState(EMPTY_HERO_CLASSES);
      return;
    }
    startNativeHeroDiscovery();
    const cb = (next: NativeHeroClasses) => setState(next);
    nativeHeroSubscribers.add(cb);
    setState(nativeHeroClasses);
    if (Date.now() - nativeHeroLastDiscoverAt > 5000) {
      scheduleNativeHeroDiscovery();
    }
    return () => { nativeHeroSubscribers.delete(cb); };
  }, [applyGate]);
  return state;
}

type PerShelfHeroProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  showArt: boolean;
  isFirstShelf: boolean;
  forceLayoutAsRecents: boolean;
  isFullPage?: boolean;
  enableLogo?: boolean;
  enableDescription?: boolean;
  descriptionBelowLogo?: boolean;
  logoBelowShelf?: boolean;
  logoPosition?: HorizontalPosition;
  descriptionPosition?: HorizontalPosition;
  logoSize?: number;
  logoTopOffset?: number;
  descriptionHeight?: number;
  descriptionLogoGap?: number;
  infoAbove?: boolean;
};

const HERO_DEFAULTS = {
  isFullPage: false, enableLogo: false, enableDescription: false, descriptionBelowLogo: false, logoBelowShelf: false,
  logoPosition: 'left', descriptionPosition: 'left', logoSize: 100, logoTopOffset: 20, descriptionHeight: 2, descriptionLogoGap: 10, infoAbove: false,
} as const satisfies Partial<PerShelfHeroProps>;

type Slot = 'A' | 'B';

type HeroSwapState = {
  activeSlot: Slot;
  currentKey: number;
  fallbackIdx: number;
  urls: string[];
  userHasFocused: boolean;
  swapTimer: any;
  firstSwap: boolean;
};

type SlotSetters = { setSlot: (slot: Slot, url: string | null) => void; setPending: (slot: Slot) => void };

const freshHeroState = (): HeroSwapState => ({ activeSlot: 'A', currentKey: 0, fallbackIdx: 0, urls: [], userHasFocused: false, swapTimer: null, firstSwap: true });

function stageNextSlot(hero: HeroSwapState, setters: SlotSetters, url: string | null): void {
  const next: Slot = hero.activeSlot === 'A' ? 'B' : 'A';
  setters.setSlot(next, url);
  setters.setPending(next);
}

function debounceSwap(hero: HeroSwapState, doSwap: () => void): void {
  if (hero.swapTimer) clearTimeout(hero.swapTimer);
  const wasFirst = hero.firstSwap;
  hero.firstSwap = false;
  if (wasFirst) doSwap();
  else hero.swapTimer = setTimeout(doSwap, 30);
}

function swapSynthHero(hero: HeroSwapState, setters: SlotSetters, synthHero: string, synthKey: number): void {
  debounceSwap(hero, () => {
    hero.swapTimer = null;
    if (hero.currentKey !== synthKey) return;
    hero.urls = [synthHero];
    hero.fallbackIdx = 0;
    stageNextSlot(hero, setters, synthHero);
  });
}

function refineHeroLater(hero: HeroSwapState, setters: SlotSetters, appid: number, url0: string | null): void {
  setTimeout(() => {
    if (hero.currentKey !== appid) return;
    const fresh = getHeroUrls(appid);
    const newFirst = fresh[0] ?? null;
    if (!newFirst || newFirst === url0) return;
    hero.urls = fresh;
    hero.fallbackIdx = 0;
    setters.setSlot(hero.activeSlot, resolveHeroSrcFromCache(newFirst, fresh));
  }, 700);
}

function swapAppHero(hero: HeroSwapState, setters: SlotSetters, appid: number): void {
  debounceSwap(hero, () => {
    hero.swapTimer = null;
    if (hero.currentKey !== appid) return;
    prefetchNativeAppData(appid);
    const native = getNativeHeroUrls(appid);
    const urls = (native && native.length) ? native : getHeroUrls(appid);
    const usedNative = urls === native;
    hero.urls = urls;
    hero.fallbackIdx = 0;
    const url0 = urls[0] ?? null;
    stageNextSlot(hero, setters, resolveHeroSrcFromCache(url0, urls));
    if (!usedNative) refineHeroLater(hero, setters, appid, url0);
  });
}

function resolveFocusedCard(el: HTMLElement, e: Event | undefined, focusedAnyCard: HTMLElement | null, hero: HeroSwapState): HTMLElement | null {
  let focused: HTMLElement | null = null;
  if (e && e.target instanceof HTMLElement)
    focused = e.target.closest('.ds-card[data-appid], .ds-card[data-ds-hero-url]') as HTMLElement | null;
  if (!focused) focused = focusedAnyCard;
  if (focused) { hero.userHasFocused = true; return focused; }
  if (hero.userHasFocused) {
    const trackedGone = hero.currentKey > 0 && !el.querySelector(`.ds-card[data-appid="${hero.currentKey}"]`);
    if (!trackedGone) return null;
    hero.userHasFocused = false;
  }
  return findFirstVisibleCard(el.querySelectorAll<HTMLElement>('.ds-card[data-appid]'));
}

function labelLeftOf(el: HTMLElement, card: HTMLElement, label: HTMLElement | null): number | null {
  try {
    return heroLabelLeft(el.getBoundingClientRect(), card.getBoundingClientRect(), label?.offsetWidth ?? 0, heroLabelAlign(card));
  } catch { return null; }
}

function readForceThemes(): boolean {
  try {
    const raw = (globalThis as any).localStorage?.getItem('deck-shelves-settings-cache-v3');
    if (!raw) return false;
    return JSON.parse(raw)?.forceCssLoaderThemes === true;
  } catch { return false; }
}

function heroThemeGate(isPromoted: boolean): boolean {
  return (isArtHeroActive() || isBigArtModeActive()) && (readForceThemes() || isPromoted);
}

const slotLoaded = (src: string | null, loadedSrc: string | null): boolean => !!src && loadedSrc === src;

function resolveLogoSrc(logoUrls: string[], idx: number): string | null {
  const u = logoUrls[idx];
  return u ? (getHotCachedImageSrc(u) || u) : null;
}

type OverlayFlags = { hasFocusedApp: boolean; wantsLogo: boolean; hasRealLogo: boolean; wantsDescriptionBelowLogo: boolean; showOverlayContainer: boolean };

function overlayFlags(a: { enableLogo: boolean; enableDescription: boolean; descriptionBelowLogo: boolean; focusedAppid: number; logoSrc: string | null; overlayDescription: string | null }): OverlayFlags {
  const hasFocusedApp = a.focusedAppid > 0;
  const wantsLogo = a.enableLogo && hasFocusedApp;
  const hasRealLogo = wantsLogo && !!a.logoSrc;
  const wantsDescriptionBelowLogo = a.enableDescription && !!a.overlayDescription && a.descriptionBelowLogo && hasFocusedApp;
  return { hasFocusedApp, wantsLogo, hasRealLogo, wantsDescriptionBelowLogo, showOverlayContainer: wantsLogo || wantsDescriptionBelowLogo };
}

function visibleLayers(a: { showArt: boolean; slotA: string | null; slotB: string | null; needsLabel: boolean; labelNode: HTMLElement | null; showOverlayContainer: boolean }) {
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

function HeroSlot({ src, active, loaded, innerClass, zoomClass, imgClass, onLoaded, onError }: HeroSlotProps) {
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

function HeroArt({ rootClass, isFullPage, isFirstShelf, topBleed, heroHeight, maskVal, shown, children }: HeroArtProps) {
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
function PromotedLabel({ mountRef, left, bottom, visible }: { mountRef: React.RefObject<HTMLDivElement | null>; left: number; bottom: number; visible: boolean }) {
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

function HeroOverlay(p: HeroOverlayProps) {
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

function PerShelfHero(props: PerShelfHeroProps) {
  const p = withDefaults(props, HERO_DEFAULTS);
  const { containerRef, showArt, isFirstShelf, forceLayoutAsRecents, isFullPage, enableLogo, enableDescription, descriptionBelowLogo, infoAbove } = p;
  const [gameRunning, setGameRunning] = useState(() => getSessionState().gameRunning);
  useEffect(() => subscribeSessionState(() => setGameRunning(getSessionState().gameRunning)), []);
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<Slot>('A');
  const [focusedAppid, setFocusedAppid] = useState<number>(0);
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const [visible, setVisible] = useState(true);
  const [topBleed, setTopBleed] = useState(-90);
  const [labelNode, setLabelNode] = useState<HTMLElement | null>(null);
  const labelMountRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = labelMountRef.current;
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    if (labelNode) host.appendChild(labelNode);
  }, [labelNode, infoAbove]);
  const needsLabel = infoAbove;
  const [rowH, setRowH] = useState(310);
  const [labelLeft, setLabelLeft] = useState(40);
  const [isPromoted, setIsPromoted] = useState(false);
  const [isShelfSelected, setIsShelfSelected] = useState(false);
  const heroClasses = useNativeHeroClasses(heroThemeGate(isPromoted));
  const heroRef = useRef<HeroSwapState | null>(null);
  if (heroRef.current === null) heroRef.current = freshHeroState();
  const hero = heroRef.current;
  useEffect(() => { hero.activeSlot = activeSlot; }, [activeSlot, hero]);
  const setters = useMemo<SlotSetters>(() => ({
    setSlot: (slot, url) => { if (slot === 'A') setSlotA(url); else setSlotB(url); },
    setPending: setPendingSlot,
  }), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const root = el.closest('.deck-shelves-root');
    if (!root) return;
    const bleed = (isFirstShelf || isPromoted) ? -80 : (isFullPage ? -80 : -140);
    setTopBleed(bleed);
  }, [containerRef, isFirstShelf, isPromoted, isFullPage]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const row = el.querySelector('.ds-row-scroll') as HTMLElement | null;
      if (!row) return;
      const dist = el.offsetHeight - row.offsetTop;
      if (dist > 0) setRowH(Math.round(dist));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    let rowEl: HTMLElement | null = el.querySelector('.ds-row-scroll');
    if (rowEl) ro.observe(rowEl);
    const mo = new MutationObserver(() => {
      const next = el.querySelector('.ds-row-scroll') as HTMLElement | null;
      if (next && next !== rowEl) {
        if (rowEl) try { ro.unobserve(rowEl); } catch {}
        ro.observe(next);
        rowEl = next;
        measure();
      }
    });
    mo.observe(el, { childList: true, subtree: true });
    measure();
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => setIsPromoted(el.getAttribute('data-ds-recents-slot') === 'true');
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-ds-recents-slot'] });
    return () => obs.disconnect();
  }, [containerRef]);

  // Each shelf's stacking context must sit above the shelf below, or the hero bleed covers it.
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

  const onError = useCallback((slot: Slot) => () => {
    hero.fallbackIdx += 1;
    const next = hero.urls[hero.fallbackIdx];
    if (next) {
      let finalUrl: string = next;
      try {
        const hot = getHotCachedImageSrc(next);
        if (hot) finalUrl = hot;
        else warmCacheBackground(next);
      } catch {}
      setters.setSlot(slot, finalUrl);
    }
    else setVisible(false);
  }, [hero, setters]);

  const [loadedSrcA, setLoadedSrcA] = useState<string | null>(null);
  const [loadedSrcB, setLoadedSrcB] = useState<string | null>(null);
  const slotALoaded = slotLoaded(slotA, loadedSrcA);
  const slotBLoaded = slotLoaded(slotB, loadedSrcB);

  useEffect(() => {
    if (!pendingSlot) return;
    const ready = pendingSlot === 'A' ? slotALoaded : slotBLoaded;
    if (ready) {
      setActiveSlot(pendingSlot);
      setPendingSlot(null);
    }
  }, [pendingSlot, slotALoaded, slotBLoaded]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || gameRunning) return;
    hero.currentKey = 0;
    const onSynthFocused = (synthHero: string) => {
      setLabelNode(null);
      const synthKey = -Math.abs(hashStringFastForHero(synthHero));
      if (synthKey === hero.currentKey) return;
      hero.currentKey = synthKey;
      if (showArt) swapSynthHero(hero, setters, synthHero, synthKey);
    };
    const onAppFocused = (appid: number) => {
      if (appid === hero.currentKey) return;
      hero.currentKey = appid;
      setFocusedAppid(appid);
      if (showArt) swapAppHero(hero, setters, appid);
    };
    const update = (e?: Event) => {
      const focusedAnyCard = el.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      setIsShelfSelected((prev) => (prev === !!focusedAnyCard ? prev : !!focusedAnyCard));
      const focused = resolveFocusedCard(el, e, focusedAnyCard, hero);
      if (!focused) return;
      const appid = Number(focused.getAttribute('data-appid') ?? 0);
      // Scheme allowlisted via sanitizeHeroUrl to satisfy CodeQL xss-through-dom.
      const synthHero = sanitizeHeroUrl(focused.getAttribute('data-ds-hero-url'));
      if (synthHero) { onSynthFocused(synthHero); return; }
      if (appid <= 0) { setLabelNode(null); return; }
      requestAnimationFrame(() => { const left = labelLeftOf(el, focused, labelMountRef.current); if (left !== null) setLabelLeft(left); });
      const labelEl = focused.querySelector('.ds-card-label') as HTMLElement | null;
      setLabelNode((previous) => reuseHeroLabel(previous, labelEl));
      onAppFocused(appid);
      setVisible(true);
    };
    el.addEventListener('focusin', update);
    let updatePending: number | null = null;
    const scheduleUpdate = () => {
      if (updatePending != null) return;
      updatePending = requestAnimationFrame(() => {
        updatePending = null;
        update();
      });
    };
    const obs = new MutationObserver((records) => {
      if (records.some((record) => !isHeroLabelOutputMutation(record))) scheduleUpdate();
    });
    // characterData catches online names replacing the #appid placeholder text.
    obs.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], characterData: true });
    const row = el.querySelector('.ds-row-scroll') as HTMLElement | null;
    const onRowScroll = () => {
      const fc = el.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      if (!fc) return;
      const left = labelLeftOf(el, fc, labelMountRef.current);
      if (left !== null) setLabelLeft(left);
    };
    row?.addEventListener('scroll', onRowScroll, { passive: true });
    update();
    return () => {
      el.removeEventListener('focusin', update); obs.disconnect();
      row?.removeEventListener('scroll', onRowScroll);
      if (updatePending != null) cancelAnimationFrame(updatePending);
      if (hero.swapTimer) { clearTimeout(hero.swapTimer); hero.swapTimer = null; }
    };
  }, [containerRef, showArt, gameRunning, hero, setters]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let idleHandle: any = null;
    let backoffHandle: any = null;
    const cancelScheduled = () => {
      if (backoffHandle) { clearTimeout(backoffHandle); backoffHandle = null; }
      if (idleHandle && typeof (window as any).cancelIdleCallback === 'function') {
        try { (window as any).cancelIdleCallback(idleHandle); } catch {}
        idleHandle = null;
      }
    };
    const schedule = (fn: () => void) => {
      if (cancelled) return;
      const ric: any = (window as any).requestIdleCallback;
      if (typeof ric === 'function') {
        idleHandle = ric(fn, { timeout: 3000 });
      } else {
        backoffHandle = setTimeout(fn, 250);
      }
    };
    const start = setTimeout(() => {
      if (cancelled) return;
      const allCards = Array.from(el.querySelectorAll<HTMLElement>('.ds-card[data-appid]'));
      let idx = 0;
      const PER_TICK = 4;
      const warmOneCard = (aid: number) => {
        try {
          const p = firstCacheableUrl(getPortraitUrls(aid));
          if (p) warmCacheBackground(p);
          if (!showArt) return;
          const h = firstCacheableUrl(getHeroUrls(aid));
          if (h) warmCacheBackground(h);
          const l = firstCacheableUrl(getLandscapeUrls(aid));
          if (l) warmCacheBackground(l);
        } catch {}
      };
      const tick = () => {
        if (cancelled) return;
        for (let warmed = 0; warmed < PER_TICK && idx < allCards.length; warmed++) {
          const aid = Number(allCards[idx++].getAttribute('data-appid')) || 0;
          if (aid > 0) warmOneCard(aid);
        }
        if (idx < allCards.length) schedule(tick);
      };
      schedule(tick);
    }, 500 + Math.random() * 2000);
    return () => {
      cancelled = true;
      clearTimeout(start);
      cancelScheduled();
    };
  }, [containerRef, showArt]);

  const logoAssetKey = getAppAssetCacheKey(focusedAppid);
  const logoUrls = useMemo(() => (enableLogo && focusedAppid > 0 ? getLogoUrls(focusedAppid) : []), [enableLogo, focusedAppid, logoAssetKey]);
  useEffect(() => {
    if (focusedAppid > 0) hero.currentKey = 0;
    const el = containerRef.current;
    const focused = el?.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
    try { focused?.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); } catch {}
  }, [logoAssetKey]);
  const [logoIdx, setLogoIdx] = useState(0);
  useEffect(() => { setLogoIdx(0); }, [focusedAppid]);
  useEffect(() => {
    for (const u of logoUrls) if (!getHotCachedImageSrc(u)) warmCacheBackground(u);
  }, [logoUrls]);
  const logoSrc = resolveLogoSrc(logoUrls, logoIdx);
  const [overlayDescription, setOverlayDescription] = useState<string | null>(null);
  useEffect(() => {
    if (!enableDescription || focusedAppid <= 0) { setOverlayDescription(null); return; }
    preloadAppDescriptions(focusedAppid);
    const tick = (): boolean => {
      const d = getAppDescriptions(focusedAppid);
      if (d?.snippet) { setOverlayDescription(d.snippet); return true; }
      return false;
    };
    setOverlayDescription(null);
    if (tick()) return;
    const id = window.setInterval(() => { if (tick()) window.clearInterval(id); }, 400);
    const stop = window.setTimeout(() => window.clearInterval(id), 6000);
    return () => { window.clearInterval(id); window.clearTimeout(stop); };
  }, [enableDescription, focusedAppid]);
  const flags = overlayFlags({ enableLogo, enableDescription, descriptionBelowLogo, focusedAppid, logoSrc, overlayDescription });
  const layers = visibleLayers({ showArt, slotA, slotB, needsLabel, labelNode, showOverlayContainer: flags.showOverlayContainer });
  if (layers.nothing) return null;
  const { heroHeight, maskVal } = computeHeroVisualGeometry({ isFirstShelf, isPromoted, topBleed, forceLayoutAsRecents, isShelfSelected });

  return (
    <>
      {layers.hasArt && (
        <HeroArt rootClass={heroClasses.rootClass} isFullPage={isFullPage} isFirstShelf={isFirstShelf} topBleed={topBleed} heroHeight={heroHeight} maskVal={maskVal} shown={visible && (slotALoaded || slotBLoaded)}>
          <HeroSlot src={slotA} active={activeSlot === 'A'} loaded={slotALoaded} innerClass={heroClasses.innerClass} zoomClass={heroClasses.zoomClass} imgClass={heroClasses.imgClass} onLoaded={setLoadedSrcA} onError={onError('A')} />
          <HeroSlot src={slotB} active={activeSlot === 'B'} loaded={slotBLoaded} innerClass={heroClasses.innerClass} zoomClass={heroClasses.zoomClass} imgClass={heroClasses.imgClass} onLoaded={setLoadedSrcB} onError={onError('B')} />
        </HeroArt>
      )}
      {layers.showLabel && <PromotedLabel mountRef={labelMountRef} left={labelLeft} bottom={rowH} visible={visible} />}
      {flags.showOverlayContainer && (
        <HeroOverlay
          logoPosition={p.logoPosition} descriptionPosition={p.descriptionPosition} logoBelowShelf={p.logoBelowShelf}
          isFullPage={isFullPage} logoTopOffset={p.logoTopOffset} logoSize={p.logoSize}
          descriptionHeight={p.descriptionHeight} descriptionLogoGap={p.descriptionLogoGap}
          visible={visible} flags={flags} logoSrc={logoSrc} onLogoError={() => setLogoIdx((i) => i + 1)} description={overlayDescription}
        />
      )}
    </>
  );
}

export { PerShelfHero };
