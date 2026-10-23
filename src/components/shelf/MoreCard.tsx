import { trackFeature } from "../../steam/usageTracking";
import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";
import { logInfo } from "../../runtime/logger";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { TrailingCardShell } from "./TrailingCardShell";

function findNativeCardSample(doc: Document | null): HTMLElement | null {
  const map = doc ? getRuntimeClassMap(doc) : null;
  if (!map?.nativeCard) return null;
  const sel = buildSelectorFromToken(map.nativeCard);
  return sel ? (doc?.querySelector(`${sel}:not(.ds-card)`) as HTMLElement | null) : null;
}

// Read the native card's ::after animation name onto the card so the theme's
// focus-glow pseudo-element styling matches. Best-effort — swallows failures.
function applyNativeAfterAnimation(doc: Document | null, target: HTMLElement | null): void {
  if (!target) return;
  try {
    const sample = findNativeCardSample(doc);
    if (!sample) return;
    const animName = (getComputedStyle(sample, '::after').animationName || '').split(',')[0] || '';
    if (animName && animName !== 'none') target.style.setProperty('--ds-native-after-animation', animName);
  } catch (e) {
    logInfo("HOME", "MoreCard: animation read failed", String(e));
  }
}

export function MoreCard({ item, cardW = CARD_W, cardH = CARD_ART_H, interactive = true }: { item: DeckRowItem; cardW?: number; cardH?: number; interactive?: boolean }) {
  const activate = () => { trackFeature("see_more"); item.onActivate?.(); };
  return (
    <TrailingCardShell cardW={cardW} cardH={cardH} interactive={interactive} onActivate={activate} onNativeClass={applyNativeAfterAnimation}>
      <span className="ds-more-card-text">{item.name}</span>
    </TrailingCardShell>
  );
}
