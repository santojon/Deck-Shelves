import { useRef } from "react";
import { trackFeature } from "../../steam/usageTracking";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { TrailingCardShell } from "./TrailingCardShell";

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
  const iconRef = useRef<HTMLSpanElement>(null);
  /* Trigger the spin via DOM class toggle rather than React state — the
     refresh callback usually causes setAppIds() upstream which can shift
     focus and unmount the row briefly. State-driven animation gets cancelled
     mid-flight; a CSS keyframes animation owned by the icon DOM element
     keeps spinning regardless of React reconciliation. */
  const handleActivate = () => {
    const icon = iconRef.current;
    if (icon) {
      icon.classList.remove('ds-refresh-spinning');
      void icon.offsetWidth;
      icon.classList.add('ds-refresh-spinning');
    }
    trackFeature("refresh");
    item.onActivate?.();
  };

  return (
    <TrailingCardShell
      cardW={cardW}
      cardH={cardH}
      interactive={interactive}
      onActivate={handleActivate}
      artClassName="ds-refresh-card"
      artStyle={{ flexDirection: "column", gap: 16, color: "rgba(255,255,255,0.92)" }}
    >
      <span ref={iconRef} className="ds-refresh-icon" style={{ display: "inline-flex" }}>
        {refreshIconSvg}
      </span>
      <span className="ds-more-card-text">{item.name}</span>
    </TrailingCardShell>
  );
}
