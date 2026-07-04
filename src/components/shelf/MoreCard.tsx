import React, { useEffect, useRef, useState } from "react";
import { Focusable } from "../../runtime/host/decky";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { trackFeature } from "../../steam/usageTracking";
import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";
import { logInfo } from "../../runtime/logger";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { getCachedCardRadius } from "./shelfStyles";
import { resolveNativeCardClass, retryWithIntervals } from "./cardUtils";

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
  const cardRef = useRef<HTMLDivElement>(null);
  const [nativeCardClass, setNativeCardClass] = useState('');

  useEffect(() => {
    return retryWithIntervals(() => {
      const doc = getPreferredSteamDocument();
      const cls = resolveNativeCardClass(doc);
      if (cls === null) return false;
      setNativeCardClass(cls);
      applyNativeAfterAnimation(doc, cardRef.current);
      return true;
    }, [250, 500, 800, 1200]);
  }, []);

  const cachedCardRadius = getCachedCardRadius();

  // Size off the per-shelf --ds-eff-* vars so a native-dims change reflows
  // through CSS with no re-render; the prop is the fallback.
  const cssW = `var(--ds-eff-card-w, ${cardW}px)`;
  const cssH = `var(--ds-eff-card-h, ${cardH}px)`;
  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: cssW,
    minWidth: cssW,
    height: cssH,
    flexShrink: 0,
    padding: 0,
    margin: 0,
    background: "transparent",
    cursor: interactive ? "pointer" : "default",
    overflow: "visible",
  };
  /* Wrap art in an unclassed first-child div so theme rules that
     target `nativeCardWrapper > div:first-child` (TiltedHome's
     perspective + rotateY etc) land on the transform-target div,
     mirroring native card structure. See GameCard for the same
     pattern + rationale. */
  const innerArt = (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        className="ds-card-art"
        style={{
          position: "absolute",
          inset: 0,
          width: cssW,
          height: cssH,
          overflow: "hidden",
          background: "linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))",
          borderRadius: cachedCardRadius,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <span className="ds-more-card-text">{item.name}</span>
      </div>
    </div>
  );

  /* Non-interactive variant — used in the modal preview where the card is
     purely illustrative. Plain div skips Focusable entirely so gamepad nav
     doesn't land on it (matches what the user expects when there's no
     navigable target behind the card). */
  if (!interactive) {
    return (
      <div ref={cardRef as any} className={`ds-card${nativeCardClass ? ` ${nativeCardClass}` : ''}`} style={containerStyle}>
        {innerArt}
      </div>
    );
  }

  return (
    <Focusable
      ref={cardRef}
      className={`ds-card${nativeCardClass ? ` ${nativeCardClass}` : ''}`}
      focusClassName="gpfocus"
      onActivate={() => { trackFeature("see_more"); item.onActivate?.(); }}
      onOKButton={() => { trackFeature("see_more"); item.onActivate?.(); }}
      style={containerStyle}
    >
      {innerArt}
    </Focusable>
  );
}
