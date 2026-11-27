export function buildSelectorFromToken(token: string | null): string | null {
  if (!token) return null;
  return `.${token.replace(/\s+/g, '.')}`;
}

export function getRuntimeClassMap(doc: Document): Record<string, string> | null {
  try {
    const w = (doc as any).defaultView as Window | undefined;
    if (w && (w as any).__DS_CLASS_MAP) return (w as any).__DS_CLASS_MAP as Record<string, string>;
    const own = (globalThis as any).__DS_CLASS_MAP;
    if (own) return own as Record<string, string>;
    try {
      const raw = w && w.localStorage ? w.localStorage.getItem('ds_class_map') : null;
      if (raw) return JSON.parse(raw) as Record<string, string>;
    } catch {}
  } catch {}
  return null;
}

export function setRuntimeClassMap(doc: Document, map: Record<string, string>) {
  try {
    const w = (doc as any).defaultView as Window | undefined;
    if (w) {
      try { (w as any).__DS_CLASS_MAP = map; } catch {}
      try { w.localStorage && w.localStorage.setItem('ds_class_map', JSON.stringify(map)); } catch {}
    }
  } catch {}
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

function wrapHostInContainerChain(doc: Document, host: HTMLElement, map: Record<string, string>): HTMLElement {
  const layers: string[] = [];
  for (let i = 0; i < 10; i++) {
    const cls = map[`homeLayer${i}`];
    if (cls) layers.push(cls);
  }
  if (!layers.length) return host;
  let outer: HTMLElement | null = null;
  let innermost: HTMLElement | null = null;
  for (let i = layers.length - 1; i >= 0; i--) {
    const wrapper = doc.createElement('div');
    wrapper.className = layers[i];
    if (innermost) innermost.appendChild(wrapper); else outer = wrapper;
    innermost = wrapper;
  }
  innermost!.appendChild(host);
  outer!.style.cssText = 'position:absolute;top:-99999px;left:-99999px;visibility:hidden;pointer-events:none;';
  return outer!;
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
    const root = wrapHostInContainerChain(doc, host, map ?? {});
    doc.body.appendChild(root);
    try {
      return measureCardPair(card1, card2, host, img1);
    } finally {
      doc.body.removeChild(root);
    }
  } catch {}
  return null;
}

function imgIsCardCandidate(img: HTMLImageElement): boolean {
  if (img.closest('.ds-card') || img.closest('#deck-shelves-home-root')) return false;
  if (img.closest('.ds-highlight-mini') || img.closest('.deck-shelves-dialog')) return false;
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
