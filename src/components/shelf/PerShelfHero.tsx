import { useEffect, useRef, useState, useCallback } from "react";
import { getPreferredSteamDocument, getAllSteamDocuments } from "../../runtime/steamHost";
import { isArtHeroActive } from "../../core/cssLoaderDetect";
import { getLandscapeUrls, getPortraitFallbacks } from "../../core/steamAssets";
import { getHotCachedImageSrc, warmCacheBackground, firstCacheableUrl } from "../../core/imageCache";

let _nativeAssetProto: any = null;

function findNativeAssetProto(): any {
  if (_nativeAssetProto && typeof _nativeAssetProto.GetSourcesForAsset === "function") {
    return _nativeAssetProto;
  }
  _nativeAssetProto = null;
  try {
    for (const doc of getAllSteamDocuments()) {
      const imgs = doc.querySelectorAll("img");
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i] as HTMLImageElement;
        // Skip DS-rendered images — we're hunting Steam's own asset component.
        if (img.closest(".ds-card, .ds-per-shelf-hero-img")) continue;
        const fiberKey = Object.keys(img).find(k => k.startsWith("__reactFiber$"));
        if (!fiberKey) continue;
        let f: any = (img as any)[fiberKey];
        let depth = 0;
        while (f && depth < 8) {
          const p = f.memoizedProps;
          if (p && "eAssetType" in p && f.stateNode) {
            const proto = Object.getPrototypeOf(f.stateNode);
            if (typeof proto?.GetSourcesForAsset === "function") {
              _nativeAssetProto = proto;
              return proto;
            }
          }
          f = f.return;
          depth++;
        }
      }
    }
  } catch { /* swallow — caller falls back to static list */ }
  return null;
}

/** Steam's native `<S>` asset component computes hero URLs via `GetHeroImages`
 *  which has access to hash filenames that aren't exposed on the basic
 *  `appStore.GetAppOverviewByAppID` overview (observed for Candellum,
 *  appid 4514790: only the hashed `/assets/{appid}/{hash}/library_hero.jpg`
 *  serves the real 1920×620 hero — everything else 404s or returns the
 *  smaller header crop). Instantiate the class via `Object.create` on its
 *  prototype, call `GetSourcesForAsset` with our app + `eAssetType=1` (hero),
 *  and get back exactly the URL list Steam itself would render. */
// Allowlist of URL schemes safe to pass to `<img src>`. Anything outside
// this set (most notably `javascript:` and `data:text/html`) returns
// `null` so the synth-hero pipeline treats the attribute as missing.
// Doubles as the sanitizer node CodeQL's `js/xss-through-dom` query
// expects on the DOM-attribute → `<img src>` data flow.
function sanitizeHeroUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Same-origin / path-relative — always safe.
  if (s.startsWith("/") || s.startsWith("./") || s.startsWith("../")) return s;
  // Allowlisted schemes. `data:` is restricted to image MIME types so a
  // `data:text/html,...` payload can't sneak in.
  const lower = s.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return s;
  if (lower.startsWith("blob:") || lower.startsWith("file:")) return s;
  if (lower.startsWith("data:image/")) return s;
  return null;
}

// Stable 32-bit FNV-1a hash of a string — used as a synthetic-card hero
// key in PerShelfHero so re-focusing the same synth doesn't re-swap, and
// moving between synth heroes correctly triggers a fresh load. Returned
// value is positive; the caller negates it so it can't collide with a
// real Steam appid in `currentAppid`.
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

/** Kick off Steam's own `RegisterForAppData(appid)` via a fake S instance.
 *  Without this the hero hash never lands in the data store for an app that
 *  isn't currently mounted in native UI — observed for Candellum: hero only
 *  appeared once the user focused it in native recents, which mounted the
 *  S instance and triggered the load. Calling it here pre-loads the data
 *  for every app we want to render a hero for, so the next pass of
 *  `getNativeHeroUrls` picks up the real hashed URL. Best-effort, no-op
 *  if anything is missing. */
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
  const native = getNativeHeroUrls(appid);
  if (native && native.length) return native;
  // Pre-mount fallback (no native S instance discovered yet). Trimmed to
  // the three URLs most likely to actually exist: the user's own custom
  // hero, then the public CDN's library_hero. We dropped the hashless
  // `/assets/{appid}/library_hero.jpg`, `/assets/{appid}/header.jpg` and
  // the CDN `header.jpg` — for any title without a hash exposed on
  // overview they all 404, and the prefetch + retry in PerShelfHero
  // resolves to the real hashed URL within ~700 ms anyway.
  return [
    `/customimages/${appid}_hero.png`,
    `/customimages/${appid}_hero.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`,
  ];
}

function tryHotCache(url: string | null): string | null {
  if (!url) return null;
  try { return getHotCachedImageSrc(url); } catch { return null; }
}

function resolveHeroSrcFromCache(url0: string | null, urls: ReadonlyArray<string>): string | null {
  const hotUrl0 = tryHotCache(url0);
  if (hotUrl0) return hotUrl0;
  const warmTarget = firstCacheableUrl(urls);
  if (!warmTarget) return url0;
  const hotWarm = tryHotCache(warmTarget);
  if (hotWarm) return hotWarm;
  try { warmCacheBackground(warmTarget); } catch {}
  return url0;
}

/** Lightweight per-shelf hero background. Rendered inside the .ds-shelf div
 *  (z-index:-1) so it appears behind that shelf's cards only. Separate from
 *  the global HeroBackground which handles the recents-slot promoted shelf. */

// Hero height, viewport-parameterized: scales proportionally with the screen
// instead of a hard pixel value. Used for the first shelf, and for every
// shelf under forceCssLoaderThemes.
const HERO_HEIGHT = '70vh';

// Module-level shared discovery of the active CSS Loader theme's hero
// class chain. Before: each PerShelfHero instance owned its own MO on
// the head + ran an `img` scan + getComputedStyle walk on EVERY head
// mutation. With N hero shelves, every CSS Loader tick triggered N
// expensive scans — the source of the user-reported "shelves take too
// long to load / reload too often" regression once per-shelf hero
// went beyond the first shelf. Now: ONE MO + ONE scan, results pushed
// to all subscribers. Each shelf decides whether to apply (it depends
// on its own `isPromoted` state, which stays per-instance).
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

function discoverNativeHeroClasses(): NativeHeroClasses {
  if (!isArtHeroActive()) return EMPTY_HERO_CLASSES;
  try {
    for (const doc of getAllSteamDocuments()) {
      const win = doc.defaultView ?? window;
      const imgs = doc.querySelectorAll<HTMLImageElement>('img');
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        if (img.closest('.ds-card, .ds-per-shelf-hero-img')) continue;
        const r = img.getBoundingClientRect();
        if (r.width < 400 || r.height < 120) continue;
        const imgClass = ((img.className as any) || '').toString().trim() || null;
        let node: HTMLElement | null = img.parentElement;
        let zoomClass: string | null = null;
        let innerClass: string | null = null;
        let rootClass: string | null = null;
        for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
          const cs = win.getComputedStyle(node);
          const wm = (cs as any).webkitMaskImage;
          const hasMask = (cs.maskImage && cs.maskImage !== 'none') || (wm && wm !== 'none');
          const hasAnim = cs.animationName && cs.animationName !== 'none';
          const cls = ((node.className as any) || '').toString().trim();
          if (hasAnim && !zoomClass && !innerClass && cls) zoomClass = cls;
          else if (hasMask && !innerClass) innerClass = cls || null;
          else if (innerClass && !rootClass && cls) rootClass = cls;
        }
        if (innerClass || zoomClass) {
          return { imgClass, zoomClass, innerClass, rootClass };
        }
      }
    }
  } catch {}
  return EMPTY_HERO_CLASSES;
}

function scheduleNativeHeroDiscovery(): void {
  // Coalesce bursts of head mutations into ONE rAF-deferred scan; the
  // scan itself is expensive (getComputedStyle on N ancestors of every
  // image in every Steam document) so we want it at most once per
  // frame even when the theme is rewriting head styles aggressively.
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

function PerShelfHero({ containerRef, showArt, isFirstShelf, forceLayoutAsRecents }: { containerRef: React.RefObject<HTMLDivElement | null>; showArt: boolean; isFirstShelf: boolean; forceLayoutAsRecents: boolean }) {
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const [visible, setVisible] = useState(true);  // true: always render, opacity driven by image loading
  // Smaller bleed above for non-first hero shelves so their art doesn't
  // overlap the shelf above. Determined by DOM order on mount.
  const [topBleed, setTopBleed] = useState(-90);
  // Game-info overlay: a clone of the focused card's `.ds-card-label`,
  // shown above the row exactly like the native recents hero label.
  // Rendered inside THIS shelf (position:absolute relative to it) so it
  // always follows the shelf — no global/fixed anchoring.
  const [labelHtml, setLabelHtml] = useState<string | null>(null);
  const [needsLabel, setNeedsLabel] = useState(() => { try { return isArtHeroActive(); } catch { return false; } });
  const [rowH, setRowH] = useState(310);
  const [labelLeft, setLabelLeft] = useState(40);
  const [isPromoted, setIsPromoted] = useState(false);
  // Tracks whether a card in THIS shelf currently has gamepad/DOM focus.
  // Drives the conditional top fade under `forceLayoutAsRecents` (force-on
  // secondary shelves): opaque top while selected, subtle fade while not.
  const [isShelfSelected, setIsShelfSelected] = useState(false);
  // Native hero classes — pulled from the module-level shared cache so
  // we don't pay the discover-per-shelf cost (see useNativeHeroClasses).
  // The `applyGate` decides whether THIS shelf adopts the theme classes
  // (matches the promotion CSS: only promoted shelves OR force-themes
  // get the theme's hashed hero classes; otherwise the built-in look).
  // `readForceThemes` is cached per render via getCurrentSettings's
  // localStorage cache so it's cheap.
  const readForceThemes = (): boolean => {
    try {
      const raw = (globalThis as any).localStorage?.getItem('deck-shelves-settings-cache-v3');
      if (!raw) return false;
      return JSON.parse(raw)?.forceCssLoaderThemes === true;
    } catch { return false; }
  };
  const heroClasses = useNativeHeroClasses(isArtHeroActive() && (readForceThemes() || isPromoted));
  const nativeHeroImgClass = heroClasses.imgClass;
  const nativeHeroZoomClass = heroClasses.zoomClass;
  const nativeHeroInnerClass = heroClasses.innerClass;
  const nativeHeroRootClass = heroClasses.rootClass;
  const activeSlotRef = useRef<'A' | 'B'>('A');
  const currentAppid = useRef(0);
  const fallbackIdx = useRef(0);
  const allUrls = useRef<string[]>([]);
  const userHasFocusedRef = useRef(false);
  // Debounce timer that gates the slot swap during rapid focus
  // navigation — see `update()` for the rationale. Cleared on unmount.
  const heroSwapTimerRef = useRef<any>(null);
  // Track whether `update()` has fired its FIRST slot swap. Initial
  // mount (e.g. user comes back to home after going to another
  // screen) skips the debounce so the hero appears instantly —
  // there's no rapid-navigation thrash to coalesce on a fresh mount.
  const isFirstSlotSwapRef = useRef(true);
  useEffect(() => { activeSlotRef.current = activeSlot; }, [activeSlot]);

  // 80px bleed for first / promoted (anchored to page top); 140px for
  // non-first non-promoted so the cross-fade with the shelf above spans
  // the whole transition zone.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const root = el.closest('.deck-shelves-root');
    if (!root) return;
    setTopBleed((isFirstShelf || isPromoted) ? -80 : -140);
  }, [containerRef, isFirstShelf, isPromoted]);

  // Re-evaluate ArtHero state when CSS Loader themes are toggled at runtime.
  useEffect(() => {
    const recheck = () => { try { setNeedsLabel(isArtHeroActive()); } catch {} };
    const doc = getPreferredSteamDocument();
    const head = doc?.head ?? doc?.documentElement;
    if (!head) return;
    const obs = new MutationObserver(recheck);
    obs.observe(head, { childList: true });
    return () => obs.disconnect();
  }, []);

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
    // `100vh` (fixed) so the shelf RO never fires when the row grows —
    // e.g. when matchNativeSize discovers larger card dims a moment after
    // mount. Without observing the row, `rowH` stays stale and the
    // overlay label ends up positioned over the card art instead of
    // above the row. Re-attach if the row appears later via MutationObserver.
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

  // Track whether this shelf is in full-page ArtHero mode (data-ds-recents-slot).
  // The overlay label only belongs there: in that mode the in-card labels and
  // shelf title are hidden by CSS, so the overlay replaces them. On a normal
  // (non-promoted) shelf the title + in-card labels show as usual — rendering
  // the overlay too would stack duplicate texts.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => setIsPromoted(el.getAttribute('data-ds-recents-slot') === 'true');
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-ds-recents-slot'] });
    return () => obs.disconnect();
  }, [containerRef]);

  // Native hero class discovery — moved to a module-level singleton
  // (see `useNativeHeroClasses` and `startNativeHeroDiscovery` above).
  // One observer + one scan serves every hero shelf instead of N per
  // shelf, which is what was making 2nd+ hero shelves slow to load.

  // Assign decreasing z-index to the shelf divs so each shelf's stacking
  // context sits above the shelf below it. Without this, DOM order (later =
  // on top) makes shelf N's downward hero bleed appear behind shelf N+1 instead
  // of in front of it. Runs after a short delay so all hero shelves have mounted.
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

  const onError = useCallback((slot: 'A' | 'B') => () => {
    fallbackIdx.current += 1;
    const next = allUrls.current[fallbackIdx.current];
    if (next) {
      let finalUrl: string = next;
      try {
        const hot = getHotCachedImageSrc(next);
        if (hot) finalUrl = hot;
        else warmCacheBackground(next);
      } catch {}
      if (slot === 'A') setSlotA(finalUrl); else setSlotB(finalUrl);
    }
    else setVisible(false);
  }, []);

  // Per-slot loaded state: gates the <img> opacity AND the shimmer overlay
  // so a broken / still-loading image never paints (placeholder is fully
  // transparent of the exact hero art dimensions, with a subtle shimmer
  // sweep on top — same visual cue the game cards use during their own
  // image loads).
  //
  // Track by URL not boolean — a boolean flip happens 1 frame after
  // the src change, briefly painting the prior image as if current.
  const [loadedSrcA, setLoadedSrcA] = useState<string | null>(null);
  const [loadedSrcB, setLoadedSrcB] = useState<string | null>(null);
  const slotALoaded = !!slotA && loadedSrcA === slotA;
  const slotBLoaded = !!slotB && loadedSrcB === slotB;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Reset the tracked appid whenever this effect (re-)runs — notably when
    // `showArt` flips on (global hero toggle). Otherwise `currentAppid` was
    // already set by an earlier label-only update() pass, so the appid-change
    // guard skips loading the hero art and it never appears until the user
    // navigates to a different card.
    currentAppid.current = 0;
    const update = (e?: Event) => {
      // Selection state runs first so it updates on EVERY tick — including
      // when focus leaves this shelf (handled by the cross-shelf gpfocus
      // cleanup mutating a card's class, which fires our observer).
      const focusedAnyCard = el.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      setIsShelfSelected((prev) => (prev === !!focusedAnyCard ? prev : !!focusedAnyCard));
      let focused: HTMLElement | null = null;
      if (e && e.target instanceof HTMLElement)
        focused = e.target.closest('.ds-card[data-appid], .ds-card[data-ds-hero-url]') as HTMLElement | null;
      if (!focused) focused = focusedAnyCard;
      // A genuinely focused card — via gamepad (`gpfocus` class) OR real DOM
      // focus — means the user has navigated into this shelf. Steam's gamepad
      // nav only toggles `gpfocus` and does not always fire `focusin`, so this
      // must be checked here, not only on the focusin event.
      if (focused) userHasFocusedRef.current = true;
      // First-visible-card fallback: when no card is focused, show the first
      // VISIBLE card so hidden/filtered cards (owned games on online shelves,
      // cards in collapsed rows, etc.) are skipped. Only BEFORE the user has
      // focused a card — afterwards, focus leaving the shelf must keep the
      // last-selected hero/label, not revert to the first card.
      if (!focused) {
        if (userHasFocusedRef.current) return;
        const allCards = el.querySelectorAll<HTMLElement>('.ds-card[data-appid]');
        for (const c of allCards) {
          // Check element is visible: has layout height and is in the document flow.
          // Also verify no ancestor has display:none by checking offsetParent.
          if (c.offsetHeight > 0 && c.offsetParent !== null &&
              getComputedStyle(c).visibility !== 'hidden' &&
              getComputedStyle(c).display !== 'none') {
            focused = c; break;
          }
        }
      }
      if (!focused) return;
      const appid = Number(focused.getAttribute('data-appid') ?? 0);
      // Decoration card: data-ds-hero-url is the sole src. Synth key
      // negative to avoid appid collision. Scheme allowlisted via
      // sanitizeHeroUrl to satisfy CodeQL xss-through-dom.
      const synthHeroRaw = focused.getAttribute('data-ds-hero-url');
      const synthHero = sanitizeHeroUrl(synthHeroRaw);
      if (synthHero) {
        // No DS-card-label to clone for synth cards — clear the overlay
        // label and leave hero label hidden.
        setLabelHtml(null);
        const synthKey = -Math.abs(hashStringFastForHero(synthHero));
        if (synthKey !== currentAppid.current) {
          currentAppid.current = synthKey;
          if (showArt) {
            if (heroSwapTimerRef.current) clearTimeout(heroSwapTimerRef.current);
            const wasFirst = isFirstSlotSwapRef.current;
            isFirstSlotSwapRef.current = false;
            const doSwap = () => {
              heroSwapTimerRef.current = null;
              if (currentAppid.current !== synthKey) return;
              allUrls.current = [synthHero];
              fallbackIdx.current = 0;
              const next: 'A' | 'B' = activeSlotRef.current === 'A' ? 'B' : 'A';
              if (next === 'A') setSlotA(synthHero); else setSlotB(synthHero);
              setActiveSlot(next);
            };
            if (wasFirst) doSwap();
            else heroSwapTimerRef.current = setTimeout(doSwap, 30);
          }
        }
        return;
      }
      // Non-game card (RefreshCard / MoreCard / PlaceholderCard) — they
      // have no `data-appid` and no `.ds-card-label`. Clear the overlay
      // label so it doesn't keep showing the previously-focused game's
      // name above the refresh/more card. Hero art is left as-is for
      // visual continuity (avoids a fade flash when stepping into the
      // tail card and immediately back).
      if (appid <= 0) {
        setLabelHtml(null);
        return;
      }
      // Align the overlay label horizontally with the focused card's left
      // edge — mirrors native ArtHero, where the label tracks the focused
      // tile. Read after a frame so the row's centering scroll has settled.
      const fc = focused;
      requestAnimationFrame(() => {
        try {
          const sr = el.getBoundingClientRect();
          const cr = fc.getBoundingClientRect();
          setLabelLeft(Math.max(0, Math.round(cr.left - sr.left)));
        } catch {}
      });
      // Always re-clone the card's label DOM so the overlay mirrors it
      // byte-for-byte. Online shelves resolve game names asynchronously — if
      // the first clone happened during the brief "#appid" window, re-cloning
      // picks up the resolved name once it lands. Cloning identical content
      // yields the same string, so setLabelHtml bails out (no re-render).
      const labelEl = focused.querySelector('.ds-card-label') as HTMLElement | null;
      setLabelHtml(labelEl ? labelEl.outerHTML : null);
      // Hero ART loads only when enabled for this shelf AND the game changed.
      // `forceCssLoader` promotes a shelf (full-page + label) WITHOUT forcing
      // hero art — the per-shelf / global hero-art setting is respected.
      if (appid !== currentAppid.current) {
        currentAppid.current = appid;
        if (showArt) {
          // 30ms swap debounce coalesces rapid d-pad navigation so
          // intermediate cards don't trigger hero-load cycles. First
          // mount skips the debounce so the hero appears immediately.
          if (heroSwapTimerRef.current) clearTimeout(heroSwapTimerRef.current);
          const swapAppid = appid;
          const wasFirst = isFirstSlotSwapRef.current;
          isFirstSlotSwapRef.current = false;
          const doSwap = () => {
            heroSwapTimerRef.current = null;
            // Bail if focus moved on in the meantime.
            if (currentAppid.current !== swapAppid) return;
            // Trigger Steam's own hero-data load first. Without this
            // the hashed CDN URL is unavailable until the user happens
            // to focus the game in a native shelf (observed for
            // Candellum).
            prefetchNativeAppData(swapAppid);
            // Was Steam's native (hashed, high-quality) URL already
            // available at this call? If yes, we don't need the 700 ms
            // refine pass — we already loaded the optimal URL the first
            // time, so the visible "reload" from fallback → hashed is
            // skipped entirely. Cuts hero-load cycles per card in half
            // for any game whose overview Steam has already populated.
            const native = getNativeHeroUrls(swapAppid);
            const urls = (native && native.length) ? native : getHeroUrls(swapAppid);
            const usedNative = !!(native && native.length);
            allUrls.current = urls;
            fallbackIdx.current = 0;
            const next: 'A' | 'B' = activeSlotRef.current === 'A' ? 'B' : 'A';
            const url0 = urls[0] ?? null;
            // Single-card cache lookup — same pattern GameCard uses
            // for portraits (proven safe). Hot-cache hit → blob URL
            // (no network, no decode round-trip). Cache miss → use
            // the original URL AND queue a background fetch so the
            // next visit (this session OR after a restart, since the
            // Cache Storage layer is persistent) is a hot hit. NO
            // fan-out, NO parallel calls — exactly one cache lookup
            // and at most one warmCacheBackground per slot swap.
            const resolvedUrl = resolveHeroSrcFromCache(url0, urls);
            if (next === 'A') setSlotA(resolvedUrl); else setSlotB(resolvedUrl);
            setActiveSlot(next);
            if (usedNative) return;
            // Fallback path: wait briefly for Steam's hero data to
            // land, then swap in the hashed URL when it arrives. Bails
            // when the user navigated to a different card.
            setTimeout(() => {
              if (currentAppid.current !== swapAppid) return;
              const fresh = getHeroUrls(swapAppid);
              const newFirst = fresh[0] ?? null;
              if (!newFirst || newFirst === url0) return;
              allUrls.current = fresh;
              fallbackIdx.current = 0;
              const slot = activeSlotRef.current;
              const finalUrl = resolveHeroSrcFromCache(newFirst, fresh);
              if (slot === 'A') setSlotA(finalUrl); else setSlotB(finalUrl);
            }, 700);
          };
          if (wasFirst) {
            // Instant — no setTimeout, no rAF — so the hero is set in
            // the same task that mounted PerShelfHero.
            doSwap();
          } else {
            heroSwapTimerRef.current = setTimeout(doSwap, 30);
          }
        }
      }
      setVisible(true);
    };
    el.addEventListener('focusin', update);
    // rAF-throttle subtree mutations — without this every label text /
    // class change in the row triggers a full update() (DOM query +
    // getBoundingClientRect + multiple setStates + possible hero swap),
    // and with N hero shelves mounted every focus tick fires update()
    // for every shelf. Coalescing to one rAF per shelf brings load /
    // re-render frequency back to roughly what the single-hero layout
    // had pre-regression. focusin still calls update synchronously so
    // the hero swap visually tracks the focus change with no lag.
    let updatePending: number | null = null;
    const scheduleUpdate = () => {
      if (updatePending != null) return;
      updatePending = requestAnimationFrame(() => {
        updatePending = null;
        update();
      });
    };
    const obs = new MutationObserver(scheduleUpdate);
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
      try {
        const sr = el.getBoundingClientRect();
        const cr = fc.getBoundingClientRect();
        setLabelLeft(Math.max(0, Math.round(cr.left - sr.left)));
      } catch {}
    };
    row?.addEventListener('scroll', onRowScroll, { passive: true });
    update();
    return () => {
      el.removeEventListener('focusin', update); obs.disconnect();
      row?.removeEventListener('scroll', onRowScroll);
      if (updatePending != null) cancelAnimationFrame(updatePending);
      if (heroSwapTimerRef.current) { clearTimeout(heroSwapTimerRef.current); heroSwapTimerRef.current = null; }
    };
  }, [containerRef, showArt]);

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
          const p = firstCacheableUrl(getPortraitFallbacks(aid));
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
    // Runs once per mount + when hero toggles on; cards added/removed
    // later don't re-trigger pre-warm, but they'll be cached on the
    // user's first focus of them (single-card lookup in the slot swap
    // above), so the worst case is one network fetch per genuinely-
    // new card rather than the full row.
  }, [containerRef, showArt]);

  const hasArt = showArt && !!(slotA || slotB);
  const showLabel = needsLabel && isPromoted && !!labelHtml;
  if (!hasArt && !showLabel) return null;
  const themeBg = 'var(--obsidian-main-color,var(--ds-page-bg,rgb(0,0,0)))';
  // "First-shelf" hero treatment — 70vh, opaque top, NO inter-shelf overlap.
  // Applies to the genuine first shelf (forceExpanded) AND, under
  // forceCssLoaderThemes, to EVERY shelf (each carries data-ds-recents-slot →
  // isPromoted) — there the user wants all heroes identical to the first.
  // force OFF + non-first shelves fall through to the overlap treatment.
  const treatAsFirst = isFirstShelf || isPromoted;
  // Non-first non-promoted: grow by bPx below so the symmetric top/bottom
  // fades create a seamless cross-fade with the next shelf.
  const heroHeight = treatAsFirst ? HERO_HEIGHT : `calc(100% + ${Math.abs(topBleed)}px)`;
  // Every hero bleeds `topBleed`px up over the shelf above — this is the
  // pre-change behaviour that keeps the art visually anchored to the top.
  // The genuine first shelf simply suppresses its top FADE (via `topStops`);
  // the upward bleed itself stays for every shelf.
  const bPx = Math.abs(topBleed);

  // Top fade: smooth ease-in curve with 5 stops over the full 80px bleed.
  // Keeps the hero near-invisible while overlapping the shelf above (~0.03 at
  // mid-bleed) and accelerates to opaque only in the final third.  This gives
  // the rounded, gradual transition the user sees between hero arts.
  // Bottom fade: mirrors ArtHero — opaque → 0.67 at -24px → transparent,
  // matching "rgba(0,0,0,0.67) 95%, transparent 100%" from the theme.
  const p = (f: number) => `${(bPx * f).toFixed(0)}px`;
  // Top fade: forceLayoutAsRecents shelves are opaque when selected and
  // fade when not. isFirstShelf is always opaque. Otherwise subtle fade.
  const opaqueTop = forceLayoutAsRecents ? isShelfSelected : isFirstShelf;
  // Subtle ease-in curve (~x^4): low opacity for most of the bleed, ramps
  // near the end. Extra stops smooth the gradient interpolation.
  const topStops = opaqueTop
    ? [`  black 0,`]
    : [
        `  transparent 0,`,
        `  rgba(0,0,0,0.003) ${p(0.10)},`,
        `  rgba(0,0,0,0.012) ${p(0.22)},`,
        `  rgba(0,0,0,0.035) ${p(0.38)},`,
        `  rgba(0,0,0,0.085) ${p(0.55)},`,
        `  rgba(0,0,0,0.18) ${p(0.72)},`,
        `  rgba(0,0,0,0.40) ${p(0.86)},`,
        `  rgba(0,0,0,0.70) ${p(0.95)},`,
        `  rgba(0,0,0,0.92) ${bPx}px,`,
        `  black calc(${bPx}px + 40px),`,
      ];
  // Bottom fade scales with bPx for non-first non-promoted (matches the
  // wider top bleed). First/promoted keep the 100/64/16 ArtHero values.
  const bBlackOffset = treatAsFirst ? 100 : bPx;
  const bMidOffset = treatAsFirst ? 64 : Math.round(bPx * 0.64);
  const bTransOffset = treatAsFirst ? 16 : Math.round(bPx * 0.16);
  const maskVal = [
    `linear-gradient(to bottom,`,
    ...topStops,
    `  black calc(100% - ${bBlackOffset}px),`,
    `  rgba(0,0,0,0.45) calc(100% - ${bMidOffset}px),`,
    `  transparent calc(100% - ${bTransOffset}px))`,
  ].join(' ');

  return (
    <>
    {hasArt && <div className={nativeHeroRootClass ?? undefined} data-ds-per-shelf-hero="true" style={{
      position: 'absolute',
      // Viewport-parameterized height (~374px at the Deck's BigPicture
      // viewport): scales with the screen instead of a hard pixel value.
      // Themes can override via --ds-hero-h / --ds-hero-top (e.g. fullscreen
      // theme bumps to 100vh + top:0 on promoted shelves).
      top: `var(--ds-hero-top, ${topBleed}px)`, height: `var(--ds-hero-h, ${heroHeight})`,
      // Exactly viewport-width — NOT bled out sideways. The native theme's
      // zoom layer carries a `width: 100vw` rule; a hero wider than the
      // viewport left that layer 48px short on the right (the white bar).
      // Full-viewport-width also satisfies "image spans 100% of the viewport".
      left: 0, right: 0,
      zIndex: -1, pointerEvents: 'none', overflow: 'hidden',
      // Hide the entire hero wrapper until at least one slot has decoded
      // its image — matches the "hero disabled" visual state instead of
      // showing a dark fill / shimmer placeholder while loading.
      opacity: visible && (slotALoaded || slotBLoaded) ? 1 : 0,
      transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
      // OUR linear mask stays on the root — it carries the inter-shelf
      // overlap+fade (each hero bleeds `topBleed`px up over the shelf above
      // and eases in). The theme's own gradient (ArtHero's radial mask) is
      // applied separately, by the discovered `heroInner` class on the
      // layers below — so both compose instead of one replacing the other.
      maskImage: `var(--ds-hero-mask, ${maskVal})`,
      WebkitMaskImage: `var(--ds-hero-mask, ${maskVal})`,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: themeBg }} />
      {slotA && (
        <div className={nativeHeroInnerClass ?? undefined} style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          opacity: activeSlot === 'A' ? 1 : 0,
          // 250ms cross-fade (was 500ms) — the long version felt sluggish
          // when the user d-padded onto a card and waited for the hero to
          // visibly arrive. Quarter-second matches Steam's own UI cadence
          // closely enough that it reads as instant without flicker.
          transition: 'opacity 0.25s cubic-bezier(0.17,0.45,0.14,0.83)',
        }}>
          <div className={nativeHeroZoomClass ?? undefined} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <img src={slotA} onError={onError('A')}
              // Off-main-thread decode — large hero JPEGs (~1920×620)
              // decode on the main thread when they finish downloading,
              // blocking the renderer for 20-100 ms each time and
              // showing up as a navigation stutter. `decoding="async"`
              // hands the decode to the image pipeline thread.
              decoding="async"
              ref={(el) => {
                // Eager is-loaded: if the browser already has this
                // src cached + decoded (hot blob URL / HTTP-cache
                // hit on a repeat visit), `el.complete + naturalWidth`
                // is true the same tick React assigns `src`. Flip
                // loadedSrc synchronously so the cached case skips
                // the onLoad round trip AND the opacity-gate flash.
                if (el && el.complete && (el.naturalWidth || 0) > 0 && slotA && loadedSrcA !== slotA) {
                  setLoadedSrcA(slotA);
                }
              }}
              onLoad={(e) => {
                // Only mark as loaded if the image actually decoded with a
                // non-zero natural size — Steam CDN occasionally returns
                // 200 OK with a placeholder/corrupt body which still fires
                // `onLoad` but paints as a broken image. Treating that as a
                // load failure routes it through the fallback chain.
                const img = e.currentTarget;
                if ((img.naturalWidth || 0) > 0 && (img.naturalHeight || 0) > 0) {
                  setLoadedSrcA(slotA);
                } else {
                  onError('A')();
                }
              }}
              className={`ds-per-shelf-hero-img${slotALoaded ? ' is-loaded' : ''}${nativeHeroImgClass ? ' ' + nativeHeroImgClass : ''}`}
              style={{
                width: '100%', height: '100%', display: 'block',
                // Anchor the art to the top — the pre-change framing the user
                // wants (the native img class otherwise centres it at 50%).
                objectPosition: '50% 18%',
                // When the theme supplies its own zoom (native zoom class on
                // the wrapper), disable ours — running both compounds the
                // scale and drifts the framing off-centre.
                animation: nativeHeroZoomClass ? 'none' : undefined,
              }} />
          </div>
        </div>
      )}
      {slotB && (
        <div className={nativeHeroInnerClass ?? undefined} style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          opacity: activeSlot === 'B' ? 1 : 0,
          transition: 'opacity 0.25s cubic-bezier(0.17,0.45,0.14,0.83)',
        }}>
          <div className={nativeHeroZoomClass ?? undefined} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <img src={slotB} onError={onError('B')}
              decoding="async"
              ref={(el) => {
                if (el && el.complete && (el.naturalWidth || 0) > 0 && slotB && loadedSrcB !== slotB) {
                  setLoadedSrcB(slotB);
                }
              }}
              onLoad={(e) => {
                const img = e.currentTarget;
                if ((img.naturalWidth || 0) > 0 && (img.naturalHeight || 0) > 0) {
                  setLoadedSrcB(slotB);
                } else {
                  onError('B')();
                }
              }}
              className={`ds-per-shelf-hero-img${slotBLoaded ? ' is-loaded' : ''}${nativeHeroImgClass ? ' ' + nativeHeroImgClass : ''}`}
              style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>
      )}
    </div>}
    {/* Game-info overlay — sibling of the hero art (NOT a child: the art
        div is z-index:-1 and forms a stacking context that would trap the
        label behind the cards). Positioned absolute inside the shelf,
        just above the card row, so it follows this shelf naturally.
        Only on promoted (full-page ArtHero) shelves — there the in-card
        labels + title are hidden by CSS, so the overlay replaces them;
        on normal shelves it would stack on top of the visible texts. */}
    {showLabel && (
      <div
        className="ds-promoted-hero-label"
        style={{
          position: 'absolute',
          left: labelLeft,
          bottom: rowH,
          zIndex: 20,
          pointerEvents: 'none',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.4s cubic-bezier(0.17,0.45,0.14,0.83), left 0.2s ease',
        }}
        dangerouslySetInnerHTML={{ __html: labelHtml }}
      />
    )}
    </>
  );
}

export { PerShelfHero };
