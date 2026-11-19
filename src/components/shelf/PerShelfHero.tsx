import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNativeHeroClasses, heroThemeGate } from "./perShelfHeroTheme";
import { getLandscapeUrls, getPortraitUrls, getLogoUrls, getAppAssetCacheKey } from "../../core/steamAssets";
import { getHotCachedImageSrc, warmCacheBackground, firstCacheableUrl } from "../../core/imageCache";
import { getAppDescriptions, preloadAppDescriptions } from "../../steam/appDescriptionsCache";
import { computeHeroVisualGeometry, type HorizontalPosition } from "./perShelfHeroHelpers";
import { withDefaults } from "../withDefaults";
import { subscribeSessionState, getSessionState } from "../../runtime/sessionState";
import { reuseHeroLabel, isHeroLabelOutputMutation, heroLabelAlign, heroLabelLeft } from "./perShelfHeroLabel";
import { getHeroUrls } from "./perShelfHeroAssets";
import { sanitizeHeroUrl, hashStringFastForHero } from "./perShelfHeroSynthetic";
import { freshHeroState, swapSynthHero, swapAppHero, resolveFocusedCard, type Slot, type HeroSwapState, type SlotSetters } from "./perShelfHeroSwap";
import { slotLoaded, resolveLogoSrc, overlayFlags, visibleLayers, HeroSlot, HeroArt, PromotedLabel, HeroOverlay } from "./perShelfHeroLayers";

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

function labelLeftOf(el: HTMLElement, card: HTMLElement, label: HTMLElement | null): number | null {
  try {
    return heroLabelLeft(el.getBoundingClientRect(), card.getBoundingClientRect(), label?.offsetWidth ?? 0, heroLabelAlign(card));
  } catch { return null; }
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
