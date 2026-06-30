import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getPreferredSteamDocument, getAllSteamDocuments } from "../../runtime/steamHost";
import { isArtHeroActive } from "../../core/cssLoaderDetect";
import { getLandscapeUrls, getPortraitUrls, getHeroUrls as getCentralHeroUrls, getLogoUrls, getAppAssetCacheKey } from "../../core/steamAssets";
import { getHotCachedImageSrc, warmCacheBackground, firstCacheableUrl } from "../../core/imageCache";
import { getAppDescriptions, preloadAppDescriptions } from "../../steam/appDescriptionsCache";

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

/* Allowlist of URL schemes safe to pass to `<img src>`. Anything outside
   this set (most notably `javascript:` and `data:text/html`) returns
   `null` so the synth-hero pipeline treats the attribute as missing.
   Doubles as the sanitizer node CodeQL's `js/xss-through-dom` query
   expects on the DOM-attribute → `<img src>` data flow. */
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

// Hero height, viewport-parameterized: scales proportionally with the screen
// instead of a hard pixel value. Used for the first shelf, and for every
// shelf under forceCssLoaderThemes.
const HERO_HEIGHT = '70vh';

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

function PerShelfHero({ containerRef, showArt, isFirstShelf, forceLayoutAsRecents, isFullPage = false, enableLogo = false, enableDescription = false, descriptionBelowLogo = false, logoBelowShelf = false, logoPosition = 'left', descriptionPosition = 'left', logoSize = 100, logoTopOffset = 20, descriptionHeight = 2, descriptionLogoGap = 8, infoAbove = false }: { containerRef: React.RefObject<HTMLDivElement | null>; showArt: boolean; isFirstShelf: boolean; forceLayoutAsRecents: boolean; isFullPage?: boolean; enableLogo?: boolean; enableDescription?: boolean; descriptionBelowLogo?: boolean; logoBelowShelf?: boolean; logoPosition?: 'left' | 'center' | 'right'; descriptionPosition?: 'left' | 'center' | 'right'; logoSize?: number; logoTopOffset?: number; descriptionHeight?: number; descriptionLogoGap?: number; infoAbove?: boolean }) {
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  // Focused card's appid drives the logo + description overlay so the
  // banner mirrors whatever the user has highlighted in this shelf.
  const [focusedAppid, setFocusedAppid] = useState<number>(0);
  /* The slot we want to switch TO but haven't yet because its image is
     still loading. Keeping `activeSlot` on the previously-loaded slot
     until the new one is ready avoids the 200-500 ms "both invisible"
     gap where the old hero has already faded out and the new image
     hasn't decoded yet. */
  const [pendingSlot, setPendingSlot] = useState<'A' | 'B' | null>(null);
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
  }, [labelNode]);
  // The "game info above the cards" label is now driven by the user's
  // gameInfoAbove setting (threaded in as `infoAbove`), fully decoupled from
  // theme detection — it shows with or without an ArtHero theme.
  const needsLabel = infoAbove;
  const [rowH, setRowH] = useState(310);
  const [labelLeft, setLabelLeft] = useState(40);
  const [isPromoted, setIsPromoted] = useState(false);
  // Tracks whether a card in THIS shelf currently has gamepad/DOM focus.
  // Drives the conditional top fade under `forceLayoutAsRecents` (force-on
  // secondary shelves): opaque top while selected, subtle fade while not.
  const [isShelfSelected, setIsShelfSelected] = useState(false);
  // Native hero classes — pulled from the module-level shared cache so
  // we don't pay the discover-per-shelf cost (see useNativeHeroClasses).
  /* The `applyGate` decides whether THIS shelf adopts the theme classes
     (matches the promotion CSS: only promoted shelves OR force-themes
     get the theme's hashed hero classes; otherwise the built-in look).
     `readForceThemes` is cached per render via getCurrentSettings's
     localStorage cache so it's cheap. */
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
  /* Track whether `update()` has fired its FIRST slot swap. Initial
     mount (e.g. user comes back to home after going to another
     screen) skips the debounce so the hero appears instantly —
     there's no rapid-navigation thrash to coalesce on a fresh mount. */
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

  /* Native hero class discovery — moved to a module-level singleton
     (see `useNativeHeroClasses` and `startNativeHeroDiscovery` above).
     One observer + one scan serves every hero shelf instead of N per
     shelf, which is what was making 2nd+ hero shelves slow to load. */

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
  /* sweep on top — same visual cue the game cards use during their own
     image loads).

     Track by URL not boolean — a boolean flip happens 1 frame after
     the src change, briefly painting the prior image as if current. */
  const [loadedSrcA, setLoadedSrcA] = useState<string | null>(null);
  const [loadedSrcB, setLoadedSrcB] = useState<string | null>(null);
  const slotALoaded = !!slotA && loadedSrcA === slotA;
  const slotBLoaded = !!slotB && loadedSrcB === slotB;

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
    if (!el) return;
    /* Reset the tracked appid whenever this effect (re-)runs — notably when
       `showArt` flips on (global hero toggle). Otherwise `currentAppid` was
       already set by an earlier label-only update() pass, so the appid-change
       guard skips loading the hero art and it never appears until the user
       navigates to a different card. */
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
      /* A genuinely focused card — via gamepad (`gpfocus` class) OR real DOM
         focus — means the user has navigated into this shelf. Steam's gamepad
         nav only toggles `gpfocus` and does not always fire `focusin`, so this
         must be checked here, not only on the focusin event. */
      if (focused) userHasFocusedRef.current = true;
      /* First-visible-card fallback: when no card is focused, show the first
         VISIBLE card so hidden/filtered cards (owned games on online shelves,
         cards in collapsed rows, etc.) are skipped. Only BEFORE the user has
         focused a card — afterwards, focus leaving the shelf must keep the
         last-selected hero/label, not revert to the first card. */
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
        setLabelNode(null);
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
              // Mark next as pending; activeSlot flips when the image loads.
              setPendingSlot(next);
            };
            if (wasFirst) doSwap();
            else heroSwapTimerRef.current = setTimeout(doSwap, 30);
          }
        }
        return;
      }
      // Non-game card (RefreshCard / MoreCard / PlaceholderCard) — they
      /* have no `data-appid` and no `.ds-card-label`. Clear the overlay
         label so it doesn't keep showing the previously-focused game's
         name above the refresh/more card. Hero art is left as-is for
         visual continuity (avoids a fade flash when stepping into the
         tail card and immediately back). */
      if (appid <= 0) {
        setLabelNode(null);
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
      /* Always re-clone the card's label DOM so the overlay mirrors it
         byte-for-byte. Online shelves resolve game names asynchronously — if
         the first clone happened during the brief "#appid" window, re-cloning
         picks up the resolved name once it lands. */
      const labelEl = focused.querySelector('.ds-card-label') as HTMLElement | null;
      setLabelNode(labelEl ? (labelEl.cloneNode(true) as HTMLElement) : null);
      // Hero ART loads only when enabled for this shelf AND the game changed.
      // `forceCssLoader` promotes a shelf (full-page + label) WITHOUT forcing
      // hero art — the per-shelf / global hero-art setting is respected.
      if (appid !== currentAppid.current) {
        currentAppid.current = appid;
        setFocusedAppid(appid);
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
            /* Trigger Steam's own hero-data load first. Without this
               the hashed CDN URL is unavailable until the user happens
               to focus the game in a native shelf (observed for
               Candellum). */
            prefetchNativeAppData(swapAppid);
            // Was Steam's native (hashed, high-quality) URL already
            /* available at this call? If yes, we don't need the 700 ms
               refine pass — we already loaded the optimal URL the first
               time, so the visible "reload" from fallback → hashed is
               skipped entirely. Cuts hero-load cycles per card in half
               for any game whose overview Steam has already populated. */
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
            /* the original URL AND queue a background fetch so the
               next visit (this session OR after a restart, since the
               Cache Storage layer is persistent) is a hot hit. NO
               fan-out, NO parallel calls — exactly one cache lookup
               and at most one warmCacheBackground per slot swap. */
            const resolvedUrl = resolveHeroSrcFromCache(url0, urls);
            if (next === 'A') setSlotA(resolvedUrl); else setSlotB(resolvedUrl);
            /* Mark next as pending; activeSlot flips when the image loads
               (see the pendingSlot → activeSlot effect below). This keeps
               the previously-loaded slot visible during the new image's
               load window instead of fading to black. */
            setPendingSlot(next);
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
    /* and with N hero shelves mounted every focus tick fires update()
       for every shelf. Coalescing to one rAF per shelf brings load /
       re-render frequency back to roughly what the single-hero layout
       had pre-regression. focusin still calls update synchronously so
       the hero swap visually tracks the focus change with no lag. */
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

  // Bind slot URLs through useMemo so the value passed to <img src> stays
  // stable across renders that don't change the source. Hooks must run
  // unconditionally — kept above the early return below.
  const slotASrc = useMemo(() => slotA ?? undefined, [slotA]);
  const slotBSrc = useMemo(() => slotB ?? undefined, [slotB]);
  // Focused-card logo + description overlay (Netflix-style banner).
  /* Tracks the focused appid above and walks the standard URL chain
     with onError fallback (loopback → customimages → CDN). The logo URL
     list runs through the shared blob cache so warm cache hits (~3 ms)
     skip the network when the user re-focuses a card they've already
     seen this session. */
  const logoAssetKey = getAppAssetCacheKey(focusedAppid);
  const logoUrls = useMemo(() => (enableLogo && focusedAppid > 0 ? getLogoUrls(focusedAppid) : []), [enableLogo, focusedAppid, logoAssetKey]);
  /* When the user replaces hero artwork for the focused game, Steam bumps
     `local_cache_version` / `header_filename` etc. The asset key flips, but
     `currentAppid.current === focusedAppid` so the hero-swap path is gated
     out. Force the next update() pass to refetch by zeroing the guard. */
  useEffect(() => {
    if (focusedAppid > 0) currentAppid.current = 0;
    const el = containerRef.current;
    const focused = el?.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
    try { focused?.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); } catch {}
  }, [logoAssetKey]);
  const [logoIdx, setLogoIdx] = useState(0);
  useEffect(() => { setLogoIdx(0); }, [focusedAppid]);
  useEffect(() => {
    for (const u of logoUrls) if (!getHotCachedImageSrc(u)) warmCacheBackground(u);
  }, [logoUrls]);
  const logoSrc = logoUrls[logoIdx] ? (getHotCachedImageSrc(logoUrls[logoIdx]) || logoUrls[logoIdx]) : null;
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
  const hasFocusedApp = focusedAppid > 0;
  const wantsLogo = enableLogo && hasFocusedApp;
  const hasRealLogo = wantsLogo && !!logoSrc;
  const wantsDescriptionBelowLogo = enableDescription && !!overlayDescription && descriptionBelowLogo && hasFocusedApp;
  const showOverlayContainer = wantsLogo || wantsDescriptionBelowLogo;
  const hasArt = showArt && !!(slotA || slotB);
  // `needsLabel` is the gameInfoAbove setting — show the focused game's info
  // above the cards on ANY shelf that opted in (global applies to all shelves),
  // not only the promoted first one.
  const showLabel = needsLabel && !!labelNode;
  if (!hasArt && !showLabel && !showOverlayContainer) return null;
  const themeBg = 'var(--obsidian-main-color,var(--ds-page-bg,rgb(0,0,0)))';
  /* "First-shelf" hero treatment — 70vh, opaque top, NO inter-shelf overlap.
     Applies to the genuine first shelf (forceExpanded) AND, under
     forceCssLoaderThemes, to EVERY shelf (each carries data-ds-recents-slot →
     isPromoted) — there the user wants all heroes identical to the first.
     force OFF + non-first shelves fall through to the overlap treatment. */
  const treatAsFirst = isFirstShelf || isPromoted;
  // Non-first non-promoted: grow by bPx below so the symmetric top/bottom
  // fades create a seamless cross-fade with the next shelf.
  const heroHeight = treatAsFirst ? HERO_HEIGHT : `calc(100% + ${Math.abs(topBleed)}px)`;
  /* Every hero bleeds `topBleed`px up over the shelf above — this is the
     pre-change behaviour that keeps the art visually anchored to the top.
     The genuine first shelf simply suppresses its top FADE (via `topStops`);
     the upward bleed itself stays for every shelf. */
  const bPx = Math.abs(topBleed);

  // Top fade: smooth ease-in curve with 5 stops over the full 80px bleed.
  /* Keeps the hero near-invisible while overlapping the shelf above (~0.03 at
     mid-bleed) and accelerates to opaque only in the final third.  This gives
     the rounded, gradual transition the user sees between hero arts.
     Bottom fade: mirrors ArtHero — opaque → 0.67 at -24px → transparent,
     matching "rgba(0,0,0,0.67) 95%, transparent 100%" from the theme. */
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
    {hasArt && <div className={nativeHeroRootClass ?? undefined} data-ds-per-shelf-hero="true" data-ds-hero-full-page={isFullPage ? 'true' : undefined} style={{
      position: 'absolute',
      /* Per-shelf full-page: hero fills the shelf's own 100vh box
         (same composition as the first shelf under hideRecents).
         Bleed up + fade applies whenever the shelf is NOT a genuine
         recents replacement (`isFirstShelf` already encodes that). The
         100vh full-page layout is handled on the shelf box, not here. */
      top: `var(--ds-hero-top, ${isFirstShelf ? '0px' : `${topBleed}px`})`,
      height: `var(--ds-hero-h, ${isFirstShelf ? '100%' : heroHeight})`,
      left: 0, right: 0,
      zIndex: -1,
      pointerEvents: 'none',
      overflow: 'hidden',
      opacity: visible && (slotALoaded || slotBLoaded) ? 1 : 0,
      transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
      /* OUR linear mask stays on the root — it carries the inter-shelf
         overlap+fade (each hero bleeds `topBleed`px up over the shelf above
         and eases in). The theme's own gradient (ArtHero's radial mask) is
         applied separately, by the discovered `heroInner` class on the
         layers below — so both compose instead of one replacing the other. */
      maskImage: `var(--ds-hero-mask, ${maskVal})`,
      WebkitMaskImage: `var(--ds-hero-mask, ${maskVal})`,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: themeBg }} />
      {slotA && (
        <div className={nativeHeroInnerClass ?? undefined} style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          opacity: activeSlot === 'A' ? 1 : 0,
          /* 250ms cross-fade (was 500ms) — the long version felt sluggish
             when the user d-padded onto a card and waited for the hero to
             visibly arrive. Quarter-second matches Steam's own UI cadence
             closely enough that it reads as instant without flicker. */
          /* Match Steam's native hero swap: 0.5s cubic-bezier
             (0.17,0.45,0.14,0.83) for opacity, plus a subtle scale
             dip from 1.03 → 1.0 on the incoming slot so the new image
             settles like the native (per `_22nzPNKReQkNRGtwIFGIy2`
             keyframe Steam plays on every hero swap). */
          transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83), transform 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
          transform: activeSlot === 'A' ? 'scale(1)' : 'scale(1.03)',
        }}>
          <div className={nativeHeroZoomClass ?? undefined} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <img src={slotASrc} onError={onError('A')}
              /* Off-main-thread decode — large hero JPEGs (~1920×620)
                 decode on the main thread when they finish downloading,
                 blocking the renderer for 20-100 ms each time and
                 showing up as a navigation stutter. `decoding="async"`
                 hands the decode to the image pipeline thread. */
              decoding="async"
              ref={(el) => {
                // Eager is-loaded: if the browser already has this
                /* src cached + decoded (hot blob URL / HTTP-cache
                   hit on a repeat visit), `el.complete + naturalWidth`
                   is true the same tick React assigns `src`. Flip
                   loadedSrc synchronously so the cached case skips
                   the onLoad round trip AND the opacity-gate flash. */
                if (el && el.complete && (el.naturalWidth || 0) > 0 && slotA && loadedSrcA !== slotA) {
                  setLoadedSrcA(slotA);
                }
              }}
              onLoad={(e) => {
                /* Only mark as loaded if the image actually decoded with a
                   non-zero natural size — Steam CDN occasionally returns
                   200 OK with a placeholder/corrupt body which still fires
                   `onLoad` but paints as a broken image. Treating that as a
                   load failure routes it through the fallback chain. */
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
          transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83), transform 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
          transform: activeSlot === 'B' ? 'scale(1)' : 'scale(1.03)',
        }}>
          <div className={nativeHeroZoomClass ?? undefined} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <img src={slotBSrc} onError={onError('B')}
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
              style={{
                width: '100%', height: '100%', display: 'block',
                // Match slot A's framing — without this the slot defaults to
                // the native img class's 50% centre, so alternating A/B slots
                // make the hero bob up/down as the user navigates card-to-card.
                objectPosition: '50% 18%',
                animation: nativeHeroZoomClass ? 'none' : undefined,
              }} />
          </div>
        </div>
      )}
    </div>}
    {/* Game-info overlay — sibling of the hero art (NOT a child: the z-index:-1
        art div forms a stacking context that would trap the label behind cards).
        Positioned absolute just above the card row so it follows this shelf. Only
        on promoted (full-page ArtHero) shelves — the in-card labels/title are
        CSS-hidden there so this replaces them; on normal shelves it'd stack. */}
    {showLabel && (
      <div
        ref={labelMountRef}
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
      />
    )}
    {showOverlayContainer && (
      <div
        className="ds-shelf-logo-overlay"
        data-ds-position={logoPosition}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: logoPosition === 'left' ? 24 : logoPosition === 'right' ? 'auto' : '50%',
          right: logoPosition === 'right' ? 24 : 'auto',
          transform: logoPosition === 'center' ? 'translateX(-50%)' : undefined,
          // Logo anchored close to the top of the shelf's container,
          // with the user-tunable `logoTopOffset` (0-100) scaling it:
          //   full-page: 0..8 vh  (default 20 → 1.6 vh)
          /*   regular:   0..32 px (default 20 → 6.4 px)
             First/promoted shelves OUTSIDE full-page mode also use the px
             path so the logo sits at the same position as the rest of the
             shelves; otherwise the 34vh logo would push the description
             down past the shelf title and overlap the card row. */
          /* logoBelowShelf anchors the banner to the BOTTOM of the shelf
             (it sits in DeckRow's paddingBottom, under the cards) instead of
             the top. Same offset, mirrored to `bottom`. */
          top: logoBelowShelf ? 'auto' : (isFullPage ? `${(logoTopOffset * 0.08).toFixed(2)}vh` : Math.round(logoTopOffset * 0.32)),
          bottom: logoBelowShelf ? (isFullPage ? `${(logoTopOffset * 0.08).toFixed(2)}vh` : Math.round(logoTopOffset * 0.32)) : undefined,
          /* No outer maxWidth: the logo image carries its own size cap and
             the description carries its own (wider) max-width — letting the
             container shrink to the widest child gives the description room
             to actually use its full 4-card-wide budget instead of being
             clipped by a tight outer box. */
          zIndex: 21,
          pointerEvents: 'none',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.4s cubic-bezier(0.17,0.45,0.14,0.83)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: logoPosition === 'left' ? 'flex-start' : logoPosition === 'right' ? 'flex-end' : 'center',
          textAlign: logoPosition,
        }}
      >
        {wantsLogo && (hasRealLogo ? (
          <img
            src={logoSrc!}
            alt=""
            onError={() => setLogoIdx((i) => i + 1)}
            style={{
              maxWidth: '100%',
              maxHeight: isFullPage ? `${(28 * logoSize / 100).toFixed(2)}vh` : `${Math.round(130 * logoSize / 100)}px`,
              objectFit: 'contain',
              filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.75))',
            }}
          />
        ) : (
          /* Transparent placeholder preserves the slot when the user
             opted in to the logo but no image is available for the
             focused app — the description below stays in the same
             vertical position regardless of the logo state. */
          <div
            aria-hidden="true"
            style={{
              width: 1,
              height: isFullPage ? `${(28 * logoSize / 100).toFixed(2)}vh` : `${Math.round(130 * logoSize / 100)}px`,
            }}
          />
        ))}
        {wantsDescriptionBelowLogo && (
          <div
            className="ds-shelf-logo-description"
            style={{
              marginTop: wantsLogo ? descriptionLogoGap : 0,
              maxWidth: 'min(calc(var(--ds-eff-card-w, 188px) * 4 + var(--ds-eff-card-gap, 16px) * 3), 72vw)',
              fontSize: '0.74em',
              lineHeight: 1.2,
              color: 'rgba(255,255,255,0.85)',
              textShadow: '0 2px 8px rgba(0,0,0,0.7)',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical' as any,
              WebkitLineClamp: Math.max(1, Math.min(3, descriptionHeight)),
              lineClamp: Math.max(1, Math.min(3, descriptionHeight)),
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: descriptionPosition,
              alignSelf: descriptionPosition === 'left' ? 'flex-start' : descriptionPosition === 'right' ? 'flex-end' : 'center',
            }}
          >
            {overlayDescription}
          </div>
        )}
      </div>
    )}
    </>
  );
}

export { PerShelfHero };
