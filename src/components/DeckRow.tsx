import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { mark, measure } from "../core/perf";
import { computeCenteredScrollLeft } from "../core/scrollUtils";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument, getAllSteamDocuments } from "../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap } from "../core/webpackCompat";
import { isArtHeroActive } from "../core/cssLoaderDetect";
import { logInfo } from "../runtime/logger";
import { focusElement } from "../core/focusRestore";
import { flowChildrenProps } from "../core/steamOSVersion";

// Re-export types and components from shelf/ for backwards compatibility
export { type DeckRowItem } from "./shelf/types";
export { GameCard } from "./shelf/GameCard";
export { MoreCard } from "./shelf/MoreCard";
export { PlaceholderCard } from "./shelf/PlaceholderCard";

// Mention card constants and image sizing for compatibility checks
// CARD_W = CARD_ART_H = object-fit: cover
import { type DeckRowItem, CARD_W, CARD_ART_H, CARD_GAP } from "./shelf/types";
import { ShelfRow } from "./shelf/ShelfRow";
import {
  getCachedNativeDims,
  globalStylesStart,
  globalStylesStop,
  onNativeDimsChange,
} from "./shelf/shelfStyles";
import { getCurrentSettings, saveSettings } from "../store/settingsStore";
import { patchShelfInSettings } from "../domain/settings";

// Cached prototype of Steam's native asset <img> component (any class
// instance whose props include `eAssetType`). Discovered once via the live
// DOM/React fiber; reused for every subsequent hero resolution.
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
    if (next) { if (slot === 'A') setSlotA(next); else setSlotB(next); }
    else setVisible(false);
  }, []);

  // Per-slot loaded state: gates the <img> opacity AND the shimmer overlay
  // so a broken / still-loading image never paints (placeholder is fully
  // transparent of the exact hero art dimensions, with a subtle shimmer
  // sweep on top — same visual cue the game cards use during their own
  // image loads).
  //
  // Tracking by URL (not boolean) is required: when `slotA` changes (focus
  // → new game), React updates the `<img>` src prop in the SAME render
  // pass that resets the boolean — but the browser keeps the old image
  // painted until the new one decodes, which is a frame where the prior
  // loaded=true would have left opacity at 1 and shown the previous image
  // as if it were the current one. By deriving `slotALoaded` from
  // `loadedSrcA === slotA`, the flip to "not loaded" is synchronous with
  // the src change — no stale visible frame.
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
        focused = e.target.closest('.ds-card[data-appid]') as HTMLElement | null;
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
          // Debounce the actual slot swap so rapid d-pad navigation
          // doesn't fire a hero-load cycle for every intermediate card
          // (each cycle triggers React renders + a CSS cross-fade +
          // an HTTP fetch the browser can't cache before the next swap
          // cancels it). 60 ms is short enough to feel instant when
          // the user lands on a card, but long enough to skip cards
          // the user just blew past on the way to one further over.
          if (heroSwapTimerRef.current) clearTimeout(heroSwapTimerRef.current);
          const swapAppid = appid;
          heroSwapTimerRef.current = setTimeout(() => {
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
            if (next === 'A') setSlotA(url0); else setSlotB(url0);
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
              if (slot === 'A') setSlotA(newFirst); else setSlotB(newFirst);
            }, 700);
          }, 60);
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
          transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
        }}>
          <div className={nativeHeroZoomClass ?? undefined} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <img src={slotA} onError={onError('A')}
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
          transition: 'opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83)',
        }}>
          <div className={nativeHeroZoomClass ?? undefined} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <img src={slotB} onError={onError('B')}
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

function readCollapsed(shelfId: string): boolean {
  try { return localStorage.getItem(`ds-collapsed-${shelfId}`) === '1'; } catch (e) { logInfo("HOME", "readCollapsed failed", String(e)); return false; }
}

function writeCollapsed(shelfId: string, collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(`ds-collapsed-${shelfId}`, '1');
    else localStorage.removeItem(`ds-collapsed-${shelfId}`);
  } catch (e) {
    logInfo("HOME", "writeCollapsed failed", String(e));
  }
}

function DeckRowImpl({ title, items, shelfId, removableSet, matchNativeSize = false, highlightFirst = false, highlightAll = false, highlightedAppIds, hideStatusLine = false, hideNewBadge = false, hideDiscountBadge = false, hideCompatIcons = false, hideNonSteamBadge = false, hideShelfTitle = false, hideGameNames = false, hideInstallIndicator = false, forceExpanded = false, forceLayoutAsRecents = false, heroEnabled = false, heroLabelMount = false }: { title?: string; items: DeckRowItem[]; shelfId?: string; removableSet?: Set<number>; matchNativeSize?: boolean; highlightFirst?: boolean; highlightAll?: boolean; highlightedAppIds?: number[]; hideStatusLine?: boolean; hideNewBadge?: boolean; hideDiscountBadge?: boolean; hideCompatIcons?: boolean; hideNonSteamBadge?: boolean; hideShelfTitle?: boolean; hideGameNames?: boolean; hideInstallIndicator?: boolean; forceExpanded?: boolean; forceLayoutAsRecents?: boolean; heroEnabled?: boolean; heroLabelMount?: boolean }) {
  const visuallyForced = forceExpanded || forceLayoutAsRecents;
  const highlightedSet = useMemo(() => {
    if (!highlightedAppIds?.length) return null;
    return new Set(highlightedAppIds);
  }, [highlightedAppIds]);
  // X-button binding. `removableSet` is fed in by Shelf.tsx (which has
  // access to the pre-applyManualOrder resolved source ids — DeckRow
  // only sees the post-merge `items`, so it can't compute the set
  // itself). `hiddenSet` is read from settings each render for the
  // Hide/Show label toggle; both callbacks below persist directly.
  const hiddenSet = useMemo(() => {
    if (!shelfId) return undefined;
    const s = getCurrentSettings();
    const sh: any = s?.shelves?.find((row: any) => row.id === shelfId);
    const h: number[] | undefined = sh?.hiddenAppIds;
    return h?.length ? new Set(h) : undefined;
  }, [shelfId, items]);
  const onRemoveCard = useCallback((appid: number) => {
    if (!shelfId || !appid) return;
    const s = getCurrentSettings();
    if (!s) return;
    const sh: any = (s.shelves ?? []).find((row: any) => row.id === shelfId);
    if (!sh) return;
    const m: number[] = sh.manualOrder ?? [];
    if (!m.includes(appid)) return;
    void saveSettings(patchShelfInSettings(s, shelfId, {
      manualOrder: m.filter((id) => id !== appid),
    }));
  }, [shelfId]);
  const onHideCard = useCallback((appid: number) => {
    if (!shelfId || !appid) return;
    const s = getCurrentSettings();
    if (!s) return;
    const sh: any = (s.shelves ?? []).find((row: any) => row.id === shelfId);
    if (!sh) return;
    const h: number[] = sh.hiddenAppIds ?? [];
    const next = h.includes(appid) ? h.filter((id) => id !== appid) : [...h, appid];
    void saveSettings(patchShelfInSettings(s, shelfId, { hiddenAppIds: next }));
  }, [shelfId]);
  try { mark?.(`deckRow.render:${shelfId ?? 'unknown'}:start`); } catch (e) { logInfo("HOME", "mark failed", String(e)); }
  const rowRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [collapsedState, setCollapsed] = useState(() => shelfId ? readCollapsed(shelfId) : false);
  // Sync local collapse state when the game-capsule menu (Collapse action)
  // mutates ds-collapsed-{shelfId} from outside the React tree. Cleanup is
  // mandatory — DeckRow remounts per shelf.
  useEffect(() => {
    if (!shelfId) return;
    const onCollapsed = (e: Event) => {
      const ev = e as CustomEvent<{ shelfId: string; collapsed: boolean }>;
      if (ev.detail?.shelfId !== shelfId) return;
      setCollapsed(!!ev.detail.collapsed);
    };
    window.addEventListener('ds-shelf-collapsed', onCollapsed as EventListener);
    return () => window.removeEventListener('ds-shelf-collapsed', onCollapsed as EventListener);
  }, [shelfId]);
  // When our shelf takes the native-recents slot (`forceExpanded=true`),
  // render it expanded but preserve the user's original collapsed status
  // untouched — if it later loses the slot (becomes second/third/etc.),
  // it should return to whatever state the user had chosen. We intentionally
  // do NOT overwrite `collapsedState` or the persisted `ds-collapsed-{id}`
  // key while `forceExpanded` is active.
  const collapsed = visuallyForced ? false : collapsedState;
  const [nativeRowClass, setNativeRowClass] = useState('');

  // Effective dimensions, computed once at mount from whatever native dims are
  // already cached. These feed the cards only as the *fallback* of their
  // --ds-eff-* CSS variables — the live value comes from those vars (set on
  // the shelf div, resolved from the root --ds-native-* vars that ensureStyles
  // keeps current). So a dims discovery after mount reflows the cards through
  // CSS alone, with no React re-render of the 800+ GameCards on the home.
  const dims = useMemo(() => {
    const nd = getCachedNativeDims();
    const w = matchNativeSize && nd ? nd.width : CARD_W;
    const h = matchNativeSize && nd ? nd.height : CARD_ART_H;
    // TiltedHome skews cards into each other: a measured native gap of 0 (or
    // near-0) becomes fully invisible after the skew transform. Clamp to 8px
    // minimum so parallelograms never fully merge regardless of theme state.
    const rawGap = matchNativeSize && nd ? nd.gap : CARD_GAP;
    const gap = Math.max(rawGap, 8);
    // Default featured: ~3.21× portrait width (matches base native 430px featured
    // card at 134px portrait width, measured via CDP on the Steam Deck home screen).
    const featW = matchNativeSize && nd?.featuredWidth ? nd.featuredWidth : Math.round(w * 3.21);
    // A featured card differs from its row-mates only in WIDTH — its height
    // (and art height) always match the regular cards, never Steam's
    // separately measured landscape-card height.
    const artH = matchNativeSize && nd?.imgHeight ? nd.imgHeight : h;
    const featH = h;
    const featArtH = artH;
    return { w, h, gap, featW, featH, artH, featArtH };
  }, [matchNativeSize]);
  const { w: effectiveW, h: effectiveH, gap: effectiveGap, featW: effectiveFeaturedW, featH: effectiveFeaturedH, artH: effectiveArtH, featArtH: effectiveFeaturedArtH } = dims;

  // Per-shelf effective-dimension vars. When matchNativeSize is on, the cards
  // size off the live native dims (root --ds-native-* vars); when off, the
  // vars are absent and cards fall back to their CARD_W/CARD_ART_H props —
  // exactly the prior behaviour. Memoized on matchNativeSize alone so a dims
  // change never recomputes (and thus never re-renders) this object.
  const effShelfVars = useMemo<React.CSSProperties>(() => {
    if (!matchNativeSize) return {};
    return {
      ["--ds-eff-card-w" as string]: `var(--ds-native-card-w, ${CARD_W}px)`,
      ["--ds-eff-card-h" as string]: `var(--ds-native-card-h, ${CARD_ART_H}px)`,
      ["--ds-eff-card-art-h" as string]: `var(--ds-native-card-art-h, ${CARD_ART_H}px)`,
      ["--ds-eff-feat-w" as string]: `var(--ds-native-feat-w, ${Math.round(CARD_W * 3.21)}px)`,
      // A featured card must be the SAME height as the regular cards in its
      // row — only its WIDTH differs. So feat height/art-height intentionally
      // reuse the regular card's native vars (not the separately-measured
      // --ds-native-feat-* ones, which track Steam's landscape native card
      // and would make the featured card taller/shorter than its neighbours).
      ["--ds-eff-feat-h" as string]: `var(--ds-native-card-h, ${CARD_ART_H}px)`,
      ["--ds-eff-feat-art-h" as string]: `var(--ds-native-card-art-h, ${CARD_ART_H}px)`,
      ["--ds-eff-card-gap" as string]: `max(var(--ds-native-card-gap, ${CARD_GAP}px), 8px)`,
    };
  }, [matchNativeSize]);
  // When native dims are unavailable but highlightFirst is on, the featured
  // card must stay the same HEIGHT as neighboring portrait cards — only width
  // differs (landscape hero shape). Scaling height broke row alignment.
  const finalFeaturedW = effectiveFeaturedW;
  const finalFeaturedH = effectiveFeaturedH;
  const finalFeaturedArtH = effectiveFeaturedArtH;

  useEffect(() => {
    globalStylesStart();
    try { requestAnimationFrame(() => { try { measure?.(`deckRow.render:${shelfId ?? 'unknown'}`, `deckRow.render:${shelfId ?? 'unknown'}:start`); } catch (e) { logInfo("HOME", "measure failed", String(e)); } }); } catch (e) { logInfo("HOME", "rAF measure failed", String(e)); }
    const unsub = onNativeDimsChange(() => {
      // The cards resize through CSS (--ds-eff-* vars) with no re-render.
      // After that reflow the focused card's offsetLeft shifts because
      // preceding cards resized — the row's scrollLeft (set for the old
      // layout) leaves the focused card off-center, making the focus look
      // misplaced. Re-center on the next frame, only if a card in THIS row
      // currently holds the tracker.
      try {
        const focused = (globalThis as any).__ds_last_focused_card as HTMLElement | null;
        const row = rowRef.current;
        if (focused && row?.contains(focused)) {
          requestAnimationFrame(() => {
            try {
              const final = computeCenteredScrollLeft(
                { width: row.clientWidth, scrollWidth: row.scrollWidth },
                { left: focused.offsetLeft, top: focused.offsetTop, width: focused.offsetWidth, height: focused.offsetHeight }
              );
              row.scrollTo({ left: final, behavior: 'instant' as ScrollBehavior });
            } catch {}
          });
        }
      } catch {}
    });
    // No race-condition guard needed: a shelf that mounts before dims are
    // cached still sizes correctly once they arrive — the cards follow the
    // root --ds-native-* vars through CSS, no listener or re-render required.
    return () => {
      globalStylesStop();
      unsub();
    };
  }, []);

  useEffect(() => {
    function addMapClasses(el: HTMLElement | null, key: string, map: Record<string, string> | null) {
      if (!el || !map?.[key]) return;
      for (const c of map[key].split(/\s+/)) {
        if (c && !el.classList.contains(c)) el.classList.add(c);
      }
    }
    function readForceThemes(): boolean {
      try {
        const w = globalThis as any;
        const raw = w.localStorage?.getItem?.('deck-shelves-settings-cache-v3');
        if (!raw) return false;
        const s = JSON.parse(raw);
        return s?.forceCssLoaderThemes === true;
      } catch { return false; }
    }
    function injectShelfNativeClasses() {
      const doc = getPreferredSteamDocument();
      const map = doc ? getRuntimeClassMap(doc) : null;
      if (!map) return;
      addMapClasses(outerRef.current, 'nativeShelf', map);
      addMapClasses(titleRef.current, 'nativeShelfTitle', map);
      if (map.nativeShelfRow) setNativeRowClass(map.nativeShelfRow);
      // Curated safe set (always applied): recents container / header tokens.
      addMapClasses(outerRef.current, 'nativeRecentsContainer', map);
      addMapClasses(outerRef.current, 'nativeRecentsInner', map);
      addMapClasses(outerRef.current, 'nativeRecentsSection', map);
      addMapClasses(titleRef.current, 'nativeRecentsHeader', map);
      addMapClasses(titleRef.current, 'nativeRecentsHeaderLabel', map);
      // Experimental: when `forceCssLoaderThemes` is on, apply the full set
      // of DFL semantic tokens so themes targeting Title/Section/Collection/
      // GameRow/Library variants also reach DS shelves. Focus/hover state
      // classes stay excluded to avoid conflicts with DS focus handling.
      if (readForceThemes()) {
        const outerExtras = [
          'nativeSemanticGameRow', 'nativeSection', 'nativeSectionContainer',
          'nativeLibraryHomeSection', 'nativeCollection', 'nativeCollectionContents',
          'nativeCardsSection',
        ];
        for (const k of outerExtras) addMapClasses(outerRef.current, k, map);
        const titleExtras = [
          'nativeTitle', 'nativeTitleText', 'nativeTitleLabel', 'nativeTitleContainer',
          'nativeSectionTitle', 'nativeSectionHeader', 'nativeSectionHeaderContent',
          'nativeSectionName', 'nativeCollectionHeader', 'nativeCollectionName',
          'nativeCollectionLabel',
        ];
        for (const k of titleExtras) addMapClasses(titleRef.current, k, map);
      }
    }
    injectShelfNativeClasses();
    // Multiple retry points: classmap discovery (homePatch) and settings load
    // from backend both happen async after mount. On cold boot the 500ms slot
    // misses both — 1 s, 2 s, and 5 s cover the tail without staying active.
    const timers = [500, 1000, 2000, 5000].map(d => setTimeout(injectShelfNativeClasses, d));
    const onSettings = () => injectShelfNativeClasses();
    globalThis.addEventListener('deck-shelves-settings-changed', onSettings);
    return () => {
      for (const t of timers) clearTimeout(t);
      globalThis.removeEventListener('deck-shelves-settings-changed', onSettings);
    };
  }, []);

  

  // Keep `forceExpanded` readable inside the focus-scroll effect without
  // re-subscribing the listener every time it flips — the effect below
  // captures a ref so it always sees the current value.
  const forceExpandedRef = useRef(forceExpanded);
  useEffect(() => { forceExpandedRef.current = forceExpanded; }, [forceExpanded]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const CENTER_TOLERANCE_PX = 32; // don't fight Steam when it's already close
    let scheduled: number | null = null;
    let lastScrollable: HTMLElement | null = null;
    let lastTarget = -1;
    const findScrollableAncestor = (node: HTMLElement | null): HTMLElement | null => {
      let cur = node?.parentElement ?? null;
      while (cur && cur !== cur.ownerDocument?.body) {
        try {
          const cs = getComputedStyle(cur);
          const oy = (cs.overflowY || "").toLowerCase();
          if ((oy === "auto" || oy === "scroll" || oy === "overlay") && cur.scrollHeight > cur.clientHeight) return cur;
        } catch { /* skip */ }
        cur = cur.parentElement;
      }
      return null;
    };
    // Center `el` inside its scrollable ancestor. One smooth scroll per focus
    // event, issued only when needed — if Steam's native scroll already put
    // the shelf near center (within tolerance), skip entirely to avoid
    // competing smooth-scrolls that cause visible stutter.
    //
    // Exception: when this shelf is promoted to the native-recents slot
    // (`forceExpanded=true`), pin the scrollable to the very top — otherwise
    // the shelf's natural position near scroll content top leaves its header
    // clipped by prior content (hero, hidden recents spacer). scrollTop=0
    // is the only position that guarantees the promoted shelf renders in
    // full below whatever sits above it.
    const maybeCenter = () => {
      try {
        const scr = findScrollableAncestor(el);
        if (!scr) { el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
        const elRect = el.getBoundingClientRect();
        const scrRect = scr.getBoundingClientRect();
        if (forceExpandedRef.current) {
          if (scr === lastScrollable && lastTarget === 0) return;
          lastScrollable = scr;
          lastTarget = 0;
          try { scr.scrollTo({ top: 0, behavior: "smooth" }); } catch { scr.scrollTop = 0; }
          return;
        }
        const currentCenterOffset = (elRect.top + elRect.height / 2) - (scrRect.top + scrRect.height / 2);
        if (Math.abs(currentCenterOffset) <= CENTER_TOLERANCE_PX) return;
        const delta = elRect.top - scrRect.top;
        const target = Math.round(scr.scrollTop + delta - (scr.clientHeight - elRect.height) / 2);
        const clamped = Math.max(0, Math.min(scr.scrollHeight - scr.clientHeight, target));
        // Coalesce: ignore redundant scroll commands to the same target on the
        // same scrollable — Steam may re-fire focusin during smooth scroll.
        if (scr === lastScrollable && Math.abs(clamped - lastTarget) < 2) return;
        lastScrollable = scr;
        lastTarget = clamped;
        try { scr.scrollTo({ top: clamped, behavior: "smooth" }); } catch { scr.scrollTop = clamped; }
      } catch { /* ignore */ }
    };
    let verifyTimer: number | null = null;
    const onFocusIn = () => {
      if (scheduled === null) {
        scheduled = requestAnimationFrame(() => {
          scheduled = null;
          maybeCenter();
        });
      }
      // Verification pass after 300ms: covers the recently-expanded-shelf
      // case where the first scroll reads mid-animation layout or Steam's
      // native scroll competes with ours. Self-skips via the tolerance
      // check inside maybeCenter when the shelf is already centered.
      if (verifyTimer) clearTimeout(verifyTimer);
      verifyTimer = window.setTimeout(() => {
        verifyTimer = null;
        // Reset the dedup target so the verification pass can re-issue the
        // same scroll if it's genuinely needed again.
        lastTarget = -1;
        maybeCenter();
      }, 300);
    };
    el.addEventListener("focusin", onFocusIn);
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      if (scheduled !== null) cancelAnimationFrame(scheduled);
      if (verifyTimer) clearTimeout(verifyTimer);
    };
  }, []);


  useEffect(() => {
    const rowEl = rowRef.current;
    if (!rowEl) return;
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
        throttleRows.delete(rowEl);
        throttleTimer = null;
        if (lastFocusedCard && lastFocusedCard !== card) {
          doHorizontalScroll(lastFocusedCard);
        }
      }, 150);
    };

    let lastFocusedCard: HTMLElement | null = null;
    const handleFocusedCard = (card: HTMLElement | null) => {
      if (!card) return;
      lastFocusedCard = card;
      if (throttleRows.has(rowEl)) return;
      try {
        const allCards = Array.from(rowEl.querySelectorAll<HTMLElement>('.ds-card'));
        for (const it of allCards) {
          it.classList.toggle('is-selected', it === card);
        }
      } catch (e) {
        logInfo("HOME", "is-selected toggle failed", String(e));
      }
      try {
        const nested = Array.from(rowEl.querySelectorAll<HTMLElement>('.gpfocus'));
        for (const n of nested) {
          if (n !== card && n.classList) n.classList.remove('gpfocus');
        }
      } catch (e) {
        logInfo("HOME", "gpfocus cleanup failed", String(e));
      }
      try {
        const outer = outerRef.current;
        if (outer) requestAnimationFrame(() => {
          if (forceExpandedRef.current) return;
          outer.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      } catch (e) {
        logInfo("HOME", "scrollIntoView failed", String(e));
      }
      // Vertical fallback A: walk DOM for scrollable ancestor and scroll manually.
      try {
        function getScrollableAncestor(node: HTMLElement | null): HTMLElement | null {
          let cur = node?.parentElement ?? null;
          while (cur && cur !== document.body) {
            try {
              const cs = getComputedStyle(cur);
              const oy = (cs.overflowY || '').toLowerCase();
              if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cur.scrollHeight > cur.clientHeight) return cur;
            } catch (e) {
              logInfo("HOME", "getScrollableAncestor: getComputedStyle failed", String(e));
            }
            cur = cur.parentElement;
          }
          return null;
        }
        const anc = getScrollableAncestor(rowEl);
        if (anc) {
          const outerEl = outerRef.current;
          if (outerEl) {
            if (forceExpandedRef.current) {
              try { anc.scrollTo({ top: 0, behavior: 'smooth' }); } catch { anc.scrollTop = 0; }
            } else {
              const outerRect = outerEl.getBoundingClientRect();
              const ancRect = anc.getBoundingClientRect();
              const delta = outerRect.top - ancRect.top;
              const target = anc.scrollTop + delta - (anc.clientHeight / 2) + (outerRect.height / 2);
              const maxScroll = Math.max(0, anc.scrollHeight - anc.clientHeight);
              const finalTop = Math.max(0, Math.min(target, maxScroll));
              try { anc.scrollTo({ top: finalTop, behavior: 'smooth' }); } catch { anc.scrollTop = finalTop; }
            }
          }
        }
      } catch (e) {
        logInfo("HOME", "vertical scroll fallback A failed", String(e));
      }
      // Vertical fallback B: Steam's home uses a separate BrowserWindow document.
      try {
        const spDoc = getPreferredSteamDocument();
        if (spDoc && spDoc !== document) {
          const candidates = Array.from(spDoc.querySelectorAll<HTMLElement>('[class]'));
          let viewport: HTMLElement | null = null;
          const map = (() => { try { return getRuntimeClassMap(spDoc); } catch { return null; } })();
          if (map?.viewport) {
            const sel = buildSelectorFromToken(map.viewport);
            if (sel) try { viewport = spDoc.querySelector(sel); } catch (e) { logInfo("HOME", "viewport selector failed", String(e)); }
          }
          if (!viewport) {
            for (const el of candidates) {
              try {
                const cs = getComputedStyle(el);
                const oy = (cs.overflowY || '').toLowerCase();
                if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight && el.clientHeight > 80) { viewport = el; break; }
              } catch (e) {
                logInfo("HOME", "viewport scan: getComputedStyle failed", String(e));
              }
            }
          }
          if (viewport) {
            const outerEl = outerRef.current;
            if (outerEl) {
              if (forceExpandedRef.current) {
                try { viewport.scrollTo({ top: 0, behavior: 'smooth' }); } catch { viewport.scrollTop = 0; }
              } else {
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
        }
      } catch (e) {
        logInfo("HOME", "vertical scroll fallback B failed", String(e));
      }
      doHorizontalScroll(card);
    };

    const observer = new MutationObserver((mutations) => {
      let detected: HTMLElement | null = null;
      for (const m of mutations) {
        const el = m.target as HTMLElement;
        if (el.classList?.contains('gpfocus') && el.classList?.contains('ds-card')) {
          detected = el;
          break;
        }
      }
      if (!detected) return;
      const c = detected;
      // GLOBAL sync cleanup — remove gpfocus from all DS cards in all known
      // Steam documents EXCEPT the one we just observed gaining it. Each
      // DeckRow's MutationObserver only watches its own row, so without this
      // cross-row pass, gpfocus from a card in a previously-visited shelf
      // persists and `findFocusedDsCard` (queries .ds-card.gpfocus across
      // documents) returns the wrong card in DOM order. Synchronous so the
      // OPTIONS-button intercept sees a single focused card immediately.
      try {
        for (const doc of getAllSteamDocuments()) {
          const all = doc.querySelectorAll<HTMLElement>('.ds-card.gpfocus');
          for (const it of all) { if (it !== c) it.classList.remove('gpfocus'); }
        }
      } catch {}
      if (rafPending !== null) return;
      rafPending = requestAnimationFrame(() => {
        rafPending = null;
        // Skip the scroll-to-center when the gpfocus was transient. On a Steam
        // restart the nav tree is rebuilt and gpfocus flickers across cards
        // (including late-resolving online shelves) before settling — without
        // this guard a brief gpfocus on an online card scrolls the viewport to
        // center that shelf even though real focus ends up elsewhere.
        if (!c.classList.contains('gpfocus') && c !== c.ownerDocument?.activeElement) return;
        handleFocusedCard(c);
      });
    });

    const onCardFocus = (e: FocusEvent) => {
      const card = (e.target as HTMLElement)?.closest?.('.ds-card') as HTMLElement | null;
      if (card) {
        (globalThis as any).__ds_last_focused_card = card;
        if (rafPending !== null) { cancelAnimationFrame(rafPending); rafPending = null; }
        rafPending = requestAnimationFrame(() => {
          rafPending = null;
          if (!card.classList.contains('gpfocus') && card !== card.ownerDocument?.activeElement) return;
          handleFocusedCard(card);
        });
      }
    };

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
    if (visuallyForced) return;
    const next = !collapsed;
    const shelf = outerRef.current;
    const focusedInside = !!shelf?.querySelector('.gpfocus, :focus');
    setCollapsed(next);
    if (shelfId) writeCollapsed(shelfId, next);
    if (!focusedInside) return;
    const tryFocus = (attempt: number) => {
      let target: HTMLElement | null = null;
      if (!next) {
        target = rowRef.current?.querySelector<HTMLElement>('.ds-card') ?? null;
      } else {
        const all = Array.from(shelf?.ownerDocument?.querySelectorAll<HTMLElement>('.ds-shelf .ds-card') ?? []);
        target = all.find((el) => !shelf?.contains(el)) ?? null;
      }
      if (target && focusElement(target)) return;
      if (attempt < 20) setTimeout(() => tryFocus(attempt + 1), 50);
    };
    requestAnimationFrame(() => tryFocus(0));
  };

  if (!items.length) return null;
  return (
    <div
      ref={outerRef}
      className="Panel ds-shelf"
      data-shelfid={shelfId || undefined}
      data-ds-hero-enabled={heroEnabled ? 'true' : undefined}
        style={{ position: 'relative', ...effShelfVars, marginBottom: hideStatusLine ? -6 : 12, scrollMarginTop: 60, scrollMarginBottom: 52, overflow: heroEnabled ? 'visible' : 'hidden', background: heroEnabled ? 'transparent' : 'var(--ds-shell-bg)' }}
    >
      {(heroEnabled || heroLabelMount) && <PerShelfHero containerRef={outerRef} showArt={heroEnabled} isFirstShelf={visuallyForced} forceLayoutAsRecents={forceLayoutAsRecents} />}
      {title && !hideShelfTitle ? (
        collapsed ? (
          <Focusable
            ref={titleRef as any}
            className="ds-shelf-title"
            onClick={toggleCollapse}
            onOKButton={toggleCollapse}
            onActivate={toggleCollapse}
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
            <span style={{ flex: 1 }}>{`+ ${title}`}</span>
          </Focusable>
        ) : (
          <div
            ref={titleRef}
            className={`ds-shelf-title${visuallyForced ? ' ds-shelf-title--locked' : ''}`}
            onClick={visuallyForced ? undefined : toggleCollapse}
            style={{
              marginBottom: 8,
              paddingLeft: "2.8vw",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: visuallyForced ? "default" : "pointer",
              userSelect: "none",
              pointerEvents: visuallyForced ? "none" : undefined,
            }}
          >
            <span style={{ flex: 1 }}>{title}</span>
          </div>
        )
      ) : null}
      {(!collapsed || hideShelfTitle) && (
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
            gap: `var(--ds-eff-card-gap, ${effectiveGap}px)`,
            overflowX: "auto",
            overflowY: "visible",
            scrollbarWidth: "none",
            scrollBehavior: "smooth",
            /* paddingBottom 60 (was 46) — fits the card label + status line
             * with focus scale(1.04) headroom. Smaller values clip the
             * status row when a card is focused (scale pushes the label
             * ~6px further down than its rest position). */
            padding: "16px 0 60px 2.8vw",
          }}
          {...flowChildrenProps("horizontal")}
        >
          <ShelfRow
            items={items}
            cardW={effectiveW}
            cardH={effectiveH}
            artH={effectiveArtH}
            featuredW={finalFeaturedW}
            featuredH={finalFeaturedH}
            featuredArtH={finalFeaturedArtH}
            highlightFirst={highlightFirst}
            highlightAll={highlightAll}
            highlightedSet={highlightedSet ?? undefined}
            hideStatusLine={hideStatusLine}
            hideNewBadge={hideNewBadge}
            hideDiscountBadge={hideDiscountBadge}
            hideCompatIcons={hideCompatIcons}
            hideNonSteamBadge={hideNonSteamBadge}
            hideGameName={hideGameNames}
            hideInstallIndicator={hideInstallIndicator}
            removableSet={removableSet}
            onRemoveCard={onRemoveCard}
            hiddenSet={hiddenSet}
            onHideCard={onHideCard}
          />
          <div style={{ minWidth: "2.8vw", minHeight: 1, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
        </Focusable>
      )}
    </div>
  );
}

// Shallow-prop memo: `items` is already memoized in ShelfView via useMemo,
// so re-renders triggered by unrelated parent state (e.g. settings panel
// updates) don't force a full shelf re-render when only non-visual props
// have been recomputed identically.
export const DeckRow = memo(DeckRowImpl);
