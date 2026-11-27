import { getPreferredSteamDocument, getAllSteamDocuments } from "../../runtime/steamHost";
import { discoverNativeCardDimensions, getRuntimeClassMap, type NativeCardDims } from "../../core/webpackCompat";
import { logInfo } from "../../runtime/logger";
import { subscribeShelfRefresh } from "../../core/shelfRefresh";
import { isFocusRoundCompatActive } from "../../core/cssLoaderDetect";
import { applyDocumentThemeFlags } from "../../themes/registry";
import { CARD_W, CARD_ART_H, CARD_GAP } from "./types";
import { buildShelfStylesheet, type ShelfStylesheetCtx } from "./shelfStylesheetTemplate";
import { homeBehindGame } from "../home/mountUtils";

const FOCUS_RING_STYLE_ID = "deck-shelves-focus-ring-suppress";

function collectStyleDocs(): Document[] {
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
  return docs;
}

function removeFocusRingStyle(docs: Document[]) {
  for (const d of docs) {
    const s = d.getElementById(FOCUS_RING_STYLE_ID);
    if (s) s.remove();
  }
}

function applyFocusRingStyle(docs: Document[], cssText: string) {
  for (const d of docs) {
    let s = d.getElementById(FOCUS_RING_STYLE_ID) as HTMLStyleElement | null;
    if (!s) {
      s = d.createElement("style");
      s.id = FOCUS_RING_STYLE_ID;
      d.head.appendChild(s);
    }
    if (s.textContent !== cssText) s.textContent = cssText;
  }
}

function ensureFocusRingSuppress() {
  try {
    const docs = collectStyleDocs();
    if (!isFocusRoundCompatActive()) {
      removeFocusRingStyle(docs);
      return;
    }
    const map = getRuntimeClassMap(getPreferredSteamDocument() ?? document);
    const ringClass = map?.nativeFocusRing;
    if (!ringClass) return;
    applyFocusRingStyle(docs, `[class~="${ringClass}"]{animation:none !important;border:none !important;opacity:0 !important;}`);
  } catch (e) {
    logInfo("HOME", "ensureFocusRingSuppress failed", String(e));
  }
}

const STYLE_ID = "deck-shelves-row-style";

const DIMS_TOL_PX = 4;
const DIMS_STABLE_POLLS = 2;
const DIMS_DEBOUNCE_MS = 500;
const STYLES_POLL_MS = 3000;
const STYLES_POLL_MS_IDLE = 30000;

const DIMS_CACHE_KEY = "ds-cardsize";
const DIMS_CACHE_VERSION = 3;
type PersistedDimsV3 = { v: number; entries: Array<{ fp: { vw: number; vh: number; dpr: number }; dims: NativeCardDims }> };
type PersistedDimsV2 = { v: number; dims: NativeCardDims; vw: number; vh: number; dpr: number };

function fpMatches(a: { vw: number; vh: number; dpr: number }, b: { vw: number; vh: number; dpr: number }): boolean {
  return a.vw === b.vw && a.vh === b.vh && Math.abs(a.dpr - b.dpr) <= 0.05;
}

let cachedCardRadius = "0px";
let cachedNewBadgeRadius = "";
let cachedNativeDims: NativeCardDims | null = null;
let cachedDimsFp: { vw: number; vh: number; dpr: number } | null = null;
const nativeDimsListeners = new Set<() => void>();

// Two matching polls before accepting, so focus scale or animation frames don't cause flicker.
let pendingDims: NativeCardDims | null = null;
let pendingDimsCount = 0;
let acceptNextMeasurementImmediately = false;

function resolveViewportWindow(): any {
  // SharedJSContext reports innerWidth/innerHeight as 1, so use the GamepadUI window.
  let w: any = null;
  try { w = (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow; } catch {}
  return w?.innerWidth ? w : (globalThis as any);
}

function viewportFingerprint(): { vw: number; vh: number; dpr: number } {
  const w = resolveViewportWindow();
  return {
    vw: Math.round(Number(w?.innerWidth ?? 0)),
    vh: Math.round(Number(w?.innerHeight ?? 0)),
    dpr: Number(w?.devicePixelRatio ?? 1),
  };
}

function migrateV2Entry(parsed: any): PersistedDimsV3 | null {
  if (parsed?.v === 2 && parsed.dims && typeof parsed.vw === 'number') {
    const v2 = parsed as PersistedDimsV2;
    return { v: DIMS_CACHE_VERSION, entries: [{ fp: { vw: v2.vw, vh: v2.vh, dpr: v2.dpr ?? 1 }, dims: v2.dims }] };
  }
  return null;
}

function loadPersistedEntries(): PersistedDimsV3 {
  try {
    const raw = (globalThis as any)?.localStorage?.getItem(DIMS_CACHE_KEY);
    if (!raw) return { v: DIMS_CACHE_VERSION, entries: [] };
    const parsed = JSON.parse(raw);
    if (parsed?.v === DIMS_CACHE_VERSION && Array.isArray(parsed.entries)) return parsed as PersistedDimsV3;
    const migrated = migrateV2Entry(parsed);
    if (migrated) return migrated;
  } catch {}
  return { v: DIMS_CACHE_VERSION, entries: [] };
}

function loadPersistedDims(): { dims: NativeCardDims; fp: { vw: number; vh: number; dpr: number } } | null {
  try {
    const fp = viewportFingerprint();
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
    const idx = all.entries.findIndex((e) => fpMatches(e.fp, fp));
    if (idx >= 0) all.entries[idx] = { fp, dims };
    else all.entries.push({ fp, dims });
    if (all.entries.length > 8) all.entries = all.entries.slice(-8);
    (globalThis as any)?.localStorage?.setItem(DIMS_CACHE_KEY, JSON.stringify(all));
  } catch {}
}

function lookupPersistedForFp(fp: { vw: number; vh: number; dpr: number }): NativeCardDims | null {
  try {
    const all = loadPersistedEntries();
    const match = all.entries.find((e) => fpMatches(e.fp, fp));
    return match ? match.dims : null;
  } catch { return null; }
}

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

export function clampCardGap(rawGap: number, cardWidth: number): number {
  return Math.min(Math.max(rawGap, 8), cardWidth * 0.5);
}

export function getCachedCardRadius(): string { return cachedCardRadius; }
export function getCachedNativeDims(): NativeCardDims | null { return cachedNativeDims; }
export function onNativeDimsChange(cb: () => void): () => void {
  nativeDimsListeners.add(cb);
  return () => { nativeDimsListeners.delete(cb); };
}

function panelBorderRadius(panel: HTMLElement): string | null {
  const cls = panel.className ?? "";
  if (cls.indexOf("ds-card") >= 0 || cls.indexOf("ds-row") >= 0) return null;
  if (!panel.querySelector("img")) return null;
  try {
    const r = getComputedStyle(panel).borderRadius;
    if (r && r !== "0px") return r;
  } catch {}
  return null;
}

function detectNativeCardRadius(): string {
  try {
    const doc = getPreferredSteamDocument();
    if (!doc) return "0px";
    const panels = doc.querySelectorAll(".Panel.Focusable");
    for (let i = 0; i < panels.length; i++) {
      const r = panelBorderRadius(panels[i] as HTMLElement);
      if (r) return r;
    }
  } catch {
    logInfo("HOME", "detectNativeCardRadius failed");
  }
  return "0px";
}

function newBadgeRadius(el: HTMLElement): string | null {
  if (el.children.length !== 0) return null;
  const t = el.textContent;
  if (t !== 'Novo' && t !== 'NEW' && t !== 'New') return null;
  const cs = getComputedStyle(el);
  if (cs.backgroundColor !== 'rgb(26, 159, 255)') return null;
  return cs.borderRadius || '';
}

function detectNativeNewBadgeRadius(): string {
  try {
    const docs = [getPreferredSteamDocument(), document];
    for (const doc of docs) {
      if (!doc) continue;
      const nodes = doc.querySelectorAll<HTMLElement>('*');
      for (let i = 0; i < nodes.length; i++) {
        const r = newBadgeRadius(nodes[i]);
        if (r !== null) return r;
      }
    }
  } catch {}
  return "";
}

type EffectiveDims = { w: number; h: number; gap: number; artH: number; featW: number; featH: number; featArtH: number };

function featuredDims(nd: NativeCardDims | null, w: number, h: number): Pick<EffectiveDims, 'featW' | 'featH' | 'featArtH'> {
  return {
    featW: nd?.featuredWidth ?? Math.round(w * 3.21),
    featH: nd?.featuredHeight ?? h,
    featArtH: nd?.featuredImgHeight ?? nd?.featuredHeight ?? h,
  };
}

function effectiveDims(nd: NativeCardDims | null): EffectiveDims {
  const w = nd?.width ?? CARD_W;
  const h = nd?.height ?? CARD_ART_H;
  return {
    w,
    h,
    gap: nd ? clampCardGap(nd.gap, w) : CARD_GAP,
    artH: nd?.imgHeight ?? h,
    ...featuredDims(nd, w, h),
  };
}

function nativeDimVarEntries(): [string, string][] {
  const d = effectiveDims(cachedNativeDims);
  return [
    ['--ds-native-card-w', `${d.w}px`],
    ['--ds-native-card-h', `${d.h}px`],
    ['--ds-native-card-gap', `${d.gap}px`],
    ['--ds-native-card-art-h', `${d.artH}px`],
    ['--ds-native-feat-w', `${d.featW}px`],
    ['--ds-native-feat-h', `${d.featH}px`],
    ['--ds-native-feat-art-h', `${d.featArtH}px`],
  ];
}

// Brief un-hide to measure a native card; frames only paint between tasks, so it never shows.
type HideRecentsRule = { el: HTMLStyleElement | null; text: string; active: boolean };

function readHideRecentsRule(steamDoc: Document): HideRecentsRule {
  const el = steamDoc.getElementById('deck-shelves-hide-recents-style') as HTMLStyleElement | null;
  const text = el?.textContent ?? '';
  return { el, text, active: !!text && text.includes('display: none') };
}

function isInlineHidden(el: HTMLElement): boolean {
  return el.style.display === 'none' || el.style.visibility === 'hidden';
}

function unhideRecents(recentsEl: HTMLElement, rule: HideRecentsRule): () => void {
  const saved = { display: recentsEl.style.display, visibility: recentsEl.style.visibility, height: recentsEl.style.height, overflow: recentsEl.style.overflow };
  if (rule.el && rule.active) rule.el.textContent = '';
  recentsEl.style.display = '';
  recentsEl.style.visibility = '';
  recentsEl.style.height = '';
  recentsEl.style.overflow = '';
  return () => {
    if (rule.el && rule.active) rule.el.textContent = rule.text;
    recentsEl.style.display = saved.display;
    recentsEl.style.visibility = saved.visibility;
    recentsEl.style.height = saved.height;
    recentsEl.style.overflow = saved.overflow;
  };
}

function discoverViaBriefUnhide(steamDoc: Document): NativeCardDims | null {
  try {
    const mount = steamDoc.getElementById('deck-shelves-home-root') as HTMLElement | null;
    const recentsEl = mount?.previousElementSibling as HTMLElement | null;
    if (!recentsEl) return null;
    const rule = readHideRecentsRule(steamDoc);
    if (!isInlineHidden(recentsEl) && !rule.active) return null;
    const restore = unhideRecents(recentsEl, rule);
    try {
      // Force synchronous layout so getBoundingClientRect sees the unhidden cards.
      void recentsEl.offsetHeight;
      return discoverNativeCardDimensions(steamDoc);
    } finally {
      restore();
    }
  } catch { return null; }
}

function ensureStyles() {
  try {
    invalidateDimsOnFpChange();
    const newRadius = detectNativeCardRadius();
    const radiusChanged = newRadius !== cachedCardRadius;
    cachedCardRadius = newRadius;
    const newBadgeRadius = detectNativeNewBadgeRadius();
    const newBadgeRadiusChanged = newBadgeRadius !== cachedNewBadgeRadius;
    cachedNewBadgeRadius = newBadgeRadius;
    const steamDoc = getPreferredSteamDocument();
    const dimsChanged = updateNativeDims(steamDoc);
    ensureFocusRingSuppress();
    const docs = [document, steamDoc];
    for (const doc of docs) {
      if (!doc) continue;
      applyStyleVars(doc, radiusChanged, dimsChanged, newBadgeRadiusChanged);
      detectPageBg(doc);
      applyDocumentThemeFlags(doc);
      detectNativeHeadingColor(doc);
    }
  } catch {
    logInfo("HOME", "ensureStyles failed");
  }
}

function invalidateDimsOnFpChange(): void {
  if (!(cachedNativeDims && cachedDimsFp)) return;
  const fp = viewportFingerprint();
  if (fp.vw >= 100 && fp.vh >= 100 &&
      (fp.vw !== cachedDimsFp.vw || fp.vh !== cachedDimsFp.vh || Math.abs(fp.dpr - cachedDimsFp.dpr) > 0.05)) {
    cachedNativeDims = null;
    cachedDimsFp = null;
    pendingDims = null;
    pendingDimsCount = 0;
  }
}

const dimTol = (a: number | undefined, b: number | undefined) => Math.abs((a ?? 0) - (b ?? 0)) > DIMS_TOL_PX;

function mergeCachedDimFields(newDims: NativeCardDims): void {
  const c = cachedNativeDims;
  if (!c) return;
  if (!newDims.featuredWidth && c.featuredWidth) newDims.featuredWidth = c.featuredWidth;
  if (!newDims.featuredHeight && c.featuredHeight) newDims.featuredHeight = c.featuredHeight;
  if (!newDims.featuredImgHeight && c.featuredImgHeight) newDims.featuredImgHeight = c.featuredImgHeight;
  if (!newDims.imgHeight && c.imgHeight) newDims.imgHeight = c.imgHeight;
}

function discoverDims(steamDoc: Document): NativeCardDims | null {
  let newDims = discoverNativeCardDimensions(steamDoc) ?? discoverNativeCardDimensions(document);
  if (!newDims) newDims = discoverViaBriefUnhide(steamDoc);
  if (newDims) {
    const fpNow = viewportFingerprint();
    if (fpNow.vw >= 100 && newDims.width / fpNow.vw > 0.22) newDims = null;
  }
  if (newDims && cachedNativeDims) mergeCachedDimFields(newDims);
  return newDims;
}

function dimsDiffer(newDims: NativeCardDims): boolean {
  const c = cachedNativeDims;
  return !c ||
    dimTol(newDims.width, c.width) ||
    dimTol(newDims.height, c.height) ||
    dimTol(newDims.gap, c.gap) ||
    dimTol(newDims.featuredWidth, c.featuredWidth) ||
    dimTol(newDims.featuredHeight, c.featuredHeight);
}

function advancePendingDims(newDims: NativeCardDims): void {
  const matchesPending = pendingDims &&
    !dimTol(newDims.width, pendingDims.width) &&
    !dimTol(newDims.height, pendingDims.height) &&
    !dimTol(newDims.gap, pendingDims.gap);
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

function commitDims(newDims: NativeCardDims | null, dimsChanged: boolean): void {
  if (dimsChanged && newDims) {
    const acquiredFeatured = !!newDims.featuredWidth && !cachedNativeDims?.featuredWidth;
    if (acquiredFeatured || acceptNextMeasurementImmediately) {
      acceptNextMeasurementImmediately = false;
      cachedNativeDims = newDims;
      cachedDimsFp = viewportFingerprint();
      persistDims(newDims);
      pendingDims = null;
      pendingDimsCount = 0;
      debouncedNotifyDims(newDims);
    } else {
      advancePendingDims(newDims);
    }
  } else if (!cachedNativeDims && newDims) {
    cachedNativeDims = newDims;
    cachedDimsFp = viewportFingerprint();
    persistDims(newDims);
  } else {
    pendingDims = null;
    pendingDimsCount = 0;
  }
}

function updateNativeDims(steamDoc: Document): boolean {
  const newDims = discoverDims(steamDoc);
  const dimsChanged = newDims !== null && dimsDiffer(newDims);
  commitDims(newDims, dimsChanged);
  return dimsChanged;
}

function applyStyleVars(doc: Document, radiusChanged: boolean, dimsChanged: boolean, newBadgeRadiusChanged: boolean): void {
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = buildStylesheet();
    doc.head.appendChild(style);
  } else if (radiusChanged || dimsChanged || newBadgeRadiusChanged) {
    doc.documentElement.style.setProperty('--ds-card-radius', cachedCardRadius);
    if (cachedNewBadgeRadius) doc.documentElement.style.setProperty('--ds-new-badge-radius', cachedNewBadgeRadius);
    else doc.documentElement.style.removeProperty('--ds-new-badge-radius');
    for (const [k, v] of nativeDimVarEntries()) doc.documentElement.style.setProperty(k, v);
  }
  if (cachedNewBadgeRadius) doc.documentElement.style.setProperty('--ds-new-badge-radius', cachedNewBadgeRadius);
  else doc.documentElement.style.removeProperty('--ds-new-badge-radius');
}

function firstOpaqueAncestorBg(doc: Document): string {
  const mount = doc.getElementById('deck-shelves-home-root');
  if (!mount) return '';
  let el: HTMLElement | null = mount.parentElement;
  for (let i = 0; i < 6 && el && el !== doc.body; i++) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    el = el.parentElement;
  }
  return '';
}

function detectPageBg(doc: Document): void {
  try {
    let pageBg = firstOpaqueAncestorBg(doc);
    if (!pageBg) {
      const bodyBg = getComputedStyle(doc.body).backgroundColor;
      if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') pageBg = bodyBg;
    }
    doc.documentElement.style.setProperty('--ds-page-bg', pageBg || 'rgb(0, 0, 0)');
  } catch {}
}

function headingColorOf(h: HTMLElement): string | null {
  const cls = h.className || '';
  if (!/_[A-Za-z0-9_-]{5,}/.test(cls)) return null;
  const c = getComputedStyle(h).color;
  if (!c || c === 'rgb(0, 0, 0)' || c === 'rgba(0, 0, 0, 0)') return null;
  const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) {
    const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    const max = Math.max(r, g, b);
    const sat = max > 0 ? (max - Math.min(r, g, b)) / max : 0;
    if (sat < 0.25) return null;
  }
  return c;
}

function detectNativeHeadingColor(doc: Document): void {
  try {
    doc.documentElement.style.removeProperty('--ds-native-heading-color');
    const headings = doc.querySelectorAll('h2[class], h3[class]');
    for (const h of Array.from(headings)) {
      const c = headingColorOf(h as HTMLElement);
      if (c) { doc.documentElement.style.setProperty('--ds-native-heading-color', c); break; }
    }
  } catch {
    logInfo("HOME", "heading color detection failed");
  }
}

function buildStylesheet(): string {
  const d = effectiveDims(cachedNativeDims);
  const ctx: ShelfStylesheetCtx = {
    cardRadius: cachedCardRadius,
    cardW: d.w,
    cardH: d.h,
    cardArtH: d.artH,
    cardGap: d.gap,
    featuredW: d.featW,
    featuredH: d.featH,
    featuredArtH: d.featArtH,
  };
  return buildShelfStylesheet(ctx);
}

let globalStyleRefCount = 0;
let globalStyleTimer: ReturnType<typeof setInterval> | null = null;
let globalStyleTimerPeriod: number = STYLES_POLL_MS;
let globalResizeHandler: (() => void) | null = null;

function rearmStyleTimer() {
  const wantPeriod = cachedNativeDims?.featuredWidth ? STYLES_POLL_MS_IDLE : STYLES_POLL_MS;
  if (globalStyleTimer && globalStyleTimerPeriod === wantPeriod) return;
  if (globalStyleTimer) { clearInterval(globalStyleTimer); globalStyleTimer = null; }
  globalStyleTimerPeriod = wantPeriod;
  globalStyleTimer = setInterval(() => {
    if (homeBehindGame()) return;
    ensureStyles();
    rearmStyleTimer();
  }, wantPeriod);
}

// Display switches resize the BigPicture window, not the one this code runs in.
const resizeListenerWindows = new Set<Window>();
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
    const tryAttachBig = () => {
      try { attach((globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow); } catch {}
    };
    tryAttachBig();
    for (const d of [500, 1500, 3000, 6000]) setTimeout(tryAttachBig, d);
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
          const stored = lookupPersistedForFp(fp);
          if (stored) {
            cachedNativeDims = stored;
            cachedDimsFp = fp;
            pendingDims = null;
            pendingDimsCount = 0;
            applyCachedDimsToCssVars();
            debouncedNotifyDims(stored);
          } else {
            cachedNativeDims = null;
            cachedDimsFp = null;
            pendingDims = null;
            pendingDimsCount = 0;
          }
          acceptNextMeasurementImmediately = true;
          ensureStyles();
          setTimeout(() => { try { acceptNextMeasurementImmediately = true; ensureStyles(); } catch {} }, 500);
        }
      } catch {}
    }, 2000);
    const earlyDelays = [150, 350, 700, 1200, 2000];
    for (const d of earlyDelays) {
      setTimeout(() => {
        if (cachedNativeDims?.featuredWidth) return;
        ensureStyles();
      }, d);
    }
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

const ROOT_VARS = ["--ds-card-radius", "--ds-new-badge-radius", "--ds-page-bg", "--ds-native-heading-color"];

// The stylesheet and root variables outlive the Home's mounts, so only the plugin teardown takes them out.
export function removeGlobalStyles(): void {
  const docs = collectStyleDocs();
  const vars = [...ROOT_VARS, ...nativeDimVarEntries().map(([k]) => k)];
  for (const doc of docs) {
    try { doc.getElementById(STYLE_ID)?.remove(); } catch {}
    try { for (const k of vars) doc.documentElement.style.removeProperty(k); } catch {}
  }
  try { removeFocusRingStyle(docs); } catch {}
}

export function formatPlaytime(minutes: number | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes}min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1).replace(".", ",")} h`;
}
