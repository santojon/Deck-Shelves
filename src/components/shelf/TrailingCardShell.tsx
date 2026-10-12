import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { Focusable } from "../../runtime/host/decky";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { CARD_W, CARD_ART_H } from "./types";
import { getCachedCardRadius } from "./shelfStyles";
import { resolveNativeCardClass, retryWithIntervals } from "./cardUtils";

/* The shell shared by the trailing cards (See more, Refresh): native card
   class resolution, card-sized container off the per-shelf --ds-eff-* vars,
   the unclassed first-child wrapper theme rules target (TiltedHome's
   perspective lands on it, mirroring the native card structure — see
   GameCard), and the interactive / illustrative render split. */
export function TrailingCardShell({ cardW = CARD_W, cardH = CARD_ART_H, interactive = true, onActivate, artClassName, artStyle, onNativeClass, children }: {
  cardW?: number;
  cardH?: number;
  interactive?: boolean;
  onActivate: () => void;
  artClassName?: string;
  artStyle?: React.CSSProperties;
  // Runs once the native card class resolved, with the card element.
  onNativeClass?: (doc: Document | null, card: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [nativeCardClass, setNativeCardClass] = useState('');

  useEffect(() => {
    return retryWithIntervals(() => {
      const doc = getPreferredSteamDocument();
      const cls = resolveNativeCardClass(doc);
      if (cls === null) return false;
      setNativeCardClass(cls);
      onNativeClass?.(doc, cardRef.current);
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
  const innerArt = (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        className={`ds-card-art${artClassName ? ` ${artClassName}` : ''}`}
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
          ...artStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
  const className = `ds-card${nativeCardClass ? ` ${nativeCardClass}` : ''}`;

  /* Non-interactive variant — the modal preview, where the card is purely
     illustrative: a plain div skips Focusable so gamepad nav never lands on
     it and no A press is wasted on a no-op handler. */
  if (!interactive) {
    return (
      <div ref={cardRef as any} className={className} style={containerStyle}>
        {innerArt}
      </div>
    );
  }

  return (
    <Focusable
      ref={cardRef}
      className={className}
      focusClassName="gpfocus"
      onActivate={onActivate}
      onOKButton={onActivate}
      style={containerStyle}
    >
      {innerArt}
    </Focusable>
  );
}
