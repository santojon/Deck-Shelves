import { getPreferredSteamDocument, getAllSteamDocuments } from "../../runtime/steamHost";
import { discoverNativeCardDimensions, getRuntimeClassMap, type NativeCardDims } from "../../core/webpackCompat";
import { logInfo } from "../../runtime/logger";
import { subscribeShelfRefresh } from "../../core/shelfRefresh";
import { isFocusRoundCompatActive } from "../../core/cssLoaderDetect";
import { CARD_W, CARD_ART_H, CARD_GAP } from "./types";
import { buildShelfStylesheet, type ShelfStylesheetCtx } from "./shelfStylesheetTemplate";

const FOCUS_RING_STYLE_ID = "deck-shelves-focus-ring-suppress";

// Suppress the Steam native FocusRing overlay (separate DOM element with
// its own animation/border) when the Focus Highlight Color > Round
// Compatibility patch is on. The hash is resolved at runtime via the
// classmap; CSS rule is injected in every Steam document so it reaches BP.
function ensureFocusRingSuppress() {
  try {
    const active = isFocusRoundCompatActive();
    const docs: Document[] = [];
    const seen = new Set<Document>();
    const add = (d: Document | null | undefined) => {
      if (!d || seen.has(d)) return;
      seen.add(d);
      docs.push(d);
    };
    add(document);
    add(getPreferredSteamDocument());
    for (const d of getAllSteamDocuments()) add(d);

    if (!active) {
      for (const d of docs) {
        const s = d.getElementById(FOCUS_RING_STYLE_ID);
        if (s) s.remove();
      }
      return;
    }

    const map = getRuntimeClassMap(getPreferredSteamDocument() ?? document);
    const ringClass = map?.nativeFocusRing;
    if (!ringClass) return;

    const cssText = `[class~="${ringClass}"]{animation:none !important;border:none !important;opacity:0 !important;}`;
    for (const d of docs) {
      let s = d.getElementById(FOCUS_RING_STYLE_ID) as HTMLStyleElement | null;
      if (!s) {
        s = d.createElement("style");
        s.id = FOCUS_RING_STYLE_ID;
        d.head.appendChild(s);
      }
      if (s.textContent !== cssText) s.textContent = cssText;
    }
  } catch (e) {
    logInfo("HOME", "ensureFocusRingSuppress failed", String(e));
  }
}

const STYLE_ID = "deck-shelves-row-style";

// Tuning for native-dim discovery cycle
const DIMS_TOL_PX = 4;            // ignore jitter smaller than this
const DIMS_STABLE_POLLS = 2;      // consecutive matches required before accepting
const DIMS_DEBOUNCE_MS = 500;     // notify listeners after the churn settles
const STYLES_POLL_MS = 3000;      // fast cadence while dims aren't stable
const STYLES_POLL_MS_IDLE = 30000;// slower cadence once featured dims are cached

// Persisted cache (cold-start reflow avoidance).
// v3 stores ONE entry per viewport fingerprint so switching displays
// (1440p external ↔ 800p Deck) restores the previously-measured dims for
// each resolution instead of falling back to constants when the live
// recents is hidden and can't be re-measured.
const DIMS_CACHE_KEY = "ds-cardsize";
const DIMS_CACHE_VERSION = 3;
type PersistedDimsV3 = { v: number; entries: Array<{ fp: { vw: number; vh: number; dpr: number }; dims: NativeCardDims }> };
// Legacy v2 shape — read once on first run to migrate the prior single-entry
// cache into the new multi-entry map so users don't lose their tuned dims.
type PersistedDimsV2 = { v: number; dims: NativeCardDims; vw: number; vh: number; dpr: number };

function fpMatches(a: { vw: number; vh: number; dpr: number }, b: { vw: number; vh: number; dpr: number }): boolean {
  return a.vw === b.vw && a.vh === b.vh && Math.abs(a.dpr - b.dpr) <= 0.05;
}

let cachedCardRadius = "0px";
let cachedNewBadgeRadius = "";
let cachedNativeDims: NativeCardDims | null = null;
// Fingerprint at the time cachedNativeDims was last measured — used to detect
// resolution changes mid-session without waiting for the stability cycle.
let cachedDimsFp: { vw: number; vh: number; dpr: number } | null = null;
const nativeDimsListeners = new Set<() => void>();

// Confirmation cycle: new dims must be stable for N consecutive polls before accepting.
// This prevents flicker from transient measurements (focus scale, hover, animation frames).
let pendingDims: NativeCardDims | null = null;
let pendingDimsCount = 0;
// When the viewport changes (resolution swap) we want the very next valid
// measurement to apply without waiting for the 2-poll stability cycle —
// otherwise cards stay at the wrong size for tens of seconds after the swap.
let acceptNextMeasurementImmediately = false;

function viewportFingerprint(): { vw: number; vh: number; dpr: number } {
  // SharedJSContext has window.innerWidth/Height = 1, so reading from
  // globalThis blocks persistence (the < 100 check below). Prefer the
  // GamepadUI BrowserWindow which has the real viewport. Fall back to
  // globalThis only when the GPU window isn't reachable.
  let w: any = null;
  try { w = (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow; } catch {}
  if (!w?.innerWidth) w = globalThis as any;
  return {
    vw: Math.round(Number(w?.innerWidth ?? 0)),
    vh: Math.round(Number(w?.innerHeight ?? 0)),
    dpr: Number(w?.devicePixelRatio ?? 1),
  };
}

// Read the full persisted entries map (one entry per viewport fingerprint).
// Migrates v2 (single entry) into v3 (entries array) on first read so users
// don't lose their previously-tuned dims.
function loadPersistedEntries(): PersistedDimsV3 {
  try {
    const raw = (globalThis as any)?.localStorage?.getItem(DIMS_CACHE_KEY);
    if (!raw) return { v: DIMS_CACHE_VERSION, entries: [] };
    const parsed = JSON.parse(raw);
    if (parsed?.v === DIMS_CACHE_VERSION && Array.isArray(parsed.entries)) return parsed as PersistedDimsV3;
    // v2 migration: convert the single { dims, vw, vh, dpr } into a v3 entry.
    if (parsed?.v === 2 && parsed.dims && typeof parsed.vw === 'number') {
      const v2 = parsed as PersistedDimsV2;
      return { v: DIMS_CACHE_VERSION, entries: [{ fp: { vw: v2.vw, vh: v2.vh, dpr: v2.dpr ?? 1 }, dims: v2.dims }] };
    }
  } catch {}
  return { v: DIMS_CACHE_VERSION, entries: [] };
}

function loadPersistedDims(): { dims: NativeCardDims; fp: { vw: number; vh: number; dpr: number } } | null {
  try {
    const fp = viewportFingerprint();
    // When BigPic isn't ready yet at module load we can't pick the right
    // entry — leave cachedNativeDims null and let the polling tick re-seed
    // once a real viewport is observable.
    if (fp.vw < 100 || fp.vh < 100) return null;
    const all = loadPersistedEntries();
    const match = all.entries.find((e) => fpMatches(e.fp, fp));
    if (!match) return null;
    return { dims: match.dims, fp: match.fp };
  } catch { return null; }
}

function persistDims(dims: NativeCardDims) {
  try {
    const fp = viewportFingerprint();
    if (fp.vw < 100 || fp.vh < 100) return;
    const all = loadPersistedEntries();
    // Replace existing entry for the current fp, or append.
    const idx = all.entries.findIndex((e) => fpMatches(e.fp, fp));
    if (idx >= 0) all.entries[idx] = { fp, dims };
    else all.entries.push({ fp, dims });
    // Cap to a small number of resolutions to avoid unbounded growth.
    if (all.entries.length > 8) all.entries = all.entries.slice(-8);
    (globalThis as any)?.localStorage?.setItem(DIMS_CACHE_KEY, JSON.stringify(all));
  } catch {}
}

// Returns the persisted dims for a specific viewport fingerprint, or null.
// Used by the fp poll to restore previously-measured dims when the user
// switches to a viewport we've already seen — avoids the wait for a fresh
// measurement (which may never complete when native recents stays hidden).
function lookupPersistedForFp(fp: { vw: number; vh: number; dpr: number }): NativeCardDims | null {
  try {
    const all = loadPersistedEntries();
    const match = all.entries.find((e) => fpMatches(e.fp, fp));
    return match ? match.dims : null;
  } catch { return null; }
}

// Propagates the in-memory `cachedNativeDims` to CSS variables on every
// known Steam document's `<html>`. `ensureStyles` already does this, but
// only when a new measurement was accepted in the same call. When we set
// `cachedNativeDims` from the persisted store (fp poll lookup, cold-start
// seed) without a fresh measurement, the variables would stay stale unless
// we propagate here.
function applyCachedDimsToCssVars(): void {
  try {
    const docs: Document[] = [];
    try { docs.push(document); } catch {}
    try { docs.push(getPreferredSteamDocument()); } catch {}
    const seen = new Set<Document>();
    for (const doc of docs) {
      if (!doc || seen.has(doc)) continue;
      seen.add(doc);
      try { for (const [k, v] of nativeDimVarEntries()) doc.documentElement.style.setProperty(k, v); } catch {}
    }
  } catch {}
}

// Seed from last-session cache so cold boot skips the CARD_W/CARD_ART_H fallback
// and avoids the reflow when native dims are discovered shortly after.
// Seed cachedDimsFp from the cache's STORED fp (not the live one) so a viewport
// change since the cache was written is detected on the next ensureStyles tick.
{
  const persisted = loadPersistedDims();
  if (persisted) { cachedNativeDims = persisted.dims; cachedDimsFp = persisted.fp; }
}

let dimsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedNotifyDims(_dims: NativeCardDims) {
  if (dimsDebounceTimer) clearTimeout(dimsDebounceTimer);
  dimsDebounceTimer = setTimeout(() => {
    dimsDebounceTimer = null;
    nativeDimsListeners.forEach(cb => cb());
  }, DIMS_DEBOUNCE_MS);
}
// notifyDimsNow kept as dead code — all paths now use debouncedNotifyDims
// to avoid jarring full-screen re-renders when dims first arrive.

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
        return cs.borderRadius || '';
      }
    }
  } catch {}
  return "";
}

// Native card-dimension CSS variables. Cards reference these through the
// per-shelf --ds-eff-* vars, so a dims change reflows every card via CSS
// alone — no React re-render of the 800+ GameCards on the home screen.
// The fallbacks mirror the dims computation in DeckRow exactly.
function nativeDimVarEntries(): [string, string][] {
  const nd = cachedNativeDims;
  const w = nd?.width ?? CARD_W;
  const h = nd?.height ?? CARD_ART_H;
  return [
    ['--ds-native-card-w', `${w}px`],
    ['--ds-native-card-h', `${h}px`],
    ['--ds-native-card-gap', `${nd?.gap ?? CARD_GAP}px`],
    ['--ds-native-card-art-h', `${nd?.imgHeight ?? h}px`],
    ['--ds-native-feat-w', `${nd?.featuredWidth ?? Math.round(w * 3.21)}px`],
    ['--ds-native-feat-h', `${nd?.featuredHeight ?? h}px`],
    ['--ds-native-feat-art-h', `${nd?.featuredImgHeight ?? nd?.featuredHeight ?? h}px`],
  ];
}

// Fallback measurement that briefly un-hides native recents to get a
// measurable card, then immediately re-hides — all in one synchronous block.
// The compositor only paints DOM state at animation-frame boundaries, so the
// transient unhidden state is never shown to the user (no visible flash).
// Used when `discoverNativeCardDimensions` returns null because hideRecents
// is active and there are no other measurable native portrait cards on screen.
function discoverViaBriefUnhide(steamDoc: Document): NativeCardDims | null {
  try {
    const mount = steamDoc.getElementById('deck-shelves-home-root') as HTMLElement | null;
    if (!mount) return null;
    const recentsEl = mount.previousElementSibling as HTMLElement | null;
    if (!recentsEl) return null;
    // Hide can come from either the dedicated <style#hide-recents> element OR
    // from inline `display:none` set by applyHideRecents on the recents
    // element itself (the classmap may not have native-recents tokens, in
    // which case homePatch only sets the inline style and skips the CSS rule).
    const hideStyle = steamDoc.getElementById('deck-shelves-hide-recents-style') as HTMLStyleElement | null;
    const styleText = hideStyle?.textContent ?? '';
    const hiddenViaInline = recentsEl.style.display === 'none' || recentsEl.style.visibility === 'hidden';
    const hiddenViaStyleRule = !!styleText && styleText.includes('display: none');
    if (!hiddenViaInline && !hiddenViaStyleRule) return null;
    // Save anything we may touch
    const savedDisplay = recentsEl.style.display;
    const savedVisibility = recentsEl.style.visibility;
    const savedHeight = recentsEl.style.height;
    const savedOverflow = recentsEl.style.overflow;
    try {
      if (hideStyle && hiddenViaStyleRule) hideStyle.textContent = '';
      // Clear inline hiding too — applyHideRecents may have set both.
      recentsEl.style.display = '';
      recentsEl.style.visibility = '';
      recentsEl.style.height = '';
      recentsEl.style.overflow = '';
      // Force synchronous layout so getBoundingClientRect sees the unhidden cards.
      void recentsEl.offsetHeight;
      return discoverNativeCardDimensions(steamDoc);
    } finally {
      // Restore before the next paint so the user never sees recents flash.
      if (hideStyle && hiddenViaStyleRule) hideStyle.textContent = styleText;
      recentsEl.style.display = savedDisplay;
      recentsEl.style.visibility = savedVisibility;
      recentsEl.style.height = savedHeight;
      recentsEl.style.overflow = savedOverflow;
    }
  } catch { return null; }
}

function ensureStyles() {
  try {
    // If the viewport fingerprint changed (resolution / DPI switch), discard
    // the in-memory dims immediately so the very next measurement applies
    // without waiting for the 2-poll stability cycle. Without this, the idle
    // poll interval (30 s) means a resolution change takes up to 60 s to
    // reflect on featured-card sizing when matchNativeSize is on.
    if (cachedNativeDims && cachedDimsFp) {
      const fp = viewportFingerprint();
      if (fp.vw >= 100 && fp.vh >= 100 &&
          (fp.vw !== cachedDimsFp.vw || fp.vh !== cachedDimsFp.vh || Math.abs(fp.dpr - cachedDimsFp.dpr) > 0.05)) {
        cachedNativeDims = null;
        cachedDimsFp = null;
        pendingDims = null;
        pendingDimsCount = 0;
      }
    }
    const newRadius = detectNativeCardRadius();
    const radiusChanged = newRadius !== cachedCardRadius;
    cachedCardRadius = newRadius;
    const newBadgeRadius = detectNativeNewBadgeRadius();
    const newBadgeRadiusChanged = newBadgeRadius !== cachedNewBadgeRadius;
    cachedNewBadgeRadius = newBadgeRadius;
    const steamDoc = getPreferredSteamDocument();
    let newDims = discoverNativeCardDimensions(steamDoc) ?? discoverNativeCardDimensions(document);
    // Fallback: when hideRecents is active there are no measurable native
    // portraits on screen — discover by briefly un-hiding (sync block, no
    // visible flash). Without this, post-display-swap dims stay at fallback
    // constants until the user opens library and comes back.
    if (!newDims) newDims = discoverViaBriefUnhide(steamDoc);
    // Sanity: discard measurements that don't make sense for the current
    // viewport — happens when Steam hasn't yet re-laid out after a display
    // swap and our brief-unhide reads cards still sized for the previous
    // viewport. Native portrait cards take roughly 8-15% of viewport width;
    // anything above ~22% is almost certainly leftover layout from the
    // previous resolution and would poison the per-fp cache.
    if (newDims) {
      const fpNow = viewportFingerprint();
      if (fpNow.vw >= 100 && newDims.width / fpNow.vw > 0.22) {
        newDims = null;
      }
    }
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
      // Also accept immediately when a viewport change was just detected — the
      // stability cycle would otherwise hold cards at the wrong size for tens of
      // seconds after a display-resolution swap.
      const acquiredFeatured = !!newDims.featuredWidth && !cachedNativeDims?.featuredWidth;
      if (acquiredFeatured || acceptNextMeasurementImmediately) {
        acceptNextMeasurementImmediately = false;
        cachedNativeDims = newDims;
        cachedDimsFp = viewportFingerprint();
        persistDims(newDims);
        pendingDims = null;
        pendingDimsCount = 0;
        // Always debounce — even on first acquisition (hadDims=false).
        // notifyDimsNow() on first measurement causes all DeckRows to
        // re-render mid-interaction ("prateleiras recarregam"), which is
        // jarring on the first navigation after a restart. The debounce
        // (~100ms) is imperceptible but prevents the full-screen reload.
        debouncedNotifyDims(newDims);
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
          cachedDimsFp = viewportFingerprint();
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
      cachedDimsFp = viewportFingerprint();
      persistDims(newDims);
    } else {
      pendingDims = null;
      pendingDimsCount = 0;
    }
    // Runtime-hash-based focus ring suppression — injected/removed every
    // ensureStyles tick so it tracks theme toggle + classmap availability.
    ensureFocusRingSuppress();
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
        if (cachedNewBadgeRadius) doc.documentElement.style.setProperty('--ds-new-badge-radius', cachedNewBadgeRadius);
        else doc.documentElement.style.removeProperty('--ds-new-badge-radius');
        for (const [k, v] of nativeDimVarEntries()) doc.documentElement.style.setProperty(k, v);
      }
      // Only persist a detected value — leaving the var unset lets the
      // CSS fallback chain (var(--ds-new-badge-radius, var(--round-radius-size, 0))) pick up theme radius.
      if (cachedNewBadgeRadius) doc.documentElement.style.setProperty('--ds-new-badge-radius', cachedNewBadgeRadius);
      else doc.documentElement.style.removeProperty('--ds-new-badge-radius');

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

      // Obsidian theme detection — the theme sets `--obsidian-main-color` on
      // :root. Per-shelf hero images should inherit the same grayscale+contrast
      // filter that Obsidian applies to native hero images so they match visually.
      try {
        const obs = getComputedStyle(doc.documentElement).getPropertyValue('--obsidian-main-color').trim();
        if (obs !== '') doc.documentElement.setAttribute('data-ds-obsidian', '1');
        else doc.documentElement.removeAttribute('data-ds-obsidian');
      } catch {}

      // SLH theme defense — that CSS Loader theme locks the home page to
      // viewport height with absolutely-positioned containers, so our
      // shelves below the visible area become unreachable (no native page
      // scroll). Detected via the theme's `--SLH-lift-hero-px` custom
      // property; when present, mark the documentElement so the stylesheet
      // applies the layout overrides on the affected ancestor classes.
      // Marker is removed when the theme is no longer active.
      try {
        const slh = getComputedStyle(doc.documentElement).getPropertyValue('--SLH-lift-hero-px').trim();
        if (slh !== '') doc.documentElement.setAttribute('data-ds-slh', '1');
        else doc.documentElement.removeAttribute('data-ds-slh');
      } catch {}

      // Centered Home detection — the theme sets a padding/inset custom
      // property on :root to shift the home page content into a centered
      // column. Variable name varies across versions, so probe a known set
      // and copy the first non-empty value into our own `--ds-centered-pad`
      // so the CSS rule below has a single, stable variable to read from.
      try {
        const root = doc.documentElement;
        const cs = getComputedStyle(root);
        const candidates = [
          '--center-home-padding', '--centered-home-padding',
          '--center-home-padding-x', '--center-home-x',
          '--ch-padding', '--centered-padding',
        ];
        let chVal = '';
        for (const name of candidates) {
          const v = cs.getPropertyValue(name).trim();
          if (v !== '') { chVal = v; break; }
        }
        if (chVal !== '') {
          root.setAttribute('data-ds-centered', '1');
          root.style.setProperty('--ds-centered-pad', chVal);
        } else {
          root.removeAttribute('data-ds-centered');
          root.style.removeProperty('--ds-centered-pad');
        }
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
  const dims = cachedNativeDims;
  const ctx: ShelfStylesheetCtx = {
    cardRadius: cachedCardRadius,
    cardW: dims?.width ?? CARD_W,
    cardH: dims?.height ?? CARD_ART_H,
    cardArtH: dims?.imgHeight ?? dims?.height ?? CARD_ART_H,
    cardGap: dims?.gap ?? CARD_GAP,
    featuredW: dims?.featuredWidth ?? Math.round((dims?.width ?? CARD_W) * 3.21),
    featuredH: dims?.featuredHeight ?? dims?.height ?? CARD_ART_H,
    featuredArtH: dims?.featuredImgHeight ?? dims?.featuredHeight ?? dims?.height ?? CARD_ART_H,
  };
  return buildShelfStylesheet(ctx);
}

// Single global timer for ensureStyles — shared by all DeckRow instances.
let globalStyleRefCount = 0;
let globalStyleTimer: ReturnType<typeof setInterval> | null = null;
let globalStyleTimerPeriod: number = STYLES_POLL_MS;
let globalResizeHandler: (() => void) | null = null;

// Re-arm the steady poll at the appropriate cadence. Fast (3s) while featured
// dims aren't cached yet; slow (30s) once they are — most theme changes also
// fire resize/hashchange, which immediately re-invoke ensureStyles regardless.
function rearmStyleTimer() {
  const wantPeriod = cachedNativeDims?.featuredWidth ? STYLES_POLL_MS_IDLE : STYLES_POLL_MS;
  if (globalStyleTimer && globalStyleTimerPeriod === wantPeriod) return;
  if (globalStyleTimer) { clearInterval(globalStyleTimer); globalStyleTimer = null; }
  globalStyleTimerPeriod = wantPeriod;
  globalStyleTimer = setInterval(() => {
    ensureStyles();
    rearmStyleTimer();
  }, wantPeriod);
}

// Track which windows we've attached the resize handler to so we can detach
// them all on stop. The plugin code runs in SharedJSContext but the visual
// viewport that changes on display switch (1440p external → 800p internal)
// is the BigPicture window — resize events fire there, not on SWC. Without
// also listening on BigPic, `ensureStyles` only re-runs on the 30 s idle
// poll, leaving cards at the old size for up to 30 s after the display swap.
const resizeListenerWindows = new Set<Window>();
// Independent viewport-fingerprint poll. Resize listeners on BigPic require
// the SteamUIStore main window to be ready at `globalStylesStart` time, which
// isn't guaranteed (DeckRow can mount before SteamUIStore exposes the main
// window instance). A light 2 s fp poll catches display-resolution swaps
// regardless of when the listener attached.
let globalFpPollTimer: ReturnType<typeof setInterval> | null = null;
let lastObservedFp: { vw: number; vh: number; dpr: number } | null = null;
let globalShelfRefreshUnsub: (() => void) | null = null;

export function globalStylesStart() {
  if (++globalStyleRefCount === 1) {
    ensureStyles();
    rearmStyleTimer();
    globalResizeHandler = () => ensureStyles();
    const attach = (w: any) => {
      if (!w || resizeListenerWindows.has(w)) return;
      try { w.addEventListener('resize', globalResizeHandler!); resizeListenerWindows.add(w); } catch {}
    };
    attach(window);
    // Retry the BigPic attach for a few seconds — SteamUIStore.WindowStore may
    // not yet expose GamepadUIMainWindowInstance when this effect first runs.
    const tryAttachBig = () => {
      try { attach((globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow); } catch {}
    };
    tryAttachBig();
    for (const d of [500, 1500, 3000, 6000]) setTimeout(tryAttachBig, d);
    // Independent viewport fingerprint poll — catches resolution swaps even
    // if the resize event never fires (e.g. attach to BigPic failed silently).
    lastObservedFp = viewportFingerprint();
    globalFpPollTimer = setInterval(() => {
      try {
        const fp = viewportFingerprint();
        if (fp.vw < 100 || fp.vh < 100) return;
        if (!lastObservedFp ||
            fp.vw !== lastObservedFp.vw ||
            fp.vh !== lastObservedFp.vh ||
            Math.abs(fp.dpr - (lastObservedFp.dpr ?? 1)) > 0.05) {
          lastObservedFp = fp;
          // 1) If we've already measured this exact viewport in a prior
          //    session, restore those dims immediately — cards re-size before
          //    any measurement attempt.
          const stored = lookupPersistedForFp(fp);
          if (stored) {
            cachedNativeDims = stored;
            cachedDimsFp = fp;
            pendingDims = null;
            pendingDimsCount = 0;
            // Push the cached dims into CSS variables NOW — `ensureStyles`
            // below only updates them when a new measurement is accepted in
            // the same tick. With recents hidden, that measurement returns
            // null, so without this manual propagation the cards stay at the
            // previous viewport's dims even though the cache was updated.
            applyCachedDimsToCssVars();
            debouncedNotifyDims(stored);
          } else {
            // First time at this viewport: clear so ensureStyles measures fresh.
            cachedNativeDims = null;
            cachedDimsFp = null;
            pendingDims = null;
            pendingDimsCount = 0;
          }
          // Skip the 2-poll stability gate on the next measurement — a real
          // viewport swap is a legit change. Retry 500 ms later in case Steam
          // is still re-laying out under the new viewport at the first call.
          acceptNextMeasurementImmediately = true;
          ensureStyles();
          setTimeout(() => { try { acceptNextMeasurementImmediately = true; ensureStyles(); } catch {} }, 500);
        }
      } catch {}
    }, 2000);
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
    // Piggy-back on the shelf-refresh emitter — every refresh cycle (30 s
    // fallback + Steam app/collection change events) re-runs measurement.
    // Pairs well with `discoverViaBriefUnhide`, which makes measurement
    // succeed even when hideRecents leaves no measurable native portraits.
    globalShelfRefreshUnsub = subscribeShelfRefresh(() => { try { ensureStyles(); } catch {} });
  }
}

export function globalStylesStop() {
  if (--globalStyleRefCount <= 0) {
    globalStyleRefCount = 0;
    if (globalStyleTimer) { clearInterval(globalStyleTimer); globalStyleTimer = null; }
    globalStyleTimerPeriod = STYLES_POLL_MS;
    if (globalFpPollTimer) { clearInterval(globalFpPollTimer); globalFpPollTimer = null; }
    if (globalShelfRefreshUnsub) { try { globalShelfRefreshUnsub(); } catch {} globalShelfRefreshUnsub = null; }
    if (globalResizeHandler) {
      for (const w of resizeListenerWindows) {
        try { w.removeEventListener('resize', globalResizeHandler); } catch {}
      }
      resizeListenerWindows.clear();
      globalResizeHandler = null;
    }
  }
}

export function formatPlaytime(minutes: number | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes}min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1).replace(".", ",")} h`;
}
