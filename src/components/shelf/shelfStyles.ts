import { getPreferredSteamDocument, getAllSteamDocuments } from "../../runtime/steamHost";
import { discoverNativeCardDimensions, getRuntimeClassMap, type NativeCardDims } from "../../core/webpackCompat";
import { logInfo } from "../../runtime/logger";
import { subscribeShelfRefresh } from "../../core/shelfRefresh";
import { isFocusRoundCompatActive } from "../../core/cssLoaderDetect";
import { CARD_W, CARD_ART_H, CARD_GAP } from "./types";

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

/**
 * Reads the native NEW badge radius so DS badges match SteamOS. Returns
 * "" when no native badge is rendered (recents hidden / no qualifying
 * game) so the CSS fallback chain stays in effect for Round-family themes.
 */
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
  return `
    :root {
      --ds-card-radius: ${cachedCardRadius};
      --ds-card-dim: 0.9;
      --ds-card-bg: rgba(55, 55, 58, 0.52);
      --ds-shell-bg: transparent;
      --ds-page-bg: rgb(0, 0, 0);
      --ds-native-card-w: ${cachedNativeDims?.width ?? CARD_W}px;
      --ds-native-card-h: ${cachedNativeDims?.height ?? CARD_ART_H}px;
      --ds-native-card-gap: ${cachedNativeDims?.gap ?? CARD_GAP}px;
      --ds-native-card-art-h: ${cachedNativeDims?.imgHeight ?? cachedNativeDims?.height ?? CARD_ART_H}px;
      --ds-native-feat-w: ${cachedNativeDims?.featuredWidth ?? Math.round((cachedNativeDims?.width ?? CARD_W) * 3.21)}px;
      --ds-native-feat-h: ${cachedNativeDims?.featuredHeight ?? cachedNativeDims?.height ?? CARD_ART_H}px;
      --ds-native-feat-art-h: ${cachedNativeDims?.featuredImgHeight ?? cachedNativeDims?.featuredHeight ?? cachedNativeDims?.height ?? CARD_ART_H}px;
      --ds-card-h: ${cachedNativeDims?.height ?? CARD_ART_H}px;
      --ds-row-base-gap: ${cachedNativeDims?.gap ?? CARD_GAP}px;
    }
    #deck-shelves-home-root { margin-top: -32px !important; }
    .deck-shelves-root { background: transparent; }
    .Panel.ds-shelf { background: transparent !important; }
    .ds-row-scroll { scrollbar-width: none; -ms-overflow-style: none; }
    .ds-row-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }

    /* The Opção B promotion adds the native wrapper class to our shelves
       so theme rules (Obsidian backgrounds, Delly fades, ArtHero
       hero/mask, etc.) reach our shelf naturally. But that wrapper class
       also drags in the native rule ._39tNvaLedsTrVh0fFsP4Jm { height:
       105vh }, which would inflate the shelf to 5% past the viewport.
       Reset every DS shelf to auto unconditionally so it stays compact
       (just title + row) by default — forceCssLoaderThemes adds the
       wrapper class to ALL shelves, so the reset must cover all of them,
       not only the promoted one. The ArtHero-specific layout below has
       higher specificity and still opts the promoted shelf back into the
       tall flex container when needed. */
    .Panel.ds-shelf {
      height: auto !important;
    }

    /* ── SLH alt C shim (data-ds-slh="1") ─────────────────────────────────
       Problem: the SLH theme uses position:absolute/bottom:0 on the native
       recents grid inside a height:100vh/overflow:hidden container. When DS
       hides the native recents (height:0), that grid disappears but the
       fixed-height container stays. Our promoted shelf
       (data-ds-recents-slot="true") sits OUTSIDE that container inside
       #deck-shelves-home-root, so it is not caught by the theme's
       absolute-positioning rule and ends up at the top instead of the bottom.

       Fix: expand #deck-shelves-home-root to viewport height and pin the
       promoted shelf to its bottom via absolute positioning — mirroring the
       theme's layout contract without touching any native class names.

       NOTE: Requires validation on a real Deck with the theme active. The
       56px header offset is based on CDP observations from 2026-05-14. */
    [data-ds-slh="1"] #deck-shelves-home-root {
      height: calc(100vh - 56px);
      position: relative;
      overflow: visible;
    }
    [data-ds-slh="1"] .deck-shelves-root {
      height: 100%;
      position: relative;
    }
    [data-ds-slh="1"] .ds-shelf[data-ds-recents-slot="true"] {
      position: absolute !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: auto !important;
      /* SLH pads the grid top by the lift amount so the hero image above
         it doesn't overlap the card row. Mirror via the same variable. */
      padding-top: calc(var(--SLH-lift-hero-px, 0px) + 6px);
    }
    /* SLH + ArtHero: the ArtHero flex column still applies inside the
       absolute-positioned promoted shelf. */
    [data-ds-slh="1"] .deck-shelves-root[data-ds-hero-label="true"] .ds-shelf[data-ds-recents-slot="true"] {
      display: flex !important;
      flex-direction: column;
    }

    /* ── Centered Home shim (data-ds-centered="1") ─────────────────────────
       The Centered Home theme (by Morz) shifts the library home content into
       a centered column using a left padding defined by --center-home-padding.
       DS shelves sit in a portal outside that column and therefore stay
       full-width, not centered. We compensate by applying the same left-padding
       variable so DS shelves align with native content.

       NOTE: --center-home-padding name needs verification on a real Deck with
       the theme active. If the theme uses a different property name, update the
       detection in ensureStyles() and this rule together. */
    [data-ds-centered="1"] #deck-shelves-home-root,
    [data-ds-centered="1"] .deck-shelves-root {
      padding-left: var(--ds-centered-pad, var(--center-home-padding, 0px));
      padding-right: var(--ds-centered-pad, var(--center-home-padding, 0px));
      box-sizing: border-box;
    }
    /* The row's own left padding (2.8vw, inline-styled) compounds with the
       container padding above and offsets cards too far right. Override to 0
       so cards sit flush with the centered native column. */
    [data-ds-centered="1"] .ds-shelf .ds-row-scroll {
      padding-left: 0 !important;
    }
    [data-ds-centered="1"] .ds-shelf .ds-shelf-title {
      padding-left: 0 !important;
    }

    /* ArtHero (and any future hero-label theme) opts into the full layout:
       full-height shelf, title hidden, cards flexed to the bottom — so the
       hero overlay can fill the visible area above the row exactly the way
       native recents do. Gated on the data-ds-hero-label attribute (set by
       HeroBackground when an ArtHero-family theme is detected) so that
       deactivating ArtHero reverts the layout to the compact default
       above without any code change. */
    .deck-shelves-root[data-ds-hero-label="true"] .ds-shelf[data-ds-recents-slot="true"] {
      display: flex !important;
      flex-direction: column;
      height: calc(100vh - 56px) !important;
    }
    .deck-shelves-root[data-ds-hero-label="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-shelf-title {
      display: none !important;
    }
    .deck-shelves-root[data-ds-hero-label="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-row-scroll {
      margin-top: auto;
    }

    /* Hero-label overlay (ArtHero etc.): when the active theme requires the
       focused card's info to be shown above the row, PerShelfHero clones
       the .ds-card-label DOM into a wrapper here. The cloned label keeps
       its own classes (so all formatting matches the in-card label exactly)
       but its inline position:absolute / top:artH was meaningful only
       inside the card — reset it to static here so it lays out naturally
       in the wrapper. The original IN-CARD label is hidden so the focused
       card doesn't render the same label twice — scoped to the
       ".ds-card .ds-card-label" descendant so it does NOT also hide the
       cloned overlay label, which lives in .ds-promoted-hero-label and
       not inside a card. */
    .deck-shelves-root[data-ds-hero-label="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-card .ds-card-label {
      display: none !important;
    }
    .ds-promoted-hero-label .ds-card-label {
      position: static !important;
      top: auto !important;
      left: auto !important;
      width: auto !important;
      padding-top: 0 !important;
      opacity: 1 !important;
      display: block !important;
    }
    /* Match the native ArtHero recents game-info overlay exactly (values
       read via CDP from the native recents shelf):
         name   — 22px / weight 800 / rgb(255,255,255)
         status — 14.67px / weight 700 / rgba(255,255,255,0.5) /
                  uppercase / letter-spacing 0.5px
       Status icons are dropped — the native overlay shows just text. */
    .ds-promoted-hero-label .ds-card-label-name {
      font-size: 22px !important;
      font-weight: 800 !important;
      line-height: 1.15 !important;
      color: rgb(255, 255, 255) !important;
      white-space: nowrap !important;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.85);
    }
    .ds-promoted-hero-label .ds-card-status {
      font-size: 14.6667px !important;
      font-weight: 700 !important;
      opacity: 1 !important;
      color: rgba(255, 255, 255, 0.5) !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      margin-top: 2px !important;
      text-shadow: 0 1px 8px rgba(0, 0, 0, 0.85);
    }
    /* Hide only the play icon (installed + no pending update). The download
       icon (not installed) and the update icon (installed + update pending)
       stay visible — they convey actionable state the user needs to see. */
    .ds-promoted-hero-label .ds-card-status-icon.ds-card-status-play {
      display: none !important;
    }
    .ds-card {
      border-radius: var(--ds-card-radius, ${cachedCardRadius}) !important;
      /* overflow: visible so the badge host can extend above the card on
         focus without being clipped. The art (.ds-card-art) keeps its own
         overflow: hidden + border-radius so the cover image stays clipped. */
      overflow: visible;
      transition: transform 0.3s cubic-bezier(0.16, 0.86, 0.43, 0.99);
      scroll-margin-top: 90px;
      scroll-margin-bottom: 52px;
      scroll-margin-inline-end: 2.8vw;
    }
    /* Cancel native brightness on .ds-card so it does not create a stacking
       context that traps the badge host's z-index. Brightness is applied to
       .ds-card-art below instead. */
    #deck-shelves-home-root .ds-card { filter: none !important; }
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
    }
    /* Suppress our focus drop shadow when the "Focus Highlight Color" theme's
       Round Compatibility patch is on — that patch removes the native card
       focus indicator, so DS cards should match. Spec needs the #id prefix
       to beat the (1,2,0) original focus rule. */
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:focus,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card.gpfocus,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:hover {
      box-shadow: none !important;
    }
    /* Synthetic decoration cards with placeholder=false (the default)
       render no background fill - the native card class still carries
       a baseline drop shadow from the theme, which paints against
       nothing and looks like a floating shadow with no card. Suppress
       it across every state (idle / focus / hover) for transparent
       decoration slots; placeholder=true keeps the shadow so the
       grey card panel reads as a real card. */
    #deck-shelves-home-root .ds-card--synthetic-noshadow,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:focus,
    #deck-shelves-home-root .ds-card--synthetic-noshadow.gpfocus,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:hover {
      box-shadow: none !important;
    }
    /* Shadow-only-on-focus mode: suppress drop shadow at idle, restore it
       on focus/hover. Mirrors the native focus shadow so the framed look
       only kicks in when the user actually navigates to the card. */
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only {
      box-shadow: none !important;
    }
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only:focus,
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only.gpfocus,
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only:hover {
      box-shadow: 0 8px 16px rgba(0,0,0,0.5) !important;
    }
    /* Same suppression for the native shine ::after layer — paints
       over a transparent card it can't visually anchor against. */
    #deck-shelves-home-root .ds-card--synthetic-noshadow::after,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:focus::after,
    #deck-shelves-home-root .ds-card--synthetic-noshadow.gpfocus::after,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:hover::after {
      opacity: 0 !important;
      animation: none !important;
    }
    /* Also kill the Game Cover Shine ::after animation/opacity under the same
       flag — that pseudo paints over the card on focus and isn't controlled
       by the Round Compat patch on its own. */
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:focus::after,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card.gpfocus::after,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:hover::after {
      opacity: 0 !important;
      animation: none !important;
    }
    #deck-shelves-home-root { z-index: 10 !important; }
    /* Round Compat ON: hide the FocusRing entirely. Gated on the html-level
       flag so the rule can reach the FocusRing's subtree (which sits outside
       .deck-shelves-root). Hash kept in sync with classmap entry for
       FocusRing — if a Steam release breaks this, update the class below. */
    html[data-ds-theme-focus-round-compat="true"] ._1wPplsegQqCoe06wXPhzKT {
      animation: none !important;
      border: none !important;
      outline: none !important;
      opacity: 0 !important;
    }
    /* Round Compat OFF: the FocusRing carries TWO visual layers — a static
       white border (Steam native) and a themed colored outline (animated
       blinker). Suppress the border AND switch box-sizing to border-box so
       the ring's box stays the exact card size on all four sides (default
       content-box made the border push the right/bottom edges 4px out).
       Then outline-offset: 1px places the colored outline 1px outside the
       card edge symmetrically. Scoped via :has() to apply only when a
       ds-card is the focused element, leaving other Steam screens alone. */
    html:has(.ds-card.gpfocus):not([data-ds-theme-focus-round-compat="true"]) ._1wPplsegQqCoe06wXPhzKT,
    html:has(.ds-card:focus):not([data-ds-theme-focus-round-compat="true"]) ._1wPplsegQqCoe06wXPhzKT {
      box-sizing: border-box !important;
      border: 0 none transparent !important;
      margin: 0 !important;
      outline-offset: 1px !important;
    }
    /* Layout-only ::after: matches the card's art height/radius so any
       theme overlay (e.g. Game Cover Shine focus animation) targets the
       right region. Opacity is NOT forced here — the cover-shine theme
       relies on opacity 0 by default + opacity 0.8 on :focus to run its
       shine animation. Forcing opacity 1 made the shine gradient static-
       visible on every card (purple stripe at bottom-right). */
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
      display: inline !important;
    }
    #deck-shelves-home-root .ds-card.gpfocus::after,
    #deck-shelves-home-root .ds-card:focus::after,
    #deck-shelves-home-root .ds-card:hover::after {
      height: var(--ds-card-art-h, 100%) !important;
      bottom: auto !important;
      border-radius: var(--ds-card-radius, ${cachedCardRadius}) !important;
    }
    #deck-shelves-home-root .ds-card .ds-card-shimmer {
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, rgba(90,90,90,0.18) 0%, rgba(160,160,160,0.32) 50%, rgba(90,90,90,0.18) 100%);
      background-size: 200% 100%;
      animation: ds-shelf-shimmer 2s ease-in-out infinite;
      pointer-events: none;
      z-index: 1;
      border-radius: var(--ds-card-radius, 4px);
    }
    #deck-shelves-home-root .ds-card .ds-card-shimmer--loaded { display: none; }
    /* Hero img opacity gate — defends against the browser's broken-
       image glyph painting during the gap between src assignment and
       first decoded byte (especially for slot swaps where the new
       URL hasn't loaded yet but its wrapper is already at full
       opacity from the cross-fade). 60 ms transition (was 180 ms) so
       cached/cold loads alike feel near-instant. PerShelfHero sets
       is-loaded synchronously via a ref callback when the img is
       already decoded (hot blob URL / HTTP cache hit), so cached
       hero swaps don't even need a render cycle to flip the class.
       ID-scoped under #deck-shelves-home-root to beat the
       no-hero-gradient theme rule's (0,4,0) specificity. */
    /* Hero img opacity gating — the transition runs ONLY on the up-leg
       (going from 0 → 1 when the image actually decodes). Going back to
       0 (fallback chain advancing to the next URL after an error, src
       reassigned to a different game on focus change, etc.) is instant.
       A symmetric transition let a frame of the BROWSER'S broken-img
       placeholder peek through during the fade-out — visible as a quick
       broken-hero flash when the first shelf is in the recents slot
       (there's no native hero behind to mask it). */
    #deck-shelves-home-root .ds-per-shelf-hero-img { opacity: 0 !important; transition: none !important; }
    #deck-shelves-home-root .ds-per-shelf-hero-img.is-loaded { opacity: 1 !important; transition: opacity 0.06s ease !important; }
    /* TiltedHome integration: see the block scoped under
       [data-ds-theme-tilted-home="true"] further down. The intermediate
       skew-based version was removed because it conflicted with the
       theme's own rotateY transforms. */
    /* Refresh icon spin — driven by class added on click via DOM (not React
       state) so the animation survives the upstream setAppIds() that may
       reconcile the row while playing. The class is re-added each click via
       a remove + reflow + add sequence so consecutive clicks restart the
       spin from 0deg instead of stuttering. */
    @keyframes ds-refresh-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .ds-refresh-icon.ds-refresh-spinning {
      animation: ds-refresh-spin 0.7s cubic-bezier(0.4, 0.05, 0.4, 1);
    }
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
      filter: brightness(var(--ds-card-dim, 0.9)) !important;
      transition: filter 0.4s cubic-bezier(0, 0.73, 0.48, 1);
    }
    .ds-card-art img {
      border-radius: var(--ds-card-radius, ${cachedCardRadius});
    }
    #deck-shelves-home-root .ds-card.gpfocus .ds-card-art,
    #deck-shelves-home-root .ds-card:focus .ds-card-art,
    #deck-shelves-home-root .ds-card:hover .ds-card-art {
      z-index: 2;
      filter: brightness(1) !important;
    }

    /* =================================================================
       TiltedHome theme integration — single, native-equivalent
       =================================================================
       Activated only when isTiltedHomeActive() returns true (HomeInject
       sets data-ds-theme-tilted-home="true" on .deck-shelves-root). The
       prior implementation applied a 2-D skew using --ren-tilt-angle
       blindly whenever the variable was defined, but native TiltedHome
       uses perspective + rotateY (3-D fan), so DS cards were rendered
       skewed while native cards rotated — visual conflict the user
       reported as "duas implementações sobrepondo".

       Approach (mirrors native TiltedHome exactly):
       - Default (cards LEFT of focus + the focused card before override):
         perspective(600px) rotateY(2*angle) — leans toward the right
       - Cards AFTER focused (sibling combinator ~): rotateY(-2*angle)
         — leans toward the left, completing the fan around the focused
         card
       - Focused card: scale(1.05) only, no rotation — pivot of the fan
         (matches native's .gpfocuswithin > div:first-child treatment)
       - Trailing tiles (.ds-refresh-card / .ds-more-card): tilted +
         scaled like native's GoToLibrary tile
       - Row: overflow-y visible + perspective parent so tilted edges
         aren't clipped

       Reads the user's --ren-tilt-angle and --ren-view-more-focus-scale
       directly from :root so the tilt intensity matches whatever the
       user configured in the TiltedHome theme module. Honors gpfocus
       AND gpfocuswithin (Steam toggles both during d-pad nav). */

    /* DS-side overrides target .ds-card > .ds-card-art (the same
       element TiltedHome's native selector targets via > div:first-child
       on the wrapper class we add via resolveNativeCardClass). That
       way TiltedHome's DEFAULT rule (the left-tilt rotation) reaches
       DS cards naturally via the shared wrapper class — no need to
       duplicate it here. We only ADD the cases TiltedHome's native
       selectors can't reach because they rely on the ReactVirtualized
       grid structure DS doesn't replicate:

       - Right-side override: cards AFTER the focused one need the
         opposite-sign rotation. TiltedHome's rule wraps this in a
         ReactVirtualized__Grid__innerScrollContainer + gpfocuswithin
         sibling selector chain that DS doesn't have, so we mirror it
         with our own sibling combinator (.ds-card.gpfocuswithin ~
         .ds-card).
       - Focused override: native applies scale(1.02) to the focused
         tile's first child; we apply slightly larger scale(1.05).

       All overrides target .ds-card-art so they cascade together
       with TiltedHome's rule on the same element (no double transform
       on the wrapper). */
    /* =================================================================
       DS-side TiltedHome implementation — full mode-aware support.
       =================================================================
       Why DS-side and not class-adoption: Decky's Focusable puts a
       tabindex on the same wrapper that would adopt nativeCardWrapper,
       and some TiltedHome modules' focused-state selectors use the
       tabindex attribute to match the focused tile — which would then
       match EVERY DS card and replace the tilt with a flat scale on
       all of them. Until we rebuild on a custom focus primitive
       (NativeFocusable) that puts tabindex on a deeper element
       matching native's hierarchy, DS implements its own tilt CSS
       that mirrors each TiltedHome variant exactly.

       Mode detection lives in cssLoaderDetect.ts:getTiltedHomeMode()
       and is published as data attrs on .deck-shelves-root by
       HomeInject:
         data-ds-theme-tilt-method = "skew" | "3d"
         data-ds-theme-tilt-direction = "one-way" | "opposites"

       Variants supported:
       - SKEW one-way: every tile gets skew(angle) — most common
         TiltedHome install (one CSS Loader module, no opposite override)
       - SKEW opposites: cards before focus skew(+angle), after skew(-angle)
       - 3D one-way: every tile gets perspective + rotateY(angle)
       - 3D opposites: same with sibling override

       Tilt is applied to .ds-card ITSELF (not the wrapping div) so the
       Focusable's box-shadow focus indicator (computed from the card's
       bounding rect) follows the tilt — fixes the "foco aparentemente
       alinhado por dentro do card" issue where the focus ring stayed
       rectangular inside a tilted parallelogram visual.

       The wrapping div added in GameCard / MoreCard / RefreshCard
       intentionally stays — it lets the card art keep its existing
       layout while the parent tilts as a single unit. PlaceholderCard
       and SyntheticCard don't have the wrapping div but render the
       art element directly as the card's child, which also tilts
       because the transform is on the .ds-card parent. */

    /* Row needs perspective context for 3D tilts to compose around a
       fixed eye-point, plus overflow-y: visible so tilted edges
       aren't clipped at the row boundary. */
    .deck-shelves-root[data-ds-theme-tilted-home="true"] .ds-row-scroll {
      overflow-y: visible !important;
      perspective: 600px !important;
    }
    /* Tilt applied to .ds-card ITSELF (the wrapper) — NOT the inner
       first-child div — so the Focusable's box-shadow focus indicator
       (computed from the wrapper's bounding rect) follows the tilt
       visually. All rules use !important to beat Steam's native
       higher-specificity :focus rule
       (.BasicUI .WYgDg9NyCcMIVuMyZ_NBC.Focusable:focus._3VOR2AeYATx3qSE0I-Pm-5
       { transform: translateZ(7px) }) which would otherwise zero out
       our tilt on the focused card. We compose translateZ(7px) into
       the focused rule so the native depth-lift effect is preserved. */

    /* SKEW one-way: every card tilts same direction. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) !important;
      transition: transform 0.4s !important;
    }
    /* SKEW opposites: default lean one way, sibling-after-focused flips. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus ~ .ds-card {
      transform: skew(calc(-1 * var(--ren-tilt-angle, -5deg))) !important;
    }
    /* SKEW focused — one-way mode: KEEP the directional tilt + scale +
       Steam's translateZ. The whole row leans the same direction so
       the selected card stays integrated by keeping its tilt.
       Opposites mode: focused goes FLAT (no skew, just scale +
       translateZ) — the surrounding cards form a fan converging on
       the focused tile, so the pivot of the fan reads correctly
       only when it itself has no tilt (matches native behaviour). */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-card:focus {
      transform: skew(var(--ren-tilt-angle, -5deg)) scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card:focus {
      transform: scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }

    /* 3D one-way: every card gets perspective + rotateY same direction. */
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-card {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) !important;
      transform-style: preserve-3d !important;
      transition: transform 0.4s !important;
    }
    /* 3D opposites: default lean left (+2*angle), sibling-after-focused
       flips to right (-2*angle). Together these form the fan
       composition converging on the focused card. */
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) !important;
      transform-style: preserve-3d !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus ~ .ds-card {
      transform: perspective(600px) rotateY(calc(-2 * var(--ren-tilt-angle, -5deg))) !important;
    }
    /* 3D focused — same direction rule as SKEW. One-way keeps the
       rotation; opposites flattens the focused pivot. */
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-card:focus {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card:focus {
      transform: scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }

    /* Trailing tiles (Refresh / More) — view-more / GoToLibrary
       treatment. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"] .ds-refresh-card,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"] .ds-more-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) scale(var(--ren-view-more-focus-scale, 0.88)) !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"] .ds-refresh-card,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"] .ds-more-card {
      transform: perspective(600px) rotateY(calc(-2 * var(--ren-tilt-angle, -5deg))) scale(var(--ren-view-more-focus-scale, 0.88)) !important;
      transition: transform 0.4s !important;
    }
    /* Trailing tiles focused — same one-way-keeps-tilt /
       opposites-flattens rule as game tiles. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-more-card.gpfocus {
      transform: skew(var(--ren-tilt-angle, -5deg)) scale(1.05) translateZ(7px) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-more-card.gpfocus {
      transform: scale(1.05) translateZ(7px) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-more-card.gpfocus {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) scale(1.05) translateZ(7px) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-more-card.gpfocus {
      transform: scale(1.05) translateZ(7px) !important;
    }

    /* Most-recent / first tile offset — mirrors native's
       --ren-most-recent-offset shift. */
    .deck-shelves-root[data-ds-theme-tilted-home="true"] .ds-row-scroll > .ds-card:first-child {
      margin-left: var(--ren-most-recent-offset, 2%);
    }

    /* Counter-tilt the verified / playable badge so it reads
       horizontally even though the card is tilted. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"] .ds-card .ds-compat {
      transform: skew(calc(-1 * var(--ren-tilt-angle, -5deg)));
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
      position: absolute; top: 0px; left: 0; right: 0;
      height: 24px;
      display: flex; justify-content: center; align-items: flex-start;
      pointer-events: none;
      z-index: 21;
    }
    /* Badge host: 2px above the card top by default, rises to 12px on
       focus/hover. */
    .ds-card .ds-card-badge-host {
      top: -2px;
      height: calc(100% + 2px);
      transition: top 0.15s ease, height 0.15s ease;
    }
    .ds-card.gpfocus .ds-card-badge-host,
    .ds-card:focus .ds-card-badge-host,
    .ds-card:hover .ds-card-badge-host,
    .ds-card.is-selected .ds-card-badge-host {
      top: -10px;
      height: calc(100% + 10px);
    }
    .ds-new-badge {
      /* Mirrors the native SteamOS "New" badge color resolution:
         themes may override --ds-new-badge-bg directly; otherwise the
         badge falls back to --colored-toggles-main-color (the same var
         the native badge uses, set by themes like Colored Toggles), and
         finally to the Steam-default blue when no theme is active.
         Round / More Round themes set --round-radius-size on :root —
         badges (new + discount, both share this class) inherit it
         unconditionally so the round always applies regardless of
         force / promoted-slot state. */
      background: var(--ds-new-badge-bg, var(--colored-toggles-main-color, rgb(26, 159, 255)));
      color: var(--ds-new-badge-color, #fff);
      font: 700 10px/20px "Motiva Sans", Helvetica, Arial, sans-serif;
      letter-spacing: 0.5px; text-transform: uppercase;
      padding: 2px 12px;
      border-radius: var(--ds-new-badge-radius, var(--round-radius-size, 0px));
      box-shadow: rgb(37, 53, 83) 0 1px 8px 0;
      pointer-events: none;
      z-index: 21;
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
    .ds-card.ds-card--featured .ds-card-art img { object-position: center top; }

    /* ── Per-shelf hero art ─────────────────────────────────────────────────
       Hero images rendered by PerShelfHero (in DeckRow when heroEnabled=true).
       Subtle zoom animation mirrors the 25s native Steam hero zoom. */
    @keyframes ds-per-shelf-hero-zoom {
      from { transform: scale(1); }
      to   { transform: scale(var(--ds-hero-zoom-scale, 1.06)); }
    }
    .ds-shelf[data-ds-hero-enabled="true"] .ds-per-shelf-hero-img {
      animation: ds-per-shelf-hero-zoom var(--ds-hero-zoom-duration, 25s) var(--ds-hero-zoom-ease, ease) infinite alternate;
      transition: opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83),
                  filter 0.35s ease;
      /* Respect theme overrides via CSS variables for fit/position/filter */
      object-fit: var(--ds-hero-fit, cover);
      object-position: var(--ds-hero-position, 50% 18%);
      filter: var(--ds-hero-appearance-filter, none);
      mask-image: var(--ds-hero-mask, none);
      -webkit-mask-image: var(--ds-hero-mask, none);
    }

    /* Global promoted hero background container — themes can override the
       mask via --ds-hero-mask on :root. Fallback mirrors the native linear
       bottom fade when no theme provides a mask. */
    .ds-hero-background {
      mask-image: var(--ds-hero-mask, linear-gradient(rgb(0,0,0) 90%, rgba(0,0,0,0) calc(100% - 5px)));
      -webkit-mask-image: var(--ds-hero-mask, linear-gradient(rgb(0,0,0) 90%, rgba(0,0,0,0) calc(100% - 5px)));
    }

    /* Obsidian without ArtHero: apply grayscale+contrast to per-shelf hero
       images so they match the first shelf. When ArtHero is also active
       (data-ds-hero-label set on .deck-shelves-root), the first shelf shows
       colour — so skip grayscale on all per-shelf heroes to match. */
    [data-ds-obsidian="1"] .deck-shelves-root:not([data-ds-hero-label="true"]) .ds-shelf[data-ds-hero-enabled="true"] .ds-per-shelf-hero-img {
      filter: grayscale(1) contrast(1.1);
    }

    /* Theme inheritance for promoted (recents-slot) shelves. The slot
       attribute scopes these rules to the first shelf (hideRecents) or to
       every shelf (force on). */

    /* Carousel transparency: only the portrait artwork dims. Label keeps
       its own opacity:0 default (visible on focus); badge band stays at 1
       because it's not in the selector. Specificity bump (#deck-shelves-
       home-root) outranks the carousel theme's gpfocuswithin rule. */
    #deck-shelves-home-root .ds-card:not(.gpfocus):not(.is-selected):not(:hover):not(:focus) .ds-card-art {
      opacity: var(--carousel-opacity, 1) !important;
      transition: opacity 0.2s ease-in-out;
    }
    #deck-shelves-home-root .ds-card.gpfocus .ds-card-art,
    #deck-shelves-home-root .ds-card:focus .ds-card-art,
    #deck-shelves-home-root .ds-card:hover .ds-card-art,
    #deck-shelves-home-root .ds-card.is-selected .ds-card-art {
      opacity: 1 !important;
    }
    .ds-card { opacity: 1 !important; }

    /* First DS shelf below native (hideRecents off): 150px upward bleed
       with a 6-stop top fade that lands opaque at the shelf top. Bottom
       fade is extended to 132px / 5 stops for a smoother blend into the
       next shelf. */
    .deck-shelves-root > .ds-shelf:first-child:not([data-ds-recents-slot="true"]) [data-ds-per-shelf-hero="true"] {
      --ds-hero-top: -150px;
      --ds-hero-h: calc(100% + 150px);
      --ds-hero-mask: linear-gradient(to bottom,
        transparent 0,
        rgba(0,0,0,0.08) 30px,
        rgba(0,0,0,0.25) 60px,
        rgba(0,0,0,0.5) 90px,
        rgba(0,0,0,0.78) 120px,
        black 150px,
        black calc(100% - 140px),
        rgba(0,0,0,0.78) calc(100% - 105px),
        rgba(0,0,0,0.45) calc(100% - 70px),
        rgba(0,0,0,0.2) calc(100% - 35px),
        transparent calc(100% - 8px));
    }

    /* Second DS shelf top bleed — tuned based on what the first is.
       Default inline -140 stays for force/other cases. */

    /* No force + native visible: larger bleed for the second (170). */
    .deck-shelves-root > .ds-shelf:first-child:not([data-ds-recents-slot="true"]) + .ds-shelf [data-ds-per-shelf-hero="true"] {
      --ds-hero-top: -170px;
      --ds-hero-h: calc(100% + 170px);
    }

    /* No force + recents hidden: smaller bleed for the second (110). */
    .deck-shelves-root > .ds-shelf[data-ds-recents-slot="true"]:first-child + .ds-shelf:not([data-ds-recents-slot="true"]) [data-ds-per-shelf-hero="true"] {
      --ds-hero-top: -110px;
      --ds-hero-h: calc(100% + 110px);
    }

    /* No Hero Gradient — strip mask/zoom on promoted heroes. */
    [data-ds-theme-no-hero-gradient="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-per-shelf-hero-img {
      mask-image: none !important;
      -webkit-mask-image: none !important;
      filter: none !important;
      opacity: 1 !important;
      animation: none !important;
    }

    /* Hero Fullscreen — promoted shelves take the full viewport. Hero
       vars set inline in PerShelfHero are overridden here via CSS. */
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"] .ds-shelf[data-ds-recents-slot="true"] {
      height: 100vh !important;
      --ds-hero-top: 0px;
      --ds-hero-h: 100vh;
    }
    /* First DS shelf pulled UP 56px only when recents are hidden (no
       native content above) — covers the transparent header band without
       overlapping native when it stays visible. */
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"][data-ds-recents-hidden="true"] > .ds-shelf[data-ds-recents-slot="true"]:first-child {
      margin-top: -56px;
    }
    /* FORCE: clean page-per-shelf (no margin, no hero fade). */
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"][data-ds-force-themes="true"] .ds-shelf {
      margin-bottom: 0 !important;
    }
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"][data-ds-force-themes="true"] .ds-shelf[data-ds-recents-slot="true"] [data-ds-per-shelf-hero="true"] {
      mask-image: none !important;
      -webkit-mask-image: none !important;
    }

    /* No Home Text — only engages under force (per user spec). */
    [data-ds-force-themes="true"][data-ds-theme-no-home-text="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-card-label,
    [data-ds-force-themes="true"][data-ds-theme-no-home-text="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-promoted-hero-label {
      visibility: hidden !important;
    }
  `;
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
