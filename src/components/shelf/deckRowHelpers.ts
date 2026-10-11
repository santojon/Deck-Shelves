import { getRuntimeClassMap, buildSelectorFromToken, type NativeCardDims } from "../../core/webpackCompat";
import { getAllSteamDocuments } from "../../runtime/steamHost";
import { logInfo } from "../../runtime/logger";
import { CARD_W, CARD_ART_H, CARD_GAP } from "./types";
import { clampCardGap } from "./shelfStyles";

/* Pure, zero-side-effect helpers extracted from DeckRow.tsx — CSS/layout
   math and DOM-scan sub-steps, kept separate so the stateful focus/scroll
   imperative logic in the component stays untouched. */

type EffectiveDims = { w: number; h: number; gap: number; featW: number; featH: number; artH: number; featArtH: number };

function computeDefaultDims(): EffectiveDims {
  const w = CARD_W;
  const h = CARD_ART_H;
  // Clamped both ways (min 8px so TiltedHome's skew never fully merges
  // adjacent cards, max half the card width so a bad native measurement
  // can never blow up into a huge visible gap) — see clampCardGap.
  const gap = clampCardGap(CARD_GAP, w);
  // Default featured: ~3.21x portrait width (matches base native 430px
  // featured card at 134px portrait width, measured via CDP on the Deck).
  const featW = Math.round(w * 3.21);
  return { w, h, gap, featW, featH: h, artH: h, featArtH: h };
}

function computeNativeDims(nd: NativeCardDims): EffectiveDims {
  const w = nd.width;
  const h = nd.height;
  const gap = clampCardGap(nd.gap, w);
  const featW = nd.featuredWidth ? nd.featuredWidth : Math.round(w * 3.21);
  // A featured card differs from its row-mates only in WIDTH — its height
  // (and art height) always match the regular cards, never Steam's
  // separately measured landscape-card height.
  const artH = nd.imgHeight ? nd.imgHeight : h;
  return { w, h, gap, featW, featH: h, artH, featArtH: artH };
}

export function computeEffectiveDims(matchNativeSize: boolean, nd: NativeCardDims | null): EffectiveDims {
  if (!matchNativeSize || !nd) return computeDefaultDims();
  return computeNativeDims(nd);
}

export function computeVisuallyForced(forceExpanded: boolean, forceLayoutAsRecents: boolean): boolean {
  return forceExpanded || forceLayoutAsRecents;
}

// 100vh layout fires for BOTH real recents-replacement (forceExpanded) and
// per-shelf full-page intent (fullPageLayoutOnly).
export function computeFullPageLayoutActive(forceExpanded: boolean, fullPageLayoutOnly: boolean, pinScrollTop: boolean): boolean {
  return (forceExpanded || fullPageLayoutOnly) && !pinScrollTop;
}

export function computeAutoCollapsed(forceCollapsed: boolean, autoCollapseWhenEmpty: boolean, itemCount: number): boolean {
  return forceCollapsed || (autoCollapseWhenEmpty && itemCount === 0);
}

export function computeCollapsed(visuallyForced: boolean, collapsedState: boolean, autoCollapsed: boolean): boolean {
  return visuallyForced ? false : (collapsedState || autoCollapsed);
}

// Space the logo + (below-logo) description banner needs, reserved either
// above (default) or below (logoBelowShelf) the cards.
export function computeLogoBandPx(params: { enableLogo: boolean; logoSize: number; logoTopOffset: number; enableDescription: boolean; descriptionBelowLogo: boolean }): number {
  const { enableLogo, logoSize, logoTopOffset, enableDescription, descriptionBelowLogo } = params;
  if (!enableLogo) return 0;
  const descExtra = (enableDescription && descriptionBelowLogo) ? 26 : 0;
  return Math.round(130 * logoSize / 100) + Math.max(0, Math.round(logoTopOffset * 0.32)) + descExtra;
}

function computeShelfRootPaddingTop(params: { fullPageLayoutActive: boolean; infoAbove: boolean; enableLogo: boolean; logoBelowShelf: boolean; logoBandPx: number }): number | undefined {
  const { fullPageLayoutActive, infoAbove, enableLogo, logoBelowShelf, logoBandPx } = params;
  if (fullPageLayoutActive || !(infoAbove || (enableLogo && !logoBelowShelf))) return undefined;
  const logoBand = (enableLogo && !logoBelowShelf) ? logoBandPx : 0;
  const labelBand = infoAbove ? 50 : 0;
  return logoBand + labelBand + 2;
}

// Full-page shelves (recents-replacement / per-shelf fullPageShelf) anchor
// cards at the bottom via flex so the hero composes inside the shelf's own
// 100vh bounds.
function computeFullPageFlexStyle(fullPageLayoutActive: boolean): {
  minHeight: string | undefined; display: 'flex' | undefined; flexDirection: 'column' | undefined; justifyContent: 'flex-end' | undefined;
} {
  if (!fullPageLayoutActive) return { minHeight: undefined, display: undefined, flexDirection: undefined, justifyContent: undefined };
  return { minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' };
}

export function computeShelfRootStyle(params: {
  heroEnabled: boolean; enableLogo: boolean; enableDescription: boolean; hideStatusLine: boolean;
  fullPageLayoutActive: boolean; infoAbove: boolean; logoBelowShelf: boolean; logoBandPx: number;
}): {
  marginBottom: number; overflow: 'visible' | 'hidden'; background: string;
  minHeight: string | undefined; display: 'flex' | undefined; flexDirection: 'column' | undefined; justifyContent: 'flex-end' | undefined;
  paddingTop: number | undefined; paddingBottom: number | undefined;
} {
  const { heroEnabled, enableLogo, enableDescription, hideStatusLine, fullPageLayoutActive, infoAbove, logoBelowShelf, logoBandPx } = params;
  const showsArtOrText = heroEnabled || enableLogo || enableDescription;
  const paddingBottom = (!fullPageLayoutActive && enableLogo && logoBelowShelf) ? logoBandPx + 2 : undefined;
  return {
    marginBottom: hideStatusLine ? -6 : 12,
    overflow: showsArtOrText ? 'visible' : 'hidden',
    background: (heroEnabled || enableLogo) ? 'transparent' : 'var(--ds-shell-bg)',
    ...computeFullPageFlexStyle(fullPageLayoutActive),
    paddingTop: computeShelfRootPaddingTop({ fullPageLayoutActive, infoAbove, enableLogo, logoBelowShelf, logoBandPx }),
    paddingBottom,
  };
}

export function shouldRenderHero(params: { heroEnabled: boolean; heroLabelMount: boolean; enableLogo: boolean; enableDescription: boolean; infoAbove: boolean }): boolean {
  return params.heroEnabled || params.heroLabelMount || params.enableLogo || params.enableDescription || params.infoAbove;
}

// A boolean prop surfaced as a data-attribute: present ('true') or absent.
export function boolAttr(value: boolean): 'true' | undefined {
  return value ? 'true' : undefined;
}

// When a shelf is locked into its promoted (recents-replacement) layout,
// the title loses its collapse affordance entirely.
export function computeLockedTitleProps(visuallyForced: boolean, toggleCollapse: () => void): {
  extraClass: string; onClick: (() => void) | undefined; cursor: 'default' | 'pointer'; pointerEvents: 'none' | undefined;
} {
  if (visuallyForced) return { extraClass: ' ds-shelf-title--locked', onClick: undefined, cursor: 'default', pointerEvents: 'none' };
  return { extraClass: '', onClick: toggleCollapse, cursor: 'pointer', pointerEvents: undefined };
}

export function resolveTitleJustifyContent(position: 'left' | 'center' | 'right'): 'center' | 'flex-end' | 'flex-start' {
  if (position === 'center') return 'center';
  if (position === 'right') return 'flex-end';
  return 'flex-start';
}

// Small value helpers — kept separate so their branches don't count
// against the caller's own complexity.
export function joinOrEmpty(list: unknown[] | null | undefined): string {
  return list?.join(",") ?? "";
}

// --- DOM-imperative focus/scroll helpers (side-effecting, but with no
// branching/timing changes vs. the inline code they replace) ---

/* A deferred re-center pass can outlive the focus that scheduled it (a rapid
   lateral-navigation burst keeps re-arming a verify timer; by the time it
   fires, focus may have already moved to a different row entirely). True iff
   a card inside `el` is still genuinely focused — checks both real DOM focus
   and GamepadUI's own `gpfocus` class. */
export function isFocusStillWithin(el: HTMLElement): boolean {
  const active = el.ownerDocument?.activeElement;
  return (active != null && el.contains(active)) || !!el.querySelector('.gpfocus');
}

export function isLateralMoveWithinShelf(prevCard: HTMLElement | null, card: HTMLElement, rowEl: HTMLElement): boolean {
  return !!prevCard && prevCard !== card && rowEl.contains(prevCard);
}

export function syncCardSelectionClasses(rowEl: HTMLElement, card: HTMLElement): void {
  try {
    const allCards = Array.from(rowEl.querySelectorAll<HTMLElement>('.ds-card'));
    for (const it of allCards) it.classList.toggle('is-selected', it === card);
  } catch (e) {
    logInfo("HOME", "is-selected toggle failed", String(e));
  }
  try {
    const nested = Array.from(rowEl.querySelectorAll<HTMLElement>('.gpfocus'));
    for (const n of nested) { if (n !== card && n.classList) n.classList.remove('gpfocus'); }
  } catch (e) {
    logInfo("HOME", "gpfocus cleanup failed", String(e));
  }
}

export function scrollShelfIntoView(outer: HTMLElement | null, pinToTop: boolean): void {
  if (!outer) return;
  requestAnimationFrame(() => {
    if (pinToTop) return;
    outer.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

// Centers `el` inside `container` by scrolling container's top — shared by
// both vertical-fallback paths (ancestor scroll container, Steam viewport).
export function centerElementInContainer(container: HTMLElement, el: HTMLElement, pinToTop: boolean): void {
  if (pinToTop) {
    try { container.scrollTo({ top: 0, behavior: 'smooth' }); } catch { container.scrollTop = 0; }
    return;
  }
  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const delta = elRect.top - containerRect.top;
  const target = container.scrollTop + delta - (container.clientHeight / 2) + (elRect.height / 2);
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const finalTop = Math.max(0, Math.min(target, maxScroll));
  try { container.scrollTo({ top: finalTop, behavior: 'smooth' }); } catch { container.scrollTop = finalTop; }
}

export function applyVerticalFallback(container: HTMLElement | null, outerEl: HTMLElement | null, pinToTop: boolean): void {
  if (!container || !outerEl) return;
  centerElementInContainer(container, outerEl, pinToTop);
}

function findViewportByThemeMap(spDoc: Document): HTMLElement | null {
  const map = (() => { try { return getRuntimeClassMap(spDoc); } catch { return null; } })();
  if (!map?.viewport) return null;
  const sel = buildSelectorFromToken(map.viewport);
  if (!sel) return null;
  try { return spDoc.querySelector(sel); } catch (e) { logInfo("HOME", "viewport selector failed", String(e)); return null; }
}

function scanForViewport(spDoc: Document): HTMLElement | null {
  const candidates = Array.from(spDoc.querySelectorAll<HTMLElement>('[class]'));
  for (const el of candidates) {
    try {
      const cs = getComputedStyle(el);
      const oy = (cs.overflowY || '').toLowerCase();
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight && el.clientHeight > 80) return el;
    } catch (e) {
      logInfo("HOME", "viewport scan: getComputedStyle failed", String(e));
    }
  }
  return null;
}

// Steam's home uses a separate BrowserWindow document — find its scroll
// viewport, preferring the theme-map token, falling back to a DOM scan.
export function findScrollViewport(spDoc: Document): HTMLElement | null {
  return findViewportByThemeMap(spDoc) ?? scanForViewport(spDoc);
}

export function findGpfocusDsCardMutation(mutations: MutationRecord[]): HTMLElement | null {
  for (const m of mutations) {
    const el = m.target as HTMLElement;
    if (el.classList?.contains('gpfocus') && el.classList?.contains('ds-card')) return el;
  }
  return null;
}

/* GLOBAL sync cleanup: remove gpfocus from every DS card in every known
   Steam document except `keep` — without this, gpfocus from a previously
   visited shelf's row persists and cross-document focus queries pick the
   wrong card. */
export function clearGpfocusOnOtherDocs(keep: HTMLElement): void {
  try {
    for (const doc of getAllSteamDocuments()) {
      const all = doc.querySelectorAll<HTMLElement>('.ds-card.gpfocus');
      for (const it of all) { if (it !== keep) it.classList.remove('gpfocus'); }
    }
  } catch {}
}
