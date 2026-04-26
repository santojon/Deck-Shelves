import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { discoverNativeCardDimensions, type NativeCardDims } from "../../core/webpackCompat";
import { logInfo } from "../../runtime/logger";
import { CARD_W, CARD_ART_H, CARD_GAP } from "./types";

const STYLE_ID = "deck-shelves-row-style";

// Tuning for native-dim discovery cycle
const DIMS_TOL_PX = 4;            // ignore jitter smaller than this
const DIMS_STABLE_POLLS = 2;      // consecutive matches required before accepting
const DIMS_DEBOUNCE_MS = 500;     // notify listeners after the churn settles
const STYLES_POLL_MS = 3000;      // how often ensureStyles re-runs

// Persisted cache (cold-start reflow avoidance)
const DIMS_CACHE_KEY = "ds-cardsize";
const DIMS_CACHE_VERSION = 2;
type PersistedDims = { v: number; dims: NativeCardDims; vw: number; vh: number; dpr: number };

let cachedCardRadius = "0px";
let cachedNewBadgeRadius = "0px";
let cachedNativeDims: NativeCardDims | null = null;
const nativeDimsListeners = new Set<() => void>();

// Confirmation cycle: new dims must be stable for N consecutive polls before accepting.
// This prevents flicker from transient measurements (focus scale, hover, animation frames).
let pendingDims: NativeCardDims | null = null;
let pendingDimsCount = 0;

function viewportFingerprint(): { vw: number; vh: number; dpr: number } {
  const w: any = globalThis as any;
  return {
    vw: Math.round(Number(w?.innerWidth ?? 0)),
    vh: Math.round(Number(w?.innerHeight ?? 0)),
    dpr: Number(w?.devicePixelRatio ?? 1),
  };
}

function loadPersistedDims(): NativeCardDims | null {
  try {
    const raw = (globalThis as any)?.localStorage?.getItem(DIMS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDims;
    if (!parsed || parsed.v !== DIMS_CACHE_VERSION || !parsed.dims) return null;
    return parsed.dims;
  } catch { return null; }
}

function persistDims(dims: NativeCardDims) {
  try {
    const fp = viewportFingerprint();
    if (fp.vw < 100 || fp.vh < 100) return;
    const payload: PersistedDims = { v: DIMS_CACHE_VERSION, dims, ...fp };
    (globalThis as any)?.localStorage?.setItem(DIMS_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

// Seed from last-session cache so cold boot skips the CARD_W/CARD_ART_H fallback
// and avoids the reflow when native dims are discovered shortly after.
cachedNativeDims = loadPersistedDims();

let dimsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedNotifyDims(_dims: NativeCardDims) {
  if (dimsDebounceTimer) clearTimeout(dimsDebounceTimer);
  dimsDebounceTimer = setTimeout(() => {
    dimsDebounceTimer = null;
    nativeDimsListeners.forEach(cb => cb());
  }, DIMS_DEBOUNCE_MS);
}
function notifyDimsNow() {
  if (dimsDebounceTimer) { clearTimeout(dimsDebounceTimer); dimsDebounceTimer = null; }
  nativeDimsListeners.forEach(cb => cb());
}

export function getCachedCardRadius(): string { return cachedCardRadius; }
export function getCachedNativeDims(): NativeCardDims | null { return cachedNativeDims; }
export function onNativeDimsChange(cb: () => void): () => void {
  nativeDimsListeners.add(cb);
  return () => { nativeDimsListeners.delete(cb); };
}

function detectNativeCardRadius(): string {
  try {
    const doc = getPreferredSteamDocument();
    if (!doc) return "0px";
    const panels = doc.querySelectorAll(".Panel.Focusable");
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i] as HTMLElement;
      const cls = panel.className ?? "";
      if (cls.indexOf("ds-card") >= 0 || cls.indexOf("ds-row") >= 0) continue;
      if (!panel.querySelector("img")) continue;
      try {
        const r = getComputedStyle(panel).borderRadius;
        if (r && r !== "0px") return r;
      } catch { /* skip */ }
    }
  } catch {
    logInfo("HOME", "detectNativeCardRadius failed");
  }
  return "0px";
}

function detectNativeNewBadgeRadius(): string {
  try {
    const docs = [getPreferredSteamDocument(), document];
    for (const doc of docs) {
      if (!doc) continue;
      const nodes = doc.querySelectorAll<HTMLElement>('*');
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (el.children.length !== 0) continue;
        const t = el.textContent;
        if (t !== 'Novo' && t !== 'NEW' && t !== 'New') continue;
        const cs = getComputedStyle(el);
        if (cs.backgroundColor !== 'rgb(26, 159, 255)') continue;
        return cs.borderRadius || '0px';
      }
    }
  } catch {}
  return "0px";
}

function ensureStyles() {
  try {
    const newRadius = detectNativeCardRadius();
    const radiusChanged = newRadius !== cachedCardRadius;
    cachedCardRadius = newRadius;
    const newBadgeRadius = detectNativeNewBadgeRadius();
    const newBadgeRadiusChanged = newBadgeRadius !== cachedNewBadgeRadius;
    cachedNewBadgeRadius = newBadgeRadius;
    const steamDoc = getPreferredSteamDocument();
    const newDims = discoverNativeCardDimensions(steamDoc) ?? discoverNativeCardDimensions(document);
    // Only accept new dims when the change exceeds tolerance (avoids flicker
    // from focus-scale, rounding, or animation mid-frame measurements).
    // When newDims is null (e.g. recents hidden, or focus present), keep the cached dims.
    const tol = (a: number | undefined, b: number | undefined) => Math.abs((a ?? 0) - (b ?? 0)) > DIMS_TOL_PX;
    // When the new measurement lacks a field the cache already has (e.g. native
    // featured card is focused/hidden and was skipped by discovery), preserve
    // the cached value instead of treating the absence as a change. Otherwise
    // leaving the DS shelf would overwrite featuredWidth with undefined and
    // shrink the featured card back to the fallback size.
    if (newDims && cachedNativeDims) {
      if (!newDims.featuredWidth && cachedNativeDims.featuredWidth) newDims.featuredWidth = cachedNativeDims.featuredWidth;
      if (!newDims.featuredHeight && cachedNativeDims.featuredHeight) newDims.featuredHeight = cachedNativeDims.featuredHeight;
      if (!newDims.featuredImgHeight && cachedNativeDims.featuredImgHeight) newDims.featuredImgHeight = cachedNativeDims.featuredImgHeight;
      if (!newDims.imgHeight && cachedNativeDims.imgHeight) newDims.imgHeight = cachedNativeDims.imgHeight;
    }
    const dimsChanged = newDims !== null && (
      !cachedNativeDims ||
      tol(newDims.width, cachedNativeDims.width) ||
      tol(newDims.height, cachedNativeDims.height) ||
      tol(newDims.gap, cachedNativeDims.gap) ||
      tol(newDims.featuredWidth, cachedNativeDims.featuredWidth) ||
      tol(newDims.featuredHeight, cachedNativeDims.featuredHeight)
    );
    if (dimsChanged && newDims) {
      // Fast path: when the cache has no featuredWidth but the new measurement does,
      // accept immediately. The featured card would otherwise render at the fallback
      // landscape ratio for 6+ seconds (2 × poll interval) before resizing — visible
      // as a slow enlarge on cold boot when matchNativeSize is on.
      const acquiredFeatured = !!newDims.featuredWidth && !cachedNativeDims?.featuredWidth;
      if (acquiredFeatured) {
        cachedNativeDims = newDims;
        persistDims(newDims);
        pendingDims = null;
        pendingDimsCount = 0;
        // Synchronous notification — the 500ms debounce delays the featured
        // card resize noticeably when it's finally discovered. Acquiring
        // featured for the first time is a one-shot event; no debounce needed.
        notifyDimsNow();
      } else {
      // Require 2 consecutive polls showing the same new values before accepting
      const matchesPending = pendingDims &&
        !tol(newDims.width, pendingDims.width) &&
        !tol(newDims.height, pendingDims.height) &&
        !tol(newDims.gap, pendingDims.gap);
      if (matchesPending) {
        pendingDimsCount++;
        if (pendingDimsCount >= DIMS_STABLE_POLLS) {
          cachedNativeDims = newDims;
          persistDims(newDims);
          pendingDims = null;
          pendingDimsCount = 0;
          debouncedNotifyDims(newDims);
        }
      } else {
        pendingDims = newDims;
        pendingDimsCount = 1;
      }
      }
    } else if (!cachedNativeDims && newDims) {
      cachedNativeDims = newDims;
      persistDims(newDims);
    } else {
      pendingDims = null;
      pendingDimsCount = 0;
    }
    // Update CSS variables without removing/recreating the stylesheet to avoid style flicker
    const docs = [document, steamDoc];
    for (const doc of docs) {
      if (!doc) continue;
      if (!doc.getElementById(STYLE_ID)) {
        const style = doc.createElement("style");
        style.id = STYLE_ID;
        style.textContent = buildStylesheet();
        doc.head.appendChild(style);
      } else if (radiusChanged || dimsChanged || newBadgeRadiusChanged) {
        // Update CSS variables in-place instead of removing the stylesheet
        doc.documentElement.style.setProperty('--ds-card-radius', cachedCardRadius);
        doc.documentElement.style.setProperty('--ds-new-badge-radius', cachedNewBadgeRadius);
        doc.documentElement.style.setProperty('--ds-native-card-w', `${cachedNativeDims?.width ?? CARD_W}px`);
        doc.documentElement.style.setProperty('--ds-native-card-h', `${cachedNativeDims?.height ?? CARD_ART_H}px`);
        doc.documentElement.style.setProperty('--ds-native-card-gap', `${cachedNativeDims?.gap ?? CARD_GAP}px`);
      }
      doc.documentElement.style.setProperty('--ds-new-badge-radius', cachedNewBadgeRadius);

      // Detect page background color from the scrollable viewport or body
      try {
        const mount = doc.getElementById('deck-shelves-home-root');
        let pageBg = '';
        if (mount) {
          let el: HTMLElement | null = mount.parentElement;
          for (let i = 0; i < 6 && el && el !== doc.body; i++) {
            const bg = getComputedStyle(el).backgroundColor;
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { pageBg = bg; break; }
            el = el.parentElement;
          }
        }
        if (!pageBg) {
          const bodyBg = getComputedStyle(doc.body).backgroundColor;
          if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') pageBg = bodyBg;
        }
        if (pageBg) doc.documentElement.style.setProperty('--ds-page-bg', pageBg);
        else doc.documentElement.style.setProperty('--ds-page-bg', 'rgb(0, 0, 0)');
      } catch {}

      try {
        doc.documentElement.style.removeProperty('--ds-native-heading-color');
        const headings = doc.querySelectorAll('h2[class], h3[class]');
        for (const h of Array.from(headings)) {
          const cls = (h as HTMLElement).className || '';
          if (/_[A-Za-z0-9_-]{5,}/.test(cls)) {
            const c = getComputedStyle(h as HTMLElement).color;
            if (!c || c === 'rgb(0, 0, 0)' || c === 'rgba(0, 0, 0, 0)') continue;
            const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (m) {
              const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
              const max = Math.max(r, g, b);
              const sat = max > 0 ? (max - Math.min(r, g, b)) / max : 0;
              if (sat < 0.25) continue;
            }
            doc.documentElement.style.setProperty('--ds-native-heading-color', c);
            break;
          }
        }
      } catch {
        logInfo("HOME", "heading color detection failed");
      }
    }
  } catch {
    logInfo("HOME", "ensureStyles failed");
  }
}

function buildStylesheet(): string {
  return `
    :root {
      --ds-card-radius: ${cachedCardRadius};
      --ds-card-dim: 0.9;
      --ds-card-bg: rgba(3, 10, 30, 0.92);
      --ds-shell-bg: transparent;
      --ds-page-bg: rgb(0, 0, 0);
      --ds-native-card-w: ${cachedNativeDims?.width ?? CARD_W}px;
      --ds-native-card-h: ${cachedNativeDims?.height ?? CARD_ART_H}px;
      --ds-native-card-gap: ${cachedNativeDims?.gap ?? CARD_GAP}px;
    }
    #deck-shelves-home-root { margin-top: -32px !important; }
    .deck-shelves-root { background: transparent; }
    .Panel.ds-shelf { background: transparent !important; }
    .ds-row-scroll { scrollbar-width: none; -ms-overflow-style: none; }
    .ds-row-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }

    /* When the first shelf is promoted into the native recents slot via
       Opção B, it inherits the native rule  ._39tNvaLedsTrVh0fFsP4Jm
       { height: 105vh } . The 105vh extends 5% past the viewport, so cards
       laid out at the bottom of that box end up clipped below the visible
       area. Cap to the visible content height (subtract our mount offset)
       so the row sits at the visible bottom. Flex column + margin-top:auto
       on the row pushes cards to that bottom, matching ArtHero's layout
       (hero art fills above the cards). The title is hidden — when ArtHero
       is active this slot is the hero region, native recents have no
       visible title, and showing ours would clutter the hero. */
    .ds-shelf[data-ds-recents-slot="true"] {
      display: flex !important;
      flex-direction: column;
      height: calc(100vh - 56px) !important;
    }
    .ds-shelf[data-ds-recents-slot="true"] .ds-shelf-title {
      display: none;
    }
    .ds-shelf[data-ds-recents-slot="true"] .ds-row-scroll {
      margin-top: auto;
    }

    /* Hero-label overlay (ArtHero etc.): when the active theme requires the
       focused card's info to be shown above the row, HeroBackground clones
       the .ds-card-label DOM into a wrapper here. The cloned label keeps
       its own classes (so all formatting matches the in-card label exactly)
       but its inline position:absolute / top:artH was meaningful only
       inside the card — reset it to static here so it lays out naturally
       in the wrapper. The original in-card label is hidden so the focused
       card doesn't render the same label twice. */
    .deck-shelves-root[data-ds-hero-label="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-card-label {
      display: none !important;
    }
    .ds-promoted-hero-label .ds-card-label {
      position: static !important;
      top: auto !important;
      left: auto !important;
      width: auto !important;
      padding-top: 0 !important;
      opacity: 1 !important;
    }
    .ds-card {
      border-radius: var(--ds-card-radius, ${cachedCardRadius}) !important;
      overflow: hidden;
      filter: brightness(var(--ds-card-dim, 0.9));
      transition: filter 0.4s cubic-bezier(0, 0.73, 0.48, 1), width 0.12s ease, height 0.12s ease, min-width 0.12s ease;
      will-change: width, height;
      scroll-margin-top: 90px;
      scroll-margin-bottom: 52px;
      scroll-margin-inline-end: 2.8vw;
    }
    #deck-shelves-home-root .deck-shelves-root:focus,
    #deck-shelves-home-root .deck-shelves-root.gpfocus,
    #deck-shelves-home-root .deck-shelves-root.gpfocuswithin,
    #deck-shelves-home-root .ds-row-scroll:focus,
    #deck-shelves-home-root .ds-row-scroll.gpfocus,
    #deck-shelves-home-root .ds-row-scroll.gpfocuswithin,
    #deck-shelves-home-root .Panel.gpfocus,
    #deck-shelves-home-root .Focusable.gpfocus,
    #deck-shelves-home-root [class*="row"].gpfocus {
      outline: none !important;
      border: none !important;
      box-shadow: none !important;
      animation: none !important;
    }
    #deck-shelves-home-root .ds-card:focus,
    #deck-shelves-home-root .ds-card.gpfocus,
    #deck-shelves-home-root .ds-card:hover {
      outline: none !important;
      outline-offset: 0px !important;
      border: none !important;
      /* Theme-aware focus ring: keep the native drop shadow, add a thin
         glow in the theme accent color (ArtHero etc. expose this var). If
         the theme doesn't set it, the fallback is fully transparent so
         only the drop shadow shows. */
      box-shadow: rgba(0, 0, 0, 0.5) 0px 16px 24px 0px, 0 0 0 2px var(--custom-sp-color-border, transparent) !important;
      z-index: 12;
      filter: brightness(1);
    }
    #deck-shelves-home-root .ds-card::after {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: auto !important;
      height: var(--ds-card-art-h, 100%) !important;
      border-radius: var(--ds-card-radius, ${cachedCardRadius}) !important;
      pointer-events: none !important;
      z-index: 4 !important;
      opacity: 1 !important;
      display: inline !important;
    }
    #deck-shelves-home-root .ds-card.gpfocus::after,
    #deck-shelves-home-root .ds-card:focus::after,
    #deck-shelves-home-root .ds-card:hover::after {
      height: var(--ds-card-art-h, 100%) !important;
      bottom: auto !important;
      border-radius: var(--ds-card-radius, ${cachedCardRadius}) !important;
    }
    #deck-shelves-home-root .ds-card .ds-card-shimmer { display: none !important; }
    @keyframes ds-shelf-shimmer {
      0% { background-position: 0% 0%; opacity: 0; }
      40% { opacity: 1; }
      100% { background-position: -200% 0%; opacity: 0; }
    }
    @keyframes ds-focus-pulse {
      0% { opacity: 0; }
      40% { opacity: 1; }
      100% { opacity: 0; }
    }
    #deck-shelves-home-root .ds-card *:focus { outline: none !important; box-shadow: none !important; }
    .ds-card-art {
      position: absolute !important;
      inset: 0 !important;
      height: var(--ds-card-art-h, 100%) !important;
      padding-top: 0 !important;
      border-radius: var(--ds-card-radius, ${cachedCardRadius});
      overflow: hidden;
    }
    .ds-card-art img {
      border-radius: var(--ds-card-radius, ${cachedCardRadius});
    }
    .ds-card.gpfocus .ds-card-art,
    .ds-card:focus .ds-card-art,
    .ds-card:hover .ds-card-art {
      z-index: 2;
    }

    /* TiltedHome (Renaissance) compat — universal: when a CSS Loader theme
       sets --ren-tilt-angle on :root, our cards mirror the same skew the
       theme applies to native recents tiles. var() without a fallback on
       the angle means the whole transform is invalid (and dropped) when no
       theme defines it — zero GPU/composite cost in the no-theme case.

       The transform targets the img inside .ds-card-art rather than the
       container, because the container is absolutely positioned inside a
       .ds-card with overflow:visible — transforming the container would
       scale it past the card edges into neighboring cards. The img lives
       inside .ds-card-art (overflow:hidden) so the skew/scale is clipped.

       The cover scale is COMPUTED, not fixed: for a HxW box sheared by
       angle theta, the parallelogram fully encloses the original rect
       when scaled by 1 + abs(tan(theta)) * (H/W). The H/W ratio is
       published per card as --ds-card-h-w-ratio (set in GameCard.tsx) so
       featured (landscape) and portrait cards each get the minimum scale
       needed to cover their own skew gap — no overshooting, no wedges. */
    /* abs() is not supported in the Chromium build that ships with SteamOS,
       but max() and tan() are. abs(tan(x)) is computed via
       max(tan(x), tan(0 - x)) — for any real x, exactly one of the two
       tan() calls is positive (or both zero), so max() returns |tan(x)|. */
    .ds-card-art img {
      transform: skew(var(--ren-tilt-angle))
                 scale(calc(1 + max(tan(var(--ren-tilt-angle)), tan(calc(0deg - var(--ren-tilt-angle)))) * var(--ds-card-h-w-ratio, 1.5)));
      transition: transform 0.4s;
    }
    .ds-card.gpfocus .ds-card-art img,
    .ds-card:focus .ds-card-art img,
    .ds-card:hover .ds-card-art img {
      /* Focus state: same parametric coverage scale, plus a small
         multiplicative bump that mirrors the native scale(1.02) lift —
         expressed as +2% of whatever the cover scale resolved to. */
      transform: skew(var(--ren-tilt-angle))
                 scale(calc((1 + max(tan(var(--ren-tilt-angle)), tan(calc(0deg - var(--ren-tilt-angle)))) * var(--ds-card-h-w-ratio, 1.5)) * 1.02));
    }

    .ds-card .ds-card-label {
      opacity: 0;
      transition: opacity .15s ease;
    }

    /* Compact label variant: hide the status line but keep title positioning */
    .ds-card-label--compact .ds-card-status { display: none !important; }
    .ds-card.gpfocus .ds-card-label,
    .ds-card:focus .ds-card-label,
    .ds-card:hover .ds-card-label {
      opacity: 1;
    }
    .ds-card img { transition: opacity .15s ease; width: 100% !important; height: 100% !important; object-fit: cover !important; }
    .ds-compat {
      position: absolute; bottom: 4px; right: 4px;
      display: var(--ds-compat-display, flex); align-items: center;
      background: rgba(0,0,0,0.7);
      border-radius: 20px;
      padding: 2px;
      z-index: 3; pointer-events: none;
      width: 40px; height: 20px;
      opacity: 0;
      transition: opacity .15s ease;
    }
    .ds-card.gpfocus .ds-compat,
    .ds-card:focus .ds-compat,
    .ds-card:hover .ds-compat { opacity: var(--ds-compat-opacity, 1); }
    .ds-compat svg { flex-shrink: 0; width: 20px; height: 20px; }
    .ds-compat-deck-icon { color: var(--custom-compat-icons-deck, rgba(255,255,255,0.84)); }
    .ds-compat-verified .ds-compat-verdict-icon { color: var(--custom-compat-icons-verified, rgb(89, 191, 64)); }
    .ds-compat-playable .ds-compat-verdict-icon { color: var(--custom-compat-icons-playable, rgb(255, 200, 44)); }
    .ds-compat-unsupported .ds-compat-verdict-icon { color: var(--custom-compat-icons-unsupported, rgb(220, 222, 223)); }
    .ds-compat-unknown .ds-compat-verdict-icon { color: var(--custom-compat-icons-unknown, rgba(255,255,255,0.4)); }
    body.ds-hide-non-steam-badges .nonsteam-badge,
    .ds-card--hide-non-steam-badge .nonsteam-badge { display: none !important; }
    .ds-new-badge-band {
      position: absolute; top: -2px; left: 0; right: 0;
      height: 24px;
      display: flex; justify-content: center; align-items: flex-start;
      pointer-events: none;
      z-index: 20;
    }
    .ds-new-badge {
      background: rgb(26, 159, 255); color: #fff;
      font: 700 10px/20px "Motiva Sans", Helvetica, Arial, sans-serif;
      letter-spacing: 0.5px; text-transform: uppercase;
      padding: 2px 12px; border-radius: var(--ds-new-badge-radius, 0px);
      box-shadow: rgb(37, 53, 83) 0 1px 8px 0;
      pointer-events: none;
    }
    .ds-shelf-title {
      color: var(--ds-native-heading-color, inherit);
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .ds-shelf-collapse-icon {
      font-size: 14px;
      opacity: 0.5;
      transition: transform 0.2s;
      display: inline-block;
    }
    .ds-card-label-name {
      color: var(--ds-native-heading-color, inherit);
      font-size: inherit;
      line-height: 1.2;
      font-weight: bold;
      white-space: nowrap;
      overflow: visible;
    }
    .ds-card-status {
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0.7;
      font-size: 0.75em;
      line-height: 1.3;
      font-weight: bold;
      text-transform: uppercase;
      margin-top: 4px;
      white-space: nowrap;
      overflow: visible;
    }
    .ds-card-status-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      line-height: 0;
    }
    .ds-card-status-play { color: var(--ds-native-heading-color, rgb(89, 191, 64)); }
    .ds-more-card-text {
      font-size: 16px;
      font-weight: 400;
      line-height: 1.35;
      text-align: center;
    }
    .ds-card-art-placeholder {
      font-size: 11px;
      opacity: 0.5;
      text-align: center;
      word-break: break-word;
    }
    .ds-card.ds-card--featured .ds-card-label { opacity: 1 !important; }
    .ds-card.ds-card--featured .ds-card-art img { object-position: center top; }
  `;
}

// Single global timer for ensureStyles — shared by all DeckRow instances.
let globalStyleRefCount = 0;
let globalStyleTimer: ReturnType<typeof setInterval> | null = null;
let globalResizeHandler: (() => void) | null = null;

export function globalStylesStart() {
  if (++globalStyleRefCount === 1) {
    ensureStyles();
    globalStyleTimer = setInterval(ensureStyles, STYLES_POLL_MS);
    globalResizeHandler = () => ensureStyles();
    window.addEventListener('resize', globalResizeHandler);
    // Short burst of early polls to catch native dims as soon as Steam's home
    // renders its recents — otherwise we wait a full STYLES_POLL_MS (3s) for
    // the first chance, which visibly delays the featured card sizing.
    // Stops as soon as we have featured dims.
    const earlyDelays = [150, 350, 700, 1200, 2000];
    for (const d of earlyDelays) {
      setTimeout(() => {
        if (cachedNativeDims?.featuredWidth) return;
        ensureStyles();
      }, d);
    }
  }
}

export function globalStylesStop() {
  if (--globalStyleRefCount <= 0) {
    globalStyleRefCount = 0;
    if (globalStyleTimer) { clearInterval(globalStyleTimer); globalStyleTimer = null; }
    if (globalResizeHandler) { window.removeEventListener('resize', globalResizeHandler); globalResizeHandler = null; }
  }
}

export function formatPlaytime(minutes: number | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes}min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1).replace(".", ",")} h`;
}
