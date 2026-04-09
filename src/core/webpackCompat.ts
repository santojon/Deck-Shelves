export function findWebpackHashedClass(doc: Document): string | null {
  try {
    const els = Array.from(doc.querySelectorAll<HTMLElement>('[class]'));
    for (const el of els) {
      try {
        const cs = getComputedStyle(el);
        const oy = ((el.style && (el.style as any).overflowY) || (cs && cs.overflowY) || '').toLowerCase();
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight && el.clientHeight > 80) {
          for (const cls of Array.from(el.classList)) {
            if (cls && cls.startsWith('_') && cls.length > 5) return cls;
          }
        }
      } catch {}
    }
  } catch {}
  return null;
}

export function buildSelectorFromToken(token: string | null): string | null {
  if (!token) return null;
  return `.${token.replace(/\s+/g, '.')}`;
}

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
function _discoverNativeCardTokens(doc: Document): Record<string, string> | null {
  try {
    const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>('img'));
    for (const img of imgs) {
      try {
        // Skip our own cards' images
        const closest = img.closest('.ds-card');
        if (closest) continue;
        // Only consider portrait-sized game card images (skip avatars, icons, etc.)
        const r = img.getBoundingClientRect();
        if (r.width < 90 || r.width > 220 || r.height < 120) continue;
        // Collect all obfuscated classes on the img
        const imgClasses = Array.from(img.classList).filter(c => c.startsWith('_') && c.length > 5);
        // Direct parent = nativeCardArt background container
        const directParent = img.parentElement;
        const directClasses = directParent
          ? Array.from(directParent.classList).filter(c => c.startsWith('_') && c.length > 5)
          : [];
        // Grandparent = outer art wrapper (with aspect-ratio padding)
        const grandParent = directParent?.parentElement;
        const grandClasses = grandParent && !grandParent.classList.contains('ds-card')
          ? Array.from(grandParent.classList).filter(c => c.startsWith('_') && c.length > 5)
          : [];

        // Traverse up to find the actual focusable card root rather than the inner art wrapper.
        let el: Element | null = img.parentElement;
        let depth = 0;
        let bestRootClasses: string[] | null = null;
        while (el && depth++ < 10) {
          const rootClasses = Array.from(el.classList).filter((c) => {
            if (!c || c.length <= 5) return false;
            if (c === 'Panel' || c === 'Focusable' || c === 'gpfocus' || c === 'gpfocuswithin') return false;
            if (c.startsWith('ds-')) return false;
            return /[_A-Z0-9-]/.test(c);
          });
          if (rootClasses.length) {
            const cs = getComputedStyle(el as HTMLElement);
            if (cs.cursor === 'pointer' && !el.classList.contains('ds-card')) {
              bestRootClasses = rootClasses;
              if (el.classList.contains('Focusable') || el.classList.contains('Panel')) {
                break;
              }
            }
          }
          el = el.parentElement;
        }
        if (bestRootClasses?.length) {
          const primaryCardClass = bestRootClasses.find((c) => !c.startsWith('_')) ?? bestRootClasses[0];
          const cardMods = bestRootClasses.filter((c) => c !== primaryCardClass);
          const out: Record<string, string> = { nativeCard: primaryCardClass };
          if (cardMods.length) out.nativeCardMods = cardMods.join(' ');
          // Art background container (direct parent of img)
          if (directClasses[0]) out.nativeCardArt = directClasses[0];
          // Outer wrapper (grandparent, has aspect-ratio padding-top)
          if (grandClasses[0] && grandClasses[0] !== directClasses[0]) out.nativeCardArtOuter = grandClasses[0];
          // Portrait aspect-ratio class (padding-top: 150%) — look for it on grandparent
          const portraitCls = grandClasses.find(c => c !== grandClasses[0]);
          if (portraitCls) out.nativeCardArtPortrait = portraitCls;
          // Img primary class and fade class
          if (imgClasses[0]) out.nativeCardImg = imgClasses[0];
          if (imgClasses[1]) out.nativeCardImgFade = imgClasses[1];
          // Label/info bar: in the native recents layout, the game name info bar
          // sits as a sibling of the card root in a parent wrapper. Walk up from
          // the card root and look at sibling elements for the info bar classes
          // that CSS Loader themes (e.g. "Centered Game Text") target.
          try {
            const cardRoot = el as HTMLElement;
            // First try direct children (inner label inside card root)
            for (const child of Array.from(cardRoot.children)) {
              if (!(child instanceof HTMLElement) || child.contains(img)) continue;
              const labelClasses = Array.from(child.classList).filter(c => c.startsWith('_') && c.length > 5);
              if (labelClasses[0]) { out.nativeCardLabel = labelClasses[0]; break; }
            }
            // Then look at siblings of card root (info bar at parent level)
            const cardParent = cardRoot.parentElement;
            if (cardParent) {
              for (const sib of Array.from(cardParent.children)) {
                if (sib === cardRoot || !(sib instanceof HTMLElement) || sib.contains(img)) continue;
                const txt = sib.textContent?.trim();
                if (!txt || txt.length < 2) continue;
                const sibClasses = Array.from(sib.classList).filter(c => c.startsWith('_') && c.length > 5);
                if (sibClasses[0]) out.nativeCardLabel = sibClasses[0];
                // Dig for innermost text element with classes
                const inner = sib.querySelector<HTMLElement>('div[class], span[class]');
                if (inner) {
                  const textCls = Array.from(inner.classList).filter(c => c.startsWith('_') && c.length > 5);
                  if (textCls[0]) out.nativeCardLabelText = textCls[0];
                }
                break;
              }
            }
          } catch {}
          return out;
        }
      } catch {}
    }
  } catch {}
  return null;
}

/** Traverse shelf-level elements to discover nativeShelf, nativeShelfTitle, nativeShelfRow tokens.
 *  Looks for horizontal scroll containers (shelf rows) and their parent/sibling heading elements.
 */
function _discoverNativeShelfTokens(doc: Document): Record<string, string> | null {
  try {
    const els = Array.from(doc.querySelectorAll<HTMLElement>('[class]'));
    for (const el of els) {
      try {
        const cs = getComputedStyle(el);
        const ox = (cs.overflowX || '').toLowerCase();
        if (!(ox === 'auto' || ox === 'scroll' || ox === 'overlay')) continue;
        if (el.scrollWidth <= el.clientWidth + 10 || el.clientHeight < 100) continue;
        // Skip containers inside our own plugin
        if (el.closest('#deck-shelves-home-root')) continue;
        const rowCls = Array.from(el.classList).find(c => c.startsWith('_') && c.length > 5);
        if (!rowCls) continue;
        const parent = el.parentElement;
        if (!parent) continue;
        const shelfCls = Array.from(parent.classList).find(c => c.startsWith('_') && c.length > 5);
        // Find sibling heading element (font-size >= 16px) → nativeShelfTitle
        let titleCls: string | undefined;
        for (const sib of Array.from(parent.children)) {
          if (sib === el) continue;
          try {
            const sibCS = getComputedStyle(sib as HTMLElement);
            if (parseFloat(sibCS.fontSize) >= 16) {
              titleCls = Array.from(sib.classList).find(c => c.startsWith('_') && c.length > 5);
              if (titleCls) break;
            }
          } catch {}
        }
        const out: Record<string, string> = {};
        if (rowCls) out.nativeShelfRow = rowCls;
        if (shelfCls) out.nativeShelf = shelfCls;
        if (titleCls) out.nativeShelfTitle = titleCls;
        if (Object.keys(out).length) return out;
      } catch {}
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
 *  Also detects the wider "featured" first card if present (e.g. when a CSS Loader
 *  theme shows a landscape highlight card before the portrait row).
 *  Returns { width, height, gap, featuredWidth?, featuredHeight? } or null.
 */
export function discoverNativeCardDimensions(doc: Document): NativeCardDims | null {
  try {
    const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>('img'));
    const portraitRoots: HTMLElement[] = [];
    const wideRoots: HTMLElement[] = [];

    const visited = new Set<HTMLElement>();
    for (const img of imgs) {
      try {
        if (img.closest('.ds-card') || img.closest('#deck-shelves-home-root')) continue;
        const r = img.getBoundingClientRect();
        if (r.height < 80) continue;
        // Walk up to find the focusable card root. Prefer Focusable/Panel elements
        // over bare cursor:pointer elements (which may be inner art containers that
        // overflow their card and report wrong dimensions).
        let el: HTMLElement | null = img.parentElement;
        let depth = 0;
        let fallbackRoot: HTMLElement | null = null;
        while (el && depth++ < 10) {
          try {
            const cs = getComputedStyle(el);
            if (cs.cursor === 'pointer' && !el.classList.contains('ds-card')) {
              if (!fallbackRoot) fallbackRoot = el;
              if (el.classList.contains('Focusable') || el.classList.contains('Panel')) {
                fallbackRoot = el;
                break;
              }
            }
          } catch {}
          el = el.parentElement;
        }
        if (fallbackRoot && !visited.has(fallbackRoot)) {
          visited.add(fallbackRoot);
          const cr = fallbackRoot.getBoundingClientRect();
          if (cr.width > 220) {
            wideRoots.push(fallbackRoot);
          } else if (cr.width >= 90) {
            portraitRoots.push(fallbackRoot);
          }
        }
      } catch {}
    }

    if (portraitRoots.length < 2) return null;

    // Portrait card dimensions
    const firstRect = portraitRoots[0].getBoundingClientRect();
    const width = Math.round(firstRect.width);
    const height = Math.round(firstRect.height);
    const secondRect = portraitRoots[1].getBoundingClientRect();
    const gap = Math.max(0, Math.round(secondRect.left - firstRect.right));
    if (width < 50 || height < 80) return null;

    const result: NativeCardDims = { width, height, gap };

    // Portrait image height (may be less than card height if theme reserves label space)
    try {
      const portImg = portraitRoots[0].querySelector('img');
      if (portImg) {
        const ir = portImg.getBoundingClientRect();
        if (ir.height >= 40) result.imgHeight = Math.round(ir.height);
      }
    } catch {}

    // Featured card: the widest card root found, if it's notably wider than portrait cards
    if (wideRoots.length > 0) {
      wideRoots.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
      const featCard = wideRoots[0];
      const featRect = featCard.getBoundingClientRect();
      const fw = Math.round(featRect.width);
      const fh = Math.round(featRect.height);
      if (fw > width * 1.5 && fh >= 80) {
        result.featuredWidth = fw;
        result.featuredHeight = fh;
        // Featured image height
        try {
          const featImg = featCard.querySelector('img');
          if (featImg) {
            const fir = featImg.getBoundingClientRect();
            if (fir.height >= 40) result.featuredImgHeight = Math.round(fir.height);
          }
        } catch {}
      }
    }

    return result;
  } catch {}
  return null;
}

export function discoverClassMap(doc: Document): Record<string, string> | null {
  try {
    // Prefer explicit scrollable candidates with obfuscated classes
    const els = Array.from(doc.querySelectorAll<HTMLElement>('[class]'));
    // 1) look for overflow scroll containers
    for (const el of els) {
      try {
        const cs = getComputedStyle(el);
        const oy = (cs.overflowY || '').toLowerCase();
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight && el.clientHeight > 80) {
          for (const cls of Array.from(el.classList)) {
            if (cls && cls.startsWith('_') && cls.length > 4) {
              const nativeCardTokens = _discoverNativeCardTokens(doc);
              const nativeShelfTokens = _discoverNativeShelfTokens(doc);
              return { viewport: cls, ...(nativeShelfTokens ?? {}), ...(nativeCardTokens ?? {}) };
            }
          }
        }
      } catch {}
    }

    // 2) fallback: scan ancestor chain of body/mount for obfuscated tokens
    try {
      const candidates: string[] = [];
      const rootCandidates = [doc.getElementById('deck-shelves-home-root'), doc.body, doc.documentElement];
      for (const rc of rootCandidates) {
        if (!rc) continue;
        let cur: Element | null = rc;
        let depth = 0;
        while (cur && depth++ < 40) {
          try {
            const cls = (cur.className || '').toString();
            if (cls) {
              for (const token of cls.split(/\s+/)) {
                if (token && token.startsWith('_') && token.length > 4) candidates.push(token);
              }
            }
          } catch {}
          cur = cur.parentElement;
        }
      }
      if (candidates.length) {
        // pick the most frequent token
        const freq: Record<string, number> = {};
        for (const c of candidates) freq[c] = (freq[c] || 0) + 1;
        const sorted = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
        const viewportToken = sorted[0];
        // try to detect row/card tokens near the viewport
        try {
          const viewportEl = doc.querySelector(buildSelectorFromToken(viewportToken) || '') as HTMLElement | null;
          if (viewportEl) {
            // find a child that looks like a row: many children and sizable width/height
            const childCandidates = Array.from(viewportEl.children).filter((c) => c instanceof HTMLElement) as HTMLElement[];
            for (const ch of childCandidates) {
              try {
                if (ch.children.length >= 4) {
                  const cls = (ch.className || '').toString();
                  for (const token of cls.split(/\s+/)) {
                    if (token && token.startsWith('_') && token.length > 4) {
                      const rowToken = token;
                      // attempt to find a card token inside this row
                      let cardToken: string | undefined;
                      const grand = Array.from(ch.querySelectorAll('*')) as HTMLElement[];
                      for (const g of grand) {
                        try {
                          const gcls = (g.className || '').toString();
                          for (const t of gcls.split(/\s+/)) {
                            if (t && t.startsWith('_') && t.length > 4) { cardToken = t; break; }
                          }
                        } catch {}
                        if (cardToken) break;
                      }
                      const nativeCardTokens2 = _discoverNativeCardTokens(doc);
                      const nativeShelfTokens2 = _discoverNativeShelfTokens(doc);
                      const out: Record<string,string> = { viewport: viewportToken, ...(nativeShelfTokens2 ?? {}), ...(nativeCardTokens2 ?? {}) };
                      if (rowToken) out.row = rowToken;
                      if (cardToken) out.card = cardToken;
                      return out;
                    }
                  }
                }
              } catch {}
            }
          }
        } catch {}
        const nativeCardTokens3 = _discoverNativeCardTokens(doc);
        const nativeShelfTokens3 = _discoverNativeShelfTokens(doc);
        return { viewport: viewportToken, ...(nativeShelfTokens3 ?? {}), ...(nativeCardTokens3 ?? {}) };
      }
    } catch {}

    // 3) Broad token aggregation fallback: gather tokens and score by element metrics
    try {
      const tokenMap: Record<string, HTMLElement[]> = {};
      const all = Array.from(doc.querySelectorAll<HTMLElement>('[class]'));
      for (const el of all) {
        try {
          const cls = (el.className || '').toString();
          if (!cls) continue;
          for (const t of cls.split(/\s+/)) {
            if (!t || !t.startsWith('_')) continue;
            tokenMap[t] = tokenMap[t] || [];
            tokenMap[t].push(el);
          }
        } catch {}
      }
      if (Object.keys(tokenMap).length) {
        // prefer token used on an element that is scrollable -> viewport
        for (const [t, els] of Object.entries(tokenMap)) {
          for (const el of els) {
            try {
              const sh = (el.scrollHeight || 0);
              const chh = (el.clientHeight || 0);
              if ((el.style && (el.style as any).overflowY === 'auto') || (sh > chh && chh > 80)) {
                const nativeCardTokens = _discoverNativeCardTokens(doc);
                const nativeShelfTokens4 = _discoverNativeShelfTokens(doc);
                const out: Record<string,string> = { viewport: t, ...(nativeShelfTokens4 ?? {}), ...(nativeCardTokens ?? {}) };
                try {
                  const viewportEl = el;
                  const childEls = Array.from(viewportEl.children).filter(c=> c instanceof HTMLElement) as HTMLElement[];
                  for (const ch of childEls) {
                    try {
                      const cls = (ch.className||'').toString();
                      const rowTok = cls.split(/\s+/).find(x=>x.startsWith('_'));
                      if (rowTok) {
                        out.row = rowTok;
                        // try find a card token inside this row
                        const grand = Array.from(ch.querySelectorAll<HTMLElement>('*'));
                        for (const g of grand) {
                          try {
                            const gcls = (g.className||'').toString();
                            const ctok = gcls.split(/\s+/).find(x=>x.startsWith('_'));
                            if (ctok) { out.card = ctok; break; }
                          } catch {}
                        }
                        break;
                      }
                    } catch {}
                  }
                } catch {}
                return out;
              }
            } catch {}
          }
        }
        // fallback: return most frequent token as viewport
        const sorted = Object.keys(tokenMap).sort((a,b)=> tokenMap[b].length - tokenMap[a].length);
        const nativeShelfTokens5 = _discoverNativeShelfTokens(doc);
        return { viewport: sorted[0], ...(nativeShelfTokens5 ?? {}) };
      }
    } catch {}
    return null;
  } catch {
    return null;
  }
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
export function discoverCompatClasses(doc: Document): { verified?: string; playable?: string; unsupported?: string } {
  const result: { verified?: string; playable?: string; unsupported?: string } = {};
  try {
    const sheets = Array.from(doc.styleSheets);
    for (const sheet of sheets) {
      try {
        const rules = Array.from(sheet.cssRules || []) as CSSStyleRule[];
        for (const rule of rules) {
          if (!rule.selectorText || !rule.style) continue;
          const color = rule.style.color;
          if (!color) continue;
          const sel = rule.selectorText;
          // Only match simple single-class selectors (e.g. ".kEOD…")
          const singleClassRe = /^\.[A-Za-z_][A-Za-z0-9_-]+$/;
          // For verified and playable: expect a single class selector
          if (color === 'rgb(89, 191, 64)' && singleClassRe.test(sel)) {
            result.verified = sel.slice(1); // strip leading dot
          } else if (color === 'rgb(255, 200, 44)' && singleClassRe.test(sel)) {
            result.playable = sel.slice(1);
          } else if (color === 'rgb(220, 222, 223)') {
            // Unsupported rule may be a multi-selector: extract the first class
            const firstPart = sel.split(',')[0].trim();
            if (singleClassRe.test(firstPart)) {
              result.unsupported = firstPart.slice(1);
            }
          }
        }
      } catch {}
    }
  } catch {}
  return result;
}
