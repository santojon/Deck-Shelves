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

// Walk up the React fiber tree (max 8 levels) looking for an ancestor
// component whose props carry `eAssetType` and whose prototype exposes
// `GetSourcesForAsset` — that's Steam's own asset-resolver component.
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
    // Skip DS-rendered images — we're hunting Steam's own asset component.
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
  } catch { /* swallow — caller falls back to static list */ }
  return null;
}

/* Allowlist of URL schemes safe to pass to `<img src>`. Anything outside
   this set (most notably `javascript:` and `data:text/html`) returns
   `null` so the synth-hero pipeline treats the attribute as missing.
   Doubles as the sanitizer node CodeQL's `js/xss-through-dom` query
   expects on the DOM-attribute → `<img src>` data flow. */
const SAFE_HERO_SCHEMES = new Set(["http:", "https:", "blob:", "file:"]);
function sanitizeHeroUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  /* Reconstruct + percent-encode through the URL API rather than returning
     the raw DOM string. URL.href escapes HTML meta-characters (`<`, `>`, `"`)
     in the path/query, so the value reaching the <img> src can't carry markup
     — this is the recognized barrier for CodeQL's xss-through-dom. Relative
     paths resolve against the page origin; the scheme is then allowlisted. */
  const base = (typeof location !== "undefined" && location.origin) ? location.origin : "https://steamloopback.host";
  let u: URL;
  try { u = new URL(s, base); } catch { return null; }
  const proto = u.protocol.toLowerCase();
  if (SAFE_HERO_SCHEMES.has(proto)) return u.href;
  // `data:` restricted to image MIME types so a `data:text/html,...` payload can't sneak in.
  if (proto === "data:" && u.href.toLowerCase().startsWith("data:image/")) return u.href;
  return null;
}

/* Stable 32-bit FNV-1a hash of a string — used as a synthetic-card hero
   key in PerShelfHero so re-focusing the same synth doesn't re-swap, and
   moving between synth heroes correctly triggers a fresh load. Returned
   value is positive; the caller negates it so it can't collide with a
   real Steam appid in `currentAppid`. */
function hashStringFastForHero(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  // Cap so the negated value stays well within JS safe int range and
  // never overlaps the legitimate Steam appid space (<= ~5_000_000_000).
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
    // Drop the placeholder so our own fallback chain still gets a shot
    // before we render Steam's default-app image.
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
    // The handle (`fake.m_hAppDetails`) is intentionally left dangling:
    // the registration is purely a notification subscription; the loaded
    // data persists process-wide regardless. Cheap to leak.
    fake.RegisterForAppDetails();
  } catch { /* best-effort */ }
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
  /* Pre-warm the first cacheable fallback (a CDN URL) so an on-error fallback
     is instant — but NEVER substitute it for url0. The cacheable URL is the
     CDN *default* hero (custom + loopback URLs are deliberately non-cacheable),
     so returning it would override the user's custom artwork at url0 — which
     is served cheaply from the local loopback host anyway. */
  const warmTarget = firstCacheableUrl(urls);
  if (warmTarget) { try { warmCacheBackground(warmTarget); } catch {} }
  return url0;
}


/* Module-level shared discovery of the active CSS Loader theme's hero
   class chain. Before: each PerShelfHero instance owned its own MO on
   the head + ran an `img` scan + getComputedStyle walk on EVERY head
   mutation. With N hero shelves, every CSS Loader tick triggered N */
/* expensive scans — the source of the user-reported "shelves take too
   long to load / reload too often" regression once per-shelf hero
   went beyond the first shelf. Now: ONE MO + ONE scan, results pushed
   to all subscribers. Each shelf decides whether to apply (it depends
   on its own `isPromoted` state, which stays per-instance). */
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

// A candidate native hero image: large enough to be a hero (not a card
// thumbnail) and not one of our own DS-rendered images.
function isCandidateHeroImg(img: HTMLImageElement): boolean {
  if (img.closest('.ds-card, .ds-per-shelf-hero-img')) return false;
  const r = img.getBoundingClientRect();
  return r.width >= 400 && r.height >= 120;
}

function classOf(node: Element): string {
  return ((node.className as any) || '').toString().trim();
}

// Walk up to 6 ancestors from the hero image looking for the theme's own
// mask (→ innerClass) and animation (→ zoomClass) wrapper classes, then
// one more level up for the root wrapper once innerClass is found.
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

// One ancestor can only contribute to ONE slot, in priority order:
// animation (zoom) first, then mask (inner), then whatever's next (root).
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

/* Live discovery needs a visibly-sized native hero image — none exists when
   hideRecents collapses the native shelf to zero size. Fall back to the
   boot-time embedded/cached class map (same source `isArtHeroActive`'s
   heroInner lookup trusts) — each render layer below applies independently,
   so root+inner alone still gets the native mask/shape. */
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
  /* Coalesce bursts of head mutations into ONE rAF-deferred scan; the
     scan itself is expensive (getComputedStyle on N ancestors of every
     image in every Steam document) so we want it at most once per
     frame even when the theme is rewriting head styles aggressively. */
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
  // CSS Loader takes a beat to inject hashed theme styles; two
  // staggered re-checks catch the late ones without polling forever.
  setTimeout(scheduleNativeHeroDiscovery, 1200);
  setTimeout(scheduleNativeHeroDiscovery, 3000);
  const doc = getPreferredSteamDocument();
  const head = doc?.head ?? doc?.documentElement;
  if (head) {
    const mo = new MutationObserver(scheduleNativeHeroDiscovery);
    mo.observe(head, { childList: true });
    // Intentionally never disconnect — discovery is a singleton for the
    // life of the BP window. Module-level cleanup isn't needed; the
    // observer is bound to the BP head which outlives every shelf.
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
    // Sync immediately with the latest published state — covers the
    // case where the singleton already ran a discovery before this
    // shelf mounted (typical for shelves 2..N).
    setState(nativeHeroClasses);
    // Trigger a fresh discovery if it's been a while since the last
    // one — the head MO is the primary signal but a newly-mounted
    // shelf might benefit from a re-check (e.g. theme just toggled).
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

/* Mutable per-shelf hero state shared by the focus tracker and the slot swaps —
   one ref, not state, so a swap never re-renders on its own. */
type HeroSwapState = {
  activeSlot: Slot;
  // The focused card's key: a Steam appid, or a negative synthetic-card hash.
  currentKey: number;
  fallbackIdx: number;
  urls: string[];
  userHasFocused: boolean;
  // Debounce timer that gates the slot swap during rapid focus navigation.
  swapTimer: any;
  /* Whether the FIRST slot swap is still ahead: initial mount (e.g. coming back
     to Home from another screen) skips the debounce so the hero appears
     instantly — there's no rapid-navigation thrash to coalesce on a fresh mount. */
  firstSwap: boolean;
};

type SlotSetters = { setSlot: (slot: Slot, url: string | null) => void; setPending: (slot: Slot) => void };

const freshHeroState = (): HeroSwapState => ({ activeSlot: 'A', currentKey: 0, fallbackIdx: 0, urls: [], userHasFocused: false, swapTimer: null, firstSwap: true });

// Writes the next hero into the inactive slot and marks it pending; `activeSlot` flips when its image loads.
function stageNextSlot(hero: HeroSwapState, setters: SlotSetters, url: string | null): void {
  const next: Slot = hero.activeSlot === 'A' ? 'B' : 'A';
  setters.setSlot(next, url);
  setters.setPending(next);
}

/* 30 ms swap debounce coalesces rapid d-pad navigation so intermediate cards
   don't trigger hero-load cycles. The first swap after mount runs instantly —
   no setTimeout, no rAF — so the hero is set in the same task that mounted the shelf. */
function debounceSwap(hero: HeroSwapState, doSwap: () => void): void {
  if (hero.swapTimer) clearTimeout(hero.swapTimer);
  const wasFirst = hero.firstSwap;
  hero.firstSwap = false;
  if (wasFirst) doSwap();
  else hero.swapTimer = setTimeout(doSwap, 30);
}

// Decoration card: `data-ds-hero-url` is the sole source; the key is negative so it can't collide with an appid.
function swapSynthHero(hero: HeroSwapState, setters: SlotSetters, synthHero: string, synthKey: number): void {
  debounceSwap(hero, () => {
    hero.swapTimer = null;
    if (hero.currentKey !== synthKey) return;
    hero.urls = [synthHero];
    hero.fallbackIdx = 0;
    stageNextSlot(hero, setters, synthHero);
  });
}

/* Fallback path: wait briefly for Steam's hero data to land, then swap in the
   hashed URL when it arrives. Bails when the user navigated to a different card. */
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
    // Bail if focus moved on in the meantime.
    if (hero.currentKey !== appid) return;
    /* Trigger Steam's own hero-data load first. Without this the hashed CDN URL
       is unavailable until the user happens to focus the game in a native shelf
       (observed for Candellum). */
    prefetchNativeAppData(appid);
    /* Was Steam's native (hashed, high-quality) URL already available? If yes,
       the 700 ms refine pass is skipped — the optimal URL loaded the first time,
       so the visible "reload" from fallback → hashed never happens. Cuts
       hero-load cycles per card in half for any game whose overview Steam has
       already populated. */
    const native = getNativeHeroUrls(appid);
    const urls = (native && native.length) ? native : getHeroUrls(appid);
    const usedNative = urls === native;
    hero.urls = urls;
    hero.fallbackIdx = 0;
    const url0 = urls[0] ?? null;
    /* Single-card cache lookup — same pattern GameCard uses for portraits. Hot
       hit → blob URL (no network, no decode round-trip). Miss → the original
       URL plus ONE background fetch so the next visit (this session or after a
       restart — Cache Storage persists) is a hot hit. No fan-out. */
    stageNextSlot(hero, setters, resolveHeroSrcFromCache(url0, urls));
    if (!usedNative) refineHeroLater(hero, setters, appid, url0);
  });
}

/* The card whose hero this shelf shows: the event target's card, else the card
   with gamepad/DOM focus — a genuinely focused card (Steam's gamepad nav only
   toggles `gpfocus` and does not always fire `focusin`) means the user has
   navigated into this shelf. */
/* First-visible-card fallback: when no card is focused, show the first VISIBLE
   card so hidden/filtered cards (owned games on online shelves, cards in
   collapsed rows, etc.) are skipped — only BEFORE the user has focused a card;
   afterwards, focus leaving the shelf keeps the last-selected hero/label. */
/* The tracked card can still vanish outright (hidden/filtered, or a later
   re-resolve after an early boot pass): then the fallback re-arms. Real appids
   only — a synthetic key has no matching data-appid, so it keeps the
   last-focused behaviour. */
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

// Where the overlay label sits inside the shelf: tracks the focused card like native ArtHero.
function labelLeftOf(el: HTMLElement, card: HTMLElement, label: HTMLElement | null): number | null {
  try {
    return heroLabelLeft(el.getBoundingClientRect(), card.getBoundingClientRect(), label?.offsetWidth ?? 0, heroLabelAlign(card));
  } catch { return null; }
}

/* Whether a shelf adopts the theme's hero classes (matches the promotion CSS:
   only promoted shelves OR force-themes get the theme's hashed hero classes;
   otherwise the built-in look). `forceCssLoaderThemes` is read from
   getCurrentSettings's localStorage cache, so it's cheap per render. */
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

// A slot counts as loaded only once its CURRENT src decoded — tracked by URL, since a
// boolean flip happens 1 frame after the src change and would paint the prior image as current.
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

/* Which layers render: the hero art, the game-info label above the cards (the
   gameInfoAbove setting — any shelf that opted in, not only the promoted first
   one), and the logo/description overlay. */
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

/* One of the two cross-fading hero layers. 0.5s cubic-bezier(0.17,0.45,0.14,0.83)
   opacity (Steam's own hero-swap cadence; the earlier 250 ms felt sluggish
   waiting for the hero to arrive) plus a subtle scale dip from 1.03 → 1.0 on the
   incoming slot, matching the `_22nzPNKReQkNRGtwIFGIy2` keyframe Steam plays on
   every hero swap. */
function HeroSlot({ src, active, loaded, innerClass, zoomClass, imgClass, onLoaded, onError }: HeroSlotProps) {
  if (!src) return null;
  /* Eager is-loaded: if the browser already has this src cached + decoded (hot
     blob URL / HTTP-cache hit on a repeat visit), `el.complete + naturalWidth`
     is true the same tick React assigns `src`. Flip loadedSrc synchronously so
     the cached case skips the onLoad round trip AND the opacity-gate flash. */
  const eagerLoaded = (el: HTMLImageElement | null) => {
    if (el && el.complete && (el.naturalWidth || 0) > 0 && !loaded) onLoaded(src);
  };
  /* Only mark as loaded if the image actually decoded with a non-zero natural
     size — Steam CDN occasionally returns 200 OK with a placeholder/corrupt body
     which still fires `onLoad` but paints as a broken image. Treating that as a
     load failure routes it through the fallback chain. */
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
        {/* decoding="async": large hero JPEGs (~1920×620) otherwise decode on the
            main thread when they finish downloading, blocking the renderer for
            20-100 ms each time — a visible navigation stutter. */}
        <img src={src} onError={onError} decoding="async" ref={eagerLoaded} onLoad={onLoad}
          className={`ds-per-shelf-hero-img${loaded ? ' is-loaded' : ''}${imgClass ? ' ' + imgClass : ''}`}
          style={{
            width: '100%', height: '100%', display: 'block',
            // Anchor the art to the top — the framing the user wants (the native
            // img class otherwise centres it at 50%). Both slots match, so the
            // hero doesn't bob up/down as A/B alternate card-to-card.
            objectPosition: '50% 18%',
            // When the theme supplies its own zoom (native zoom class on the
            // wrapper), disable ours — running both compounds the scale and
            // drifts the framing off-centre.
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

/* The hero art box. Per-shelf full-page: it fills the shelf's own 100vh box
   (same composition as the first shelf under hideRecents). Bleed up + fade
   applies whenever the shelf is NOT a genuine recents replacement
   (`isFirstShelf` already encodes that); the 100vh layout is on the shelf box. */
/* OUR linear mask stays on the root — it carries the inter-shelf overlap+fade
   (each hero bleeds `topBleed`px up over the shelf above and eases in). The
   theme's own gradient (ArtHero's radial mask) is applied separately, by the
   discovered `heroInner` class on the layers below — so both compose. */
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

/* Game-info overlay — sibling of the hero art (NOT a child: the z-index:-1 art
   div forms a stacking context that would trap the label behind cards).
   Positioned absolute just above the card row so it follows this shelf; the
   mount host receives the cloned `.ds-card-label` node. */
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

// `logoBelowShelf` anchors the banner to the BOTTOM of the shelf instead of the top, same offset mirrored.
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

/* Focused-card logo + description overlay (Netflix-style banner). The logo sits
   close to the top of the shelf's container, scaled by the user-tunable
   `logoTopOffset` (0-100; full-page: vh, regular: px — see resolveOverlayOffset).
   No outer maxWidth: the logo carries its own size cap and the description its
   own (wider) one, so the container shrinks to the widest child. */
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
        /* Transparent placeholder preserves the slot when the user opted in to
           the logo but no image is available for the focused app — the
           description below stays in the same vertical position regardless. */
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
  // Home stays mounted behind a running game — suspend this shelf's focus
  // tracking (focusin + subtree observer + scroll) for that window.
  const [gameRunning, setGameRunning] = useState(() => getSessionState().gameRunning);
  useEffect(() => subscribeSessionState(() => setGameRunning(getSessionState().gameRunning)), []);
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<Slot>('A');
  // Focused card's appid drives the logo + description overlay so the
  // banner mirrors whatever the user has highlighted in this shelf.
  const [focusedAppid, setFocusedAppid] = useState<number>(0);
  /* The slot we want to switch TO but haven't yet because its image is
     still loading. Keeping `activeSlot` on the previously-loaded slot
     until the new one is ready avoids the 200-500 ms "both invisible"
     gap where the old hero has already faded out and the new image
     hasn't decoded yet. */
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const [visible, setVisible] = useState(true);  // true: always render, opacity driven by image loading
  // Smaller bleed above for non-first hero shelves so their art doesn't
  // overlap the shelf above. Determined by DOM order on mount.
  const [topBleed, setTopBleed] = useState(-90);
  /* Game-info overlay: a clone of the focused card's `.ds-card-label`,
     shown above the row exactly like the native recents hero label.
     Rendered inside THIS shelf (position:absolute relative to it) so it
     always follows the shelf — no global/fixed anchoring. */
  const [labelNode, setLabelNode] = useState<HTMLElement | null>(null);
  const labelMountRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = labelMountRef.current;
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    if (labelNode) host.appendChild(labelNode);
  }, [labelNode, infoAbove]);
  // The "game info above the cards" label is driven by the user's gameInfoAbove
  // setting (threaded in as `infoAbove`), fully decoupled from theme detection —
  // it shows with or without an ArtHero theme.
  const needsLabel = infoAbove;
  const [rowH, setRowH] = useState(310);
  const [labelLeft, setLabelLeft] = useState(40);
  const [isPromoted, setIsPromoted] = useState(false);
  // Tracks whether a card in THIS shelf currently has gamepad/DOM focus.
  // Drives the conditional top fade under `forceLayoutAsRecents` (force-on
  // secondary shelves): opaque top while selected, subtle fade while not.
  const [isShelfSelected, setIsShelfSelected] = useState(false);
  // Native hero classes — pulled from the module-level shared cache so we
  // don't pay the discover-per-shelf cost (see useNativeHeroClasses).
  const heroClasses = useNativeHeroClasses(heroThemeGate(isPromoted));
  const heroRef = useRef<HeroSwapState | null>(null);
  if (heroRef.current === null) heroRef.current = freshHeroState();
  const hero = heroRef.current;
  useEffect(() => { hero.activeSlot = activeSlot; }, [activeSlot, hero]);
  // Which slot a swap writes to, and which becomes pending — the setters are stable.
  const setters = useMemo<SlotSetters>(() => ({
    setSlot: (slot, url) => { if (slot === 'A') setSlotA(url); else setSlotB(url); },
    setPending: setPendingSlot,
  }), []);

  // 80px bleed for first / promoted (anchored to page top); 140px for
  // non-first non-promoted so the cross-fade with the shelf above spans
  // the whole transition zone.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const root = el.closest('.deck-shelves-root');
    if (!root) return;
    /* Full-page-without-replacement (recents above + 100vh layout)
       gets a SHORTER bleed than the regular -140 so the fade at the top
       stays compact and doesn't read as a wide grey band over the
       recents row. */
    const bleed = (isFirstShelf || isPromoted) ? -80 : (isFullPage ? -80 : -140);
    setTopBleed(bleed);
  }, [containerRef, isFirstShelf, isPromoted, isFullPage]);

  // Measure the distance from the shelf's bottom edge up to the card row's
  // top edge. The overlay label's `bottom` is set to this so it sits at
  // the row top regardless of shelf/row height changes.
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
    // Also observe the row itself. In ArtHero mode the shelf is pinned to
    /* `100vh` (fixed) so the shelf RO never fires when the row grows —
       e.g. when matchNativeSize discovers larger card dims a moment after
       mount. Without observing the row, `rowH` stays stale and the
       overlay label ends up positioned over the card art instead of
       above the row. Re-attach if the row appears later via MutationObserver. */
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

  /* Track whether this shelf is in full-page ArtHero mode (data-ds-recents-slot).
     The overlay label only belongs there: in that mode the in-card labels and
     shelf title are hidden by CSS, so the overlay replaces them. On a normal
     (non-promoted) shelf the title + in-card labels show as usual — rendering
     the overlay too would stack duplicate texts. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => setIsPromoted(el.getAttribute('data-ds-recents-slot') === 'true');
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-ds-recents-slot'] });
    return () => obs.disconnect();
  }, [containerRef]);

  /* Native hero class discovery lives in a module-level singleton (see
     `useNativeHeroClasses` and `startNativeHeroDiscovery` above): one observer
     + one scan serves every hero shelf instead of N per shelf, which is what
     was making 2nd+ hero shelves slow to load. */

  /* Assign decreasing z-index to the shelf divs so each shelf's stacking
     context sits above the shelf below it. Without this, DOM order (later =
     on top) makes shelf N's downward hero bleed appear behind shelf N+1 instead
     of in front of it. Runs after a short delay so all hero shelves have mounted. */
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

  // Per-slot loaded state: gates the <img> opacity AND the shimmer overlay so a
  // broken / still-loading image never paints (the placeholder is fully
  // transparent at the exact hero art dimensions, with a subtle shimmer sweep).
  const [loadedSrcA, setLoadedSrcA] = useState<string | null>(null);
  const [loadedSrcB, setLoadedSrcB] = useState<string | null>(null);
  const slotALoaded = slotLoaded(slotA, loadedSrcA);
  const slotBLoaded = slotLoaded(slotB, loadedSrcB);

  /* Promote `pendingSlot` to `activeSlot` only after the pending slot's
     image has actually loaded. The previously-loaded slot keeps painting
     until the new one is ready — so the user no longer sees a fade-to-
     black gap while the new hero downloads. */
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
    /* Reset the tracked key whenever this effect (re-)runs — notably when
       `showArt` flips on (global hero toggle). Otherwise it was already set by
       an earlier label-only update() pass, so the key-change guard skips
       loading the hero art and it never appears until the user navigates to a
       different card. */
    hero.currentKey = 0;
    const onSynthFocused = (synthHero: string) => {
      // No DS-card-label to clone for synth cards — clear the overlay label and leave the hero label hidden.
      setLabelNode(null);
      const synthKey = -Math.abs(hashStringFastForHero(synthHero));
      if (synthKey === hero.currentKey) return;
      hero.currentKey = synthKey;
      if (showArt) swapSynthHero(hero, setters, synthHero, synthKey);
    };
    // Hero ART loads only when enabled for this shelf AND the game changed.
    // `forceCssLoader` promotes a shelf (full-page + label) WITHOUT forcing
    // hero art — the per-shelf / global hero-art setting is respected.
    const onAppFocused = (appid: number) => {
      if (appid === hero.currentKey) return;
      hero.currentKey = appid;
      setFocusedAppid(appid);
      if (showArt) swapAppHero(hero, setters, appid);
    };
    const update = (e?: Event) => {
      // Selection state runs first so it updates on EVERY tick — including
      // when focus leaves this shelf (handled by the cross-shelf gpfocus
      // cleanup mutating a card's class, which fires our observer).
      const focusedAnyCard = el.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      setIsShelfSelected((prev) => (prev === !!focusedAnyCard ? prev : !!focusedAnyCard));
      const focused = resolveFocusedCard(el, e, focusedAnyCard, hero);
      if (!focused) return;
      const appid = Number(focused.getAttribute('data-appid') ?? 0);
      // Scheme allowlisted via sanitizeHeroUrl to satisfy CodeQL xss-through-dom.
      const synthHero = sanitizeHeroUrl(focused.getAttribute('data-ds-hero-url'));
      if (synthHero) { onSynthFocused(synthHero); return; }
      /* Non-game card (RefreshCard / MoreCard / PlaceholderCard) — no `data-appid`
         and no `.ds-card-label`. Clear the overlay label so it doesn't keep
         showing the previously-focused game's name; hero art is left as-is for
         visual continuity (avoids a fade flash when stepping into the tail card
         and immediately back). */
      if (appid <= 0) { setLabelNode(null); return; }
      // Align the overlay label with the focused card's left edge — mirrors
      // native ArtHero. Read after a frame so the row's centering scroll has settled.
      requestAnimationFrame(() => { const left = labelLeftOf(el, focused, labelMountRef.current); if (left !== null) setLabelLeft(left); });
      /* Reuse an unchanged clone so observer notifications cannot keep
         replacing the overlay. Compare the full label DOM, not just appid:
         online titles and status text can resolve after initial focus. */
      const labelEl = focused.querySelector('.ds-card-label') as HTMLElement | null;
      setLabelNode((previous) => reuseHeroLabel(previous, labelEl));
      onAppFocused(appid);
      setVisible(true);
    };
    el.addEventListener('focusin', update);
    /* rAF-throttle subtree mutations — without this every label text / class
       change in the row triggers a full update() (DOM query +
       getBoundingClientRect + multiple setStates + possible hero swap), and
       with N hero shelves mounted every focus tick fires update() for every
       shelf. focusin still calls update synchronously so the swap has no lag. */
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
    // characterData (with subtree) catches the async name resolution on
    // online shelves — the card label's text changes from "#appid" to the
    // real name, which is neither a class nor a childList mutation.
    obs.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], characterData: true });
    // Keep the label left-aligned with the focused card as the row scrolls
    // (the centering animation moves the card after focusin fires).
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

  // Idle-time image pre-warm via requestIdleCallback. Warms portrait
  // for every card on every shelf; hero shelves also warm hero +
  // landscape. Parallel fan-out here froze the deck previously.
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
      // Batch size per idle tick. The cache module's `inflight` set
      // de-dupes, browser throttles to 6 connections per host — batches
      // of 4 fill the network without thrashing the main thread.
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
    /* Runs once per mount + when hero toggles on; cards added/removed
       later don't re-trigger pre-warm, but they'll be cached on the
       user's first focus of them (single-card lookup in the slot swap
       above), so the worst case is one network fetch per genuinely-
       new card rather than the full row. */
  }, [containerRef, showArt]);

  /* Focused-card logo + description overlay (Netflix-style banner): tracks the
     focused appid above and walks the standard URL chain with onError fallback
     (loopback → customimages → CDN). The logo URL list runs through the shared
     blob cache so warm cache hits (~3 ms) skip the network when the user
     re-focuses a card they've already seen this session. */
  const logoAssetKey = getAppAssetCacheKey(focusedAppid);
  const logoUrls = useMemo(() => (enableLogo && focusedAppid > 0 ? getLogoUrls(focusedAppid) : []), [enableLogo, focusedAppid, logoAssetKey]);
  /* When the user replaces hero artwork for the focused game, Steam bumps
     `local_cache_version` / `header_filename` etc. The asset key flips, but
     the tracked key still equals `focusedAppid`, so the hero-swap path is gated
     out. Force the next update() pass to refetch by zeroing the guard. */
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
  /* "First-shelf" hero treatment — 70vh, opaque top, NO inter-shelf overlap.
     Applies to the genuine first shelf (forceExpanded) AND, under
     forceCssLoaderThemes, to EVERY shelf (isPromoted) — force OFF +
     non-first shelves fall through to the overlap treatment instead. */
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
