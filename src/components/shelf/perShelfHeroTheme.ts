import { useEffect, useState } from "react";
import { getPreferredSteamDocument, getAllSteamDocuments } from "../../runtime/steamHost";
import { isArtHeroActive, isBigArtModeActive } from "../../core/cssLoaderDetect";
import { getRuntimeClassMap } from "../../core/webpackCompat";

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

export function useNativeHeroClasses(applyGate: boolean): NativeHeroClasses {
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

function readForceThemes(): boolean {
  try {
    const raw = (globalThis as any).localStorage?.getItem('deck-shelves-settings-cache-v3');
    if (!raw) return false;
    return JSON.parse(raw)?.forceCssLoaderThemes === true;
  } catch { return false; }
}

export function heroThemeGate(isPromoted: boolean): boolean {
  return (isArtHeroActive() || isBigArtModeActive()) && (readForceThemes() || isPromoted);
}
