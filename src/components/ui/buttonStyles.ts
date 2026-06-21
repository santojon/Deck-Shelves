import type { CSSProperties } from "react";

// Pre-baked inline styles to pair with the .ds-btn classes declared in
// DeckQAMStyles. Inline styles are still needed because Decky's
// DialogButton doesn't forward className → we have to coexist with its
/* internal style attribute by including layout properties here.

   All values mirror the .ds-btn* CSS rules verbatim so the look stays
   consistent whether the consumer applies the class (preferred) or only
   passes the style object (fallback for surfaces where CSS isn't loaded). */

export const BTN_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "0 12px",
  height: 32,
  minWidth: 0,
  fontSize: 13,
};

export const BTN_COMPACT_STYLE: CSSProperties = {
  ...BTN_STYLE,
  padding: "0 10px",
  height: 28,
  fontSize: 12,
};

export const BTN_ICON_STYLE: CSSProperties = {
  ...BTN_STYLE,
  width: 32,
  padding: 0,
};

export const BTN_ICON_COMPACT_STYLE: CSSProperties = {
  ...BTN_STYLE,
  width: 28,
  height: 28,
  padding: 0,
};
