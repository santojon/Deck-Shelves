function topFadeStops(opaqueTop: boolean, bPx: number): string[] {
  if (opaqueTop) return ['  black 0,'];
  const p = (f: number) => `${(bPx * f).toFixed(0)}px`;
  return [
    '  transparent 0,',
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
}

function bottomFadeOffsets(treatAsFirst: boolean, bPx: number): { black: number; mid: number; trans: number } {
  if (treatAsFirst) return { black: 100, mid: 64, trans: 16 };
  return { black: bPx, mid: Math.round(bPx * 0.64), trans: Math.round(bPx * 0.16) };
}

export function computeHeroVisualGeometry(params: { isFirstShelf: boolean; isPromoted: boolean; topBleed: number; forceLayoutAsRecents: boolean; isShelfSelected: boolean }): { heroHeight: string; maskVal: string } {
  const { isFirstShelf, isPromoted, topBleed, forceLayoutAsRecents, isShelfSelected } = params;
  const treatAsFirst = isFirstShelf || isPromoted;
  const heroHeight = treatAsFirst ? '70vh' : `calc(100% + ${Math.abs(topBleed)}px)`;
  const bPx = Math.abs(topBleed);
  const opaqueTop = forceLayoutAsRecents ? isShelfSelected : isFirstShelf;
  const { black, mid, trans } = bottomFadeOffsets(treatAsFirst, bPx);
  const maskVal = [
    'linear-gradient(to bottom,',
    ...topFadeStops(opaqueTop, bPx),
    `  black calc(100% - ${black}px),`,
    `  rgba(0,0,0,0.45) calc(100% - ${mid}px),`,
    `  transparent calc(100% - ${trans}px))`,
  ].join(' ');
  return { heroHeight, maskVal };
}

export type HorizontalPosition = 'left' | 'center' | 'right';

export function resolveOverlayPositionStyle(position: HorizontalPosition): { left: string | number; right: string | number; transform: string | undefined; alignItems: 'flex-start' | 'flex-end' | 'center' } {
  if (position === 'right') return { left: 'auto', right: 24, transform: undefined, alignItems: 'flex-end' };
  if (position === 'center') return { left: '50%', right: 'auto', transform: 'translateX(-50%)', alignItems: 'center' };
  return { left: 24, right: 'auto', transform: undefined, alignItems: 'flex-start' };
}

export function resolveOverlayOffset(logoTopOffset: number, isFullPage: boolean): string | number {
  return isFullPage ? `${(logoTopOffset * 0.08).toFixed(2)}vh` : Math.round(logoTopOffset * 0.32);
}

function isCardVisible(c: HTMLElement): boolean {
  if (c.offsetHeight <= 0 || c.offsetParent === null) return false;
  const cs = getComputedStyle(c);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

export function findFirstVisibleCard(cards: Iterable<HTMLElement>): HTMLElement | null {
  for (const c of cards) if (isCardVisible(c)) return c;
  return null;
}
