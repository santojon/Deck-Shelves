/* eslint-disable complexity */
import React, { useEffect, useRef, useState } from "react";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";
import { logInfo } from "../../runtime/logger";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { getCachedCardRadius } from "./shelfStyles";
import { resolveNativeCardClass, retryWithIntervals } from "./cardUtils";

export function MoreCard({ item, cardW = CARD_W, cardH = CARD_ART_H, interactive = true }: { item: DeckRowItem; cardW?: number; cardH?: number; interactive?: boolean }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [nativeCardClass, setNativeCardClass] = useState('');

  useEffect(() => {
    return retryWithIntervals(() => {
      const doc = getPreferredSteamDocument();
      const cls = resolveNativeCardClass(doc);
      if (cls === null) return false;
      setNativeCardClass(cls);
      // Read animation from native sample for ::after pseudo-element styling
      try {
        const map = doc ? getRuntimeClassMap(doc) : null;
        if (map?.nativeCard) {
          const sel = buildSelectorFromToken(map.nativeCard);
          const sample = sel ? doc?.querySelector(`${sel}:not(.ds-card)`) as HTMLElement | null : null;
          if (sample) {
            const pa = getComputedStyle(sample, '::after');
            const animName = (pa.animationName || '').split(',')[0] || '';
            if (animName && animName !== 'none' && cardRef.current) cardRef.current.style.setProperty('--ds-native-after-animation', animName);
          }
        }
      } catch (e) {
        logInfo("HOME", "MoreCard: animation read failed", String(e));
      }
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
  // Wrap art in an unclassed first-child div so theme rules that
  // target `nativeCardWrapper > div:first-child` (TiltedHome's
  // perspective + rotateY etc) land on the transform-target div,
  // mirroring native card structure. See GameCard for the same
  // pattern + rationale.
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

  // Non-interactive variant — used in the modal preview where the card is
  // purely illustrative. Plain div skips Focusable entirely so gamepad nav
  // doesn't land on it (matches what the user expects when there's no
  // navigable target behind the card).
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
      onActivate={item.onActivate}
      onOKButton={item.onActivate}
      style={containerStyle}
    >
      {innerArt}
    </Focusable>
  );
}
