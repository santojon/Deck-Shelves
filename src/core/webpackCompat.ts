import { _discoverViaDFL } from "./webpackCompatDfl";

function isScrollableElement(el: HTMLElement): boolean {
  try {
    const cs = getComputedStyle(el);
    const oy = ((el.style && (el.style as any).overflowY) || (cs && cs.overflowY) || '').toLowerCase();
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
    return el.scrollHeight > el.clientHeight && el.clientHeight > 80;
  } catch { return false; }
}

function pickHashedClass(el: HTMLElement): string | null {
  for (const cls of Array.from(el.classList)) {
    if (cls && cls.startsWith('_') && cls.length > 5) return cls;
  }
  return null;
}

/** Scans the document for a webpack-hashed CSS class token (starts with `_`, length > 5)
 *  on a visible scrollable element. Used as a seed for the class map discovery. */
export function findWebpackHashedClass(doc: Document): string | null {
  try {
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[class]'))) {
      if (!isScrollableElement(el)) continue;
      const cls = pickHashedClass(el);
      if (cls) return cls;
    }
  } catch {}
  return null;
}

/** Converts a class token (or space-separated tokens) into a CSS selector string. */
export function buildSelectorFromToken(token: string | null): string | null {
  if (!token) return null;
  return `.${token.replace(/\s+/g, '.')}`;
}

/** Returns the cached class map for the given document window, from in-memory store
 *  (`__DS_CLASS_MAP`) or localStorage fallback. Returns null if not yet discovered. */
export function getRuntimeClassMap(doc: Document): Record<string, string> | null {
  try {
    const w = (doc as any).defaultView as Window | undefined;
    if (w && (w as any).__DS_CLASS_MAP) return (w as any).__DS_CLASS_MAP as Record<string, string>;
    try {
      const raw = w && w.localStorage ? w.localStorage.getItem('ds_class_map') : null;
      if (raw) return JSON.parse(raw) as Record<string, string>;
    } catch {}
  } catch {}
  return null;
}

/** Persists the class map to `__DS_CLASS_MAP` (in-memory) and `localStorage` for the
 *  given document window. Called after a successful discovery pass. */
export function setRuntimeClassMap(doc: Document, map: Record<string, string>) {
  try {
    const w = (doc as any).defaultView as Window | undefined;
    if (w) {
      try { (w as any).__DS_CLASS_MAP = map; } catch {}
      try { w.localStorage && w.localStorage.setItem('ds_class_map', JSON.stringify(map)); } catch {}
    }
  } catch {}
}

/** Traverse from an img element upward to find native card tokens.
 *  Returns { nativeCard, nativeCardArt, nativeCardArtOuter, nativeCardArtPortrait, nativeCardImg, nativeCardImgFade }
 */
function obfuscatedClasses(el: Element | null | undefined): string[] {
  if (!el) return [];
  return Array.from(el.classList).filter(c => c.startsWith('_') && c.length > 5);
}

function isPortraitGameImg(img: HTMLImageElement): boolean {
  if (img.closest('.ds-card')) return false;
  const r = img.getBoundingClientRect();
  return r.width >= 90 && r.width <= 220 && r.height >= 120;
}

const RESERVED_ROOT_CLASSES = new Set(['Panel', 'Focusable', 'gpfocus', 'gpfocuswithin']);

function pickRootClasses(el: Element): string[] {
  return Array.from(el.classList).filter((c) => {
    if (!c || c.length <= 5) return false;
    if (RESERVED_ROOT_CLASSES.has(c)) return false;
    if (c.startsWith('ds-')) return false;
    return /[_A-Z0-9-]/.test(c);
  });
}

function isCardRoot(el: Element, rootClasses: string[]): boolean {
  if (!rootClasses.length) return false;
  try {
    const cs = getComputedStyle(el as HTMLElement);
    if (cs.cursor !== 'pointer') return false;
    return !el.classList.contains('ds-card');
  } catch { return false; }
}

function findBestRootClasses(start: Element | null): string[] | null {
  let el: Element | null = start;
  let depth = 0;
  let best: string[] | null = null;
  while (el && depth++ < 10) {
    const rootClasses = pickRootClasses(el);
    if (isCardRoot(el, rootClasses)) {
      best = rootClasses;
      if (el.classList.contains('Focusable') || el.classList.contains('Panel')) break;
    }
    el = el.parentElement;
  }
  return best;
}

function assembleCardTokens(best: string[], imgClasses: string[], directClasses: string[], grandClasses: string[]): Record<string, string> {
  const primary = best.find((c) => !c.startsWith('_')) ?? best[0];
  const mods = best.filter((c) => c !== primary);
  const out: Record<string, string> = { nativeCard: primary };
  if (mods.length) out.nativeCardMods = mods.join(' ');
  if (directClasses[0]) out.nativeCardArt = directClasses[0];
  if (grandClasses[0] && grandClasses[0] !== directClasses[0]) out.nativeCardArtOuter = grandClasses[0];
  const portraitCls = grandClasses.find(c => c !== grandClasses[0]);
  if (portraitCls) out.nativeCardArtPortrait = portraitCls;
  if (imgClasses[0]) out.nativeCardImg = imgClasses[0];
  if (imgClasses[1]) out.nativeCardImgFade = imgClasses[1];
  return out;
}

function _discoverNativeCardTokens(doc: Document): Record<string, string> | null {
  try {
    for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img'))) {
      try {
        if (!isPortraitGameImg(img)) continue;
        const directParent = img.parentElement;
        const grandParent = directParent?.parentElement;
        const grandClasses = grandParent && !grandParent.classList.contains('ds-card')
          ? obfuscatedClasses(grandParent) : [];
        const best = findBestRootClasses(directParent);
        if (best?.length) {
          return assembleCardTokens(best, obfuscatedClasses(img), obfuscatedClasses(directParent), grandClasses);
        }
      } catch {}
    }
  } catch {}
  return null;
}

/** Diff a focused card and an unfocused card to extract:
 *   - `nativeCardCommon`: classes present on every card regardless of state
 *   - `nativeCardStateFocus`: classes added only when the card is focused
 *   - `nativeCardStateDefault`: classes added only when the card is not focused
 *  Used by themes that want to mirror Steam's focus visuals on DS cards.
 *
 *  Captures BOTH `_xxx` (webpack-hashed) and non-underscore obfuscated tokens
 *  (Steam ships both in the same className list). Tokens are space-joined
 *  inside each role bucket so they survive being treated as a selector chunk.
 */
const KNOWN_NATIVE_CLASSES = new Set(['Panel', 'Focusable', 'gpfocus', 'gpfocuswithin', 'gpfocus-within', 'Action', 'ButtonBase']);

function isObfuscatedToken(c: string): boolean {
  if (KNOWN_NATIVE_CLASSES.has(c) || c.startsWith('ds-')) return false;
  if (c.startsWith('_') && c.length > 5) return true;
  return c.length >= 12 && /[0-9]/.test(c) && /[A-Za-z]/.test(c);
}

function obfuscatedTokens(el: Element): string[] {
  return Array.from(el.classList).filter(isObfuscatedToken);
}

function findUnfocusedSibling(focused: HTMLElement): HTMLElement | null {
  let scope: HTMLElement | null = focused.parentElement;
  for (let d = 0; d < 6 && scope; d++) {
    const u = scope.querySelector<HTMLElement>('.Focusable.Panel:not(.gpfocus)');
    if (u) return u;
    scope = scope.parentElement;
  }
  return null;
}

function diffCardStateTokens(focused: HTMLElement, unfocused: HTMLElement): Record<string, string> {
  const fSet = new Set(obfuscatedTokens(focused));
  const dSet = new Set(obfuscatedTokens(unfocused));
  const common: string[] = [];
  const focusOnly: string[] = [];
  const defaultOnly: string[] = [];
  for (const t of fSet) (dSet.has(t) ? common : focusOnly).push(t);
  for (const t of dSet) if (!fSet.has(t)) defaultOnly.push(t);
  const out: Record<string, string> = {};
  if (common.length) out.nativeCardCommon = common.join(' ');
  if (focusOnly.length) out.nativeCardStateFocus = focusOnly.join(' ');
  if (defaultOnly.length) out.nativeCardStateDefault = defaultOnly.join(' ');
  return out;
}

function _discoverNativeCardStateTokens(doc: Document): Record<string, string> {
  try {
    const focused = doc.querySelector<HTMLElement>('.gpfocus.Focusable.Panel');
    if (!focused || focused.closest('#deck-shelves-home-root')) return {};
    const unfocused = findUnfocusedSibling(focused);
    if (!unfocused) return {};
    return diffCardStateTokens(focused, unfocused);
  } catch { return {}; }
}

/** Walk inside the first rendered shelf row to label internal wrapper layers.
 *  The row itself usually has no class tokens — Steam wraps content in 2-3
 *  inner divs that themes commonly target for spacing / padding / overflow.
 */
function reachedCardRoot(el: HTMLElement): boolean {
  return el.classList.contains('Focusable') && el.classList.contains('Panel');
}

function walkShelfRowLayers(start: HTMLElement | null, labels: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  let cur: HTMLElement | null = start;
  let idx = 0;
  while (cur && idx < labels.length) {
    const tokens = obfuscatedClasses(cur);
    if (tokens.length) { out[labels[idx]] = tokens.join(' '); idx++; }
    if (reachedCardRoot(cur)) break;
    const next = cur.firstElementChild as HTMLElement | null;
    if (!next || next === cur) break;
    cur = next;
  }
  return out;
}

function _discoverNativeShelfRowLayers(doc: Document): Record<string, string> {
  try {
    const grid = doc.querySelector<HTMLElement>('.ReactVirtualized__Grid__innerScrollContainer');
    if (!grid) return {};
    const row = grid.firstElementChild as HTMLElement | null;
    if (!row || row.closest('#deck-shelves-home-root')) return {};
    return walkShelfRowLayers(row.firstElementChild as HTMLElement | null,
      ['nativeShelfRowInner', 'nativeShelfRowContent', 'nativeShelfRowItems']);
  } catch { return {}; }
}

/** Walk the ancestor chain from the scrollGrid up to documentElement and
 *  label each named layer. Steam stacks 6-10 wrappers above the grid
 *  (section → page → app shell → root) that themes commonly target for
 *  positioning, background, and scroll behaviour. Skip layers already named
 *  by other helpers (scrollGrid, shelfSection, viewport).
 */
function _discoverNativeContainerChain(doc: Document, alreadyNamed: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const grid = doc.querySelector<HTMLElement>('.ReactVirtualized__Grid__innerScrollContainer');
    if (!grid) return out;
    let cur: HTMLElement | null = grid.parentElement;
    let layerIdx = 0;
    const maxLayers = 10;
    while (cur && layerIdx < maxLayers && cur !== doc.documentElement) {
      const tokens = obfuscatedClasses(cur);
      if (tokens.length && !alreadyNamed.has(tokens[0])) {
        out[`homeLayer${layerIdx}`] = tokens.join(' ');
        layerIdx++;
      }
      cur = cur.parentElement;
    }
  } catch {}
  return out;
}

/** Discover hero background and shelf section tokens in the native recents
 *  area. The hero is an ancestor div whose direct child has a mask-image
 *  (linear gradient fading to transparent at bottom). The shelf section is
 *  a sibling of the hero inside the same recents root.
 */
function firstHashedClass(el: Element | null | undefined): string | undefined {
  if (!el) return undefined;
  return Array.from(el.classList).find((c) => c.startsWith("_") && c.length > 5);
}

function hasLinearGradientMask(doc: Document, el: Element): boolean {
  try {
    const cs = doc.defaultView?.getComputedStyle?.(el as HTMLElement);
    const m = (cs as any)?.maskImage || (cs as any)?.webkitMaskImage || "";
    return typeof m === "string" && m.includes("linear-gradient");
  } catch { return false; }
}

function hasGradientMaskChild(doc: Document, el: HTMLElement): boolean {
  for (const c of Array.from(el.children)) {
    if (hasLinearGradientMask(doc, c)) return true;
  }
  return false;
}

function pickHeroTokens(doc: Document, section: HTMLElement): { heroRoot?: string; heroInner?: string } {
  const parent = section.parentElement;
  if (!parent) return {};
  for (const sib of Array.from(parent.children) as HTMLElement[]) {
    if (sib === section) continue;
    if (!hasGradientMaskChild(doc, sib)) continue;
    return {
      heroRoot: firstHashedClass(sib),
      heroInner: firstHashedClass(sib.children[0]),
    };
  }
  return {};
}

function _discoverNativeHomeSectionTokens(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const grid = doc.querySelector<HTMLElement>(".ReactVirtualized__Grid__innerScrollContainer");
    if (!grid) return out;
    const section = grid.closest<HTMLElement>('[class^="_"], [class*=" _"]');
    const sectionCls = firstHashedClass(section);
    if (sectionCls) out.shelfSection = sectionCls;
    const gridCls = firstHashedClass(grid);
    if (gridCls) out.scrollGrid = gridCls;
    if (section) {
      const hero = pickHeroTokens(doc, section);
      if (hero.heroRoot) out.heroRoot = hero.heroRoot;
      if (hero.heroInner) out.heroInner = hero.heroInner;
    }
  } catch {}
  return out;
}

/** Traverse shelf-level elements to discover nativeShelf, nativeShelfTitle, nativeShelfRow tokens.
 *  Primary anchor: the ReactVirtualized inner scroll container — its direct
 *  children are the rendered shelf rows. Modern Steam shelves are
 *  virtualized vertically, so individual rows don't use overflow-x.
 *  Falls back to the old horizontal-scroll heuristic if the grid isn't
 *  found (older builds / non-home routes).
 */
function findHeadingTokenIn(root: Element): string | undefined {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    try {
      const cs = getComputedStyle(el);
      if (parseFloat(cs.fontSize) < 16) continue;
      const txt = (el.textContent || '').trim();
      if (!txt || txt.length > 80) continue;
      const t = obfuscatedClasses(el)[0];
      if (t) return t;
    } catch {}
  }
  return undefined;
}

function shelfTokensFromGrid(grid: HTMLElement): Record<string, string> | null {
  const firstRow = grid.firstElementChild as HTMLElement | null;
  if (!firstRow || firstRow.closest('#deck-shelves-home-root')) return null;
  const out: Record<string, string> = {};
  const rowCls = obfuscatedClasses(firstRow)[0];
  if (rowCls) out.nativeShelfRow = rowCls;
  const inner = firstRow.children.length === 1
    ? (firstRow.firstElementChild as HTMLElement | null) : firstRow;
  if (inner) {
    const shelfCls = obfuscatedClasses(inner)[0];
    if (shelfCls && shelfCls !== rowCls) out.nativeShelf = shelfCls;
    const titleCls = findHeadingTokenIn(inner);
    if (titleCls) out.nativeShelfTitle = titleCls;
  }
  return Object.keys(out).length ? out : null;
}

function isLegacyHorizontalShelf(el: HTMLElement): boolean {
  try {
    const cs = getComputedStyle(el);
    const ox = (cs.overflowX || '').toLowerCase();
    if (ox !== 'auto' && ox !== 'scroll' && ox !== 'overlay') return false;
    if (el.scrollWidth <= el.clientWidth + 10 || el.clientHeight < 100) return false;
    return !el.closest('#deck-shelves-home-root');
  } catch { return false; }
}

function shelfTokensLegacyFromElement(el: HTMLElement): Record<string, string> | null {
  const rowCls = obfuscatedClasses(el)[0];
  if (!rowCls) return null;
  const parent = el.parentElement;
  if (!parent) return null;
  const out: Record<string, string> = { nativeShelfRow: rowCls };
  const shelfCls = obfuscatedClasses(parent)[0];
  if (shelfCls) out.nativeShelf = shelfCls;
  const titleCls = findHeadingTokenIn(parent);
  if (titleCls) out.nativeShelfTitle = titleCls;
  return Object.keys(out).length ? out : null;
}

function _discoverNativeShelfTokens(doc: Document): Record<string, string> | null {
  try {
    const grid = doc.querySelector<HTMLElement>('.ReactVirtualized__Grid__innerScrollContainer');
    if (grid) {
      const result = shelfTokensFromGrid(grid);
      if (result) return result;
    }
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[class]'))) {
      if (!isLegacyHorizontalShelf(el)) continue;
      const result = shelfTokensLegacyFromElement(el);
      if (result) return result;
    }
  } catch {}
  return null;
}

export type NativeCardDims = {
  width: number;
  height: number;
  gap: number;
  imgHeight?: number;
  featuredWidth?: number;
  featuredHeight?: number;
  featuredImgHeight?: number;
};

/** Measure native Recent Games card dimensions by finding portrait card images
 *  and measuring the focusable card root element.
 *  Also detects the wider "featured" first card if present (e.g. when a
 *  theme shows a landscape highlight card before the portrait row).
 *  Returns { width, height, gap, featuredWidth?, featuredHeight? } or null.
 */
/**
 * Fallback measurement when native cards are hidden (display:none).
 * Creates a temporary element with the native card CSS class — inside a
 * container that mirrors the native shelf row's flex context when possible
 * — and reads its computed dimensions. Works regardless of whether recents
 * are visible, so matchNativeSize keeps responding to viewport changes
 * (e.g. Deck ↔ external monitor) even when the recents shelf is
 * display:none for nav-tree exclusion.
 */
function buildMeasurementHost(doc: Document, rowToken: string): HTMLElement {
  const host = doc.createElement('div');
  if (rowToken) {
    host.className = rowToken;
    host.style.cssText = 'position:absolute;top:-99999px;left:-99999px;visibility:hidden;pointer-events:none;width:100vw;';
  } else {
    host.style.cssText = 'position:absolute;top:-99999px;left:-99999px;visibility:hidden;pointer-events:none;display:flex;flex-direction:row;width:100vw;';
  }
  return host;
}

function computeGapBetween(rect1: DOMRect, rect2: DOMRect, host: HTMLElement, cs1: CSSStyleDeclaration): number {
  const between = Math.max(0, Math.round(rect2.left - rect1.right));
  if (between > 0) return between;
  const csHost = getComputedStyle(host);
  const colGap = parseFloat(csHost.columnGap || csHost.gap || '0');
  return Math.round(colGap) || Math.round(parseFloat(cs1.marginRight) || 0);
}

function measureCardPair(card1: HTMLElement, card2: HTMLElement, host: HTMLElement, img1: HTMLElement): NativeCardDims | null {
  void card1.offsetHeight;
  const rect1 = card1.getBoundingClientRect();
  const rect2 = card2.getBoundingClientRect();
  const cs1 = getComputedStyle(card1);
  const w = rect1.width || parseFloat(cs1.width);
  const h = rect1.height || parseFloat(cs1.height);
  if (!w || !h || w < 50 || h < 80) return null;
  const result: NativeCardDims = {
    width: Math.round(w),
    height: Math.round(h),
    gap: computeGapBetween(rect1, rect2, host, cs1),
  };
  try {
    const imgRect = img1.getBoundingClientRect();
    if (imgRect.height >= 40) result.imgHeight = Math.round(imgRect.height);
  } catch {}
  return result;
}

function discoverNativeCardDimensionsViaClass(doc: Document): NativeCardDims | null {
  try {
    const map = getRuntimeClassMap(doc);
    const nativeCardClass = map?.nativeCard;
    if (!nativeCardClass) return null;
    const rowToken = (map?.nativeShelfRow || map?.nativeRecentsInner || '').split(/\s+/)[0];
    const host = buildMeasurementHost(doc, rowToken);
    const card1 = doc.createElement('div');
    const card2 = doc.createElement('div');
    card1.className = nativeCardClass;
    card2.className = nativeCardClass;
    const img1 = doc.createElement('img');
    img1.style.cssText = 'width:100%;height:100%;display:block;';
    card1.appendChild(img1);
    host.appendChild(card1);
    host.appendChild(card2);
    doc.body.appendChild(host);
    try {
      return measureCardPair(card1, card2, host, img1);
    } finally {
      doc.body.removeChild(host);
    }
  } catch {}
  return null;
}

function imgIsCardCandidate(img: HTMLImageElement): boolean {
  if (img.closest('.ds-card') || img.closest('#deck-shelves-home-root')) return false;
  if (img.closest('.ds-highlight-mini') || img.closest('.deck-shelves-modal-scope')) return false;
  return img.getBoundingClientRect().height >= 80;
}

function walkToCardRoot(start: HTMLElement | null): HTMLElement | null {
  let el = start;
  let depth = 0;
  let fallback: HTMLElement | null = null;
  while (el && depth++ < 10) {
    try {
      const cs = getComputedStyle(el);
      if (cs.cursor === 'pointer' && !el.classList.contains('ds-card')) {
        if (!fallback) fallback = el;
        if (el.classList.contains('Focusable') || el.classList.contains('Panel')) return el;
      }
    } catch {}
    el = el.parentElement;
  }
  return fallback;
}

function isStableForMeasure(el: HTMLElement): boolean {
  if (el.classList.contains('gpfocus') || el.matches(':focus') || el.matches(':hover')) return false;
  try {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return true;
    const m = t.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (!m) return true;
    const sx = parseFloat(m[1].split(',')[0].trim());
    return !Number.isFinite(sx) || Math.abs(sx - 1) <= 0.005;
  } catch { return true; }
}

function collectCardRoots(doc: Document): { portraitRoots: HTMLElement[]; wideRoots: HTMLElement[] } {
  const portraitRoots: HTMLElement[] = [];
  const wideRoots: HTMLElement[] = [];
  const visited = new Set<HTMLElement>();
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img'))) {
    try {
      if (!imgIsCardCandidate(img)) continue;
      const root = walkToCardRoot(img.parentElement);
      if (!root || visited.has(root)) continue;
      visited.add(root);
      if (!isStableForMeasure(root)) continue;
      const cr = root.getBoundingClientRect();
      if (cr.width > 220) wideRoots.push(root);
      else if (cr.width >= 90) portraitRoots.push(root);
    } catch {}
  }
  return { portraitRoots, wideRoots };
}

function computeCardGap(first: HTMLElement, second: HTMLElement, firstRect: DOMRect, secondRect: DOMRect): number {
  try {
    const layoutW1 = first.offsetWidth;
    const bboxW1 = firstRect.width;
    const hasSkew = layoutW1 > 0 && (bboxW1 / layoutW1 - 1) > 0.02;
    if (hasSkew) {
      return Math.max(0, Math.round(second.offsetLeft - first.offsetLeft - layoutW1));
    }
  } catch {}
  return Math.max(0, Math.round(secondRect.left - firstRect.right));
}

function imgHeightOf(root: HTMLElement): number | undefined {
  try {
    const img = root.querySelector('img');
    if (!img) return undefined;
    const h = Math.round(img.getBoundingClientRect().height);
    return h >= 40 ? h : undefined;
  } catch { return undefined; }
}

function pickFeaturedCard(wideRoots: HTMLElement[], firstRect: DOMRect, height: number): HTMLElement | null {
  const rowTop = firstRect.top - height * 0.5;
  const rowBottom = firstRect.bottom + height * 0.5;
  const rowCandidates = wideRoots.filter((el) => {
    try {
      const r = el.getBoundingClientRect();
      return r.top >= rowTop && r.bottom <= rowBottom;
    } catch { return false; }
  });
  const pool = rowCandidates.length > 0 ? rowCandidates : wideRoots;
  if (!pool.length) return null;
  pool.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
  return pool[0];
}

function applyFeaturedDims(result: NativeCardDims, featCard: HTMLElement, width: number, height: number): void {
  const featRect = featCard.getBoundingClientRect();
  const fw = Math.round(featRect.width);
  const fh = Math.round(featRect.height);
  if (!(fw > width * 1.5 && fh >= 80 && fh <= height + 20)) return;
  result.featuredWidth = fw;
  result.featuredHeight = fh;
  const fih = imgHeightOf(featCard);
  if (fih) result.featuredImgHeight = fih;
}

export function discoverNativeCardDimensions(doc: Document): NativeCardDims | null {
  try {
    const { portraitRoots, wideRoots } = collectCardRoots(doc);
    if (portraitRoots.length < 2) return discoverNativeCardDimensionsViaClass(doc);
    const firstRect = portraitRoots[0].getBoundingClientRect();
    const secondRect = portraitRoots[1].getBoundingClientRect();
    const width = Math.round(firstRect.width);
    const height = Math.round(firstRect.height);
    if (width < 50 || height < 80) return null;
    const result: NativeCardDims = {
      width, height,
      gap: computeCardGap(portraitRoots[0], portraitRoots[1], firstRect, secondRect),
    };
    const imgH = imgHeightOf(portraitRoots[0]);
    if (imgH) result.imgHeight = imgH;
    const featCard = pickFeaturedCard(wideRoots, firstRect, height);
    if (featCard) applyFeaturedDims(result, featCard, width, height);
    return result;
  } catch {}
  return null;
}


/** Build a Set of "primary" tokens already named under a stable key in the
 *  base discovery output, so the container-chain helper can skip them and
 *  avoid duplicate entries under generic `homeLayerN` keys. */
function _namedPrimaries(base: Record<string, string>): Set<string> {
  const out = new Set<string>();
  for (const v of Object.values(base)) {
    if (!v) continue;
    const first = v.split(/\s+/)[0];
    if (first) out.add(first);
  }
  return out;
}

function isScrollViewportEl(el: HTMLElement): boolean {
  try {
    const cs = getComputedStyle(el);
    const oy = (cs.overflowY || '').toLowerCase();
    return (oy === 'auto' || oy === 'scroll' || oy === 'overlay')
      && el.scrollHeight > el.clientHeight && el.clientHeight > 80;
  } catch { return false; }
}

function firstHashedToken(el: Element, minLen = 4): string | null {
  for (const cls of Array.from(el.classList)) {
    if (cls && cls.startsWith('_') && cls.length > minLen) return cls;
  }
  return null;
}

function discoveryBaseFor(doc: Document, viewport: string, extras: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = {
    viewport,
    ...(_discoverNativeShelfTokens(doc) ?? {}),
    ...(_discoverNativeCardTokens(doc) ?? {}),
    ..._discoverNativeHomeSectionTokens(doc),
    ..._discoverNativeCardStateTokens(doc),
    ..._discoverNativeShelfRowLayers(doc),
    ..._discoverViaDFL(doc),
    ...extras,
  };
  return { ...base, ..._discoverNativeContainerChain(doc, _namedPrimaries(base)) };
}

function discoverViaScrollContainer(doc: Document): Record<string, string> | null {
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[class]'))) {
    try {
      if (!isScrollViewportEl(el)) continue;
      const token = firstHashedToken(el);
      if (token) return discoveryBaseFor(doc, token);
    } catch {}
  }
  return null;
}

function accumulateClassTokens(el: Element, freq: Record<string, number>): void {
  try {
    const cls = (el.className || '').toString();
    for (const token of cls.split(/\s+/)) {
      if (token && token.startsWith('_') && token.length > 4) freq[token] = (freq[token] || 0) + 1;
    }
  } catch {}
}

function walkAncestors(root: Element | null, freq: Record<string, number>, maxDepth = 40): void {
  let cur: Element | null = root;
  let depth = 0;
  while (cur && depth++ < maxDepth) {
    accumulateClassTokens(cur, freq);
    cur = cur.parentElement;
  }
}

function collectAncestorTokens(doc: Document): Record<string, number> {
  const freq: Record<string, number> = {};
  walkAncestors(doc.getElementById('deck-shelves-home-root'), freq);
  walkAncestors(doc.body, freq);
  walkAncestors(doc.documentElement, freq);
  return freq;
}

function findRowCardInViewport(viewportEl: HTMLElement): { row?: string; card?: string } {
  for (const ch of Array.from(viewportEl.children).filter((c) => c instanceof HTMLElement) as HTMLElement[]) {
    if (ch.children.length < 4) continue;
    const rowTok = firstHashedToken(ch);
    if (!rowTok) continue;
    let cardTok: string | undefined;
    for (const g of Array.from(ch.querySelectorAll<HTMLElement>('*'))) {
      const t = firstHashedToken(g);
      if (t) { cardTok = t; break; }
    }
    return cardTok ? { row: rowTok, card: cardTok } : { row: rowTok };
  }
  return {};
}

function discoverViaAncestorTokens(doc: Document): Record<string, string> | null {
  const freq = collectAncestorTokens(doc);
  const sorted = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  if (!sorted.length) return null;
  const viewportToken = sorted[0];
  try {
    const viewportEl = doc.querySelector(buildSelectorFromToken(viewportToken) || '') as HTMLElement | null;
    if (viewportEl) {
      const rc = findRowCardInViewport(viewportEl);
      if (rc.row || rc.card) return discoveryBaseFor(doc, viewportToken, rc as Record<string, string>);
    }
  } catch {}
  return discoveryBaseFor(doc, viewportToken);
}

function buildTokenMap(doc: Document): Record<string, HTMLElement[]> {
  const tokenMap: Record<string, HTMLElement[]> = {};
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[class]'))) {
    try {
      const cls = (el.className || '').toString();
      for (const t of cls.split(/\s+/)) {
        if (!t || !t.startsWith('_')) continue;
        (tokenMap[t] ||= []).push(el);
      }
    } catch {}
  }
  return tokenMap;
}

function isTokenViewportElement(el: HTMLElement): boolean {
  try {
    const sh = el.scrollHeight || 0;
    const chh = el.clientHeight || 0;
    if (el.style && (el.style as any).overflowY === 'auto') return true;
    return sh > chh && chh > 80;
  } catch { return false; }
}

function discoverViaTokenMap(doc: Document): Record<string, string> | null {
  const tokenMap = buildTokenMap(doc);
  if (!Object.keys(tokenMap).length) return null;
  for (const [t, els] of Object.entries(tokenMap)) {
    for (const el of els) {
      if (!isTokenViewportElement(el)) continue;
      const rc = findRowCardInViewport(el);
      return discoveryBaseFor(doc, t, rc as Record<string, string>);
    }
  }
  const sorted = Object.keys(tokenMap).sort((a, b) => tokenMap[b].length - tokenMap[a].length);
  return discoveryBaseFor(doc, sorted[0]);
}

export function discoverClassMap(doc: Document): Record<string, string> | null {
  try {
    return discoverViaScrollContainer(doc)
        ?? discoverViaAncestorTokens(doc)
        ?? discoverViaTokenMap(doc);
  } catch { return null; }
}

/**
 * Scan the document stylesheets for the native Deck compat icon color rules
 * and return the obfuscated class name for each level.
 *
 * Steam's base stylesheet sets:
 *   .kEODDe6M5cuHWuPlcQexX           { color: rgb(89, 191, 64);   }  ← Verified
 *   .mPD42Bwx3VAs0qw9wubf2           { color: rgb(255, 200, 44);  }  ← Playable
 *   ._2LAaxz6RtHXrJJj9NzCNL4, ...   { color: rgb(220, 222, 223); }  ← Unsupported/Unknown
 *
 * We find these rules by their exact color values (not by class name) so the
 * detection survives Steam bundle renames.
 */
const SINGLE_CLASS_RE = /^\.[A-Za-z_][A-Za-z0-9_-]+$/;

const COMPAT_COLOR_TO_KEY: Record<string, 'verified' | 'playable' | 'unsupported'> = {
  'rgb(89, 191, 64)': 'verified',
  'rgb(255, 200, 44)': 'playable',
  'rgb(220, 222, 223)': 'unsupported',
};

function pickClassFromSelector(sel: string, allowMulti: boolean): string | null {
  if (SINGLE_CLASS_RE.test(sel)) return sel.slice(1);
  if (!allowMulti) return null;
  const firstPart = sel.split(',')[0].trim();
  return SINGLE_CLASS_RE.test(firstPart) ? firstPart.slice(1) : null;
}

function applyCompatRule(rule: CSSStyleRule, result: Record<string, string>): void {
  if (!rule.selectorText || !rule.style) return;
  const key = COMPAT_COLOR_TO_KEY[rule.style.color || ''];
  if (!key) return;
  const cls = pickClassFromSelector(rule.selectorText, key === 'unsupported');
  if (cls) result[key] = cls;
}

export function discoverCompatClasses(doc: Document): { verified?: string; playable?: string; unsupported?: string } {
  const result: Record<string, string> = {};
  try {
    for (const sheet of Array.from(doc.styleSheets)) {
      try {
        for (const rule of (Array.from(sheet.cssRules || []) as CSSStyleRule[])) {
          applyCompatRule(rule, result);
        }
      } catch {}
    }
  } catch {}
  return result;
}
