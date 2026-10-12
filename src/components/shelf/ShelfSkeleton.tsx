import { useEffect, useRef } from "react";
import type { Shelf } from "../../types";
import { getCachedNativeDims } from "./shelfStyles";
import { observeShelfNear } from "./shelfViewportGate";

/* The shelf's frame (title + card-sized boxes) shown while the shelf resolves,
   and the placeholder an off-screen shelf keeps until it comes within reach of
   the viewport (`onNear`). Same classes/data attributes as the real DeckRow,
   so it takes the same slot in the ordered reveal, theme layout and recents
   promotion; no focusables (focus never lands on it); static, no animation. */
const BOX_BG = "linear-gradient(313deg, rgba(51, 51, 51, 0.45), rgba(85, 85, 85, 0.45))";

export function ShelfSkeleton({ shelf, count, hideTitle = false, onNear, heightHint }: { shelf: Shelf; count: number; hideTitle?: boolean; onNear?: () => void; heightHint?: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dims = getCachedNativeDims();
  const w = dims?.width ?? 134;
  const h = dims?.height ?? 201;
  const gap = dims?.gap ?? 12;
  useEffect(() => {
    if (!onNear) return;
    return observeShelfNear(rootRef.current, onNear);
  }, [onNear]);
  return (
    <div ref={rootRef} className="Panel ds-shelf ds-shelf--skeleton" data-shelfid={shelf.id} data-ds-skeleton="true" aria-hidden="true" style={{ position: "relative", minHeight: heightHint, boxSizing: "border-box" }}>
      {!hideTitle && shelf.title ? (
        <div className="ds-shelf-title" style={{ marginBottom: 8, paddingLeft: "2.8vw", paddingRight: "2.8vw", display: "flex", alignItems: "center", gap: 8, userSelect: "none" }}>
          <span>{shelf.title}</span>
        </div>
      ) : null}
      <div className="ds-row-scroll" style={{ display: "flex", flexWrap: "nowrap", gap, overflow: "hidden", padding: "16px 0 24px 2.8vw" }}>
        {Array.from({ length: Math.max(1, count) }, (_, i) => (
          <div key={i} className="ds-skeleton-card" style={{ width: w, height: h, flexShrink: 0, borderRadius: "var(--ds-card-radius, 0px)", background: BOX_BG }} />
        ))}
      </div>
    </div>
  );
}
