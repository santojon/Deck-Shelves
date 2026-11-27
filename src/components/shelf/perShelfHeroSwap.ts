import { getHotCachedImageSrc, warmCacheBackground, firstCacheableUrl } from "../../core/imageCache";
import { findFirstVisibleCard } from "./perShelfHeroHelpers";
import { getHeroUrls, getNativeHeroUrls, prefetchNativeAppData } from "./perShelfHeroAssets";

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

export type Slot = 'A' | 'B';

export type HeroSwapState = {
  activeSlot: Slot;
  currentKey: number;
  fallbackIdx: number;
  urls: string[];
  userHasFocused: boolean;
  swapTimer: any;
  firstSwap: boolean;
};

export type SlotSetters = { setSlot: (slot: Slot, url: string | null) => void; setPending: (slot: Slot) => void };

export const freshHeroState = (): HeroSwapState => ({ activeSlot: 'A', currentKey: 0, fallbackIdx: 0, urls: [], userHasFocused: false, swapTimer: null, firstSwap: true });

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

export function swapSynthHero(hero: HeroSwapState, setters: SlotSetters, synthHero: string, synthKey: number): void {
  debounceSwap(hero, () => {
    hero.swapTimer = null;
    if (hero.currentKey !== synthKey) return;
    hero.urls = [synthHero];
    hero.fallbackIdx = 0;
    stageNextSlot(hero, setters, synthHero);
  });
}

export function swapAppHero(hero: HeroSwapState, setters: SlotSetters, appid: number): void {
  debounceSwap(hero, () => {
    hero.swapTimer = null;
    if (hero.currentKey !== appid) return;
    prefetchNativeAppData(appid);
    const native = getNativeHeroUrls(appid);
    const urls = (native && native.length) ? native : getHeroUrls(appid);
    hero.urls = urls;
    hero.fallbackIdx = 0;
    const url0 = urls[0] ?? null;
    stageNextSlot(hero, setters, resolveHeroSrcFromCache(url0, urls));
  });
}

export function resolveFocusedCard(el: HTMLElement, e: Event | undefined, focusedAnyCard: HTMLElement | null, hero: HeroSwapState): HTMLElement | null {
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
