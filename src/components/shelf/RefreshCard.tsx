import React, { useEffect, useRef, useState } from "react";
import { Focusable } from "@decky/ui";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { getCachedCardRadius } from "./shelfStyles";
import { resolveNativeCardClass, retryWithIntervals } from "./cardUtils";

const refreshIconSvg = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="44"
    height="44"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

export function RefreshCard({ item, cardW = CARD_W, cardH = CARD_ART_H, interactive = true }: { item: DeckRowItem; cardW?: number; cardH?: number; interactive?: boolean }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [nativeCardClass, setNativeCardClass] = useState('');

  useEffect(() => {
    return retryWithIntervals(() => {
      const cls = resolveNativeCardClass(getPreferredSteamDocument());
      if (cls === null) return false;
      setNativeCardClass(cls);
      return true;
    }, [250, 500, 800, 1200]);
  }, []);

  const cachedCardRadius = getCachedCardRadius();
  // Trigger the spin via DOM class toggle rather than React state — the
  // refresh callback usually causes setAppIds() upstream which can shift
  // focus and unmount the row briefly. State-driven animation gets cancelled
  // mid-flight; a CSS keyframes animation owned by the icon DOM element
  // keeps spinning regardless of React reconciliation.
  const handleActivate = () => {
    const icon = iconRef.current;
    if (icon) {
      icon.classList.remove('ds-refresh-spinning');
      void icon.offsetWidth;
      icon.classList.add('ds-refresh-spinning');
    }
    item.onActivate?.();
  };

  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: cardW,
    minWidth: cardW,
    height: cardH,
    flexShrink: 0,
    padding: 0,
    margin: 0,
    background: "transparent",
    cursor: interactive ? "pointer" : "default",
    overflow: "visible",
  };
  const innerArt = (
    <div
      className="ds-card-art ds-refresh-card"
      style={{
        position: "absolute",
        inset: 0,
        width: cardW,
        height: cardH,
        overflow: "hidden",
        background: "linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))",
        borderRadius: cachedCardRadius,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 20,
        boxSizing: "border-box",
        color: "rgba(255,255,255,0.92)",
      }}
    >
      <span ref={iconRef} className="ds-refresh-icon" style={{ display: "inline-flex" }}>
        {refreshIconSvg}
      </span>
      <span className="ds-more-card-text">{item.name}</span>
    </div>
  );

  // Non-interactive — same intent as MoreCard: skip Focusable so the modal
  // preview shows the card without it stealing gamepad focus or wasting an
  // A press on a no-op handler.
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
      onActivate={handleActivate}
      onOKButton={handleActivate}
      style={containerStyle}
    >
      {innerArt}
    </Focusable>
  );
}
