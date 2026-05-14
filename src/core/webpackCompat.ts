/** Scans the document for a webpack-hashed CSS class token (starts with `_`, length > 5)
 *  on a visible scrollable element. Used as a seed for the class map discovery. */
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
          // NOTE: native card label classes are discovered but NOT applied to our
          // label elements — applying them causes Steam CSS side-effects that break
          // card layout and context menus. They are kept in the class map for future
          // reference only.
          return out;
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
function _discoverNativeCardStateTokens(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const focused = doc.querySelector<HTMLElement>('.gpfocus.Focusable.Panel');
    if (!focused || focused.closest('#deck-shelves-home-root')) return out;

    // Find an unfocused sibling card in the same row. Steam's home rows nest
    // cards under several wrappers; the cheapest path is to ascend ~6 levels
    // until we find another `.Focusable.Panel` that isn't `.gpfocus`.
    let scope: HTMLElement | null = focused.parentElement;
    let unfocused: HTMLElement | null = null;
    for (let d = 0; d < 6 && scope && !unfocused; d++) {
      unfocused = scope.querySelector<HTMLElement>('.Focusable.Panel:not(.gpfocus)');
      if (!unfocused) scope = scope.parentElement;
    }
    if (!unfocused) return out;

    // Obfuscated tokens = either webpack-hashed (`_xxx`, length > 5) or "no-dash
    // letter clusters" (e.g. `biTV-8r…`). Conservatively accept anything that
    // contains a digit OR is >= 14 chars without being a known DFL/Steam class.
    const KNOWN = new Set(['Panel', 'Focusable', 'gpfocus', 'gpfocuswithin', 'gpfocus-within', 'Action', 'ButtonBase']);
    const obf = (el: Element): string[] =>
      Array.from(el.classList).filter((c) => {
        if (KNOWN.has(c)) return false;
        if (c.startsWith('ds-')) return false;
        if (c.startsWith('_') && c.length > 5) return true;
        return c.length >= 12 && /[0-9]/.test(c) && /[A-Za-z]/.test(c);
      });

    const fSet = new Set(obf(focused));
    const dSet = new Set(obf(unfocused));
    const common: string[] = [];
    const focusOnly: string[] = [];
    const defaultOnly: string[] = [];
    for (const t of fSet) (dSet.has(t) ? common : focusOnly).push(t);
    for (const t of dSet) if (!fSet.has(t)) defaultOnly.push(t);

    if (common.length) out.nativeCardCommon = common.join(' ');
    if (focusOnly.length) out.nativeCardStateFocus = focusOnly.join(' ');
    if (defaultOnly.length) out.nativeCardStateDefault = defaultOnly.join(' ');
  } catch {}
  return out;
}

/** Walk inside the first rendered shelf row to label internal wrapper layers.
 *  The row itself usually has no class tokens — Steam wraps content in 2-3
 *  inner divs that themes commonly target for spacing / padding / overflow.
 */
function _discoverNativeShelfRowLayers(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const grid = doc.querySelector<HTMLElement>('.ReactVirtualized__Grid__innerScrollContainer');
    if (!grid) return out;
    const row = grid.firstElementChild as HTMLElement | null;
    if (!row || row.closest('#deck-shelves-home-root')) return out;

    const obf = (el: Element): string[] =>
      Array.from(el.classList).filter((c) => c.startsWith('_') && c.length > 5);

    const labels = ['nativeShelfRowInner', 'nativeShelfRowContent', 'nativeShelfRowItems'];
    let cur: HTMLElement | null = row.firstElementChild as HTMLElement | null;
    let idx = 0;
    while (cur && idx < labels.length) {
      const tokens = obf(cur);
      if (tokens.length) {
        out[labels[idx]] = tokens.join(' ');
        idx++;
      }
      // Stop when we reach the card root (has Focusable+Panel)
      if (cur.classList.contains('Focusable') && cur.classList.contains('Panel')) break;
      const next = cur.firstElementChild as HTMLElement | null;
      if (!next || next === cur) break;
      cur = next;
    }
  } catch {}
  return out;
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
    const obf = (el: Element): string[] =>
      Array.from(el.classList).filter((c) => c.startsWith('_') && c.length > 5);

    let cur: HTMLElement | null = grid.parentElement;
    let layerIdx = 0;
    const maxLayers = 10;
    while (cur && layerIdx < maxLayers && cur !== doc.documentElement) {
      const tokens = obf(cur);
      if (tokens.length) {
        // Skip layers whose first token is already named under a stable key.
        const primary = tokens[0];
        if (!alreadyNamed.has(primary)) {
          out[`homeLayer${layerIdx}`] = tokens.join(' ');
          layerIdx++;
        }
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
function _discoverNativeHomeSectionTokens(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    // Hero root: first ancestor (from any shelf with a virtualized grid) that
    // has a child with mask-image containing "linear-gradient". The child is
    // the hero inner (cross-fades + animation).
    const grid = doc.querySelector<HTMLElement>(".ReactVirtualized__Grid__innerScrollContainer");
    if (grid) {
      const section = grid.closest<HTMLElement>('[class^="_"], [class*=" _"]');
      const sectionCls = section?.classList ? Array.from(section.classList).find((c) => c.startsWith("_") && c.length > 5) : undefined;
      if (sectionCls) out.shelfSection = sectionCls;
      const gridCls = Array.from(grid.classList).find((c) => c.startsWith("_") && c.length > 5);
      if (gridCls) out.scrollGrid = gridCls;
      // Walk up from section to find hero sibling
      const sectionParent = section?.parentElement as HTMLElement | null;
      if (sectionParent) {
        for (const sib of Array.from(sectionParent.children) as HTMLElement[]) {
          if (sib === section) continue;
          const childCs = Array.from(sib.children).map((c) => {
            try { return (doc.defaultView?.getComputedStyle?.(c as HTMLElement) ?? null); } catch { return null; }
          });
          const hasGradientMask = childCs.some((cs) => {
            const m = (cs as any)?.maskImage || (cs as any)?.webkitMaskImage || "";
            return typeof m === "string" && m.includes("linear-gradient");
          });
          if (hasGradientMask) {
            const heroCls = Array.from(sib.classList).find((c) => c.startsWith("_") && c.length > 5);
            if (heroCls) out.heroRoot = heroCls;
            // First child with the mask = inner zoom container
            const inner = sib.children[0] as HTMLElement | undefined;
            if (inner) {
              const innerCls = Array.from(inner.classList).find((c) => c.startsWith("_") && c.length > 5);
              if (innerCls) out.heroInner = innerCls;
            }
            break;
          }
        }
      }
    }
  } catch { /* ignore */ }
  return out;
}

/** Traverse shelf-level elements to discover nativeShelf, nativeShelfTitle, nativeShelfRow tokens.
 *  Primary anchor: the ReactVirtualized inner scroll container — its direct
 *  children are the rendered shelf rows. Modern Steam shelves are
 *  virtualized vertically, so individual rows don't use overflow-x.
 *  Falls back to the old horizontal-scroll heuristic if the grid isn't
 *  found (older builds / non-home routes).
 */
function _discoverNativeShelfTokens(doc: Document): Record<string, string> | null {
  const obfTokens = (el: Element): string[] =>
    Array.from(el.classList).filter((c) => c.startsWith('_') && c.length > 5);

  const findHeadingToken = (root: Element): string | undefined => {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      try {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.fontSize) < 16) continue;
        const txt = (el.textContent || '').trim();
        if (!txt || txt.length > 80) continue;
        const t = obfTokens(el)[0];
        if (t) return t;
      } catch {}
    }
    return undefined;
  };

  try {
    // Primary path: walk from the ReactVirtualized inner scroll container.
    const grid = doc.querySelector<HTMLElement>('.ReactVirtualized__Grid__innerScrollContainer');
    if (grid) {
      const firstRow = grid.firstElementChild as HTMLElement | null;
      if (firstRow && !firstRow.closest('#deck-shelves-home-root')) {
        const out: Record<string, string> = {};
        const rowCls = obfTokens(firstRow)[0];
        if (rowCls) out.nativeShelfRow = rowCls;
        // Some Steam builds wrap the heading + scroller inside an inner div;
        // accept the deepest single-child wrapper as the shelf root candidate.
        const inner = firstRow.children.length === 1
          ? (firstRow.firstElementChild as HTMLElement | null)
          : firstRow;
        if (inner) {
          const shelfCls = obfTokens(inner)[0];
          if (shelfCls && shelfCls !== rowCls) out.nativeShelf = shelfCls;
          const titleCls = findHeadingToken(inner);
          if (titleCls) out.nativeShelfTitle = titleCls;
        }
        if (Object.keys(out).length) return out;
      }
    }

    // Fallback: legacy horizontal-scroll heuristic (older builds).
    const els = Array.from(doc.querySelectorAll<HTMLElement>('[class]'));
    for (const el of els) {
      try {
        const cs = getComputedStyle(el);
        const ox = (cs.overflowX || '').toLowerCase();
        if (!(ox === 'auto' || ox === 'scroll' || ox === 'overlay')) continue;
        if (el.scrollWidth <= el.clientWidth + 10 || el.clientHeight < 100) continue;
        if (el.closest('#deck-shelves-home-root')) continue;
        const rowCls = obfTokens(el)[0];
        if (!rowCls) continue;
        const parent = el.parentElement;
        if (!parent) continue;
        const shelfCls = obfTokens(parent)[0];
        const titleCls = findHeadingToken(parent);
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
 *  Also detects the wider "featured" first card if present (e.g. when a
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
        // Skip our own modal preview mini-cards: they match the Focusable +
        // cursor:pointer + <img> shape this scan uses to find native cards,
        // and their user-chosen sizes would poison the native-dim cache —
        // first shelf renders with tiny cards + broken scroll after the
        // modal closes until the next poll re-establishes real dims.
        if (img.closest('.ds-highlight-mini') || img.closest('.deck-shelves-modal-scope')) continue;
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
          // Skip focused/hovered cards — their getBoundingClientRect includes scale transforms
          if (fallbackRoot.classList.contains('gpfocus') || fallbackRoot.matches(':focus') || fallbackRoot.matches(':hover')) continue;
          // Also skip cards that are mid-scale-transition (Steam's focus rule applies
          // a 1.02× scale on focus and CSS animates the transition out for ~200ms; a
          // poll catching that tail measures e.g. 1.01× and pollutes the cached dims,
          // which then briefly shrinks every shelf card on the home until the next
          // stable poll. Reads computed `transform` and bails if the x-scale isn't ~1.
          try {
            const t = getComputedStyle(fallbackRoot).transform;
            if (t && t !== 'none') {
              const m = t.match(/matrix(?:3d)?\(([^)]+)\)/);
              if (m) {
                const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
                const sx = parts[0];
                if (Number.isFinite(sx) && Math.abs(sx - 1) > 0.005) continue;
              }
            }
          } catch { /* ignore — fall through to default measurement */ }
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

/** DFL exposes `classMap` (array of webpack modules, each `{semanticKey: obfuscatedClass}`)
 *  on its global. Semantic names are stable across Steam builds; the
 *  obfuscated values rebuild every release. When DFL is available, prefer
 *  this lookup over heuristic DOM probing — it's the canonical source.
 *
 *  Returns a flat map of relevant semantic name → current obfuscated class.
 *  Empty object when DFL isn't reachable or the requested keys don't exist.
 */
function _discoverViaDFL(doc: Document): Record<string, string> {
  try {
    const w = (doc as any).defaultView as any;
    if (!w) return {};
    const DFL = w.DFL ?? w.deckyFrontendLib;
    if (!DFL) return {};
    const isClassValue = (v: any): v is string =>
      typeof v === 'string' && v.length >= 6 && v.length <= 60 && !/[\s%]/.test(v) && /[A-Z0-9_-]/.test(v) && /[a-zA-Z]/.test(v);

    // Build a flat lookup: semanticName → obfuscatedClass. Iterate every module,
    // skip ones with > 1000 keys (those are localization tables, not class maps).
    const flat: Record<string, string> = {};
    const cm = DFL.classMap;
    if (!Array.isArray(cm)) return {};
    for (const mod of cm) {
      if (!mod || typeof mod !== 'object') continue;
      const keys = Object.keys(mod);
      if (keys.length === 0 || keys.length >= 1000) continue;
      for (const k of keys) {
        const v = (mod as any)[k];
        if (isClassValue(v) && !flat[k]) flat[k] = v;
      }
    }

    // Map DFL semantic names → DS-internal class-map keys. Curated set
    // covering every surface a third-party theme commonly targets for shelf /
    // card / focus / status / footer styling. Names below mirror Steam's
    // internal webpack module keys (562 surveyed via CDP; ~150 selected as
    // shelf-relevant).
    const KEY_MAP: Record<string, string> = {
      // ─ Recents shelf ───────────────────────────────────────────────────
      RecentGames: 'nativeRecentGames',
      RecentGame: 'nativeRecentGame',
      RecentGameFooter: 'nativeRecentGameFooter',
      RecentGameMediaContainer: 'nativeRecentGameMedia',
      RecentGamesContainer: 'nativeRecentsContainer',
      RecentGamesInnerContainer: 'nativeRecentsInner',
      RecentGamesHeader: 'nativeRecentsHeader',
      RecentGamesHeaderLabel: 'nativeRecentsHeaderLabel',
      RecentSection: 'nativeRecentsSection',
      RecentlyInteracted: 'nativeRecentlyInteracted',
      RecentlyPlayedFriends: 'nativeRecentlyPlayedFriends',
      RecentlyUpdated: 'nativeRecentlyUpdated',
      RecentlyUpdatedIcon: 'nativeRecentlyUpdatedIcon',
      RecentlyUpdatedText: 'nativeRecentlyUpdatedText',
      RecentlyCompleted: 'nativeRecentlyCompleted',
      RecentlyCompletedCarousel: 'nativeRecentlyCompletedCarousel',
      RecentlyCompletedItem: 'nativeRecentlyCompletedItem',

      // ─ Hero background ─────────────────────────────────────────────────
      RecentGamesBackgroundContainer: 'nativeHeroContainer',
      RecentGamesBackgroundImages: 'nativeHeroImages',
      RecentGamesBackgroundImage: 'nativeHeroImage',
      RecentGamesBackgroundImagePreload: 'nativeHeroImagePreload',
      RecentGamesBackground: 'nativeHeroBg',
      RecentGamesBackgroundAnimation: 'nativeHeroAnim',
      Hero: 'nativeSemanticHero',
      HeroAndLogo: 'nativeHeroAndLogo',
      HeroContainer: 'nativeSemanticHeroContainer',
      HeroGradient: 'nativeHeroGradient',
      HeroImage: 'nativeSemanticHeroImage',
      HeroImageContainer: 'nativeSemanticHeroImageContainer',
      HeroCapsuleImageContainer: 'nativeHeroCapsule',

      // ─ Card structure ──────────────────────────────────────────────────
      Card: 'nativeSemanticCard',
      CardContainer: 'nativeSemanticCardContainer',
      CardImage: 'nativeSemanticCardImage',
      CardWrapper: 'nativeSemanticCardWrapper',
      CardShine: 'nativeSemanticCardShine',
      CardShineContainer_N: 'nativeSemanticCardShineN',
      CardShineContainer_S: 'nativeSemanticCardShineS',
      CardShineContainer_E: 'nativeSemanticCardShineE',
      CardShineContainer_W: 'nativeSemanticCardShineW',
      CardsSection: 'nativeCardsSection',
      LibraryItemBox: 'nativeLibraryItemBox',
      LibraryItemBoxTitle: 'nativeLibraryItemTitle',
      LibraryItemBoxSubscript: 'nativeLibraryItemSubscript',
      LibraryItemBoxShine: 'nativeLibraryItemShine',
      LibraryItemIcons: 'nativeLibraryItemIcons',
      LibraryItemUpdateBadge: 'nativeLibraryItemUpdateBadge',
      LibraryItemActionButton: 'nativeLibraryItemAction',
      LibraryItemOverlayOuterArea: 'nativeLibraryItemOverlayOuter',
      LibraryItemOverlayInnerArea: 'nativeLibraryItemOverlayInner',

      // ─ Capsule (generic card art container) ────────────────────────────
      Capsule: 'nativeCapsule',
      CapsuleImage: 'nativeCapsuleImage',
      CapsuleImageCtn: 'nativeCapsuleImageCtn',
      CapsuleArt: 'nativeCapsuleArt',
      CapsuleBackground: 'nativeCapsuleBg',
      CapsuleBackgroundContainer: 'nativeCapsuleBgContainer',
      CapsuleVisible: 'nativeCapsuleVisible',
      CapsuleName: 'nativeCapsuleName',
      CapsuleContainer: 'nativeCapsuleContainer',
      CapsuleColumn: 'nativeCapsuleColumn',
      CapsuleParentInfo: 'nativeCapsuleParentInfo',
      CapsuleDecorators: 'nativeCapsuleDecorators',
      CapsuleBottomBar: 'nativeCapsuleBottomBar',
      CapsuleImageAnchorPoint: 'nativeCapsuleImageAnchor',
      GameCapsule: 'nativeGameCapsule',

      // ─ Featured / focused-state styling ────────────────────────────────
      Featured: 'nativeSemanticFeatured',
      FeaturedCapsule: 'nativeSemanticFeaturedCapsule',
      FeaturedSeparator: 'nativeFeaturedSeparator',
      FeaturedItem: 'nativeFeaturedItem',
      FeaturedItemImage: 'nativeFeaturedItemImage',
      FeaturedItemHeader: 'nativeFeaturedItemHeader',
      FeaturedItemName: 'nativeFeaturedItemName',
      FeaturedItemDesc: 'nativeFeaturedItemDesc',
      FeaturedItemHideButton: 'nativeFeaturedItemHide',
      FeaturedItemLink: 'nativeFeaturedItemLink',
      FeaturedItemDetailsContainer: 'nativeFeaturedItemDetails',
      FeaturedLinks: 'nativeFeaturedLinks',
      featuredLabels: 'nativeFeaturedLabels',
      featuredTitle: 'nativeFeaturedTitle',
      featuredSubTitle: 'nativeFeaturedSubtitle',

      // ─ Focus / highlight ───────────────────────────────────────────────
      Focus: 'nativeFocus',
      Focused: 'nativeFocused',
      FocusedContainer: 'nativeFocusedContainer',
      FocusedColumn: 'nativeFocusedColumn',
      FocusedClip: 'nativeFocusedClip',
      FocusRing: 'nativeFocusRing',
      FocusRingRoot: 'nativeFocusRingRoot',
      FocusRingOnHiddenItem: 'nativeFocusRingHidden',
      FocusBar: 'nativeFocusBar',
      focusAnimation: 'nativeFocusAnim',
      Highlight: 'nativeHighlight',
      Highlighted: 'nativeHighlighted',
      HighlightOnFocus: 'nativeHighlightOnFocus',
      HighlightDiv: 'nativeHighlightDiv',
      HighlightIcon: 'nativeHighlightIcon',
      HighlightTitle: 'nativeHighlightTitle',
      HighlightDesc: 'nativeHighlightDesc',
      Highlights: 'nativeHighlights',
      HighlightEdge: 'nativeHighlightEdge',

      // ─ Title / labels ──────────────────────────────────────────────────
      Title: 'nativeTitle',
      TitleBar: 'nativeTitleBar',
      TitleSection: 'nativeTitleSection',
      TitleRow: 'nativeTitleRow',
      TitleText: 'nativeTitleText',
      TitleLogo: 'nativeTitleLogo',
      TitleLabel: 'nativeTitleLabel',
      TitleContainer: 'nativeTitleContainer',
      TitleImageContainer: 'nativeTitleImageContainer',
      TitleCtn: 'nativeTitleCtn',
      GameTitle: 'nativeGameTitle',
      GameName: 'nativeGameName',
      gameName: 'nativeGameNameLower',
      GameLogo: 'nativeGameLogo',
      gameLogo: 'nativeGameLogoLower',
      GameArt: 'nativeGameArt',

      // ─ Hidden state ────────────────────────────────────────────────────
      Hide: 'nativeHide',
      Hidden: 'nativeHidden',
      HideButton: 'nativeHideButton',
      HideMask: 'nativeHideMask',
      HideGradient: 'nativeHideGradient',
      HiddenGameLabel: 'nativeHiddenGameLabel',
      HiddenLabel: 'nativeHiddenLabel',

      // ─ Status (playing / installing / etc) ─────────────────────────────
      Status: 'nativeStatus',
      StatusIcon: 'nativeStatusIcon',
      StatusItem: 'nativeStatusItem',
      StatusEntry: 'nativeStatusEntry',
      StatusText: 'nativeStatusText',
      StatusLine: 'nativeStatusLine',
      StatusTime: 'nativeStatusTime',
      StatusSpinner: 'nativeStatusSpinner',
      StatusWrapper: 'nativeStatusWrapper',
      StatusOverride: 'nativeStatusOverride',
      StatusThrobber: 'nativeStatusThrobber',
      StatusSuccess: 'nativeStatusSuccess',
      StatusDanger: 'nativeStatusDanger',
      StatusCaution: 'nativeStatusCaution',
      gameState: 'nativeGameState',

      // ─ Playtime ────────────────────────────────────────────────────────
      Playtime: 'nativePlaytime',
      PlaytimeStatus: 'nativePlaytimeStatus',
      PlaytimeContent: 'nativePlaytimeContent',
      PlaytimeDetails: 'nativePlaytimeDetails',
      PlaytimeSection: 'nativePlaytimeSection',
      PlaytimeIcon: 'nativePlaytimeIcon',
      PlaytimeCurrentSession: 'nativePlaytimeCurrentSession',
      PlayTimeRow: 'nativePlayTimeRow',

      // ─ Deck Compat icons / badges ──────────────────────────────────────
      DeckCompat: 'nativeDeckCompat',
      DeckCompatIcon: 'nativeDeckCompatIcon',
      CompatIcon: 'nativeCompatIcon',
      CompatLabel: 'nativeCompatLabel',
      Compatible: 'nativeCompatible',
      CompatFooterIcons: 'nativeCompatFooterIcons',
      CompatFooterDescription: 'nativeCompatFooterDesc',

      // ─ Footer / status line ────────────────────────────────────────────
      Footer: 'nativeFooter',
      FooterControls: 'nativeFooterControls',
      FooterLegend: 'nativeFooterLegend',
      FooterItem: 'nativeFooterItem',
      FooterVisible: 'nativeFooterVisible',
      FooterBlurImage: 'nativeFooterBlur',
      FooterBlurImageContainer: 'nativeFooterBlurCtn',

      // ─ Section / shelf-row equivalents ─────────────────────────────────
      Section: 'nativeSection',
      SectionHeader: 'nativeSectionHeader',
      SectionHeaderContent: 'nativeSectionHeaderContent',
      SectionTitle: 'nativeSectionTitle',
      SectionName: 'nativeSectionName',
      SectionCount: 'nativeSectionCount',
      SectionSeparator: 'nativeSectionSeparator',
      SectionGap: 'nativeSectionGap',
      SectionContainer: 'nativeSectionContainer',
      GameRow: 'nativeSemanticGameRow',
      GameList: 'nativeGameList',

      // ─ Library home / outer shell ──────────────────────────────────────
      Library: 'nativeLibrary',
      LibraryHome: 'nativeLibraryHome',
      LibraryHomeSection: 'nativeLibraryHomeSection',
      LibraryContent: 'nativeLibraryContent',
      LibraryHeader: 'nativeLibraryHeader',
      LibraryInventory: 'nativeLibraryInventory',
      LibraryImage: 'nativeLibraryImage',
      LibraryImageWithName: 'nativeLibraryImageWithName',
      LibraryImageBackgroundGlow: 'nativeLibraryImageGlow',
      LibraryFallbackAssetImageContainer: 'nativeLibraryFallbackAsset',
      LibraryAssetExpandedDisplay: 'nativeLibraryAssetExpanded',
      LibraryViewSubtitle: 'nativeLibraryViewSubtitle',
      LibraryHomeEmptyGames: 'nativeLibraryHomeEmpty',
      LibraryHomeWhatsNew: 'nativeLibraryHomeWhatsNew',
      LibraryHomeMajorUpdates: 'nativeLibraryHomeMajorUpdates',
      LibraryHomeFriends: 'nativeLibraryHomeFriends',
      HomeBox: 'nativeHomeBox',
      GameListHomeAndSearch: 'nativeGameListHomeAndSearch',

      // ─ Carousel (Frontpage/Spotlight surface) ──────────────────────────
      CarouselBody: 'nativeSemanticCarouselBody',
      CarouselHeader: 'nativeSemanticCarouselHeader',
      CarouselItem: 'nativeSemanticCarouselItem',
      CarouselDisplay: 'nativeSemanticCarouselDisplay',
      CarouselImage: 'nativeSemanticCarouselImage',
      CarouselDescription: 'nativeCarouselDescription',
      CarouselThumb: 'nativeCarouselThumb',
      CarouselThumbs: 'nativeCarouselThumbs',
      CarouselPage: 'nativeCarouselPage',
      CarouselIcon: 'nativeCarouselIcon',
      CarouselGameLabel: 'nativeCarouselGameLabel',
      CarouselGameLabelWrapper: 'nativeCarouselGameLabelWrapper',
      CarouselItemLabel: 'nativeCarouselItemLabel',
      CarouselItemLabelWrapper: 'nativeCarouselItemLabelWrapper',
      CarouselCapsuleAnimated: 'nativeCarouselCapsuleAnimated',
      CarouselCapsuleBordered: 'nativeCarouselCapsuleBordered',
      CarouselCapsuleBackgroundGlow: 'nativeCarouselCapsuleGlow',
      CarouselControlsPadding: 'nativeCarouselControlsPadding',

      // ─ Spotlights / Banner ─────────────────────────────────────────────
      Spotlights: 'nativeSpotlights',
      Banner: 'nativeBanner',
      BannerContainer: 'nativeBannerContainer',
      BannerContents: 'nativeBannerContents',
      BannerContent: 'nativeBannerContent',
      BannerHeader: 'nativeBannerHeader',
      BannerVideoOverlay: 'nativeBannerVideo',
      BannerSecondHalf: 'nativeBannerSecondHalf',

      // ─ Collection shelf (when home shows a collection bar) ─────────────
      Collection: 'nativeCollection',
      CollectionShelfBanner: 'nativeCollectionShelfBanner',
      CollectionShelfBannerCtn: 'nativeCollectionShelfBannerCtn',
      CollectionBG: 'nativeCollectionBg',
      CollectionBar: 'nativeCollectionBar',
      CollectionName: 'nativeCollectionName',
      CollectionLabel: 'nativeCollectionLabel',
      CollectionLabelCount: 'nativeCollectionLabelCount',
      CollectionImage: 'nativeCollectionImage',
      CollectionIcon: 'nativeCollectionIcon',
      CollectionIconBox: 'nativeCollectionIconBox',
      CollectionContents: 'nativeCollectionContents',
      CollectionHeader: 'nativeCollectionHeader',

      // ─ Context menu (used by DS shelf-card action menu) ────────────────
      LibraryContextMenu: 'nativeLibraryContextMenu',
    };

    const out: Record<string, string> = {};
    for (const [dflKey, dsKey] of Object.entries(KEY_MAP)) {
      const v = flat[dflKey];
      if (v) out[dsKey] = v;
    }
    return out;
  } catch {
    return {};
  }
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
              const nativeSectionTokens = _discoverNativeHomeSectionTokens(doc);
              const nativeCardStateTokens = _discoverNativeCardStateTokens(doc);
              const nativeShelfRowLayers = _discoverNativeShelfRowLayers(doc);
              const base: Record<string, string> = {
                viewport: cls,
                ...(nativeShelfTokens ?? {}),
                ...(nativeCardTokens ?? {}),
                ...nativeSectionTokens,
                ...nativeCardStateTokens,
                ...nativeShelfRowLayers,
                ..._discoverViaDFL(doc),
              };
              return { ...base, ..._discoverNativeContainerChain(doc, _namedPrimaries(base)) };
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
                      const base2: Record<string,string> = {
                        viewport: viewportToken,
                        ...(nativeShelfTokens2 ?? {}),
                        ...(nativeCardTokens2 ?? {}),
                        ..._discoverNativeCardStateTokens(doc),
                        ..._discoverNativeShelfRowLayers(doc),
                        ..._discoverViaDFL(doc),
                      };
                      if (rowToken) base2.row = rowToken;
                      if (cardToken) base2.card = cardToken;
                      return { ...base2, ..._discoverNativeContainerChain(doc, _namedPrimaries(base2)) };
                    }
                  }
                }
              } catch {}
            }
          }
        } catch {}
        const nativeCardTokens3 = _discoverNativeCardTokens(doc);
        const nativeShelfTokens3 = _discoverNativeShelfTokens(doc);
        const nativeSectionTokens3 = _discoverNativeHomeSectionTokens(doc);
        const base3: Record<string, string> = {
          viewport: viewportToken,
          ...(nativeShelfTokens3 ?? {}),
          ...(nativeCardTokens3 ?? {}),
          ...nativeSectionTokens3,
          ..._discoverNativeCardStateTokens(doc),
          ..._discoverNativeShelfRowLayers(doc),
          ..._discoverViaDFL(doc),
        };
        return { ...base3, ..._discoverNativeContainerChain(doc, _namedPrimaries(base3)) };
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
                const nativeSectionTokens4 = _discoverNativeHomeSectionTokens(doc);
                const out: Record<string,string> = {
                  viewport: t,
                  ...(nativeShelfTokens4 ?? {}),
                  ...(nativeCardTokens ?? {}),
                  ...nativeSectionTokens4,
                  ..._discoverNativeCardStateTokens(doc),
                  ..._discoverNativeShelfRowLayers(doc),
                  ..._discoverViaDFL(doc),
                };
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
                return { ...out, ..._discoverNativeContainerChain(doc, _namedPrimaries(out)) };
              }
            } catch {}
          }
        }
        // fallback: return most frequent token as viewport
        const sorted = Object.keys(tokenMap).sort((a,b)=> tokenMap[b].length - tokenMap[a].length);
        const nativeShelfTokens5 = _discoverNativeShelfTokens(doc);
        const nativeSectionTokens5 = _discoverNativeHomeSectionTokens(doc);
        const base5: Record<string, string> = {
          viewport: sorted[0],
          ...(nativeShelfTokens5 ?? {}),
          ...nativeSectionTokens5,
          ..._discoverNativeCardStateTokens(doc),
          ..._discoverNativeShelfRowLayers(doc),
          ..._discoverViaDFL(doc),
        };
        return { ...base5, ..._discoverNativeContainerChain(doc, _namedPrimaries(base5)) };
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
